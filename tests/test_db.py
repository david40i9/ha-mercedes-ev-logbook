"""SQLite store: places, rates with off-peak windows, labels, imports."""


import pytest
from homeassistant.util import dt as dt_util

from custom_components.mb_logbook import db as dbm
from custom_components.mb_logbook.db import LogbookDB


@pytest.fixture
def db(tmp_path):
    d = LogbookDB(str(tmp_path / "t.db"))
    d.open()
    yield d
    d.close()


@pytest.fixture
def london():
    old = dt_util.get_default_time_zone()
    dt_util.set_default_time_zone(dt_util.get_time_zone("Europe/London"))
    yield
    dt_util.set_default_time_zone(old)


def ts(s: str) -> float:
    return dt_util.parse_datetime(s).timestamp()


def trip(**kw):
    row = {"car": "c1", "start_ts": 1000.0, "end_ts": 2000.0, "distance_km": 10.0,
           "soc_start": 80, "soc_end": 75, "points": [[1000, 52.0, -1.0], [2000, 52.1, -1.1]]}
    row.update(kw)
    return row


def test_open_is_idempotent_and_migrates(tmp_path):
    path = str(tmp_path / "m.db")
    a = LogbookDB(path)
    a.open()
    a.close()
    b = LogbookDB(path)
    b.open()  # second open must not try to re-add columns
    cols = {r["name"] for r in b._exec("PRAGMA table_info(charges)")}
    assert {"kwh_power", "cost_basis", "lat", "lon"} <= cols
    b.close()


def test_distance_m_is_about_right():
    # One degree of latitude is ~111 km.
    assert 110_000 < dbm.distance_m(52, -1, 53, -1) < 112_000


@pytest.mark.usefixtures("london")
def test_offpeak_share_simple_window():
    s, e = ts("2026-10-10T23:00:00+01:00"), ts("2026-10-11T07:00:00+01:00")
    assert dbm._offpeak_share(s, e, "23:00", "06:00") == pytest.approx(7 / 8)


@pytest.mark.usefixtures("london")
def test_offpeak_share_on_the_night_the_clocks_go_back():
    """25 Oct 2026: 23:00 BST to 06:00 GMT is 8 hours, all of it off-peak."""
    s, e = ts("2026-10-24T23:00:00+01:00"), ts("2026-10-25T06:00:00+00:00")
    assert e - s == 8 * 3600
    assert dbm._offpeak_share(s, e, "23:00", "06:00") == pytest.approx(1.0)


@pytest.mark.usefixtures("london")
def test_offpeak_share_on_the_night_the_clocks_go_forward():
    """29 Mar 2026: 23:00 GMT to 06:00 BST is 6 hours, all of it off-peak."""
    s, e = ts("2026-03-28T23:00:00+00:00"), ts("2026-03-29T06:00:00+01:00")
    assert dbm._offpeak_share(s, e, "23:00", "06:00") == pytest.approx(1.0)


@pytest.mark.usefixtures("london")
def test_offpeak_share_daytime_window_and_spanning_two_nights():
    s, e = ts("2026-10-10T12:00:00+01:00"), ts("2026-10-12T12:00:00+01:00")
    # Two full 00:30-05:30 windows in 48 h.
    assert dbm._offpeak_share(s, e, "00:30", "05:30") == pytest.approx(10 / 48)


def test_rate_for_blends_by_share():
    entry = {"rate": 0.30, "offpeak_rate": 0.06, "offpeak_start": "00:00", "offpeak_end": "00:00"}
    # A zero-length window (start == end) is treated as crossing midnight: the whole day.
    assert dbm.rate_for(entry, 0, 3600) == pytest.approx(0.06)
    assert dbm.rate_for({"rate": 0.30}, 0, 3600) == 0.30


def test_rate_at_picks_the_entry_in_force():
    rates = [{"valid_from": 0, "rate": 1}, {"valid_from": 100, "rate": 2}]
    assert dbm.rate_at(rates, 50)["rate"] == 1
    assert dbm.rate_at(rates, 100)["rate"] == 2
    assert dbm.rate_at(rates, -1) is None


