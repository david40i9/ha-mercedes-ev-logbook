"""History import: replaying the recorder must give the same log as the live logger did."""

from __future__ import annotations

import pytest
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done

from custom_components.mb_logbook.importer import async_import_history
from custom_components.mb_logbook.logger import CarLogger

from .conftest import AWAY, BASE_CONF, HOME, add_car, charges, set_car, trips
from .test_logger import drive

COMPARE_TRIP = ("distance_km", "soc_start", "soc_end", "start_place", "end_place",
                "park_soc_drop", "park_charged")
COMPARE_CHARGE = ("soc_start", "soc_end", "kwh_meter", "kwh_power", "kwh_car", "at_home", "cost", "cost_basis")


async def replay(ha, entry, start):
    """Import the recorded history into a twin car and return its trips and charges."""
    await async_wait_recording_done(ha)
    live = entry.runtime_data
    twin = CarLogger(ha, "twin", live.conf, live.db)
    counts = await async_import_history(ha, twin, dt_util.utcnow(), days=1)
    t = await ha.async_add_executor_job(live.db.trips, "twin", 0, 1e12)
    c = await ha.async_add_executor_job(live.db.charges, "twin", 0, 1e12)
    return counts, t, c


def pick(rows, keys):
    out = []
    for i, r in enumerate(sorted(rows, key=lambda r: r["start_ts"])):
        row = {k: (round(r[k], 2) if isinstance(r[k], float) else r[k]) for k in keys}
        if i == 0:
            # Before the first imported trip there is no park to measure; the live
            # logger had one from when the car was added.
            row.pop("park_soc_drop", None)
        out.append(row)
    return out


async def scenario(ha, advance):
    await advance(minutes=1)
    await drive(ha, advance, km=20, soc_used=6)            # trip 1 to AWAY, 74%
    await advance(hours=8)
    set_car(ha, soc=73)
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, pos=HOME, odometer=1040)
    await advance(minutes=10)
    set_car(ha, soc=67, ignition="0")
    await advance(minutes=1)
    set_car(ha, charging="on", power=7)                    # plugged in on arrival
    ha.states.async_set("sensor.meter", "100", {"unit_of_measurement": "kWh"})
    await advance(minutes=3)
    for i in range(1, 5):
        await advance(minutes=30)
        ha.states.async_set("sensor.meter", str(100 + 3.5 * i), {"unit_of_measurement": "kWh"})
    set_car(ha, soc=81, power=0, charging="off")
    await advance(minutes=11)
    await advance(hours=6)
    set_car(ha, soc=80)
    await drive(ha, advance, km=5, soc_used=2)             # trip 3, after a charged park


async def test_import_matches_the_live_log(ha, advance):
    ha.states.async_set("sensor.meter", "100", {"unit_of_measurement": "kWh"})
    ha.states.async_set("sensor.price", "20", {"unit_of_measurement": "p/kWh"})
    entry = await add_car(ha, {**BASE_CONF, "charger_energy_entity": "sensor.meter", "price_entity": "sensor.price"})
    start = dt_util.utcnow()
    await scenario(ha, advance)
    live_t, live_c = await trips(ha, entry), await charges(ha, entry)
    assert len(live_t) == 3 and len(live_c) == 1
    counts, rep_t, rep_c = await replay(ha, entry, start)
    assert counts == {"trips": 3, "charges": 1}
    assert pick(rep_t, COMPARE_TRIP) == pick(live_t, COMPARE_TRIP)
    assert pick(rep_c, COMPARE_CHARGE) == pick(live_c, COMPARE_CHARGE)


async def test_import_matches_the_live_log_without_a_meter(ha, car, advance):
    start = dt_util.utcnow()
    await scenario(ha, advance)
    live_t, live_c = await trips(ha, car), await charges(ha, car)
    counts, rep_t, rep_c = await replay(ha, car, start)
    assert pick(rep_t, COMPARE_TRIP) == pick(live_t, COMPARE_TRIP)
    assert pick(rep_c, COMPARE_CHARGE) == pick(live_c, COMPARE_CHARGE)
    assert rep_c[0]["kwh_power"] == pytest.approx(7 * 123 / 60, abs=0.01)  # 3 + 120 min at 7 kW


