"""Set-up and tear-down: the dashboard card, the sidebar page, the first import, services."""

from __future__ import annotations

import logging
from unittest.mock import patch

from homeassistant.components.frontend import DATA_PANELS
from homeassistant.components.lovelace.const import LOVELACE_DATA
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.mb_logbook import CARD_URL, PANEL_PATH, _async_register_card
from custom_components.mb_logbook.const import DOMAIN, VERSION

from .conftest import BASE_CONF, add_car, base_states, trips
from .test_logger import drive

CARD = f"{CARD_URL}?v={VERSION}"


def card_resources(ha):
    items = ha.data[LOVELACE_DATA].resources.async_items()
    return [i for i in items if i["url"].split("?")[0] == CARD_URL]


async def test_the_card_is_one_versioned_dashboard_resource(ha, car):
    [item] = card_resources(ha)
    assert (item["url"], item["type"]) == (CARD, "module")
    await _async_register_card(ha)  # e.g. a second car being set up
    assert len(card_resources(ha)) == 1


async def test_an_old_card_resource_is_updated_in_place(ha, car):
    resources = ha.data[LOVELACE_DATA].resources
    [item] = card_resources(ha)
    await resources.async_update_item(item["id"], {"res_type": "module", "url": f"{CARD_URL}?v=0.1.0"})
    await _async_register_card(ha)
    [again] = card_resources(ha)
    assert again["id"] == item["id"] and again["url"] == CARD


async def test_yaml_dashboards_fall_back_to_extra_js(ha, car, monkeypatch):
    """Open item L6: YAML-mode dashboards can't take a resource, so the card goes on the
    frontend's extra-JS list (which some browsers cache; Firefox users may need to add
    the resource by hand)."""
    monkeypatch.setattr(ha.data[LOVELACE_DATA], "resources", object())
    with patch("custom_components.mb_logbook.add_extra_js_url") as extra:
        await _async_register_card(ha)
    extra.assert_called_once_with(ha, CARD)


async def test_a_resource_error_never_blocks_setup(ha, car, monkeypatch, caplog):
    async def boom():
        raise RuntimeError("storage broken")

    monkeypatch.setattr(ha.data[LOVELACE_DATA].resources, "async_get_info", boom)
    with patch("custom_components.mb_logbook.add_extra_js_url") as extra, caplog.at_level(logging.WARNING):
        await _async_register_card(ha)
    extra.assert_called_once_with(ha, CARD)
    assert "Couldn't register the card" in caplog.text


async def test_the_sidebar_page_is_registered(ha, car):
    panel = ha.data[DATA_PANELS][PANEL_PATH]
    assert panel.sidebar_title == "Mercedes EV Logbook"
    assert panel.require_admin is False  # open item L5: everyone can read the logbook


async def test_unloading_the_last_car_keeps_the_shared_parts(ha, car, advance):
    """Pins current behaviour (open item L7): the DB, sidebar page and websocket commands
    stay until Home Assistant restarts. Adding the car back must still work."""
    await drive(ha, advance)
    db = ha.data[DOMAIN]["db"]
    assert await ha.config_entries.async_unload(car.entry_id)
    await ha.async_block_till_done()
    assert ha.data[DOMAIN]["db"] is db and db._conn is not None
    assert PANEL_PATH in ha.data[DATA_PANELS]
    assert await ha.config_entries.async_setup(car.entry_id)
    await ha.async_block_till_done()
    assert car.runtime_data.db is db
    assert len(await trips(ha, car)) == 1


async def test_a_failing_first_import_does_not_stop_logging(ha, advance, caplog):
    entry = MockConfigEntry(domain=DOMAIN, data=BASE_CONF, unique_id="VIN1", title="Test car")
    entry.add_to_hass(ha)
    with patch("custom_components.mb_logbook.async_import_history", side_effect=RuntimeError("no recorder")):
        assert await ha.config_entries.async_setup(entry.entry_id)
        await ha.async_block_till_done()
    assert "History import failed for Test car" in caplog.text
    await drive(ha, advance)
    assert len(await trips(ha, entry)) == 1


async def test_import_service_can_target_one_car(ha):
    base_states(ha, "car2")
    a = await add_car(ha)
    await add_car(ha, {**BASE_CONF, "car_name": "Second", "odometer_entity": "sensor.car2_odometer"},
                  unique_id="VIN2", title="Second")
    res = await ha.services.async_call(
        DOMAIN, "import_history", {"config_entry_id": a.entry_id, "days": 1}, blocking=True, return_response=True
    )
    assert list(res) == ["Test car"]
