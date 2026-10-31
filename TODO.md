# To do

Ideas and planned work for Mercedes EV Logbook. Ranked roughly by value for effort, keeping it local-only and multi-car.

## Open

1. **Drain detail**: idle drain by place and by month (where the car loses most while parked), flagging parks with pre-climate. *(TeslaMate vampire drain dashboard; the "Stats" app shows drain per location.)*
2. **Off-peak share and saving**: how much home charging fell in the off-peak window, and what it would have cost at the peak rate. Uses the off-peak rates from the Charging tab or the live price recorded per session. *(evcc's cheapest-slot planning, turned into a report.)*
3. **Day-by-day timeline** of trips and stops (the heat map part is done). *(TeslaMate "visited" dashboard.)*
4. **Charging curve** for rapid charges: store power samples during a session and plot power against battery %. *(TeslaMate charge detail.)* Needs more frequent data than the car may send.

## Not planned

- **Charging efficiency (gross vs net)**: needs a home charger meter, which most setups lack.
- **Events for automations** (`mb_logbook_trip_ended` / `mb_logbook_charge_ended`): would depend on each user's own automations.
- **Hour-range filter and previous-period comparison** on the stats.
- **Sending live data to A Better Route Planner**: it sends location and battery data to an outside service, against the local-only aim. Could only ever be opt-in, off by default.

## Done

- [x] Multi-car trips, parked drain, charging sessions (0.1)
- [x] Named places with draggable, resizable circles (0.2 – 0.4)
- [x] Import earlier trips and charges from the recorder (0.3)
- [x] Charges shown between trips; parks keep their charged flag (0.5)
- [x] Sidebar page with overview charts and routes map (0.6)
- [x] Period arrows, delete trip, charging rates per place with history (0.7)
- [x] Suggest names for unnamed places from OpenStreetMap, on request only (0.8)
- [x] Places keep the stops they were named from (0.9)
- [x] Works without a charger meter (cost from the car's charging power) or an ignition sensor (trips from movement) (0.10)
- [x] Trip labels, label filter with totals, trips CSV export (0.11)
- [x] Default trip label per place (0.12)
- [x] Mileage by label on the overview (0.13)
- [x] Sortable columns, business mileage chart (0.14)
- [x] End trips stuck with the ignition on (underground car parks); split a trip at its stop (0.15)
- [x] Battery health trend, efficiency vs outside temperature, monthly summary, merge trips, charges CSV export (0.16)
- [x] Outside temperature from Home Assistant's own weather; stored with each trip (0.17)
- [x] Renamed to Mercedes EV Logbook; brand icon; HACS and hassfest validation; GitHub releases (0.18)
- [x] Price sensors in pence, cents or per MWh converted (0.19)
- [x] Costs from your own rates with an optional off-peak window, no price sensor needed; currency per car (0.20)
- [x] Per-kWh prices shown as entered, up to 4 decimals (0.20.2)
- [x] Two cars on one home charger meter: the meter is split between the cars charging at home by their charging power, never counted twice (0.21)
- [x] Without a charger meter, home kWh and costs come from the car's charging power over the session instead of battery % (0.22)
- [x] "Where you go" heat map of trip ends on the overview; battery size pre-filled from the car model at setup (0.23)
- [x] Rename cars under Configure; heat map grouped by place with log weighting so busy places don't drown out the rest (0.24)
- [x] In the HACS default list (24 Oct 2026); README shown in HACS updated (0.24.1)
- [x] Column filters on Trips (place, label, distance, charged) and Charging (place, home/away, cost basis); totals and CSV follow them (0.25)
- [x] Automated tests (Home Assistant with a simulated car) and a CI test job; fixes they found: power-only charges kept when the battery % lags, charges no longer cut by a restart or counted through downtime, meter readings measured across an unavailable spell, resumed charges keep counting power, no-price sessions fall back to the rate, off-peak share right on the nights the clocks change, monthly summary drain limited to the month, split trips mark a charged stop (0.25.1)
- [x] More tests (130, covering trip counters, restarts, away charges, imports and set-up); the logbook page is removed with the last car and comes back when one is added; YAML-mode dashboards log how to add the card by hand; trip lists load faster (0.25.2)
- [x] Places tab: named places and Home Assistant zones in one table, with each place's default trip label on its own row; a "Needs a name" list of unnamed stops from the last 12 months, with a count on the Places tab (0.26)
- [x] Zone changes follow through: renaming, moving, resizing, adding or removing a Home Assistant zone updates past trips and charges, and a rename carries the zone's rates and default trip label (0.27)