def test_match_place_prefers_closest_and_keeps_anchors():
    places = [
        {"id": 1, "name": "Big", "lat": 52.0, "lon": -1.0, "radius_m": 2000, "anchors": []},
        {"id": 2, "name": "Shop", "lat": 52.001, "lon": -1.0, "radius_m": 50, "anchors": [[52.005, -1.0]]},
    ]
    assert dbm.match_place(places, 52.001, -1.0)["name"] == "Shop"
    assert dbm.match_place(places, 52.005, -1.0)["name"] == "Shop"  # anchor, outside the circle
    assert dbm.match_place(places, 52.01, -1.0)["name"] == "Big"
    assert dbm.match_place(places, None, None) is None


def test_trips_get_place_names_labels_and_place_defaults(db):
    db.add_trip(trip(end_lat=52.5, end_lon=-1.5))
    pid = db.save_place({"name": "Office", "lat": 52.5, "lon": -1.5, "radius_m": 100})
    db.set_place_label("Office", "Commute")
    [t] = db.trips("c1", 0, 1e12)
    assert t["end_place"] == "Office" and t["end_place_id"] == pid
    assert (t["label"], t["label_auto"]) == ("Commute", True)
    assert db.set_trip_label(t["id"], "Business")
    [t] = db.trips("c1", 0, 1e12)
    assert (t["label"], t["label_auto"]) == ("Business", False)
    assert not db.set_trip_label(9999, "x")


def test_renaming_a_place_carries_its_rates_and_default_label(db):
    pid = db.save_place({"name": "Gym", "lat": 1, "lon": 1, "radius_m": 50})
    db.save_rate({"location": "Gym", "valid_from": 0, "rate": 0.5})
    db.set_place_label("Gym", "Personal")
    db.save_place({"id": pid, "name": "Leisure centre", "lat": 1, "lon": 1, "radius_m": 50})
    assert [r["location"] for r in db.rates()] == ["Leisure centre"]
    assert db.place_labels() == {"Leisure centre": "Personal"}


def test_deleting_a_place_leaves_no_orphans(db):
    pid = db.save_place({"name": "Gone", "lat": 1, "lon": 1, "radius_m": 50})
    db.add_anchor(pid, 1, 1)
    db.delete_place(pid)
    assert db.places() == []
    assert db._exec("SELECT COUNT(*) AS n FROM place_anchors")[0]["n"] == 0


def test_charge_cost_sources(db):
    base = {"car": "c1", "end_ts": 5000.0, "soc_start": 20, "soc_end": 80, "kwh_car": 60.0, "place": "Home", "at_home": True}
    db.add_charge({**base, "start_ts": 1000.0, "kwh_meter": 50.0, "cost": 5.0, "cost_basis": "meter"})
    db.add_charge({**base, "start_ts": 2000.0, "kwh_power": 55.0})
    db.add_charge({**base, "start_ts": 3000.0, "place": "Free place", "at_home": False})
    db.save_rate({"location": "Home", "valid_from": 0, "rate": 0.25})
    db.save_rate({"location": "Free place", "valid_from": 0, "rate": 0})
    by_start = {c["start_ts"]: c for c in db.charges("c1", 0, 1e12)}
    assert (by_start[1000.0]["cost"], by_start[1000.0]["cost_source"]) == (5.0, "meter")
    assert (by_start[2000.0]["kwh_source"], by_start[2000.0]["cost"], by_start[2000.0]["cost_source"]) == ("power", 13.75, "rate")
    assert (by_start[3000.0]["kwh_source"], by_start[3000.0]["cost"], by_start[3000.0]["cost_source"]) == ("battery", 0.0, "free")


def test_adding_a_new_rate_never_changes_earlier_charges(db):
    db.add_charge({"car": "c1", "start_ts": 1000.0, "end_ts": 2000.0, "kwh_car": 10.0, "place": "Home"})
    db.save_rate({"location": "Home", "valid_from": 0, "rate": 0.2})
    db.save_rate({"location": "Home", "valid_from": 5000, "rate": 0.9})
    assert db.charges("c1", 0, 1e12)[0]["cost"] == 2.0


def test_replace_before_only_touches_older_rows_of_that_car(db):
    db.add_trip(trip(start_ts=100.0))
    db.add_trip(trip(start_ts=9000.0))
    db.add_trip(trip(car="c2", start_ts=100.0))
    db.replace_before("c1", 5000, [trip(start_ts=200.0), trip(start_ts=300.0)], [])
    assert sorted(t["start_ts"] for t in db.trips("c1", 0, 1e12)) == [200.0, 300.0, 9000.0]
    assert len(db.trips("c2", 0, 1e12)) == 1


