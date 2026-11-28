# Changelog

What changed in each release, in plain words. The newest is at the top.

## 0.36.6 (28 November 2026)

The last small points from the review. Nothing to change in your setup: update and reload the page.

- **Deleting a place deletes its rates too.** Its charging rates and default trip type were left behind, and showed up on the Places tab as if they belonged to a Home Assistant zone. A place that shares a zone's name leaves them with the zone.
- **Home Assistant stays responsive while zones are re-matched.** After a zone change, or when Home Assistant starts, the logbook checks every logged stop against your zones. With years of history that could hold Home Assistant up briefly. It now takes short breaks.
- **A clearer message for a date that doesn't exist.** A rate from 30 February now says the date isn't on the calendar, instead of only asking for a date like 2026-10-22.
- **Exported CSVs are safer still.** A place or label starting with a minus sign followed by a formula, such as -1+HYPERLINK(…), could still run in a spreadsheet. Only a plain negative number is now left as it is.

## 0.36.5 (28 November 2026)

Fixes for gaps a second review found in 0.36.4, all around restarts and charging. Nothing to change in your setup: update and reload the page.

- **A trip always closes after a restart.** If Home Assistant restarted just after you switched the car off, before the trip was saved, the trip could stay open for good, and your next drive was added to it. It now closes as it should.
- **A new drive is never added to the last one.** While a trip waits for the car's sensors after a restart, setting off again now starts a new trip instead of carrying on the old one, so the parked time between them is kept.
- **No impossible speeds after downtime.** If the car kept driving while Home Assistant was down, the trip used to end at the last movement seen, so 100 km could show as taking 5 minutes. When the mileage shows it drove on, the trip now ends when Home Assistant came back, as before 0.36.4.
- **Waiting in the car while it charges no longer spoils the charge.** If you sat in the car with the ignition on during a rapid charge, then drove off, the charge still took its end battery level from after the drive. The level as you move off is now kept. Re-importing history does the same.
- **A trip can't be saved twice.** If the database was busy at the wrong moment, a trip that was saved again later could appear twice. A failed save is now undone completely.
- **Missed driving isn't double counted.** While a trip is still waiting to be saved, the logbook no longer mistakes its miles for driving it missed.
- **Renaming an old place called "Home" leaves Home's rates alone.** A place made before 0.36.4 can share a zone's name. Renaming it used to take the Home zone's charging rates and default trip type with it, so home charges lost their cost. They now stay with the zone.
- **The "Where you go" map and the mileage chart show the period you picked.** Clicking one period and then another quickly could leave the slower first answer on screen.

## 0.36.4 (28 November 2026)

Fixes for trips and charges that could be logged wrongly, or lost, without any warning. Nothing to change in your setup: update and reload the page.

- **Driving off straight after charging no longer spoils the charge.** A charge is only closed 10 minutes after it stops, in case it starts again. If you drove off in that time, the charge took its end battery level from after the drive, so a 20 to 80% rapid charge could show as 20 to 75%, or vanish altogether if the battery had dropped below where it started. The level when you set off is now kept. Re-importing history follows the same rule.
- **A restart no longer throws away a trip.** After Home Assistant restarts, the car's sensors are often unavailable for a while. A trip that was still open could be ended straight away with no odometer reading, come out as 0 miles and be thrown away, losing its route. It now waits for the odometer, checking every minute for up to half an hour.
- **A trip that ended while Home Assistant was down gets the right end time.** It used to end at the moment Home Assistant came back, so a 20 minute drive followed by 3 hours of downtime was logged as 200 minutes, with the wrong average speed and parked time. It now ends at the last time the car was seen moving.
- **The card always shows the period and car you picked.** Clicking Year and then Week quickly could leave the slower Year figures under the Week heading, and a CSV exported then had the wrong trips. Only the latest choice is shown now.
- **A trip or charge is kept if it can't be saved.** If the database was full or busy at the moment a trip or charge finished, it was lost with only a line in the log. It's now kept and saved again a few minutes later, even across a restart.
- **Several cars start cleanly together.** With two or more cars, Home Assistant starts them at the same time, and both could set up the logbook's shared parts, which could stop a car from starting. They now take turns.
- **Peak charging power is recorded for steady charges.** A rapid charge that stayed at the same power from the start showed no peak, and so no AC/DC badge on cars without plug sensors. The first reading now counts.
- **Re-importing history keeps late charger readings.** Some home chargers report their last reading a minute or two after charging stops. The live log counted it but Import history didn't, so a re-import could lower the energy and cost. Both count it now.
- **A new rate starts today, not yesterday.** The "New rate from" box used the date in UTC, so just after midnight in a UK summer it said yesterday's date. It now uses your local date.
- **A place can't be named after a Home Assistant zone.** A place called "Home" shared its rates and default trip type with the Home zone, and renaming one moved them with it. Such names are now refused. A place that already has one can still be moved or resized.
- **Only administrators can scan for nearby names.** The screen only offered it to administrators, but any user could ask Home Assistant to send a point to OpenStreetMap.
- **Behind the scenes:** the card's CSV export now has its own tests, and some leftover code was tidied up.

## 0.36.3 (24 November 2026)

Small fixes. Nothing to change in your setup: update and reload the page.

- **Two places can't share a name.** Renaming a place to a name another place already has used to overwrite that place's default trip type and merge their charging rates without a word. It's now refused with "Another place is already called …".
- **A free charge shows a cost of 0.** The Last charge cost sensor showed "unknown" after a charge that cost nothing.
- **Configure won't accept a battery size of 0.** Saving the settings with the battery size empty hid every kWh and efficiency figure. It now asks for the size, as setup does.
- **A rate delete that fails says so.** Before, the button did nothing visible.
- **Exported CSVs are safe to open in a spreadsheet.** A place or label starting with = + - or @ could run as a formula in Excel or Google Sheets. Such cells now start with an apostrophe.
- **The Import history description is clearer.** It now says that re-running it undoes splits, merges, deletions and filled-in missed trips in that period.
- **Month names match on every chart.** The Business mileage chart said "Sept" with UK English while the others said "Sep". All charts now use three letters.
- **Safer releases.** The step that builds the download HACS installs now uses a fixed, checked version of the tool it relies on.

## 0.36.2 (24 November 2026)

Fixes for figures that could come out wrong without any warning. Nothing to change in your setup: update and reload the page.

- **Year and All views show every trip again.** The sidebar page, the card and the trips CSV only ever got the newest 2,000 trips and charges. With a couple of years of history, older months showed too little mileage or none at all. They now get everything.
- **A deleted trip stays deleted.** If you deleted your latest trip, the next drive saw the gap in the odometer and logged it again as a "missed" trip. The Fill in missed trips service did the same. Deleted trips are now remembered, so neither brings them back. Trips deleted before this update can still come back once; delete them again and they stay gone.
- **Charges are costed in full when the price sensor drops out.** If your live price sensor was unavailable for part of a charging session, that part cost nothing, so the session came out too cheap. The unpriced part is now costed at the average price seen during the session. A session with no price reading at all still uses the place's rate from the Charging tab, as before.

## 0.36.1 (24 November 2026)

- **Restore works on ignored places.** Pressing Restore in the Ignored places list did nothing (issue #22). It now puts the place back on the "Needs a name" list.

## Earlier releases

See the [releases page](https://github.com/david40i9/ha-mercedes-ev-logbook/releases) and the Done list in [TODO.md](TODO.md).
