"""WebSocket commands used by the card and the sidebar page."""

from __future__ import annotations

import pytest
from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done

from custom_components.mb_logbook.websocket import OVERPASS_URL, PHOTON_URL

from .conftest import set_car, trips
from .test_logger import drive


@pytest.fixture
async def ws(ha, car, hass_ws_client, hass_admin_user):
    """Send one command on a fresh connection with a fresh token: the tests move the
    clock on by hours, which expires tokens and drops idle sockets."""
    from pytest_homeassistant_custom_component.common import CLIENT_ID

    async def call(type_: str, **data):
        refresh = await ha.auth.async_create_refresh_token(hass_admin_user, CLIENT_ID)
        client = await hass_ws_client(ha, ha.auth.async_create_access_token(refresh))
        await client.send_json({"id": 1, "type": f"mb_logbook/{type_}", **data})
        msg = await client.receive_json()
        await client.close()
        return msg

    return call


async def test_cars_trips_charges_stats(ha, car, ws, advance):
    await drive(ha, advance)
    msg = await ws("cars")
    assert msg["success"] and msg["result"][0]["name"] == "Test car"
    assert msg["result"][0]["currency"] == "GBP"
    eid = car.entry_id
    assert len((await ws("trips", entry_id=eid))["result"]) == 1
    assert (await ws("charges", entry_id=eid))["result"] == []
    stats = (await ws("stats", entry_id=eid, months=3))["result"]
    assert len(stats["months"]) == 3
    assert stats["months"][-1]["trips"] == 1 and stats["months"][-1]["distance_km"] == 15
    routes = (await ws("routes", entry_id=eid, start=0))["result"]
    assert len(routes) == 1 and routes[0]["points"]
    assert (await ws("trips", entry_id="nope"))["success"] is False


