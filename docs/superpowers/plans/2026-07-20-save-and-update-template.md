# Save & Update Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an event title matches a template (trim + case-insensitive), replace GCal’s Save with “Save & update template” that upserts the matched template then saves the event, while keeping plain Save in the caret menu.

**Architecture:** Pure `findMatchingTemplate` helper drives match state. `save-as-template.ts` owns Save-button rewrite, capture-phase click intercept (update then programmatic native click), and matched-mode caret items. Combobox selection and title blur both call `reevaluateSaveMatch()`. Reuses `extractTemplateFromSurface` + `upsertTemplate`.

**Tech Stack:** Chromium MV3 content script, TypeScript, Vitest + happy-dom, existing Chrome storage via background messaging.

**Spec:** `docs/superpowers/specs/2026-07-20-save-and-update-template-design.md`

## Global Constraints

- Match: trimmed, case-insensitive exact name; empty title → no match
- Duplicate names: pick greatest `updatedAt`
- Evaluate on title blur or combobox pick only (not live typing)
- Surfaces: create and edit
- Combined Save copy: `Save & update template`
- Matched caret: `Save only` / `Save as template` / `Manage templates…`
- On template update failure: do not invoke native Save
- Preserve matched template `id` and `keywords` on update
- Intercept native Save (do not hide + inject a replacement button)

## File Structure

| File | Responsibility |
|------|----------------|
| `src/content/match-template.ts` | Pure matcher: title → template \| null |
| `src/content/match-template.test.ts` | Unit tests for matcher |
| `src/content/save-as-template.ts` | Match mode, Save rewrite/intercept, caret menu variants, blur watch, exported `reevaluateSaveMatch` |
| `src/content/save-match-mode.test.ts` | DOM tests for label/menu/intercept (mocked store) |
| `src/content/main.ts` | Call `reevaluateSaveMatch` after combobox select |
| `README.md` | Manual QA checklist rows |

---

### Task 1: Matching helper

**Files:**
- Create: `src/content/match-template.ts`
- Test: `src/content/match-template.test.ts`

**Interfaces:**
- Consumes: `EventTemplate` from `src/types.ts`
- Produces: `findMatchingTemplate(title: string, templates: EventTemplate[]): EventTemplate | null`

- [ ] **Step 1: Write the failing tests**

Create `src/content/match-template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EventTemplate } from "../types";
import { findMatchingTemplate } from "./match-template";

function tpl(
  partial: Pick<EventTemplate, "id" | "name" | "updatedAt"> &
    Partial<EventTemplate>,
): EventTemplate {
  return { ...partial };
}

describe("findMatchingTemplate", () => {
  const gym = tpl({ id: "gym", name: "Gym", updatedAt: 100 });
  const focus = tpl({ id: "focus", name: "Focus block", updatedAt: 200 });

  it("returns null for empty or whitespace-only title", () => {
    expect(findMatchingTemplate("", [gym])).toBeNull();
    expect(findMatchingTemplate("   ", [gym])).toBeNull();
  });

  it("matches trimmed case-insensitive exact name", () => {
    expect(findMatchingTemplate("  gym  ", [gym, focus])).toEqual(gym);
    expect(findMatchingTemplate("GYM", [gym])).toEqual(gym);
  });

  it("does not substring-match", () => {
    expect(findMatchingTemplate("Gym night", [gym])).toBeNull();
  });

  it("picks greatest updatedAt among duplicate names", () => {
    const older = tpl({ id: "a", name: "1:1", updatedAt: 10 });
    const newer = tpl({ id: "b", name: "1:1", updatedAt: 99 });
    expect(findMatchingTemplate("1:1", [older, newer])).toEqual(newer);
    expect(findMatchingTemplate("1:1", [newer, older])).toEqual(newer);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/content/match-template.test.ts`

Expected: FAIL — cannot find module `./match-template` (or similar)

- [ ] **Step 3: Implement matcher**

Create `src/content/match-template.ts`:

