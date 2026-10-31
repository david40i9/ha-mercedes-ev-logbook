"""Logged zone names follow Home Assistant's zones when they change."""

from __future__ import annotations

from .conftest import AWAY, trips
from .test_logger import drive


def set_zone(ha, name: str, lat: float, lon: float, radius: float = 100, entity: str = "zone.office") -> None:
    ha.states.async_set(
        entity, "0", {"friendly_name": name, "latitude": lat, "longitude": lon, "radius": radius, "passive": False}
    )


async def test_zone_changes_rename_logged_trips(ha, car, advance):
    await drive(ha, advance)
    [t] = await trips(ha, car)
    assert (t["start_place"], t["end_place"]) == ("Home", None)
    db = car.runtime_data.db

    # A new zone where the trip ended names it.
    set_zone(ha, "Office", *AWAY)
    await advance(seconds=6)
    [t] = await trips(ha, car)
    assert t["end_place"] == "Office"

    # Renaming the zone renames the trip and carries its rate and default label.
    await ha.async_add_executor_job(db.save_rate, {"location": "Office", "valid_from": 0, "rate": 0})
    await ha.async_add_executor_job(db.set_place_label, "Office", "Commute")
    set_zone(ha, "Office (D90)", *AWAY)
    await advance(seconds=6)
    [t] = await trips(ha, car)
    assert t["end_place"] == "Office (D90)"
    assert [r["location"] for r in db.rates()] == ["Office (D90)"]
    assert db.place_labels() == {"Office (D90)": "Commute"}

    # Moving the zone away leaves the stop unnamed again; Home is untouched.
    set_zone(ha, "Office (D90)", AWAY[0] + 0.01, AWAY[1])
    await advance(seconds=6)
    [t] = await trips(ha, car)
    assert (t["start_place"], t["end_place"]) == ("Home", None)


async def test_people_coming_and_going_dont_resync(ha, car, advance, monkeypatch):
    set_zone(ha, "Office", *AWAY)
    await advance(seconds=6)
    calls = []
    monkeypatch.setattr(car.runtime_data.db, "located_stops", lambda: calls.append(1) or [])
    ha.states.async_set("zone.office", "2", dict(ha.states.get("zone.office").attributes))
    await advance(seconds=6)
    assert calls == []