async def test_import_ends_a_trip_stuck_with_the_ignition_on(ha, car, advance):
    start = dt_util.utcnow()
    set_car(ha, ignition="4")
    await advance(minutes=5)
    set_car(ha, pos=AWAY, odometer=1020)
    await advance(hours=3)  # no movement, ignition still on
    set_car(ha, pos=HOME, odometer=1040)
    await advance(minutes=20)
    set_car(ha, ignition="0")
    await advance(minutes=4)
    live = await trips(ha, car)
    counts, rep_t, _ = await replay(ha, car, start)
    assert counts["trips"] == len(live) == 2
    assert sorted(t["distance_km"] for t in rep_t) == sorted(t["distance_km"] for t in live)


async def test_reimport_never_touches_live_rows(ha, car, advance):
    await drive(ha, advance)
    [live] = await trips(ha, car)
    await async_wait_recording_done(ha)
    # Cut-off before the live trip: nothing to import, and the live trip stays.
    await async_import_history(ha, car.runtime_data, dt_util.utc_from_timestamp(live["start_ts"] - 60), days=1)
    assert [t["id"] for t in await trips(ha, car)] == [live["id"]]


async def test_import_service_returns_counts_per_car(ha, car, advance):
    from homeassistant.core import SupportsResponse  # noqa: F401  (service is registered with response)

    await drive(ha, advance)
    await async_wait_recording_done(ha)
    res = await ha.services.async_call("mb_logbook", "import_history", {"days": 1}, blocking=True, return_response=True)
    # Everything was logged live after the entry was created, so the import finds nothing.
    assert res == {"Test car": {"trips": 0, "charges": 0}}
    assert len(await trips(ha, car)) == 1


async def test_first_setup_imports_history_once(ha, advance):
    from unittest.mock import patch

    from pytest_homeassistant_custom_component.common import MockConfigEntry

    from custom_components.mb_logbook.const import DOMAIN

    from .conftest import BASE_CONF

    await drive(ha, advance, km=12)  # before the car is added
    await async_wait_recording_done(ha)
    entry = MockConfigEntry(domain=DOMAIN, data=BASE_CONF, unique_id="VIN1", title="Test car")
    entry.add_to_hass(ha)
    assert await ha.config_entries.async_setup(entry.entry_id)
    await ha.async_block_till_done()
    await ha.async_block_till_done()
    [t] = await trips(ha, entry)
    assert t["distance_km"] == 12
    assert entry.runtime_data.imported
    with patch("custom_components.mb_logbook.async_import_history") as again:
        await ha.config_entries.async_reload(entry.entry_id)
        await ha.async_block_till_done()
    again.assert_not_called()


async def test_unloaded_car_stops_listening(ha, car, advance):
    lg = car.runtime_data
    await ha.config_entries.async_unload(car.entry_id)
    await ha.async_block_till_done()
    set_car(ha, ignition="4")
    await advance(minutes=5)
    set_car(ha, odometer=1020, ignition="0")
    await advance(minutes=5)
    assert await ha.async_add_executor_job(lg.db.trips, lg.car_id, 0, 1e12) == []
    assert not lg.trip_active


async def test_import_matches_live_for_a_paused_charge(ha, car, advance):
    start = dt_util.utcnow()
    set_car(ha, charging="on", power=7)
    await advance(minutes=30)
    set_car(ha, charging="off")
    await advance(minutes=5)
    set_car(ha, charging="on")
    await advance(minutes=30)
    set_car(ha, charging="off", power=0, soc=95)
    await advance(minutes=11)
    live = await charges(ha, car)
    _, _, rep = await replay(ha, car, start)
    assert pick(rep, COMPARE_CHARGE) == pick(live, COMPARE_CHARGE)
