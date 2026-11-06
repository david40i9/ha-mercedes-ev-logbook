"""Missed trips: the odometer moved while Home Assistant wasn't watching."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from homeassistant.core import HomeAssistant, State

from custom_components.mb_logbook import gaps
from custom_components.mb_logbook.const import DOMAIN

from .conftest import AWAY, BASE_CONF, set_car, trips
from .test_logger import drive
from .test_logger_edges import restart

ELSEWHERE = (52.3, -1.3)


async def test_driving_while_ha_was_down_becomes_a_missed_trip(ha, car, advance):
    await drive(ha, advance, km=15)  # Home -> AWAY, odometer 1000 -> 1015
    await advance(hours=2)
    await restart(ha, car, lambda: set_car(ha, odometer=1040, pos=ELSEWHERE))
    await advance(hours=1)
    await drive(ha, advance, km=10)  # ELSEWHERE -> AWAY
    rows = sorted(await trips(ha, car), key=lambda t: t["start_ts"])
    assert [round(t["distance_km"]) for t in rows] == [15, 25, 10]
    first, missed, last = rows
    assert [t["gap"] for t in rows] == [False, True, False]
    assert (missed["odo_start_km"], missed["odo_end_km"]) == (1015, 1040)
    assert (missed["start_lat"], missed["start_lon"]) == AWAY
    assert (missed["end_lat"], missed["end_lon"]) == ELSEWHERE
    assert first["end_ts"] <= missed["start_ts"] <= missed["end_ts"] <= last["start_ts"]
    assert missed["point_count"] == 0
    # The park before the next trip started at an unknown time, so it isn't measured.
    assert last["park_hours"] is None and last["park_soc_drop"] is None


async def test_a_small_odometer_step_is_not_a_missed_trip(ha, car, advance):
    """A whole-mile odometer, or a late final reading, moves it a little."""
    await drive(ha, advance, km=15)
    set_car(ha, odometer=1017)
    await advance(hours=3)
    await drive(ha, advance, km=10)
    rows = await trips(ha, car)
    assert len(rows) == 2 and not any(t["gap"] for t in rows)
    assert all(t["park_hours"] is not None for t in rows if t["start_ts"] > min(r["start_ts"] for r in rows))


def _trip(start, end, odo_a, odo_b, pos_a=(52.0, -1.0), pos_b=AWAY, soc=(80, 76)):
    return {
        "car": "VIN1", "start_ts": start, "end_ts": end, "odo_start_km": odo_a, "odo_end_km": odo_b,
        "distance_km": odo_b - odo_a, "soc_start": soc[0], "soc_end": soc[1],
        "start_lat": pos_a[0], "start_lon": pos_a[1], "end_lat": pos_b[0], "end_lon": pos_b[1],
        "points": [],
    }


async def test_fill_gaps_restores_past_gaps_once(ha: HomeAssistant, car):
    lg = car.runtime_data
    now = datetime.now(UTC).timestamp()
    t0 = now - 6 * 3600
    for t in (
        _trip(t0, t0 + 1200, 1000, 1015, soc=(80, 76)),
        # 30 km missing between these, and the car was charged in the gap
        _trip(t0 + 3 * 3600, t0 + 3 * 3600 + 900, 1045, 1055, pos_a=ELSEWHERE, soc=(90, 88)),
    ):
        await ha.async_add_executor_job(lg.db.add_trip, t)
    res = await ha.services.async_call(DOMAIN, "fill_gaps", {"days": 2}, blocking=True, return_response=True)
    assert res == {"Test car": {"missed_trips": 1}}
    missed = next(t for t in await trips(ha, car) if t["gap"])
    assert missed["distance_km"] == 30
    assert (missed["soc_start"], missed["soc_end"]) == (None, None)  # charged: battery used unknown
    assert t0 + 1200 <= missed["start_ts"] <= missed["end_ts"] <= t0 + 3 * 3600
    again = await ha.services.async_call(DOMAIN, "fill_gaps", {}, blocking=True, return_response=True)
    assert again == {"Test car": {"missed_trips": 0}}


def _st(eid, state, ts, **attrs):
    t = datetime.fromtimestamp(ts, UTC)
    return State(eid, state, attrs, last_changed=t, last_updated=t)


def test_window_uses_the_last_sight_of_the_parked_car_and_the_first_new_reading():
    conf = {**BASE_CONF}
    odo, trk = conf["odometer_entity"], conf["tracker_entity"]
    prev = {"end_ts": 1000.0, "end_lat": AWAY[0], "end_lon": AWAY[1]}
    states = {
        odo: [
            _st(odo, "1015", 1500, unit_of_measurement="km"),
            _st(odo, "unavailable", 5000),
            _st(odo, "1040", 5100, unit_of_measurement="km"),
        ],
        trk: [
            _st(trk, "not_home", 2000, latitude=AWAY[0], longitude=AWAY[1]),
            # after the restart, already somewhere else: not a sight of the parked car
            _st(trk, "not_home", 5050, latitude=ELSEWHERE[0], longitude=ELSEWHERE[1]),
        ],
    }
    assert gaps._window_from_states(states, conf, prev, 1040, 1000, 9000) == (2000, 5100)
    # Nothing recorded: the whole park
    assert gaps._window_from_states({}, conf, prev, 1040, 1000, 9000) == (1000, 9000)


@pytest.mark.parametrize(
    ("prev", "nxt", "expected"),
    [
        (None, {"odo_start_km": 10, "start_ts": 5}, None),
        ({"odo_end_km": 10, "end_ts": 1}, {"odo_start_km": 12.9, "start_ts": 5}, None),
        ({"odo_end_km": 10, "end_ts": 1}, {"odo_start_km": 20, "start_ts": 5}, 10),
        ({"odo_end_km": None, "end_ts": 1}, {"odo_start_km": 20, "start_ts": 5}, None),
        ({"odo_end_km": 10, "end_ts": 9}, {"odo_start_km": 20, "start_ts": 5}, None),
    ],
)
def test_missed_km(prev, nxt, expected):
    assert gaps.missed_km(prev, nxt, 3.0) == expected


def test_missed_trip_keeps_battery_figures_when_not_charged():
    lg = SimpleNamespace(car_id="VIN1", _place=lambda lat, lon: (None, None))
    prev = _trip(0, 10, 0, 15)
    nxt = _trip(100, 110, 40, 50, soc=(70, 65))
    t = gaps.missed_trip(lg, prev, nxt, 20, 90)
    assert (t["soc_start"], t["soc_end"], t["distance_km"], t["gap"]) == (76, 70, 25, 1)
