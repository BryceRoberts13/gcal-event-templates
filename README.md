# Google Calendar Event Templates

Searchable event templates inside Google Calendar's create-event title field — a Chromium MV3 extension.

**Repo:** `~/Desktop/Summer 2026/Coding Projects/gcal-event-templates`  
**Design spec:** `SecondBrain/docs/superpowers/specs/2026-07-08-gcal-event-templates-extension-design.md`

## Status

**Scaffolded** — design agreed; DOM integration not yet implemented.

## Load unpacked

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist/` folder.

## v1 goal

When you drag on the calendar to create an event, the title field becomes a **searchable combobox**. Pick a template → fills **title, description, location, and color** in Google's native popover.

## Development

```bash
npm run dev      # watch build
npm test         # unit tests (search + store)
```

## Manual QA

See the checklist in the design spec §10.