def test_labels_survive_a_reimport(db):
    db.add_trip(trip(start_ts=100.4))
    [t] = db.trips("c1", 0, 1e12)
    db.set_trip_label(t["id"], "Business")
    db.replace_before("c1", 5000, [trip(start_ts=100.4)], [])
    assert db.trips("c1", 0, 1e12)[0]["label"] == "Business"


def test_totals_and_idle_parks(db):
    db.add_trip(trip(start_ts=100.0, soc_start=80, soc_end=70, distance_km=50, park_hours=10, park_drain_hours=10, park_soc_drop=1, park_charged=False))
    db.add_trip(trip(start_ts=200.0, soc_start=70, soc_end=70, distance_km=1, park_hours=2, park_soc_drop=0, park_charged=False))
    t = db.totals("c1", 0, 1e12)
    assert (t["trips"], t["distance_km"], t["soc_used"], t["distance_km_with_soc"]) == (2, 51, 10, 50)
    assert db.idle_parks("c1", 0, 6) == [(10, 1)]


def test_idle_parks_respects_an_end_time(db):
    db.add_trip(trip(start_ts=100.0, park_hours=10, park_drain_hours=10, park_soc_drop=1, park_charged=False))
    db.add_trip(trip(start_ts=9000.0, park_hours=10, park_drain_hours=10, park_soc_drop=3, park_charged=False))
    assert db.idle_parks("c1", 0, 6, 5000) == [(10, 1)]


def test_trip_lists_count_points_without_returning_them(db):
    db.add_trip(trip(start_ts=100.0))
    db.add_trip(trip(start_ts=200.0, points=None))
    db._exec("UPDATE trips SET points = NULL WHERE start_ts = 200.0")  # rows from before routes were kept
    rows = {t["start_ts"]: t for t in db.trips("c1", 0, 1e12)}
    assert (rows[100.0]["point_count"], rows[200.0]["point_count"]) == (2, 0)
    assert "points" not in rows[100.0]
    assert rows[100.0]["park_charged"] is False and rows[100.0]["id"]


def test_merge_and_split_rows_round_trip(db):
    a = db.add_trip(trip(start_ts=100.0, park_charged=True))
    b = db.add_trip(trip(start_ts=300.0))
    db.replace_trips([a, b], [trip(start_ts=100.0, distance_km=20.0, park_charged=True)])
    [t] = db.trips("c1", 0, 1e12)
    assert (t["distance_km"], t["park_charged"]) == (20.0, True)
    assert db.raw_trip(t["id"])["points"] == trip()["points"]
    assert db.next_trip("c1", 100.0) is None


def test_charge_locations_and_place_usage(db):
    pid = db.save_place({"name": "Shop", "lat": 52.1, "lon": -1.1, "radius_m": 100})
    db.add_charge({"car": "c1", "start_ts": 1000.0, "end_ts": 2000.0, "kwh_car": 5.0, "lat": 52.1, "lon": -1.1})
    db.add_charge({"car": "c1", "start_ts": 3000.0, "end_ts": 4000.0, "kwh_meter": 5.0, "place": "Home"})
    db.add_trip(trip(end_lat=52.1, end_lon=-1.1))
    locs = {loc["location"]: loc for loc in db.charge_locations()}
    assert (locs["Shop"]["charges"], locs["Shop"]["metered"]) == (1, 0)
    assert (locs["Home"]["metered"], locs["Home"]["last_ts"]) == (1, 3000.0)
    assert db.place_usage() == {pid: 2}  # one trip end and one charge
    assert db.first_ts("c1") == 1000.0 and db.first_ts("nobody") is None


def test_saving_a_rate_with_an_id_updates_it(db):
    rid = db.save_rate({"location": "Home", "valid_from": 0, "rate": 0.2})
    db.save_rate({"id": rid, "location": "Home", "valid_from": 0, "rate": 0.25})
    assert [r["rate"] for r in db.rates()] == [0.25]
    db.delete_rate(rid)
    assert db.rates() == []
