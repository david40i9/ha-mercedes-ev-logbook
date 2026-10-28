"""The live logger, driven by state changes the way mbapi2020 sends them."""

from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant

from .conftest import AWAY, BASE_CONF, HOME, add_car, base_states, charges, set_car, trips

TRIP_SENSOR = "binary_sensor.test_car_logbook_trip_in_progress"
CHARGE_SENSOR = "binary_sensor.test_car_logbook_charging_session"


async def drive(ha: HomeAssistant, advance, km: float = 15, soc_used: float = 4, minutes: float = 20) -> None:
    """Ignition on, drive somewhere, ignition off, wait out the stop time."""
    odo = float(ha.states.get("sensor.car_odometer").state)
    soc = float(ha.states.get("sensor.car_soc").state)
    set_car(ha, ignition="4")
    await ha.async_block_till_done()
    await advance(minutes=minutes / 2)
    set_car(ha, pos=AWAY, odometer=odo + km / 2)
    await advance(minutes=minutes / 2)
    set_car(ha, odometer=odo + km, soc=soc - soc_used)
    set_car(ha, ignition="0")
    await ha.async_block_till_done()
    await advance(minutes=4)


async def test_a_drive_becomes_one_trip(ha, car, advance):
    set_car(ha, ignition="4")
    await ha.async_block_till_done()
    assert ha.states.get(TRIP_SENSOR).state == "on"
    assert ha.states.get(TRIP_SENSOR).attributes["from"] == "Home"
    await advance(minutes=10)
    set_car(ha, pos=AWAY, odometer=1007)
    await advance(minutes=10)
    set_car(ha, odometer=1015, soc=76)
    set_car(ha, ignition="0")
    await ha.async_block_till_done()
    await advance(minutes=2)
    assert ha.states.get(TRIP_SENSOR).state == "on"  # still inside the stop time
    await advance(minutes=2)
    assert ha.states.get(TRIP_SENSOR).state == "off"
    [t] = await trips(ha, car)
    assert t["distance_km"] == 15
    assert (t["soc_start"], t["soc_end"]) == (80, 76)
    assert t["start_place"] == "Home" and t["end_place"] is None
    assert t["end_ts"] - t["start_ts"] == pytest.approx(20 * 60, abs=2)
    assert t["point_count"] >= 2
    assert ha.states.get("sensor.test_car_logbook_last_trip_distance").state == "15.0"
    assert ha.states.get("sensor.test_car_logbook_last_trip_energy").state == "4.0"


async def test_ignition_without_driving_is_not_a_trip(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1000.1)
    set_car(ha, ignition="0")
    await advance(minutes=4)
    assert await trips(ha, car) == []
    assert ha.states.get(TRIP_SENSOR).state == "off"


async def test_a_quick_stop_inside_the_stop_time_stays_one_trip(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1005, ignition="0")
    await advance(minutes=2)
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1012, ignition="0")
    await advance(minutes=4)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 12


async def test_unavailable_ignition_does_not_end_a_trip(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=5)
    set_car(ha, ignition="unavailable")
    await advance(minutes=5)
    set_car(ha, ignition="4")
    await advance(minutes=5)
    assert ha.states.get(TRIP_SENSOR).state == "on"


async def test_ignition_stuck_on_with_no_movement_ends_at_last_movement(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=5)
    set_car(ha, pos=AWAY, odometer=1020)
    await ha.async_block_till_done()
    await advance(minutes=31)
    [t] = await trips(ha, car)
    assert t["end_ts"] - t["start_ts"] == pytest.approx(5 * 60, abs=2)
    assert ha.states.get(TRIP_SENSOR).state == "off"
    # The car moves again with the ignition still on: a new trip.
    set_car(ha, pos=HOME, odometer=1040)
    await ha.async_block_till_done()
    assert ha.states.get(TRIP_SENSOR).state == "on"


async def test_parked_drain_is_recorded_on_the_next_trip(ha, car, advance):
    await drive(ha, advance, soc_used=10)  # ends at 70%
    await advance(hours=10)
    set_car(ha, soc=69)
    await drive(ha, advance)
    t = sorted(await trips(ha, car), key=lambda t: t["start_ts"])[1]
    assert t["park_soc_drop"] == 1
    assert t["park_hours"] == pytest.approx(10, abs=0.1)
    assert t["park_charged"] is False
    assert float(ha.states.get("sensor.test_car_logbook_idle_drain").state) == pytest.approx(2.4, abs=0.05)


