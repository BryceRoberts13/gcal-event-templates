# Google Calendar Event Templates

Searchable event templates inside Google Calendar's create-event title field — a Chromium MV3 extension.

**Repo:** `~/Desktop/Summer 2026/Coding Projects/gcal-event-templates`  
**Design spec:** `SecondBrain/docs/superpowers/specs/2026-07-08-gcal-event-templates-extension-design.md`

## Status

**v1 implemented** — searchable combobox on the title field, template fill, options page CRUD, import/export, and default templates are all in place.

## Load unpacked

**Reload** on `chrome://extensions` only rereads the folder already chosen for that card. It does not download this branch, and it does not run the build. The card’s title and version come from `manifest.json` inside that folder. `package.json` stays at `0.1.0` because that is the npm package version; Chrome does not read it.

```bash
git pull
npm install
npm run build
```

`npm run build` prints the absolute `dist/` path and writes `dist/manifest.json` from the root `manifest.json`. On `chrome://extensions`, enable **Developer mode**, open the card’s details, and check the loaded path.

- That path must be this repo’s `dist/` folder (the path the build printed).
- A path that is the repo root loads `manifest.json` next to the TypeScript sources. Chrome will not run `src/content/main.ts`.
- A path that is an older `dist/` keeps the previous card, including **0.3.2** and “Searchable event templates in Google Calendar's create-event title field”.

Click **Reload** on the card whose path is the new `dist/`. The card title must be **Google Calendar Event Templates 0.4.2**, the version **0.4.2**, and the description “Hide individual events from the calendar grid, and show them again from the left sidebar.” The toolbar popup reads the same version with `chrome.runtime.getManifest()`.

If the card still says **0.3.2** after that build, remove the card and **Load unpacked** on `dist/` again.

`npm run dev` rebuilds into that same `dist/` folder. Restart it after a pull so it reads the new `manifest.json`, then Reload the card that points at `dist/`.

## Features

- **Searchable combobox on title field** — drag-to-create (and full event editor) title input becomes a filterable template picker
- **Template fill** — selecting a template fills **title, description, location, and color** in Google's native popover
- **Options page CRUD** — add, edit, delete, and reorder templates via `chrome://extensions` → Options
- **Import / export JSON** — backup templates or move them between machines without sync
- **Default templates** — ships with example templates on first install so the dropdown is usable immediately
- **Hide event** — the event ⋮ menu includes **Hide event**. Hidden events disappear from the grid on this browser
- **Show hidden** — a checkbox pinned on the left, under **My calendars**, reveals hidden events (dimmed) so you can open one and choose **Unhide event**

## Development

```bash
npm run dev          # watch build into dist/ (restart after pulling manifest.json)
npm run build        # production build to dist/; prints the folder Chrome must load
npm test             # unit tests (search + store)
npm run test:watch   # vitest in watch mode
```

## Manual QA

Run through this checklist after changes or when Google Calendar updates its UI.

| # | Check | Pass |
|---|-------|------|
| 1 | Extension loads in Chrome + Arc | |
| 2 | Drag-create opens combobox on title | |
| 3 | Typing filters templates | |
| 4 | Select fills title + description + location + color | |
| 5 | Custom title still works (no forced template) | |
| 6 | Options page: add / edit / delete template | |
| 7 | Templates persist across browser restart | |
| 8 | `chrome.storage.sync` syncs to second profile (optional) | |
| 9 | Full event editor title field also gets combobox | |
| 10 | Event ⋮ menu shows **Hide event**; choosing it removes that event from the grid | |
| 11 | **Show hidden** sits with My calendars and brings hidden events back, dimmed | |
| 12 | **Unhide event** in the ⋮ menu restores a dimmed event | |

## Known limitations

- **Color and description fields may not appear** in the quick-create mini popover depending on Google Calendar layout. When those fields are absent, the extension fills what it can find and skips the rest.
- **DOM selectors are fragile** — Google Calendar UI changes can break field detection. If fill stops working after a GCal update, check `src/gcal/dom-adapter.ts` first. Hide event looks for the open menu that contains **Print** and **Duplicate**, and otherwise sits on the open event card. Show hidden is drawn on top of the left sidebar so Calendar cannot delete it.
- **Hiding is local to this browser.** It is stored in `chrome.storage.local` and does not change the event on Google Calendar, so the phone app and other browsers still show it.
- **Recurring events follow Google's event id.** Hiding one chip hides every visible chip that shares that id.

## Selector maintenance

All Google Calendar–specific hooks live in `src/gcal/dom-adapter.ts`. When fill breaks, update the label arrays and queries there:

- `TITLE_LABELS` — aria-label values for the event title input
- `LOCATION_LABELS` — location input labels
- `DESCRIPTION_LABELS` — description textarea / contenteditable labels
- Color swatch selectors (`[data-color-id]`, color button aria-labels)

Keep selectors semantic (`aria-label`, `role`, `data-color-id`) rather than class names so they survive minor GCal restyles.
