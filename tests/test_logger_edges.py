"""The live logger's less common paths: trip counters, miles, restarts, away charges, open items."""

from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant

from .conftest import AWAY, BASE_CONF, HOME, add_car, charges, set_car, trips

TRIP_SENSOR = "binary_sensor.test_car_logbook_trip_in_progress"
CHARGE_SENSOR = "binary_sensor.test_car_logbook_charging_session"
COUNTER_CONF = {**BASE_CONF, "trip_distance_entity": "sensor.car_distance"}


def odo_miles(ha: HomeAssistant, value: float) -> None:
    ha.states.async_set("sensor.car_odometer", str(value), {"unit_of_measurement": "mi"})


async def restart(ha: HomeAssistant, entry, while_down=None) -> None:
    """Unload the car, change states while it's down, and set it up again."""
    await ha.config_entries.async_unload(entry.entry_id)
    await ha.async_block_till_done()
    if while_down:
        while_down()
    await ha.config_entries.async_setup(entry.entry_id)
    await ha.async_block_till_done()


# ----- trip distance --------------------------------------------------------------------


async def test_trip_counter_gives_the_distance_and_survives_a_reset(ha, advance):
    """The 0.1-resolution counter beats a whole-mile odometer, and a reset to 0 mid-trip
    (after a long park the car clears it) carries on counting from 0."""
    odo_miles(ha, 1000)
    set_car(ha, distance=0)
    entry = await add_car(ha, COUNTER_CONF)
    set_car(ha, ignition="4")
    await advance(minutes=5)
    set_car(ha, distance=3.0)
    await advance(minutes=5)
    set_car(ha, distance=0)  # reset
    await advance(minutes=1)
    set_car(ha, distance=5.0, pos=AWAY)
    odo_miles(ha, 1005)  # 8.05 km, rounded to whole miles
    set_car(ha, ignition="0")
    await advance(minutes=4)
    [t] = await trips(ha, entry)
    assert t["distance_km"] == 8.0
    assert t["odo_start_km"] == pytest.approx(1609.344)
    assert t["odo_end_km"] == pytest.approx(1005 * 1.609344)


async def test_odometer_wins_when_the_counter_missed_updates(ha, advance):
    """More than 2 km apart: a counter update was missed, so trust the odometer."""
    set_car(ha, distance=0)
    entry = await add_car(ha, COUNTER_CONF)
    set_car(ha, ignition="4")
    await advance(minutes=5)
    set_car(ha, distance=3.0)
    await advance(minutes=10)
    set_car(ha, odometer=1020, pos=AWAY, ignition="0")
    await advance(minutes=4)
    [t] = await trips(ha, entry)
    assert t["distance_km"] == 20


async def test_a_counter_rise_starts_a_trip_the_stale_check_closed(ha, advance):
    set_car(ha, distance=0)
    entry = await add_car(ha, COUNTER_CONF)
    set_car(ha, ignition="4")
    await advance(minutes=1)
    set_car(ha, distance=5.0, odometer=1005)
    await advance(minutes=31)  # stuck "on" with no movement: trip 1 closed
    assert ha.states.get(TRIP_SENSOR).state == "off"
    set_car(ha, distance=6.0)
    await ha.async_block_till_done()
    assert ha.states.get(TRIP_SENSOR).state == "on"
    assert len(await trips(ha, entry)) == 1


async def test_steady_movement_keeps_a_long_drive_open(ha, car, advance):
    """The 30-minute stale check counts from the last movement, not the start."""
    set_car(ha, ignition="4")
    for i in range(1, 7):
        await advance(minutes=10)
        set_car(ha, pos=(52.0 + 0.01 * i, -1.0), odometer=1000 + 10 * i)
        await ha.async_block_till_done()
    assert ha.states.get(TRIP_SENSOR).state == "on"
    set_car(ha, ignition="0")
    await advance(minutes=4)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 60
    assert t["point_count"] == 7  # the start and six fixes


async def test_a_resent_gps_fix_is_not_a_new_route_point(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=5)
    for _ in range(2):
        ha.states.async_set("device_tracker.car", "not_home", {"latitude": 52.05, "longitude": -1.0, "timestamp": "t1"})
        await advance(minutes=1)
    # Same fix time, nudged position (rounding in the API): still the same fix.
    ha.states.async_set("device_tracker.car", "not_home", {"latitude": 52.0501, "longitude": -1.0, "timestamp": "t1"})
    await advance(minutes=1)
    set_car(ha, odometer=1010, ignition="0")
    await advance(minutes=4)
    [t] = await trips(ha, car)
    pts = (await ha.async_add_executor_job(car.runtime_data.db.raw_trip, t["id"]))["points"]
    # The start, t1 once, and the end where the car stopped (at ignition off, not the nudge).
    assert [p[1] for p in pts] == [52.0, 52.05, 52.0501]
    assert pts[-1][0] == round(t["end_ts"])


