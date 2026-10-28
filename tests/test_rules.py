"""Park, drain and charging-power rules shared by the live logger and the importer."""

from custom_components.mb_logbook import rules


def test_park_fields_measures_drain_over_whole_uncharged_park():
    t0 = 1_700_000_000
    park = rules.new_park(t0, 80, False)
    f = rules.park_fields(park, t0 + 10 * 3600, 79)
    assert f == {"park_hours": 10.0, "park_drain_hours": 10.0, "park_soc_drop": 1, "park_charged": False}


def test_park_fields_measures_drain_only_after_the_charge():
    t0 = 1_700_000_000
    park = rules.after_charge(rules.new_park(t0, 40, True), t0 + 2 * 3600, 90)
    f = rules.park_fields(park, t0 + 12 * 3600, 89)
    assert f["park_hours"] == 12.0
    assert f["park_drain_hours"] == 10.0
    assert f["park_soc_drop"] == 1
    assert f["park_charged"] is True


def test_battery_rise_without_a_recorded_charge_counts_as_charged():
    f = rules.park_fields(rules.new_park(0, 50, False), 3600, 60)
    assert f["park_charged"] is True and f["park_soc_drop"] is None


def test_small_rise_is_rounding_not_a_charge():
    f = rules.park_fields(rules.new_park(0, 50, False), 3600, 51)
    assert f["park_charged"] is False and f["park_soc_drop"] == -1


def test_park_fields_without_a_park():
    assert rules.park_fields(None, 100, 50) == {
        "park_hours": None, "park_drain_hours": None, "park_soc_drop": None, "park_charged": False,
    }


def test_charge_that_ended_before_the_park_belongs_to_the_last_one():
    park = rules.new_park(1000, 60, False)
    assert rules.after_charge(park, 900, 80) is park


def test_charging_into_park_only_for_a_charge_started_after_the_trip():
    assert rules.charging_into_park({"start_ts": 1000}, 1000)
    assert rules.charging_into_park({"start_ts": 900}, 1000)  # 2 min grace
    assert not rules.charging_into_park({"start_ts": 500}, 1000)
    assert not rules.charging_into_park(None, 1000)


def test_trip_soc_end_uses_level_when_charging_began():
    assert rules.trip_soc_end(70, {"start_ts": 1000, "soc_start": 40}, 1000) == 40
    assert rules.trip_soc_end(70, None, 1000) == 70


def test_power_integration_costs_each_interval_at_its_price():
    c: dict = {}
    rules.add_power_sample(c, 0, 7.0, 0.10)
    rules.add_power_sample(c, 3600, None, 0.30)  # price change only
    rules.add_power_sample(c, 7200, 0.0, 0.30)
    assert round(c["kwh_power"], 6) == 14.0
    assert round(c["cost_power"], 6) == round(7 * 0.10 + 7 * 0.30, 6)


def test_power_integration_caps_a_stale_gap_at_six_hours():
    c: dict = {}
    rules.add_power_sample(c, 0, 10.0, None)
    rules.add_power_sample(c, 24 * 3600, 0.0, None)
    assert c["kwh_power"] == 60.0


def test_charge_cost_needs_a_price_sensor():
    assert rules.charge_cost({"kwh_meter": 10, "cost": 2.5}, False) == (None, None)
    assert rules.charge_cost({"kwh_meter": 10, "cost": 2.5}, True) == (2.5, "meter")
    assert rules.charge_cost({"kwh_meter": 0, "at_home": True, "kwh_power": 5, "cost_power": 1.0}, True) == (1.0, "power")
    assert rules.charge_cost({"kwh_meter": 0, "at_home": False, "kwh_power": 5, "cost_power": 1.0}, True) == (None, None)


def test_charge_cost_without_any_price_reading_falls_back_to_rates():
    """A price sensor that was unavailable for the whole session must not cost the charge at 0."""
    assert rules.charge_cost({"kwh_meter": 10, "cost": 0.0, "priced_kwh": 0.0}, True) == (None, None)
    assert rules.charge_cost({"kwh_meter": 10, "cost": 0.0, "priced_kwh": 10.0}, True) == (0.0, "meter")
