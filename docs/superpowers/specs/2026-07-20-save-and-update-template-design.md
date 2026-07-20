# Save & Update Template — Design Spec

**Date:** 2026-07-20  
**Status:** Approved for planning  
**Repo:** gcal-event-templates

## Problem

Updating a template today means either using the options page or “Save as template” (which creates a new template). When editing or creating an event whose title already matches a template, users want one primary action that saves the Calendar event **and** updates that template from the current form fields.

## Goals

- When the event title matches an existing template, replace the primary Save control with a combined “save event + update template” action.
- Keep plain Save available via the existing caret menu.
- Apply on both create and edit surfaces.
- Reuse existing extract/upsert plumbing; minimize DOM fragility beyond what the extension already handles.

## Non-goals

- Live matching while typing in the title field.
- Renaming templates via this flow when the title no longer matches (match is evaluated from the current title at blur/pick time).
- Syncing keywords from the event form (keywords are not present in GCal’s editor).
- Multi-select or conflict UI when duplicate names exist.

## Behavior

### Match rules

- Compare `title.trim()` to each template’s `name.trim()`.
- Case-insensitive.
- Empty title after trim → no match.
- Multiple templates with the same normalized name → choose the one with the greatest `updatedAt`.

### When to evaluate

- Title field **blur**.
- Template selected from the searchable combobox.
- Not on every keystroke.

### Matched mode (title matches a template)

- Relabel / restyle Google Calendar’s native Save button to a combined action (label e.g. **Save & update template**).
- Clicking it:
  1. Extract current fields via `extractTemplateFromSurface`.
  2. `upsertTemplate` with the matched template’s **existing `id`**, preserving **keywords**, updating name / description / location / colorId and `updatedAt`.
  3. Then invoke native Save (allow the original save to proceed).
- If template update fails, **do not** invoke native Save; surface an error (alert or existing toast pattern).
- Guard against double-submit while the update is in flight.
- Caret menu items:
  - **Save only** — native Save, no template write.
  - **Save as template** — existing create-new-template flow (prompt for name).
  - **Manage templates…** — existing options opener.

### Unmatched mode

- Restore normal Save label/behavior.
- Caret menu remains the current “Save as template” / “Manage templates…” menu (no “Save only” needed).

### Extension context invalidated

- Same refresh-banner / alert behavior as today’s save-as-template path.

## Architecture

### Primary touchpoints

| Area | Role |
|------|------|
| `src/content/save-as-template.ts` (or small sibling it owns) | Match state, Save button rewrite, click intercept, caret menu variants |
| `src/gcal/dom-adapter.ts` | Reuse `findSaveControls`, `extractTemplateFromSurface`, `findTitleInputIn` |
| `src/store/template-store.ts` | Reuse `listTemplates` / `upsertTemplate` |
| `src/content/combobox.ts` / `main.ts` | Notify save-control watcher when a template is picked so match re-evaluates without waiting for blur |

### Approach

**Intercept the native Save button** (chosen over hiding Save and injecting a replacement):

1. Observe Save presence with the existing MutationObserver / interval re-attach pattern.
2. When entering matched mode, set accessible name / visible label on the Save control and attach a capture-phase click handler.
3. Handler updates the template, then allows (or programmatically triggers) the native save.
4. When leaving matched mode, restore label and remove intercept.

### Matching helper

Pure function suitable for unit tests, e.g.:

```ts
findMatchingTemplate(title: string, templates: EventTemplate[]): EventTemplate | null
```

Normalization: `s.trim().toLowerCase()`. Among equals, `max(updatedAt)`.

## UI copy

| Control | Copy |
|---------|------|
| Combined Save | Save & update template |
| Caret (matched) | Save only / Save as template / Manage templates… |
| Success toast (optional, if cheap) | Updated template “{name}” |

Exact wording may be tweaked during implementation if length breaks GCal’s toolbar layout; meaning must stay the same.

## Testing

### Unit

- Matcher: trim, case-insensitivity, empty → null, duplicates → newest `updatedAt`.
- Mode transitions (where testable without full GCal): match toggles combined label + menu; no-match restores Save; intercept updates template then triggers save (mocked DOM / store).

### Manual QA (add to README checklist)

1. Create event with title matching a template → Save becomes combined; click updates template and saves event.
2. Edit existing event with matching title → same.
3. Type matching title but don’t blur → Save stays normal until blur or combobox pick.
4. Matched mode → caret **Save only** saves event without changing template.
5. Change title away from any template and blur → Save restored.
6. Duplicate template names → newest `updatedAt` is updated.

## Rollout / risks

- **GCal DOM churn:** Save may be recreated; re-attach must re-apply matched mode if still matched.
- **Label length:** Combined label may wrap or truncate in narrow toolbars; shorten copy if needed.
- **Color extraction:** Best-effort today; update template color only when extract finds one (same as save-as-template).

## Decision log

| Decision | Choice |
|----------|--------|
| Primary UX | Replace Save visually; plain Save via caret |
| Matching | Trimmed, case-insensitive exact name |
| Surfaces | Create and edit |
| Duplicate names | Most recently updated (`updatedAt`) |
| Re-evaluate timing | Blur or combobox pick, not live typing |
| Implementation | Intercept native Save (not hide+inject) |
