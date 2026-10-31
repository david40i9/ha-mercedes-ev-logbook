"""Keep logged place names in step with Home Assistant's zones.

Trips and charges store the zone they were in as text when they are recorded.
When a zone is renamed, moved, resized, added or removed, every logged stop
with a position is matched against the zones again, so the logbook always
reads as if today's zones had been there all along. A rename also carries the
zone's charging rates and default trip label across.
"""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.zone import DOMAIN as ZONE_DOMAIN, async_active_zone
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.start import async_at_started

from .db import LogbookDB

_LOGGER = logging.getLogger(__name__)

# What makes a zone a different place. A zone's state (people in it) changes all
# the time and is ignored.
_SHAPE = ("friendly_name", "latitude", "longitude", "radius", "passive")
DEBOUNCE_S = 5


def _shape(state) -> tuple:
    return tuple(state.attributes.get(k) for k in _SHAPE) if state is not None else ()


async def async_resync_zones(
    hass: HomeAssistant, db: LogbookDB, renames: dict[str, str] | None = None
) -> int:
    """Apply zone renames, then re-match every positioned stop. Returns stops changed."""
    for old, new in (renames or {}).items():
        await hass.async_add_executor_job(db.rename_location, old, new)
    stops = await hass.async_add_executor_job(db.located_stops)
    changes = []
    for table, row_id, col, lat, lon, place in stops:
        zone = async_active_zone(hass, lat, lon, 0)
        name = zone.name if zone is not None else None
        if name != place:
            changes.append((table, row_id, col, name))
    if changes:
        await hass.async_add_executor_job(db.set_stop_places, changes)
        _LOGGER.info("Zones changed: renamed %d logged stops to match", len(changes))
    return len(changes)


@callback
def async_track_zones(hass: HomeAssistant, db: LogbookDB) -> CALLBACK_TYPE:
    """Re-match once Home Assistant has started, then after each zone change."""
    renames: dict[str, str] = {}
    timer: CALLBACK_TYPE | None = None
    started = False

    async def _run(_now: Any = None) -> None:
        nonlocal timer
        timer = None
        todo = dict(renames)
        renames.clear()
        try:
            await async_resync_zones(hass, db, todo)
        except Exception:  # noqa: BLE001 - never break HA over a rename
            _LOGGER.exception("Couldn't update logged places after a zone change")

    @callback
    def _schedule() -> None:
        nonlocal timer
        if timer:
            timer()
        timer = async_call_later(hass, DEBOUNCE_S, _run)

    @callback
    def _filter(data) -> bool:
        return data["entity_id"].startswith(f"{ZONE_DOMAIN}.")

    @callback
    def _on_change(event: Event) -> None:
        if not started:
            return
        old, new = event.data["old_state"], event.data["new_state"]
        if _shape(old) == _shape(new):
            return
        if old is not None and new is not None and old.name != new.name:
            # Chain renames made within the debounce window (A→B then B→C is A→C).
            for k, v in list(renames.items()):
                if v == old.name:
                    renames[k] = new.name
            renames.setdefault(old.name, new.name)
        _schedule()

    unsub_bus = hass.bus.async_listen(EVENT_STATE_CHANGED, _on_change, event_filter=_filter)

    async def _at_start(_hass: HomeAssistant) -> None:
        nonlocal started
        started = True
        await _run()

    unsub_start = async_at_started(hass, _at_start)

    @callback
    def _unsub() -> None:
        unsub_bus()
        unsub_start()
        if timer:
            timer()

    return _unsub
