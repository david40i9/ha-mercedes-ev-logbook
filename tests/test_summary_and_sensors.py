"""Monthly summary, sensors and price units."""

from __future__ import annotations

from datetime import datetime

import pytest
from homeassistant.core import State
from homeassistant.util import dt as dt_util

from custom_components.mb_logbook import summary
from custom_components.mb_logbook.logger import _price_of
from custom_components.mb_logbook.temperature import temp_c

from .conftest import BASE_CONF, add_car, trips


def trip_row(car_id, start, **kw):
    row = {"car": car_id, "start_ts": start, "end_ts": start + 1800, "distance_km": 30.0,
           "soc_start": 80, "soc_end": 70, "points": []}
    row.update(kw)
    return row


async def test_summary_covers_only_last_month(ha):
    entry = await add_car(ha, {**BASE_CONF, "summary_notify": "persistent_notification"})
    lg = entry.runtime_data
    sept = dt_util.as_utc(datetime(2026, 9, 10, 12, tzinfo=dt_util.get_default_time_zone())).timestamp()
    octo = dt_util.as_utc(datetime(2026, 10, 1, 8, tzinfo=dt_util.get_default_time_zone())).timestamp()
    await ha.async_add_executor_job(lg.db.add_trip, trip_row(lg.car_id, sept, park_hours=10, park_drain_hours=10, park_soc_drop=1, park_charged=False))
    await ha.async_add_executor_job(lg.db.add_trip, trip_row(lg.car_id, octo, park_hours=10, park_drain_hours=10, park_soc_drop=9, park_charged=False))
    now = datetime(2026, 10, 1, 9, tzinfo=dt_util.get_default_time_zone())
    title, message = await summary.async_build(ha, lg, now)
    assert title == "Test car: September 2026"
    assert message.splitlines()[0] == "1 trips, 30 km"
    assert "Used about 10 kWh driving (33.3 kWh/100km)" in message
    assert "Idle drain 2.40 %/day" in message  # October's park is left out


async def test_send_summary_service_makes_a_notification(ha):
    from homeassistant.setup import async_setup_component

    await async_setup_component(ha, "persistent_notification", {})
    await add_car(ha, {**BASE_CONF, "summary_notify": "persistent_notification"})
    await ha.services.async_call("mb_logbook", "send_summary", {}, blocking=True)
    from homeassistant.components import persistent_notification

    notes = persistent_notification._async_get_or_create_notifications(ha)
    assert any(n.startswith("mb_logbook_") for n in notes)


@pytest.mark.parametrize(
    ("value", "unit", "expected"),
    [
        ("0.25", "GBP/kWh", 0.25),
        ("25", "p/kWh", 0.25),
        ("25", "GBp/kWh", 0.25),
        ("25", "c/kWh", 0.25),
        ("250", "EUR/MWh", 0.25),
        ("0.00025", "GBP/Wh", 0.25),
        ("25", "öre/kWh", 0.25),
        ("unavailable", "p/kWh", None),
    ],
)
def test_price_units(value, unit, expected):
    got = _price_of(State("sensor.price", value, {"unit_of_measurement": unit}))
    assert got == (pytest.approx(expected) if expected is not None else None)


def test_temperatures_from_sensors_and_weather():
    assert temp_c(State("sensor.out", "50", {"unit_of_measurement": "°F"})) == 10.0
    assert temp_c(State("weather.home", "sunny", {"temperature": 12.34, "temperature_unit": "°C"})) == 12.3
    assert temp_c(State("sensor.out", "unknown")) is None
    assert temp_c(None) is None


async def test_miles_car_reports_miles_and_mi_per_kwh(ha):
    entry = await add_car(ha, {**BASE_CONF, "distance_unit": "mi"})
    lg = entry.runtime_data
    await ha.async_add_executor_job(lg.db.add_trip, trip_row(lg.car_id, dt_util.utcnow().timestamp() - 60, distance_km=32.18688))
    from homeassistant.helpers.dispatcher import async_dispatcher_send

    async_dispatcher_send(ha, f"mb_logbook_updated_{lg.car_id}")
    await ha.async_block_till_done()
    st = ha.states.get("sensor.test_car_logbook_last_trip_distance")
    assert st.attributes["unit_of_measurement"] == "mi" and float(st.state) == 20.0
    assert ha.states.get("sensor.test_car_logbook_last_trip_efficiency").state == "2.0"
    assert len(await trips(ha, entry)) == 1
