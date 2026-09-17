# Mileage

A fast, private mileage log for iPhone, built as an installable web app (PWA) and served from this GitHub Pages site at `/mileage/`.

- **Manual entry only.** No GPS, no background tracking, no account. Log a trip with one number; repeat a saved route in two taps.
- **Tax-ready.** IRS standard mileage rates by effective date (the IRS changed rates on 2026-07-01), deduction totals by year and purpose, CSV export with the fields an IRS log needs.
- **Offline and local.** Data lives in the browser's `localStorage` under the key `mileage.v2`; a service worker caches the shell. Back up to a JSON file from Settings.

## Install on iPhone

Open the page in Safari, tap Share, then **Add to Home Screen**. The app then launches full screen with its own icon.

## Structure

```
mileage/
  index.html              shell markup (top bar, tab root, tab bar, sheet, alert, toast)
  manifest.webmanifest    PWA manifest
  sw.js                   service worker (cache-first shell, background refresh)
  css/tokens.css          design tokens: light/dark colors, type scale, radii, motion
  css/base.css            reset, shell layout, shared components (lists, rows, buttons, chips, segmented, switch, fields, sheet, alert, toast)
  css/{trips,entry,summary,settings}.css   per-screen styles
  js/app.js               hash router, tab bar, modal sheet, alert and toast APIs
  js/store.js             data store: trips, vehicles, saved routes, rate periods, CSV/JSON export, legacy import
  js/format.js            formatting helpers (distance, money, dates, CSV escaping)
  js/icons.js             inline SVG icon set
  js/demo.js              demo seed (loaded only on localhost)
  js/views/trips.js       Trips tab (month summary, quick log chips, day-grouped list)
  js/views/entry.js       Log/Edit trip sheet
  js/views/summary.js     Summary tab (deduction, breakdown, miles by month, export)
  js/views/settings.js    Settings and its sub-pages (vehicles, rates, routes, data)
```

Views implement `mount(root, ctx)` and may return a cleanup function. `ctx` gives access to `store`, `app` (navigate, openTrip, closeSheet, toast, confirm), route params and `onChange(fn)` for re-rendering on data changes.

## Data model

Distances are stored in miles (`distanceMi`); kilometers are a display setting. A trip is
`{ id, date, from, to, distanceMi, purpose, vehicleId, roundTrip, odoStart, odoEnd, notes, routeId }`
with `purpose` one of `business`, `personal`, `medical`, `charity`. The value of a trip is its distance times the rate in effect on its date.

Rate defaults (cents per mile) follow IRS Notice 2025-5 (2025), Notice 2026-10 (Jan–Jun 2026) and Announcement 2026-11 (from Jul 1, 2026). They are editable under Settings → Mileage rates; check irs.gov before filing.

The first launch imports trips and vehicles from the previous IndexedDB-based version of this app, if present.

## Design and verification

The app is built against a token system (`css/tokens.css`) whose light and dark palettes are checked
against both WCAG 2 contrast ratios and APCA lightness contrast: body text at or above 7:1, secondary
text and every coloured label at or above 4.5:1 and APCA Lc 60. The medical purpose colour is blue
rather than magenta so it stays distinguishable from business green under deuteranopia.

Screens were reviewed as rendered iPhone screenshots rather than as code, using a Playwright harness
that renders each route at 393×852 in light and dark with a simulated status bar and home indicator.
Automated checks cover axe-core (WCAG 2.0/2.1/2.2 A and AA, zero violations on every route in both
schemes), effective touch-target sizes, and an end-to-end flow test: log a trip from a saved route,
type a distance by hand, toggle round trip, derive a distance from odometer readings, delete with
undo, export CSV, and switch units without changing any dollar total.

## Local development

Any static server works, for example `python3 -m http.server 8123` from the repository root, then open `http://127.0.0.1:8123/mileage/`. On localhost `window.__mileage` exposes `store`, `app`, `seed('demo'|'empty')` and `go(hash)` for testing.