async def test_writes_need_an_admin(ha, car, hass_ws_client, hass_read_only_access_token, advance):
    await drive(ha, advance)
    [t] = await trips(ha, car)
    client = await hass_ws_client(ha, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": "mb_logbook/delete_trip", "trip_id": t["id"]})
    msg = await client.receive_json()
    assert not msg["success"] and msg["error"]["code"] == "unauthorized"
    await client.send_json({"id": 2, "type": "mb_logbook/trips", "entry_id": car.entry_id})
    assert (await client.receive_json())["success"]  # reading is allowed
    assert len(await trips(ha, car)) == 1


async def test_labels_and_place_defaults(ha, car, ws, advance):
    await drive(ha, advance)
    [t] = await trips(ha, car)
    assert (await ws("trip_label", trip_id=t["id"], label="  Client visit "))["result"]["label"] == "Client visit"
    labels = (await ws("labels"))["result"]
    assert labels[:3] == ["Business", "Personal", "Commute"] and "Client visit" in labels
    assert (await ws("trip_label", trip_id=99999, label="x"))["error"]["code"] == "not_found"
    await ws("place_label_set", location="Home", label="Commute")
    rows = {r["location"]: r for r in (await ws("place_labels"))["result"]}
    assert rows["Home"]["is_home"] and rows["Home"]["label"] == "Commute"
    assert (await ws("unnamed_places"))["success"]
    assert not (await ws("unnamed_places", days=0))["success"]


async def test_rates_validate_and_cost_charges(ha, car, ws):
    bad = await ws("rate_save", location="Home", valid_from="22/10/2026", rate=0.3)
    assert bad["error"]["code"] == "invalid_format"
    bad = await ws("rate_save", location="Home", valid_from="2026-10-22", rate=0.3, offpeak_start="25:00")
    assert not bad["success"]
    ok = await ws("rate_save", location="Home", valid_from="2026-01-01", rate=0.3,
                  offpeak_rate=0.07, offpeak_start="23:00", offpeak_end="06:00")
    assert ok["success"]
    # Off-peak needs all three parts; a partial set is stored without it.
    await ws("rate_save", location="Work", valid_from="2026-01-01", rate=0.5, offpeak_rate=0.1)
    rates = {r["location"]: r for r in (await ws("rates"))["result"]["rates"]}
    assert rates["Home"]["offpeak_start"] == "23:00" and rates["Work"]["offpeak_rate"] is None
    assert (await ws("rate_delete", rate_id=rates["Work"]["id"]))["success"]


async def test_naming_a_stop_with_an_existing_name_links_it(ha, car, ws):
    first = (await ws("place_save", name="Gym", lat=52.2, lon=-1.2, radius_m=100, anchor_lat=52.2, anchor_lon=-1.2))["result"]
    second = (await ws("place_save", name="gym", lat=52.3, lon=-1.3, radius_m=100, anchor_lat=52.3, anchor_lon=-1.3))["result"]
    assert second == {"id": first["id"], "linked_existing": True}
    [p] = (await ws("places"))["result"]
    assert len(p["anchors"]) == 2
    assert (await ws("place_save", name="x" * 61, lat=1, lon=1, radius_m=100))["success"] is False
    assert (await ws("place_save", name="Far", lat=91, lon=1, radius_m=100))["success"] is False


async def test_merge_and_split(ha, car, ws, advance):
    await drive(ha, advance, km=10)
    await advance(minutes=30)
    await drive(ha, advance, km=6)
    first, second = sorted(await trips(ha, car), key=lambda t: t["start_ts"])
    await ws("trip_label", trip_id=first["id"], label="Business")
    assert (await ws("merge_trips", trip_id=first["id"]))["success"]
    [merged] = await trips(ha, car)
    assert merged["distance_km"] == 16 and merged["label"] == "Business"
    assert merged["end_ts"] == second["end_ts"]
    # The merged trip has a 30+ minute gap in its route: split it again.
    split = await ws("split_trip", trip_id=merged["id"])
    assert split["success"], split
    legs = sorted(await trips(ha, car), key=lambda t: t["start_ts"])
    assert len(legs) == 2 and sum(t["distance_km"] for t in legs) == pytest.approx(16)
    assert legs[0]["label"] == "Business"
    assert (await ws("merge_trips", trip_id=legs[1]["id"]))["error"]["code"] == "no_next"


async def test_split_marks_a_stop_where_the_battery_rose_as_charged(ha, car, ws, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, pos=(52.1, -1.1), odometer=1010, soc=75)
    await advance(minutes=1)
    # Ignition stays on but the car sits for an hour and is charged (rapid charger).
    await advance(minutes=60)
    set_car(ha, soc=95)
    await advance(minutes=1)
    set_car(ha, pos=(52.2, -1.2), odometer=1020)
    await advance(minutes=10)
    set_car(ha, ignition="0")
    await advance(minutes=4)
    await async_wait_recording_done(ha)
    ts = sorted(await trips(ha, car), key=lambda t: t["start_ts"])
    # The stale check already ended the first part, so merge them back and split.
    if len(ts) == 2:
        await ws("merge_trips", trip_id=ts[0]["id"])
    [t] = await trips(ha, car)
    assert (await ws("split_trip", trip_id=t["id"]))["success"]
    leg2 = max(await trips(ha, car), key=lambda t: t["start_ts"])
    assert leg2["park_charged"] is True
    assert leg2["park_soc_drop"] is None


async def test_suggest_names_filters_and_falls_back(ha, car, ws, aioclient_mock):
    aioclient_mock.get(PHOTON_URL, status=503)
    aioclient_mock.post(OVERPASS_URL, json={"elements": [
        {"lat": 52.0001, "lon": -1.0, "tags": {"name": "Corner Cafe", "amenity": "cafe"}},
        {"lat": 52.0002, "lon": -1.0, "tags": {"name": "NG2 7AA", "shop": "x"}},
        {"lat": 52.0001, "lon": -1.0, "tags": {"name": "A bench", "amenity": "bench"}},
        {"lat": 53.0, "lon": -1.0, "tags": {"name": "Far away", "shop": "y"}},
    ]})
    res = (await ws("suggest_names", lat=52.0, lon=-1.0))["result"]
    assert [r["name"] for r in res] == ["Corner Cafe"]


async def test_temp_efficiency_reads_trip_temperatures(ha, car, ws, advance):
    ha.states.async_set("weather.forecast_home", "sunny", {"temperature": 12, "temperature_unit": "°C"})
    await drive(ha, advance, km=30, soc_used=8)
    res = (await ws("temp_efficiency", entry_id=car.entry_id))["result"]
    assert res["source"] == "weather.forecast_home"
    band = next(b for b in res["bands"] if b["lo"] == 10)
    assert band["trips"] == 1 and band["kwh"] == pytest.approx(8)


async def test_delete_trip_and_trip_points(ha, car, ws, advance):
    await drive(ha, advance)
    [t] = await trips(ha, car)
    pts = (await ws("trip_points", trip_id=t["id"]))["result"]
    assert len(pts) == t["point_count"] and pts[0][1:] == [52.0, -1.0]
    assert (await ws("trip_points", trip_id=99999))["error"]["code"] == "not_found"
    assert ha.states.get("sensor.test_car_logbook_last_trip_distance").state == "15.0"
    assert (await ws("delete_trip", trip_id=t["id"]))["result"] == {"deleted": t["id"]}
    await ha.async_block_till_done()
    assert await trips(ha, car) == []
    assert ha.states.get("sensor.test_car_logbook_last_trip_distance").state == "unknown"


async def test_place_delete_unnames_its_stops(ha, car, ws, advance):
    await drive(ha, advance)  # ends at AWAY, outside any zone
    pid = (await ws("place_save", name="Shop", lat=52.1, lon=-1.1, radius_m=100))["result"]["id"]
    assert (await trips(ha, car))[0]["end_place"] == "Shop"
    assert (await ws("place_delete", place_id=pid))["success"]
    assert (await ws("places"))["result"] == []
    assert (await trips(ha, car))[0]["end_place"] is None


async def test_split_needs_a_long_stop(ha, car, ws, advance):
    await drive(ha, advance)
    [t] = await trips(ha, car)
    assert (await ws("split_trip", trip_id=t["id"]))["error"]["code"] == "no_stop"
    assert (await ws("split_trip", trip_id=99999))["error"]["code"] == "not_found"
    assert (await ws("merge_trips", trip_id=99999))["error"]["code"] == "not_found"


async def test_stats_add_up_the_month(ha, car, ws):
    import time

    db = car.runtime_data.db
    cid = car.runtime_data.car_id
    now = time.time() - 60
    await ha.async_add_executor_job(db.add_trip, {
        "car": cid, "start_ts": now, "end_ts": now + 1800, "distance_km": 40.0, "soc_start": 80, "soc_end": 70,
        "range_start_km": 400, "range_end_km": 350, "end_place": "Office",
        "park_hours": 12, "park_drain_hours": 10, "park_soc_drop": 1, "park_charged": True,
    })
    await ha.async_add_executor_job(db.add_trip, {
        "car": cid, "start_ts": now - 100, "end_ts": now, "distance_km": 2.0, "soc_start": 60, "soc_end": 60,
        "end_place": "Office", "park_hours": 3, "park_soc_drop": 0, "park_charged": False,
    })
    await ha.async_add_executor_job(db.add_charge, {
        "car": cid, "start_ts": now, "end_ts": now + 3600, "soc_start": 40, "soc_end": 70, "kwh_car": 30.0,
        "place": "Home", "at_home": True,
    })
    await ha.async_add_executor_job(db.save_rate, {"location": "Home", "valid_from": 0, "rate": 0.2})
    res = (await ws("stats", entry_id=car.entry_id, months=2))["result"]
    month = res["months"][-1]
    assert (month["trips"], month["distance_km"]) == (2, 42)
    assert (month["kwh_used"], month["km_with_kwh"]) == (pytest.approx(10), 40)  # the flat trip is left out
    assert (month["idle_hours"], month["idle_drop"]) == (10, 1)  # the 3 h park is too short
    assert (month["charges"], month["charged_kwh"], month["cost"]) == (1, 30, pytest.approx(6))
    assert (month["range100_km"], month["range100_samples"]) == (pytest.approx(500), 2)
    assert res["months"][0]["trips"] == 0 and res["months"][0]["range100_km"] is None
    assert res["top_places"] == [{"name": "Office", "count": 2}]


async def test_temp_efficiency_needs_a_source_and_a_battery_size(ha, car, ws):
    res = (await ws("temp_efficiency", entry_id=car.entry_id))["result"]
    assert res == {"source": None, "name": None, "bands": []}


async def test_temp_efficiency_fills_old_trips_from_weather_history(ha, car, ws):
    import time

    ha.states.async_set("weather.forecast_home", "sunny", {"temperature": 3, "temperature_unit": "°C"})
    await async_wait_recording_done(ha)
    db = car.runtime_data.db
    start = time.time() + 1
    await ha.async_add_executor_job(db.add_trip, {
        "car": car.runtime_data.car_id, "start_ts": start, "end_ts": start + 1800,
        "distance_km": 20.0, "soc_start": 80, "soc_end": 74, "temp_c": None,
    })
    res = (await ws("temp_efficiency", entry_id=car.entry_id))["result"]
    band = next(b for b in res["bands"] if b["lo"] == 0)
    assert band["trips"] == 1 and band["kwh"] == pytest.approx(6)
    [t] = await trips(ha, car)
    assert t["temp_c"] == 3  # saved, so it isn't looked up again


async def test_cars_lists_every_car_by_name(ha, car, ws):
    from .conftest import BASE_CONF, add_car

    await add_car(ha, {**BASE_CONF, "car_name": "Another", "charger_energy_entity": "sensor.meter",
                       "odometer_entity": "sensor.other_odometer"}, unique_id="VIN2", title="Another")
    cars = (await ws("cars"))["result"]
    assert [c["name"] for c in cars] == ["Another", "Test car"]
    assert [c["has_meter"] for c in cars] == [True, False]
    assert cars[1]["capacity_kwh"] == 100.0 and cars[1]["trip_active"] is False