async def test_movement_mode_without_an_ignition_sensor(ha, advance):
    conf = {k: v for k, v in BASE_CONF.items() if k != "ignition_entity"}
    entry = await add_car(ha, conf)
    set_car(ha, odometer=1001)
    await ha.async_block_till_done()
    assert ha.states.get(TRIP_SENSOR).state == "on"
    await advance(minutes=2)
    set_car(ha, odometer=1004, pos=AWAY)
    await advance(minutes=2)
    set_car(ha, odometer=1008)
    await advance(minutes=4)
    [t] = await trips(ha, entry)
    # The trip starts from the reading before the first movement.
    assert t["distance_km"] == 8
    assert t["odo_start_km"] == 1000


async def test_restart_mid_trip_after_the_car_was_switched_off(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1010)
    await ha.config_entries.async_unload(car.entry_id)
    await ha.async_block_till_done()
    set_car(ha, ignition="0")  # while HA was "down"
    await ha.config_entries.async_setup(car.entry_id)
    await ha.async_block_till_done()
    await advance(seconds=1)
    [t] = await trips(ha, car)
    assert t["distance_km"] == 10


# ----- charging ---------------------------------------------------------------------


async def test_home_charge_with_a_meter_and_live_price(ha, advance):
    ha.states.async_set("sensor.meter", "100", {"unit_of_measurement": "kWh"})
    ha.states.async_set("sensor.price", "25", {"unit_of_measurement": "p/kWh"})
    entry = await add_car(ha, {**BASE_CONF, "charger_energy_entity": "sensor.meter", "price_entity": "sensor.price"})
    set_car(ha, charging="on", power=7)
    await ha.async_block_till_done()
    assert ha.states.get(CHARGE_SENSOR).state == "on"
    for i in range(1, 5):
        await advance(minutes=30)
        ha.states.async_set("sensor.meter", str(100 + 3.5 * i), {"unit_of_measurement": "kWh"})
    set_car(ha, soc=94, power=0, charging="off")
    await advance(minutes=11)
    [c] = await charges(ha, entry)
    assert c["kwh_meter"] == 14.0 and c["kwh_source"] == "meter"
    assert (c["cost"], c["cost_source"]) == (3.5, "meter")
    assert c["at_home"] is True
    assert c["max_power_kw"] == 7


async def test_meter_glitches_are_ignored(ha, advance):
    ha.states.async_set("sensor.meter", "100", {"unit_of_measurement": "kWh"})
    entry = await add_car(ha, {**BASE_CONF, "charger_energy_entity": "sensor.meter"})
    set_car(ha, charging="on")
    await ha.async_block_till_done()
    for value in ("105", "unavailable", "106", "0", "107", "500", "108"):
        ha.states.async_set("sensor.meter", value, {"unit_of_measurement": "kWh"})
        await ha.async_block_till_done()
    set_car(ha, soc=90, charging="off")
    await advance(minutes=11)
    [c] = await charges(ha, entry)
    # 100->105, then 105->106 across the unavailable spell; the drop to 0 and the
    # jumps to 107 and 500 are glitches, and 500->108 is a drop.
    assert c["kwh_meter"] == 6.0


async def test_price_sensor_unavailable_all_session_falls_back_to_the_rate(ha, advance):
    ha.states.async_set("sensor.meter", "100", {"unit_of_measurement": "kWh"})
    ha.states.async_set("sensor.price", "unavailable")
    entry = await add_car(ha, {**BASE_CONF, "charger_energy_entity": "sensor.meter", "price_entity": "sensor.price"})
    await ha.async_add_executor_job(entry.runtime_data.db.save_rate, {"location": "Home", "valid_from": 0, "rate": 0.2})
    set_car(ha, charging="on")
    await ha.async_block_till_done()
    ha.states.async_set("sensor.meter", "110", {"unit_of_measurement": "kWh"})
    set_car(ha, soc=90, charging="off")
    await advance(minutes=11)
    [c] = await charges(ha, entry)
    assert (c["cost"], c["cost_source"]) == (2.0, "rate")


async def test_power_only_charge_is_kept_when_the_battery_percent_lags(ha, car, advance):
    """No meter: the car's charging power says 7 kWh went in, though SoC hasn't updated yet."""
    set_car(ha, charging="on", power=7)
    await ha.async_block_till_done()
    await advance(hours=1)
    set_car(ha, power=0, charging="off")
    await advance(minutes=11)
    [c] = await charges(ha, car)
    assert c["kwh_power"] == pytest.approx(7, abs=0.01)
    assert c["kwh_source"] == "power"