# ----- ignition codes (open item L1) ------------------------------------------------------


async def test_ignition_1_keeps_the_trip_open_until_the_stale_check(ha, car, advance):
    """mbapi2020 reports 1 for "off" (0 is "lock"); only 0 counts as off today.

    Pins current behaviour: a car parked at 1 keeps its trip open, and the trip
    is only closed by the 30-minute stale check, ending at the last movement.
    The EQS goes 4 -> 0; check the CLA before changing IGNITION_OFF.
    """
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, pos=AWAY, odometer=1015)
    await advance(minutes=1)
    set_car(ha, ignition="1")
    await advance(minutes=4)
    assert ha.states.get(TRIP_SENSOR).state == "on"  # the stop time doesn't apply
    await advance(minutes=27)
    assert ha.states.get(TRIP_SENSOR).state == "off"
    [t] = await trips(ha, car)
    assert t["distance_km"] == 15
    assert t["end_ts"] - t["start_ts"] == pytest.approx(10 * 60, abs=2)


@pytest.mark.xfail(strict=True, reason="Open item L1: ignition 1 (off) counts as driving")
async def test_ignition_1_ends_the_trip_after_the_stop_time(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, pos=AWAY, odometer=1015)
    set_car(ha, ignition="1")
    await advance(minutes=4)
    assert ha.states.get(TRIP_SENSOR).state == "off"


# ----- restarts -----------------------------------------------------------------------------


async def test_restart_mid_drive_with_the_ignition_still_on_keeps_one_trip(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1010, pos=AWAY)
    await ha.async_block_till_done()
    await restart(ha, car)
    assert ha.states.get(TRIP_SENSOR).state == "on"
    await advance(minutes=10)
    set_car(ha, odometer=1025, pos=HOME, ignition="0")
    await advance(minutes=4)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 25
    assert t["odo_start_km"] == 1000


async def test_restart_while_the_car_is_being_driven_starts_a_trip(ha, car, advance):
    """Ignition went on while HA was down: the trip starts at the restart."""
    await restart(ha, car, lambda: set_car(ha, ignition="4"))
    assert ha.states.get(TRIP_SENSOR).state == "on"
    await advance(minutes=10)
    set_car(ha, odometer=1012, pos=AWAY, ignition="0")
    await advance(minutes=4)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 12


async def test_restart_mid_trip_in_movement_mode_ends_after_the_stop_time(ha, advance):
    conf = {k: v for k, v in BASE_CONF.items() if k != "ignition_entity"}
    entry = await add_car(ha, conf)
    set_car(ha, odometer=1004)
    await advance(minutes=1)
    set_car(ha, odometer=1009, pos=AWAY)
    await ha.async_block_till_done()
    await restart(ha, entry)
    assert ha.states.get(TRIP_SENSOR).state == "on"
    await advance(minutes=4)
    assert ha.states.get(TRIP_SENSOR).state == "off"
    [t] = await trips(ha, entry)
    assert t["distance_km"] == 9


async def test_restart_while_charging_started_picks_up_the_charge(ha, car, advance):
    await restart(ha, car, lambda: set_car(ha, charging="on", power=7))
    assert ha.states.get(CHARGE_SENSOR).state == "on"
    await advance(hours=1)
    set_car(ha, charging="off", power=0, soc=87)
    await advance(minutes=11)
    [c] = await charges(ha, car)
    assert c["kwh_power"] == pytest.approx(7, abs=0.01)


# ----- charging -------------------------------------------------------------------------------


async def test_away_charge_ignores_the_home_meter_and_car_power(ha, advance):
    """Charging away from home: the home meter isn't this car's, and its power isn't
    costed at the home price. kWh comes from the battery % gained."""
    ha.states.async_set("sensor.meter", "100", {"unit_of_measurement": "kWh"})
    ha.states.async_set("sensor.price", "25", {"unit_of_measurement": "p/kWh"})
    entry = await add_car(ha, {**BASE_CONF, "charger_energy_entity": "sensor.meter", "price_entity": "sensor.price"})
    set_car(ha, pos=AWAY, soc=50)
    set_car(ha, charging="on", power=50)
    await ha.async_block_till_done()
    await advance(minutes=30)
    ha.states.async_set("sensor.meter", "105", {"unit_of_measurement": "kWh"})  # someone else at home
    set_car(ha, soc=80, power=0, charging="off")
    await advance(minutes=11)
    [c] = await charges(ha, entry)
    assert c["at_home"] is False and c["place"] is None
    assert (c["kwh_meter"], c["kwh_power"], c["kwh_car"]) == (None, None, 30.0)
    assert (c["kwh"], c["kwh_source"]) == (30.0, "battery")
    assert c["cost"] is None and c["cost_source"] is None  # no rate for an unnamed place
    assert c["max_power_kw"] == 50


