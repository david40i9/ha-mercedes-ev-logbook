# Changelog

What changed in each release, in plain words. The newest is at the top.

## 0.36.4 (28 November 2026)

Fixes for trips and charges that could be logged wrongly, or lost, without any warning. Nothing to change in your setup: update and reload the page.

- **Driving off straight after charging no longer spoils the charge.** A charge is only closed 10 minutes after it stops, in case it starts again. If you drove off in that time, the charge took its end battery level from after the drive, so a 20 to 80% rapid charge could show as 20 to 75%, or vanish altogether if the battery had dropped below where it started. The level when you set off is now kept. Re-importing history follows the same rule.
- **A restart no longer throws away a trip.** After Home Assistant restarts, the car's sensors are often unavailable for a while. A trip that was still open could be ended straight away with no odometer reading, come out as 0 miles and be thrown away, losing its route. It now waits for the odometer, checking every minute for up to half an hour.
- **A trip that ended while Home Assistant was down gets the right end time.** It used to end at the moment Home Assistant came back, so a 20 minute drive followed by 3 hours of downtime was logged as 200 minutes, with the wrong average speed and parked time. It now ends at the last time the car was seen moving.
- **The card always shows the period and car you picked.** Clicking Year and then Week quickly could leave the slower Year figures under the Week heading, and a CSV exported then had the wrong trips. Only the latest choice is shown now.

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
