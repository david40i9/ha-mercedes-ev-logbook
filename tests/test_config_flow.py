"""Adding a car and changing its settings."""

from __future__ import annotations

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.mb_logbook.const import DOMAIN
from custom_components.mb_logbook.models import capacity_for_model

from .conftest import BASE_CONF, add_car


def _form(conf):
    return dict(conf)


async def test_manual_setup_creates_the_car(ha):
    flow = await ha.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert flow["type"] is FlowResultType.FORM and flow["step_id"] == "user"
    flow = await ha.config_entries.flow.async_configure(flow["flow_id"], {})
    assert flow["step_id"] == "entities"
    flow = await ha.config_entries.flow.async_configure(flow["flow_id"], {**BASE_CONF, "battery_capacity_kwh": 0})
    assert flow["errors"] == {"battery_capacity_kwh": "capacity_required"}
    flow = await ha.config_entries.flow.async_configure(flow["flow_id"], _form(BASE_CONF))
    assert flow["type"] is FlowResultType.CREATE_ENTRY
    assert flow["title"] == "Test car"
    entry = ha.config_entries.async_entries(DOMAIN)[0]
    assert entry.unique_id == "sensor.car_odometer"  # no VIN without mbapi2020


async def test_the_same_car_cannot_be_added_twice(ha):
    await add_car(ha, unique_id="sensor.car_odometer")
    flow = await ha.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    flow = await ha.config_entries.flow.async_configure(flow["flow_id"], {})
    flow = await ha.config_entries.flow.async_configure(flow["flow_id"], _form(BASE_CONF))
    assert flow["type"] is FlowResultType.ABORT and flow["reason"] == "already_configured"


async def test_mbapi2020_device_prefills_sensors_and_battery(ha):
    other = MockConfigEntry(domain="mbapi2020")
    other.add_to_hass(ha)
    device = dr.async_get(ha).async_get_or_create(
        config_entry_id=other.entry_id, identifiers={("mbapi2020", "W1K123")},
        name="EQS", model="EQS 450+ Exclusive Luxury Saloon",
    )
    reg = er.async_get(ha)
    for domain, key in (("sensor", "odometer"), ("sensor", "soc"), ("sensor", "ignitionstate"),
                        ("device_tracker", "tracker"), ("binary_sensor", "chargingactive")):
        reg.async_get_or_create(domain, "mbapi2020", f"W1K123_{key}", device_id=device.id,
                                config_entry=other, suggested_object_id=f"eqs_{key}")
    flow = await ha.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    flow = await ha.config_entries.flow.async_configure(flow["flow_id"], {"device_id": device.id})
    schema = {str(k): k for k in flow["data_schema"].schema}
    assert schema["odometer_entity"].description["suggested_value"] == "sensor.eqs_odometer"
    assert schema["ignition_entity"].description["suggested_value"] == "sensor.eqs_ignitionstate"
    assert schema["battery_capacity_kwh"].default() == 107.8
    assert "EQS 450+" in flow["description_placeholders"]["model_note"]


async def test_options_rename_the_car_and_reload(ha):
    entry = await add_car(ha)
    flow = await ha.config_entries.options.async_init(entry.entry_id)
    flow = await ha.config_entries.options.async_configure(
        flow["flow_id"], {**BASE_CONF, "car_name": "Sam's CLA", "stop_minutes": 5}
    )
    assert flow["type"] is FlowResultType.CREATE_ENTRY
    await ha.async_block_till_done()
    assert entry.title == "Sam's CLA"
    assert entry.runtime_data.conf["stop_minutes"] == 5
    assert entry.runtime_data.conf["car_name"] == "Sam's CLA"
    # Entity IDs don't change on rename.
    assert ha.states.get("sensor.test_car_logbook_trips_this_month") is not None


def test_battery_sizes_from_model_names():
    assert capacity_for_model("EQS 450+ Exclusive Luxury Saloon") == 107.8
    assert capacity_for_model("EQS 450 4MATIC SUV") == 108.4
    assert capacity_for_model("EQA 250+") == 66.5
    assert capacity_for_model("CLA 250+ Coupé") == 85.0
    assert capacity_for_model("CLA 250 e") is None  # plug-in hybrid
    # The electric CLA 200 shares its name with the petrol one; it's only a pre-fill the user checks.
    assert capacity_for_model("CLA 200") == 85.0
    assert capacity_for_model(None) is None