async def test_power_only_charge_is_costed_at_each_price_in_turn(ha, advance):
    ha.states.async_set("sensor.price", "10", {"unit_of_measurement": "p/kWh"})
    entry = await add_car(ha, {**BASE_CONF, "price_entity": "sensor.price"})
    set_car(ha, charging="on", power=7)
    await advance(hours=1)
    ha.states.async_set("sensor.price", "30", {"unit_of_measurement": "p/kWh"})
    await advance(hours=1)
    set_car(ha, charging="off", power=0, soc=94)
    await advance(minutes=11)
    [c] = await charges(ha, entry)
    assert c["kwh_power"] == pytest.approx(14, abs=0.01)
    assert c["cost"] == pytest.approx(0.7 + 2.1, abs=0.01)
    assert c["cost_source"] == "power"


async def test_a_charge_that_added_nothing_is_not_recorded(ha, car, advance):
    """Plugged in but the car was already full (or the charger never started)."""
    set_car(ha, charging="on", power=0)
    await advance(minutes=20)
    set_car(ha, charging="off")
    await advance(minutes=11)
    assert await charges(ha, car) == []
    assert ha.states.get(CHARGE_SENSOR).state == "off"


async def test_a_charge_that_added_nothing_still_marks_the_park_charged(ha, car, advance):
    """Pins current behaviour: the park is marked charged as soon as charging starts,
    so a session that added nothing still leaves this park out of idle drain."""
    from .test_logger import drive

    await drive(ha, advance)
    set_car(ha, charging="on", power=0)
    await advance(minutes=20)
    set_car(ha, charging="off")
    await advance(minutes=11)
    await advance(hours=10)
    set_car(ha, soc=75)
    await drive(ha, advance)
    t2 = max(await trips(ha, car), key=lambda t: t["start_ts"])
    assert t2["park_charged"] is True
    assert t2["park_soc_drop"] == 1  # still measured, from the end of the session


async def test_a_charge_longer_than_the_gap_after_a_stop_is_two_sessions(ha, car, advance):
    set_car(ha, charging="on", power=7)
    await advance(minutes=30)
    set_car(ha, charging="off", power=0, soc=84)
    await advance(minutes=11)
    set_car(ha, charging="on", power=7)
    await advance(minutes=30)
    set_car(ha, charging="off", power=0, soc=88)
    await advance(minutes=11)
    rows = sorted(await charges(ha, car), key=lambda c: c["start_ts"])
    assert [round(c["kwh_power"], 2) for c in rows] == [3.5, 3.5]
    assert (rows[0]["soc_start"], rows[0]["soc_end"], rows[1]["soc_end"]) == (80, 84, 88)


# ----- 0.36.4: driving off before a charge closes, and trips across a restart ---------------

async def rapid_charge_then_drive(ha, advance, soc_after_drive: float) -> None:
    """A 20 to 80% rapid charge away from home, then driving off within the 10 minute gap."""
    set_car(ha, pos=AWAY, soc=20)
    await advance(minutes=1)
    set_car(ha, charging="on", power=150)
    await advance(minutes=25)
    set_car(ha, soc=80, power=0, charging="off")
    await advance(minutes=2)
    set_car(ha, ignition="4")
    await advance(minutes=5)
    set_car(ha, odometer=1030, soc=soc_after_drive)
    await advance(minutes=5)  # the charge closes while driving


@pytest.mark.parametrize("soc_after_drive", [75, 19])
async def test_driving_off_before_a_charge_closes_keeps_its_end_battery(ha, car, advance, soc_after_drive):
    await rapid_charge_then_drive(ha, advance, soc_after_drive)
    [c] = await charges(ha, car)
    assert c["soc_end"] == 80
    assert c["kwh_car"] == 60


async def test_a_charge_that_resumes_after_a_trip_starts_reads_the_battery_at_the_end(ha, car, advance):
    """Sat in the car with the ignition on during a pause: charging resumes, so it ends later."""
    set_car(ha, soc=20, charging="on", power=7)
    await advance(hours=1)
    set_car(ha, power=0, charging="off", soc=30)
    await advance(minutes=1)
    set_car(ha, ignition="4")
    await advance(minutes=1)
    set_car(ha, charging="on", power=7)
    await advance(hours=1)
    set_car(ha, power=0, charging="off", soc=40)
    await advance(minutes=11)
    [c] = await charges(ha, car)
    assert c["soc_end"] == 40


async def test_restart_with_the_odometer_unavailable_waits_for_it(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1010)

    def down():
        set_car(ha, ignition="0")
        ha.states.async_set("sensor.car_odometer", "unavailable")

    await restart(ha, car, down)
    await advance(seconds=5)
    assert await trips(ha, car) == []
    assert ha.states.get(TRIP_SENSOR).state == "on"
    set_car(ha, odometer=1010)
    await advance(minutes=1)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 10