```ts
import type { EventTemplate } from "../types";

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function findMatchingTemplate(
  title: string,
  templates: EventTemplate[],
): EventTemplate | null {
  const needle = normalizeName(title);
  if (!needle) {
    return null;
  }

  let best: EventTemplate | null = null;
  for (const template of templates) {
    if (normalizeName(template.name) !== needle) {
      continue;
    }
    if (!best || template.updatedAt > best.updatedAt) {
      best = template;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/content/match-template.test.ts`

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/content/match-template.ts src/content/match-template.test.ts
git commit -m "$(cat <<'EOF'
feat: add template name matcher for save mode

EOF
)"
```

---

### Task 2: Match-mode Save rewrite + caret “Save only”

**Files:**
- Modify: `src/content/save-as-template.ts`
- Create: `src/content/save-match-mode.test.ts`
- Modify: `src/content/main.ts` (wire blur is inside save watcher; combobox notify in Task 4)

**Interfaces:**
- Consumes: `findMatchingTemplate`, `listTemplates`, `findTitleInputIn`, `findSaveControls`
- Produces:
  - `reevaluateSaveMatch(): Promise<void>` — read title, load templates, enter/leave matched mode
  - Matched Save label text `Save & update template`
  - Caret menu includes `data-gcet-action="save-only"` item when matched
  - Module state: `matchedTemplate: EventTemplate | null`

- [ ] **Step 1: Write failing DOM tests for mode UI**

Create `src/content/save-match-mode.test.ts` (happy-dom). Stub `chrome` like other store tests. Mock template list via stubbing `listTemplates` — prefer testing through exported helpers if you extract them; otherwise mount a minimal DOM and call exported `reevaluateSaveMatch` after wiring.

Minimal fixture HTML in the test:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// After implementation exports are available:
import { watchForSaveTemplateControl, reevaluateSaveMatch } from "./save-as-template";

vi.mock("../store/template-store", async () => {
  const actual = await vi.importActual<typeof import("../store/template-store")>(
    "../store/template-store",
  );
  return {
    ...actual,
    listTemplates: vi.fn(async () => [
      {
        id: "gym",
        name: "Gym",
        keywords: ["workout"],
        location: "Z Center",
        colorId: "10" as const,
        updatedAt: 100,
      },
    ]),
    upsertTemplate: vi.fn(async () => undefined),
  };
});

function mountEditor(title: string): {
  save: HTMLButtonElement;
  titleInput: HTMLInputElement;
} {
  document.body.innerHTML = `
    <div role="dialog">
      <input aria-label="Add title" value="${title}" />
      <button type="button">Save</button>
      <button type="button" aria-label="More actions">More</button>
    </div>
  `;
  const titleInput = document.querySelector("input") as HTMLInputElement;
  const save = document.querySelector("button") as HTMLButtonElement;
  return { save, titleInput };
}

describe("save match mode UI", () => {
  let stop: () => void;

  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn(), id: "test" },
      storage: { sync: { get: vi.fn(), set: vi.fn() }, local: { get: vi.fn(), set: vi.fn() } },
    });
    stop = watchForSaveTemplateControl();
  });

  afterEach(() => {
    stop();
    document.body.innerHTML = "";
  });

  it("relabels Save when title matches a template", async () => {
    const { save } = mountEditor("Gym");
    await reevaluateSaveMatch();
    expect(save.textContent?.trim()).toBe("Save & update template");
    expect(save.getAttribute("aria-label")).toBe("Save & update template");
  });

  it("restores Save when title does not match", async () => {
    const { save, titleInput } = mountEditor("Gym");
    await reevaluateSaveMatch();
    titleInput.value = "Something else";
    await reevaluateSaveMatch();
    expect(save.textContent?.trim()).toBe("Save");
  });
});
```

Add `afterEach` import from vitest.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/content/save-match-mode.test.ts`

Expected: FAIL — `reevaluateSaveMatch` not exported / Save not relabeled

- [ ] **Step 3: Implement match mode UI in `save-as-template.ts`**

Add module state and helpers (integrate with existing file; keep existing save-as-template menu behavior):

```ts
import { findMatchingTemplate } from "./match-template";
import { listTemplates } from "../store/template-store";
import type { EventTemplate } from "../types";

