"""Missed trips: distance the odometer gained while nobody was watching.

If Home Assistant (or the car's connection) is down while the car is driven,
no trip is logged, but the odometer still moves. Between two logged trips the
odometer should stand still, so a jump from one trip's end to the next trip's
start is driving that was missed. It's logged as a "missed" trip (``gap = 1``):
the distance is exact, the start and end are where the car was parked before
and after, and the times are the best the recorder can tell. There's no route,
and several drives in one gap become one missed trip.
"""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.components.recorder import get_instance, history
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import CONF_MIN_DISTANCE, CONF_ODOMETER, CONF_TRACKER, DEFAULT_MIN_DISTANCE_KM
from .db import distance_m

if TYPE_CHECKING:
    from .logger import CarLogger

_LOGGER = logging.getLogger(__name__)

# A position this close to where the car was parked means it hadn't left yet.
PARKED_M = 200.0
# Below this the jump is odometer rounding (whole miles) or a late reading, not a drive.
GAP_MIN_KM = 3.0


def gap_min_km(conf: dict[str, Any]) -> float:
    return max(GAP_MIN_KM, float(conf.get(CONF_MIN_DISTANCE, DEFAULT_MIN_DISTANCE_KM)))


def missed_km(prev: dict[str, Any] | None, nxt: dict[str, Any], min_km: float) -> float | None:
    """The distance driven between two logged trips, if it's a real gap."""
    if prev is None:
        return None
    a, b = prev.get("odo_end_km"), nxt.get("odo_start_km")
    if a is None or b is None or b - a < min_km:
        return None
    if nxt["start_ts"] < prev["end_ts"]:
        return None
    return b - a


def _window_from_states(
    states: dict[str, list], conf: dict[str, Any], prev: dict[str, Any], odo_after_km: float,
    lo: float, hi: float,
) -> tuple[float, float]:
    """When the gap's driving happened, from what the recorder saw.

    It ended by the first odometer reading at (or near) the new value. It
    started after the last reading that still showed the car where it was
    parked: the old odometer value, or a position at the old spot. Without
    such a reading, it's somewhere in the whole park.
    """
    from .logger import _num, _to_km  # noqa: PLC0415 - avoids an import cycle

    tol = GAP_MIN_KM / 2
    end = hi
    for st in states.get(conf[CONF_ODOMETER], []):
        km = _to_km(_num(st), st)
        if km is not None and km >= odo_after_km - tol:
            end = min(hi, max(lo, st.last_updated.timestamp()))
            break
    start = lo
    for st in states.get(conf[CONF_ODOMETER], []):
        km = _to_km(_num(st), st)
        ts = st.last_updated.timestamp()
        if km is not None and km < odo_after_km - tol and lo < ts < end:
            start = max(start, ts)
    lat0, lon0 = prev.get("end_lat"), prev.get("end_lon")
    if lat0 is not None and lon0 is not None:
        for st in states.get(conf[CONF_TRACKER], []):
            lat, lon = st.attributes.get("latitude"), st.attributes.get("longitude")
            ts = st.last_updated.timestamp()
            if lat is None or lon is None or not lo < ts < end:
                continue
            if distance_m(lat0, lon0, float(lat), float(lon)) <= PARKED_M:
                start = max(start, ts)
    return start, end


async def async_window(
    hass: HomeAssistant, conf: dict[str, Any], prev: dict[str, Any], hi: float, odo_after_km: float
) -> tuple[float, float]:
    """Narrow the park after ``prev`` (up to ``hi``) to when the gap happened."""
    lo = prev["end_ts"]
    ids = [conf[CONF_ODOMETER], conf[CONF_TRACKER]]
    start, end = dt_util.utc_from_timestamp(lo), dt_util.utc_from_timestamp(hi)
    try:
        states = await get_instance(hass).async_add_executor_job(
            lambda: history.get_significant_states(
                hass, start, end, ids,
                include_start_time_state=False,
                significant_changes_only=False,
                minimal_response=False,
                no_attributes=False,
            )
        )
    except Exception:  # noqa: BLE001 - the whole park is still a valid answer
        _LOGGER.debug("No recorder history for the gap", exc_info=True)
        return lo, hi
    return _window_from_states(states, conf, prev, odo_after_km, lo, hi)


def missed_trip(
    logger: CarLogger, prev: dict[str, Any], nxt: dict[str, Any], start_ts: float, end_ts: float
) -> dict[str, Any]:
    """The row for a missed trip between two logged ones."""
    soc_a, soc_b = prev.get("soc_end"), nxt.get("soc_start")
    if soc_a is not None and soc_b is not None and soc_b > soc_a:
        soc_a = soc_b = None  # charged during the gap: the battery used is unknown
    return {
        "car": logger.car_id,
        "start_ts": start_ts,
        "end_ts": end_ts,
        "odo_start_km": prev["odo_end_km"],
        "odo_end_km": nxt["odo_start_km"],
        "distance_km": round(nxt["odo_start_km"] - prev["odo_end_km"], 3),
        "soc_start": soc_a,
        "soc_end": soc_b,
        "start_lat": prev.get("end_lat"),
        "start_lon": prev.get("end_lon"),
        "end_lat": nxt.get("start_lat"),
        "end_lon": nxt.get("start_lon"),
        "start_place": logger._place(prev.get("end_lat"), prev.get("end_lon"))[0],  # noqa: SLF001
        "end_place": logger._place(nxt.get("start_lat"), nxt.get("start_lon"))[0],  # noqa: SLF001
        "points": [],
        "gap": 1,
    }


async def async_fill_gaps(hass: HomeAssistant, logger: CarLogger, days: int = 30) -> int:
    """Add a missed trip wherever the odometer jumped between two logged trips."""
    since = (dt_util.utcnow() - timedelta(days=days)).timestamp()
    rows = await hass.async_add_executor_job(logger.db.raw_trips, logger.car_id, since)
    min_km = gap_min_km(logger.conf)
    added = []
    for prev, nxt in zip(rows, rows[1:], strict=False):
        if missed_km(prev, nxt, min_km) is None:
            continue
        lo, hi = await async_window(hass, logger.conf, prev, nxt["start_ts"], nxt["odo_start_km"])
        added.append(missed_trip(logger, prev, nxt, lo, hi))
    for trip in added:
        await hass.async_add_executor_job(logger.db.add_trip, trip)
    if added:
        _LOGGER.info(
            "%s: added %d missed trip(s), %.1f km in all",
            logger.car_id, len(added), sum(t["distance_km"] for t in added),
        )
        logger._notify()  # noqa: SLF001
    return len(added)