async def test_restart_with_every_sensor_unavailable_keeps_an_old_trip(ha, car, advance):
    """The ignition is unavailable too, and the trip looks stale: still wait for the odometer."""
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1010)
    await ha.async_block_till_done()
    await ha.config_entries.async_unload(car.entry_id)
    await ha.async_block_till_done()
    await advance(hours=1)  # HA is down
    for entity_id in ("sensor.car_ignition", "sensor.car_odometer"):
        ha.states.async_set(entity_id, "unavailable")
    await ha.config_entries.async_setup(car.entry_id)
    await ha.async_block_till_done()
    await advance(minutes=3)
    assert await trips(ha, car) == []
    set_car(ha, odometer=1010, ignition="0")
    await advance(minutes=1)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 10


async def test_restart_in_movement_mode_with_the_odometer_unavailable_waits_for_it(ha, advance):
    conf = {k: v for k, v in BASE_CONF.items() if k != "ignition_entity"}
    entry = await add_car(ha, conf)
    set_car(ha, odometer=1004)
    await advance(minutes=1)
    set_car(ha, odometer=1009, pos=AWAY)
    await ha.async_block_till_done()
    await restart(ha, entry, lambda: ha.states.async_set("sensor.car_odometer", "unavailable"))
    await advance(minutes=4)
    assert await trips(ha, entry) == []
    set_car(ha, odometer=1009)
    await advance(minutes=1)
    [t] = await trips(ha, entry)
    assert t["distance_km"] == 9


async def test_an_odometer_that_never_comes_back_ends_the_trip_after_half_an_hour(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, pos=AWAY)

    def down():
        set_car(ha, ignition="0")
        ha.states.async_set("sensor.car_odometer", "unavailable")

    await restart(ha, car, down)
    for _ in range(29):
        await advance(minutes=1)
    assert ha.states.get(TRIP_SENSOR).state == "on"
    for _ in range(3):
        await advance(minutes=1)
    assert ha.states.get(TRIP_SENSOR).state == "off"


async def test_a_trip_that_ended_while_ha_was_down_ends_at_the_last_movement(ha, car, advance):
    """A 20 minute drive, then 3 hours with HA down: the trip is 20 minutes, not 200."""
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1010, pos=AWAY)
    await advance(minutes=10)
    set_car(ha, odometer=1020, pos=HOME)
    await ha.async_block_till_done()
    await ha.config_entries.async_unload(car.entry_id)
    await ha.async_block_till_done()
    set_car(ha, ignition="0")
    await advance(hours=3)
    await ha.config_entries.async_setup(car.entry_id)
    await ha.async_block_till_done()
    await advance(seconds=1)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 20
    assert t["end_ts"] - t["start_ts"] == pytest.approx(20 * 60, abs=5)


async def test_a_trip_the_database_refuses_is_kept_and_saved_later(ha, car, advance, caplog):
    import sqlite3
    from unittest.mock import patch

    db = car.runtime_data.db
    real = db.add_trip
    with patch.object(db, "add_trip", side_effect=sqlite3.OperationalError("database or disk is full")):
        set_car(ha, ignition="4")
        await advance(minutes=10)
        set_car(ha, odometer=1012, pos=AWAY, ignition="0")
        await advance(minutes=4)
    assert "couldn't save a trip" in caplog.text
    assert await trips(ha, car) == []
    # It survives a restart too.
    await restart(ha, car)
    with patch.object(db, "add_trip", side_effect=real):
        await advance(minutes=1)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 12


async def test_a_charge_the_database_refuses_is_saved_later(ha, car, advance):
    import sqlite3
    from unittest.mock import patch

    db = car.runtime_data.db
    real = db.add_charge
    with patch.object(db, "add_charge", side_effect=sqlite3.OperationalError("database is locked")):
        set_car(ha, charging="on", power=7)
        await advance(hours=1)
        set_car(ha, charging="off", power=0, soc=87)
        await advance(minutes=11)
    assert await charges(ha, car) == []
    with patch.object(db, "add_charge", side_effect=real):
        await advance(minutes=5)
    [c] = await charges(ha, car)
    assert c["kwh_power"] == pytest.approx(7, abs=0.01)


async def test_a_steady_charge_records_its_first_reading_as_the_peak(ha, car, advance):
    """A rapid charge at a steady 150 kW sends no further power reading."""
    set_car(ha, pos=AWAY, power=150)
    await ha.async_block_till_done()
    set_car(ha, charging="on")
    await advance(minutes=20)
    set_car(ha, charging="off", soc=95)
    await advance(minutes=11)
    [c] = await charges(ha, car)
    assert c["max_power_kw"] == 150
