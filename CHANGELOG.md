# Changelog

What changed in each release, in plain words. The newest is at the top.

## 0.36.2 (24 November 2026)

Fixes for figures that could come out wrong without any warning. Nothing to change in your setup: update and reload the page.

- **Year and All views show every trip again.** The sidebar page, the card and the trips CSV only ever got the newest 2,000 trips and charges. With a couple of years of history, older months showed too little mileage or none at all. They now get everything.
- **A deleted trip stays deleted.** If you deleted your latest trip, the next drive saw the gap in the odometer and logged it again as a "missed" trip. The Fill in missed trips service did the same. Deleted trips are now remembered, so neither brings them back. Trips deleted before this update can still come back once; delete them again and they stay gone.
- **Charges are costed in full when the price sensor drops out.** If your live price sensor was unavailable for part of a charging session, that part cost nothing, so the session came out too cheap. The unpriced part is now costed at the average price seen during the session. A session with no price reading at all still uses the place's rate from the Charging tab, as before.

## 0.36.1 (24 November 2026)

- **Restore works on ignored places.** Pressing Restore in the Ignored places list did nothing (issue #22). It now puts the place back on the "Needs a name" list.

## Earlier releases

See the [releases page](https://github.com/david40i9/ha-mercedes-ev-logbook/releases) and the Done list in [TODO.md](TODO.md).