const COMBINED_SAVE_LABEL = "Save & update template";

let matchedTemplate: EventTemplate | null = null;
let labeledSaveButton: HTMLElement | null = null;
let originalSaveLabel: { text: string; aria: string | null } | null = null;
let titleBlurBound: HTMLInputElement | null = null;

function setSaveLabel(saveButton: HTMLElement, label: string): void {
  saveButton.textContent = label;
  saveButton.setAttribute("aria-label", label);
}

function enterMatchedMode(saveButton: HTMLElement, template: EventTemplate): void {
  matchedTemplate = template;
  if (labeledSaveButton !== saveButton || !originalSaveLabel) {
    originalSaveLabel = {
      text: (saveButton.textContent ?? "Save").trim() || "Save",
      aria: saveButton.getAttribute("aria-label"),
    };
    labeledSaveButton = saveButton;
  }
  setSaveLabel(saveButton, COMBINED_SAVE_LABEL);
}

function leaveMatchedMode(): void {
  matchedTemplate = null;
  if (labeledSaveButton && originalSaveLabel) {
    setSaveLabel(labeledSaveButton, originalSaveLabel.text);
    if (originalSaveLabel.aria == null) {
      labeledSaveButton.removeAttribute("aria-label");
    } else {
      labeledSaveButton.setAttribute("aria-label", originalSaveLabel.aria);
    }
  }
  labeledSaveButton = null;
  originalSaveLabel = null;
}

export async function reevaluateSaveMatch(): Promise<void> {
  const titleInput = findTitleInputIn(document);
  const { saveButton } = findSaveControls(document);
  if (!titleInput || !saveButton) {
    leaveMatchedMode();
    return;
  }

  bindTitleBlur(titleInput);

  let templates: EventTemplate[];
  try {
    templates = await listTemplates();
  } catch {
    leaveMatchedMode();
    return;
  }

  const match = findMatchingTemplate(titleInput.value, templates);
  if (match) {
    enterMatchedMode(saveButton, match);
  } else {
    leaveMatchedMode();
  }
}

function bindTitleBlur(titleInput: HTMLInputElement): void {
  if (titleBlurBound === titleInput) {
    return;
  }
  titleBlurBound?.removeEventListener("blur", onTitleBlur);
  titleBlurBound = titleInput;
  titleInput.addEventListener("blur", onTitleBlur);
}

function onTitleBlur(): void {
  void reevaluateSaveMatch();
}
```

In `openMenuNear`, when building menu items, if `matchedTemplate` is set, prepend:

```ts
if (matchedTemplate) {
  const saveOnly = document.createElement("button");
  saveOnly.type = "button";
  saveOnly.className = "gcet-save-menu-item";
  saveOnly.setAttribute("role", "menuitem");
  saveOnly.dataset.gcetAction = "save-only";
  saveOnly.textContent = "Save only";
  menu.appendChild(saveOnly);
}
```

In the shield handler, before the generic `.gcet-save-menu-item` save-as-template path:

```ts
if (target.closest('[data-gcet-action="save-only"]')) {
  event.preventDefault();
  event.stopImmediatePropagation();
  closeMenu();
  const { saveButton } = findSaveControls(document);
  saveButton?.click();
  return;
}
```

Ensure `data-gcet-action="manage"` still takes precedence (already does). Ensure “Save as template” item is **not** triggered for `save-only` — the save-only check must run first. Give the existing save-as-template item `data-gcet-action="save-as-template"` and only call `saveCurrentAsTemplate` for that action (cleaner than “any menu item”).

Call `void reevaluateSaveMatch()` at the end of `tryAttach()` after mounting the caret so a freshly appeared editor with a matching title (e.g. opened from an existing event) is evaluated once Save is found. Still do **not** re-evaluate on every keystroke.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/content/save-match-mode.test.ts`

Expected: PASS for relabel / restore tests

