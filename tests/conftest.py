"""Shared fixtures: a Home Assistant instance with the recorder, a home zone and one car."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.mb_logbook.const import DOMAIN

pytest_plugins = ["pytest_homeassistant_custom_component"]

HOME = (52.0, -1.0)
AWAY = (52.1, -1.1)

BASE_CONF: dict[str, Any] = {
    "car_name": "Test car",
    "odometer_entity": "sensor.car_odometer",
    "soc_entity": "sensor.car_soc",
    "ignition_entity": "sensor.car_ignition",
    "tracker_entity": "device_tracker.car",
    "charging_entity": "binary_sensor.car_charging",
    "charge_power_entity": "sensor.car_power",
    "battery_capacity_kwh": 100.0,
    "currency": "GBP",
    "home_zone": "zone.home",
    "distance_unit": "km",
    "stop_minutes": 3,
    "min_distance_km": 0.3,
}


@pytest.fixture(autouse=True)
def auto_enable(recorder_mock, enable_custom_integrations):
    """The recorder must start before hass; custom integrations are off by default."""
    yield


def set_car(hass: HomeAssistant, prefix: str = "car", **values: Any) -> None:
    """Set any of the fake car's sensors; unspecified ones are left alone."""
    units = {"odometer": "km", "soc": "%", "power": "kW"}
    for key, value in values.items():
        if key == "pos":
            lat, lon = value
            hass.states.async_set(f"device_tracker.{prefix}", "not_home", {"latitude": lat, "longitude": lon})
        elif key == "ignition":
            hass.states.async_set(f"sensor.{prefix}_ignition", value)
        elif key == "charging":
            hass.states.async_set(f"binary_sensor.{prefix}_charging", value)
        else:
            attrs = {"unit_of_measurement": units[key]} if key in units else {}
            hass.states.async_set(f"sensor.{prefix}_{key}", str(value), attrs)


def base_states(hass: HomeAssistant, prefix: str = "car") -> None:
    set_car(hass, prefix, odometer=1000, soc=80, ignition="0", pos=HOME, charging="off", power=0)


async def add_car(
    hass: HomeAssistant, conf: dict[str, Any] | None = None, unique_id: str = "VIN1", title: str = "Test car"
) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, data=conf or BASE_CONF, unique_id=unique_id, title=title)
    entry.add_to_hass(hass)
    # The first-run history import is tested on its own.
    with patch("custom_components.mb_logbook.async_import_history", return_value={"trips": 0, "charges": 0}):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    return entry


@pytest.fixture
async def ha(hass: HomeAssistant, tmp_path) -> HomeAssistant:
    """hass with a 100 m home zone called "Home" at HOME, and a fresh logbook DB."""
    hass.config.config_dir = str(tmp_path)
    hass.config.location_name = "Home"
    hass.config.latitude, hass.config.longitude = HOME
    hass.config.currency = "GBP"
    await async_setup_component(hass, "zone", {})
    base_states(hass)
    return hass


@pytest.fixture
async def car(ha: HomeAssistant) -> MockConfigEntry:
    return await add_car(ha)


@pytest.fixture
def advance(ha: HomeAssistant, freezer) -> Callable:
    """Move the clock on and run any timers that fell due."""
    from pytest_homeassistant_custom_component.common import async_fire_time_changed

    async def _advance(**delta: float) -> None:
        from datetime import timedelta

        freezer.tick(timedelta(**delta))
        async_fire_time_changed(ha)
        await ha.async_block_till_done()
        await ha.async_block_till_done()

    return _advance


async def trips(hass: HomeAssistant, entry) -> list[dict[str, Any]]:
    lg = entry.runtime_data
    return await hass.async_add_executor_job(lg.db.trips, lg.car_id, 0, 1e12)


async def charges(hass: HomeAssistant, entry) -> list[dict[str, Any]]:
    lg = entry.runtime_data
    return await hass.async_add_executor_job(lg.db.charges, lg.car_id, 0, 1e12)