async def test_a_pause_shorter_than_the_gap_is_one_session(ha, car, advance):
    set_car(ha, charging="on", power=7)
    await advance(minutes=30)
    set_car(ha, charging="off", power=0)
    await advance(minutes=5)
    set_car(ha, charging="on", power=7)
    await advance(minutes=30)
    set_car(ha, charging="off", power=0, soc=95)
    await advance(minutes=11)
    [c] = await charges(ha, car)
    assert c["kwh_power"] == pytest.approx(7, abs=0.01)  # the paused 5 minutes don't count


async def test_charge_survives_a_restart_while_mbapi2020_is_still_loading(ha, car, advance):
    """At start-up the car's sensors are often unavailable for a while; that's not 'charging stopped'."""
    set_car(ha, charging="on", power=7)
    await advance(minutes=30)
    await ha.config_entries.async_unload(car.entry_id)
    await ha.async_block_till_done()
    set_car(ha, charging="unavailable")
    await ha.config_entries.async_setup(car.entry_id)
    await ha.async_block_till_done()
    await advance(minutes=15)
    set_car(ha, charging="on", power=7)
    await advance(minutes=15)
    set_car(ha, charging="off", power=0, soc=95)
    await advance(minutes=11)
    [c] = await charges(ha, car)
    assert c["end_ts"] - c["start_ts"] == pytest.approx(60 * 60, abs=5)


async def test_charge_that_ended_while_ha_was_down_does_not_count_the_downtime(ha, car, advance):
    set_car(ha, charging="on", power=7)
    await advance(hours=1)
    await ha.config_entries.async_unload(car.entry_id)
    await ha.async_block_till_done()
    await advance(hours=3)  # HA down; the charge stopped in here
    set_car(ha, charging="off", power=0, soc=90)
    await ha.config_entries.async_setup(car.entry_id)
    await ha.async_block_till_done()
    await advance(minutes=1)
    [c] = await charges(ha, car)
    # The hour we saw, and nothing for the unseen part: never 4 h x 7 kW.
    assert c["kwh_power"] == pytest.approx(7, abs=0.01)
    assert c["end_ts"] - c["start_ts"] == pytest.approx(3600, abs=5)


async def test_plugging_in_on_arrival_marks_the_park_charged(ha, car, advance):
    set_car(ha, ignition="4")
    await advance(minutes=10)
    set_car(ha, odometer=1010, soc=75, ignition="0")
    await advance(minutes=1)
    set_car(ha, charging="on", power=7)  # plugged in before the trip closed
    await advance(minutes=3)
    set_car(ha, soc=78)
    [t] = await trips(ha, car)
    assert t["soc_end"] == 75  # the level when charging began
    await advance(hours=2)
    set_car(ha, soc=90, power=0, charging="off")
    await advance(minutes=11)
    await advance(hours=8)
    set_car(ha, soc=89)
    await drive(ha, advance)
    t2 = max(await trips(ha, car), key=lambda t: t["start_ts"])
    assert t2["park_charged"] is True
    assert t2["park_soc_drop"] == 1
    assert t2["park_drain_hours"] < t2["park_hours"]


async def test_two_cars_on_one_meter_share_it_by_charging_power(ha, advance):
    ha.states.async_set("sensor.meter", "100", {"unit_of_measurement": "kWh"})
    base_states(ha, "car2")
    a = await add_car(ha, {**BASE_CONF, "charger_energy_entity": "sensor.meter"})
    b = await add_car(
        ha,
        {**{k: v.replace("car", "car2") if isinstance(v, str) and "car" in v and "_entity" in k else v for k, v in BASE_CONF.items()},
         "car_name": "Second", "charger_energy_entity": "sensor.meter"},
        unique_id="VIN2", title="Second",
    )
    set_car(ha, charging="on", power=7.5)
    set_car(ha, "car2", charging="on", power=2.5)
    await ha.async_block_till_done()
    ha.states.async_set("sensor.meter", "110", {"unit_of_measurement": "kWh"})
    await ha.async_block_till_done()
    set_car(ha, charging="off", power=0, soc=90)
    set_car(ha, "car2", charging="off", power=0, soc=85)
    await advance(minutes=11)
    [ca] = await charges(ha, a)
    [cb] = await charges(ha, b)
    assert (ca["kwh_meter"], cb["kwh_meter"]) == (7.5, 2.5)


async def test_resuming_after_a_pause_counts_power_even_if_the_reading_never_changed(ha, car, advance):
    """Some cars keep reporting the same power through a short pause."""
    set_car(ha, charging="on", power=7)
    await advance(minutes=30)
    set_car(ha, charging="off")
    await advance(minutes=5)
    set_car(ha, charging="on")
    await advance(minutes=30)
    set_car(ha, charging="off", power=0, soc=95)
    await advance(minutes=11)
    [c] = await charges(ha, car)
    assert c["kwh_power"] == pytest.approx(7, abs=0.01)