- [ ] **Step 5: Commit**

```bash
git add src/content/save-as-template.ts src/content/save-match-mode.test.ts
git commit -m "$(cat <<'EOF'
feat: relabel Save when title matches a template

EOF
)"
```

---

### Task 3: Intercept combined Save (update template then native save)

**Files:**
- Modify: `src/content/save-as-template.ts`
- Modify: `src/content/save-match-mode.test.ts`

**Interfaces:**
- Consumes: `extractTemplateFromSurface`, `upsertTemplate`, `matchedTemplate`, `isExtensionContextInvalidated`, `showExtensionRefreshBanner`
- Produces: capture-phase click handler on Save when matched; double-submit guard; failure → alert, no native save

- [ ] **Step 1: Write failing intercept tests**

Add to `src/content/save-match-mode.test.ts`:

```ts
import { upsertTemplate } from "../store/template-store";

it("updates matched template then clicks native Save", async () => {
  const { save, titleInput } = mountEditor("Gym");
  const nativeHandler = vi.fn();
  save.addEventListener("click", nativeHandler);

  await reevaluateSaveMatch();

  save.click();
  // allow async intercept to finish
  await vi.waitFor(() => expect(upsertTemplate).toHaveBeenCalled());

  expect(upsertTemplate).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "gym",
      name: "Gym",
      keywords: ["workout"],
    }),
  );
  await vi.waitFor(() => expect(nativeHandler).toHaveBeenCalled());
});

it("does not native-save when upsert fails", async () => {
  vi.mocked(upsertTemplate).mockRejectedValueOnce(new Error("storage down"));
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
  const { save } = mountEditor("Gym");
  const nativeHandler = vi.fn();
  save.addEventListener("click", nativeHandler);

  await reevaluateSaveMatch();
  save.click();
  await vi.waitFor(() => expect(alertSpy).toHaveBeenCalled());
  expect(nativeHandler).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});
```

Note: because the intercept uses capture + `stopImmediatePropagation`, the test’s bubble-phase `nativeHandler` only fires on the **second** programmatic click after upsert. Implement with a skip flag (below) so the second click is not intercepted again.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/content/save-match-mode.test.ts`

Expected: FAIL — upsert not called on Save click

- [ ] **Step 3: Implement click intercept**

In `save-as-template.ts`:

```ts
const NATIVE_SAVE_ATTR = "data-gcet-native-save";

let saveClickBound: HTMLElement | null = null;
let saveInFlight = false;

async function updateMatchedTemplateFromForm(): Promise<void> {
  if (!matchedTemplate) {
    return;
  }
  const titleInput = findTitleInputIn(document);
  if (!titleInput) {
    throw new Error("Could not find the event title field.");
  }
  const draft = extractTemplateFromSurface(titleInput);
  await upsertTemplate({
    ...matchedTemplate,
    ...draft,
    id: matchedTemplate.id,
    keywords: matchedTemplate.keywords,
    updatedAt: Date.now(),
  });
}

function onSaveClickCapture(event: Event): void {
  const saveButton = event.currentTarget;
  if (!(saveButton instanceof HTMLElement)) {
    return;
  }
  if (saveButton.getAttribute(NATIVE_SAVE_ATTR) === "1") {
    saveButton.removeAttribute(NATIVE_SAVE_ATTR);
    return;
  }
  if (!matchedTemplate) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (saveInFlight) {
    return;
  }
  saveInFlight = true;

  void (async () => {
    try {
      await updateMatchedTemplateFromForm();
      showToast(`Updated template “${matchedTemplate!.name}”`);
      saveButton.setAttribute(NATIVE_SAVE_ATTR, "1");
      saveButton.click();
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        showExtensionRefreshBanner();
        window.alert("Refresh this Calendar tab, then try saving again.");
        return;
      }
      window.alert(
        error instanceof Error ? error.message : "Could not update template.",
      );
    } finally {
      saveInFlight = false;
    }
  })();
}

function bindSaveIntercept(saveButton: HTMLElement): void {
  if (saveClickBound === saveButton) {
    return;
  }
  saveClickBound?.removeEventListener("click", onSaveClickCapture, true);
  saveClickBound = saveButton;
  saveButton.addEventListener("click", onSaveClickCapture, true);
}
```

Call `bindSaveIntercept(saveButton)` from `enterMatchedMode` (and from `tryAttach` when already matched after GCal recreates the button). On `leaveMatchedMode`, remove the listener:

```ts
saveClickBound?.removeEventListener("click", onSaveClickCapture, true);
saveClickBound = null;
```

**Save only** path: set `NATIVE_SAVE_ATTR` before clicking, **or** temporarily clear `matchedTemplate` — prefer setting the attribute so intercept skips:

```ts
saveButton.setAttribute(NATIVE_SAVE_ATTR, "1");
saveButton.click();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/content/save-match-mode.test.ts`

Expected: PASS including intercept cases

- [ ] **Step 5: Commit**

```bash
git add src/content/save-as-template.ts src/content/save-match-mode.test.ts
git commit -m "$(cat <<'EOF'
feat: save event and update matched template

EOF
)"
```

---

### Task 4: Combobox pick triggers re-evaluate

**Files:**
- Modify: `src/content/main.ts`
- Modify: `src/content/combobox.test.ts` only if needed (existing onSelect tests should still pass)

**Interfaces:**
- Consumes: `reevaluateSaveMatch` from `./save-as-template`
- Produces: after `applyTemplate(titleInput, template)`, call `void reevaluateSaveMatch()`

- [ ] **Step 1: Wire main.ts**

In `src/content/main.ts`, update imports and combobox callback:

```ts
import {
  reevaluateSaveMatch,
  watchForSaveTemplateControl,
} from "./save-as-template";

// inside mountComboboxOn:
const cleanup = mountTemplateCombobox(titleInput, templates, (template) => {
  applyTemplate(titleInput, template);
  void reevaluateSaveMatch();
});
```

`watchForSaveTemplateControl()` remains as today.

- [ ] **Step 2: Run unit suite**

Run: `npm test`

Expected: PASS (all existing + new tests)

- [ ] **Step 3: Commit**

```bash
git add src/content/main.ts
git commit -m "$(cat <<'EOF'
feat: reevaluate save match after template pick

EOF
)"
```

---

### Task 5: README QA + build check

**Files:**
- Modify: `README.md` (Manual QA table)
- Verify: `npm run build`

- [ ] **Step 1: Add QA rows to README**

In the Manual QA table, append:

```markdown
| 10 | Matching title (blur or template pick) → Save becomes “Save & update template” | |
| 11 | Combined Save updates template fields and saves the event | |
| 12 | Caret “Save only” saves event without changing template | |
| 13 | Non-matching title after blur → normal Save restored | |
| 14 | Duplicate template names → newest updatedAt is updated | |
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: `tsc` + vite succeed; `dist/` updated

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: QA checklist for save-and-update-template

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Trim + case-insensitive match | Task 1 |
| Duplicate → max `updatedAt` | Task 1 |
| Blur re-evaluate | Task 2 |
| Combobox pick re-evaluate | Task 4 |
| Replace Save label | Task 2 |
| Update template then native save | Task 3 |
| Failure skips native save | Task 3 |
| Double-submit guard | Task 3 |
| Preserve id + keywords | Task 3 |
| Caret “Save only” | Task 2 + 3 |
| Create + edit surfaces | Task 2 (same DOM hooks) |
| No live typing match | Task 2 (blur only) |
| Context invalidated handling | Task 3 |
| Manual QA checklist | Task 5 |

## Manual smoke (after Task 5, human)

1. `npm run build`, reload unpacked extension, hard-refresh Calendar.
2. Open create → pick “Gym” from combobox → Save label should change.
3. Edit description → combined Save → confirm template updated in Options and event saved.
4. Matched title → caret → Save only → event saves, template unchanged.
5. Type “Gym” without blurring → Save still “Save”; blur → combined.
