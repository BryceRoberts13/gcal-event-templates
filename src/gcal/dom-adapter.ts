import type { EventTemplate, GcalColorId } from "../types";
import { setContentEditableText, setInputValue, setTextareaValue } from "./dom-utils";

const TITLE_LABELS = [
  "Add title",
  "Add title and time",
  "Title",
  "Event title",
];
const LOCATION_LABELS = ["Add location", "Location"];
const DESCRIPTION_LABELS = ["Description", "Add description"];

/** Classic GCal event color ids 1–11 → palette names shown in the UI. */
const COLOR_NAMES: Record<GcalColorId, string> = {
  "1": "Lavender",
  "2": "Sage",
  "3": "Grape",
  "4": "Flamingo",
  "5": "Banana",
  "6": "Tangerine",
  "7": "Peacock",
  "8": "Graphite",
  "9": "Blueberry",
  "10": "Basil",
  "11": "Tomato",
};

const COLOR_NAME_TO_ID = Object.fromEntries(
  Object.entries(COLOR_NAMES).map(([id, name]) => [name.toLowerCase(), id as GcalColorId]),
) as Record<string, GcalColorId>;

export function isTitleInput(element: Element | null): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  const label = (element.getAttribute("aria-label") ?? "").trim();
  if (TITLE_LABELS.some((candidate) => label === candidate || label.startsWith(candidate))) {
    return true;
  }
  // Fallback: large title field near top of create/edit surfaces
  const placeholder = (element.getAttribute("placeholder") ?? "").toLowerCase();
  return placeholder.includes("title");
}

export function findEventSurface(titleInput: HTMLInputElement): HTMLElement | null {
  let node: HTMLElement | null = titleInput.parentElement;
  while (node && node !== document.body) {
    const hasLocation =
      !!findInputByLabels(node, LOCATION_LABELS) ||
      !!findDescriptionField(node) ||
      !!node.querySelector("[data-color-id], button[aria-label*='color' i]");
    if (node.getAttribute("role") === "dialog" || hasLocation) {
      return node;
    }
    node = node.parentElement;
  }

  return (
    titleInput.closest('[role="dialog"]') ??
    titleInput.closest('[role="main"]') ??
    document.body
  );
}

function findInputByLabels(
  root: ParentNode,
  labels: string[],
): HTMLInputElement | null {
  for (const label of labels) {
    const match = root.querySelector(`input[aria-label="${label}"]`);
    if (match instanceof HTMLInputElement) {
      return match;
    }
  }
  for (const label of labels) {
    const match = Array.from(root.querySelectorAll("input")).find((input) => {
      const aria = input.getAttribute("aria-label") ?? "";
      return aria === label || aria.startsWith(label);
    });
    if (match instanceof HTMLInputElement) {
      return match;
    }
  }
  return null;
}

function findDescriptionField(root: ParentNode): HTMLTextAreaElement | HTMLElement | null {
  for (const label of DESCRIPTION_LABELS) {
    const textarea = root.querySelector(`textarea[aria-label="${label}"]`);
    if (textarea instanceof HTMLTextAreaElement) {
      return textarea;
    }
    const editable = root.querySelector(
      `div[aria-label="${label}"][contenteditable="true"], div[aria-label="${label}"][contenteditable=""]`,
    );
    if (editable instanceof HTMLElement) {
      return editable;
    }
  }
  const loose = root.querySelector(
    '[aria-label="Add description"][contenteditable="true"], [aria-label="Description"][contenteditable="true"]',
  );
  return loose instanceof HTMLElement ? loose : null;
}

function setDescription(
  field: HTMLTextAreaElement | HTMLElement,
  value: string,
): void {
  if (field instanceof HTMLTextAreaElement) {
    setTextareaValue(field, value);
    return;
  }
  setContentEditableText(field, value);
}

function findColorSwatch(
  root: ParentNode,
  colorId: GcalColorId,
): HTMLElement | null {
  const name = COLOR_NAMES[colorId];
  const selectors = [
    `[data-color-id="${colorId}"]`,
    `[data-color-index="${colorId}"]`,
    `[data-colorid="${colorId}"]`,
    `div[role="menuitemradio"][aria-label="${name}"]`,
    `button[aria-label="${name}"]`,
    `[aria-label="${name}"]`,
    `[aria-label*="${name}" i]`,
  ];

  for (const selector of selectors) {
    try {
      const match = root.querySelector(selector);
      if (match instanceof HTMLElement) {
        return match;
      }
    } catch {
      // Invalid selector in this environment — skip.
    }
  }

  // Scan interactive nodes by accessible name (palette menus often lack data-color-id).
  const candidates = root.querySelectorAll(
    'button, [role="button"], [role="menuitemradio"], [role="option"], [role="menuitem"]',
  );
  for (const node of candidates) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const label = (node.getAttribute("aria-label") ?? node.textContent ?? "")
      .trim()
      .toLowerCase();
    if (label === name.toLowerCase() || label.includes(name.toLowerCase())) {
      return node;
    }
  }

  return null;
}

function findColorPickerButton(root: ParentNode): HTMLElement | null {
  const selectors = [
    'button[aria-label*="event color" i]',
    'button[aria-label*="calendar color" i]',
    'div[role="button"][aria-label*="event color" i]',
    'div[role="button"][aria-label*="calendar color" i]',
    'button[aria-label*="color" i]',
    'div[role="button"][aria-label*="color" i]',
  ];
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match instanceof HTMLElement) {
      return match;
    }
  }

  // Heuristic: colored chip near calendar name select in the details pane.
  const chips = Array.from(root.querySelectorAll("button, div[role='button']")).filter(
    (el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      const style = el.getAttribute("style") ?? "";
      const hasBg =
        /background(-color)?:\s*(rgb|#)/i.test(style) ||
        el.querySelector('[style*="background"]') !== null;
      const label = (el.getAttribute("aria-label") ?? "").toLowerCase();
      return hasBg || label.includes("color");
    },
  );
  return (chips[0] as HTMLElement | undefined) ?? null;
}

function clickSwatch(swatch: HTMLElement): void {
  swatch.click();
  swatch.setAttribute("aria-pressed", "true");
  swatch.setAttribute("aria-checked", "true");
}

function applyColor(root: ParentNode, colorId: GcalColorId): void {
  const immediate = findColorSwatch(root, colorId) ?? findColorSwatch(document, colorId);
  if (immediate) {
    clickSwatch(immediate);
    return;
  }

  const colorButton = findColorPickerButton(root) ?? findColorPickerButton(document);
  if (!colorButton) {
    // Best-effort: title/description/location already applied. Don't spam Errors.
    console.debug("[gcal-event-templates] color control not found; skipped color", colorId);
    return;
  }

  colorButton.click();

  const tryPick = (attempt: number): void => {
    const palette =
      findColorSwatch(document, colorId) ??
      findColorSwatch(root, colorId);
    if (palette) {
      clickSwatch(palette);
      return;
    }
    if (attempt < 8) {
      window.setTimeout(() => tryPick(attempt + 1), 60);
      return;
    }
    console.debug(
      "[gcal-event-templates] color swatch not found for",
      colorId,
      COLOR_NAMES[colorId],
    );
  };

  window.setTimeout(() => tryPick(0), 40);
}

export function applyTemplate(
  titleInput: HTMLInputElement,
  template: EventTemplate,
): void {
  const surface = findEventSurface(titleInput);
  if (!surface) {
    return;
  }

  setInputValue(titleInput, template.name);

  if (template.description) {
    const description = findDescriptionField(surface);
    if (description) {
      setDescription(description, template.description);
    }
  }

  if (template.location) {
    const location = findInputByLabels(surface, LOCATION_LABELS);
    if (location) {
      setInputValue(location, template.location);
    }
  }

  if (template.colorId) {
    applyColor(surface, template.colorId);
  }
}

function readFieldText(field: HTMLTextAreaElement | HTMLElement | null): string {
  if (!field) {
    return "";
  }
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    return field.value.trim();
  }
  return (field.innerText || field.textContent || "").trim();
}

export function extractTemplateFromSurface(
  titleInput: HTMLInputElement,
): Omit<EventTemplate, "id" | "updatedAt"> {
  const surface = findEventSurface(titleInput) ?? document.body;
  const description = findDescriptionField(surface);
  const location = findInputByLabels(surface, LOCATION_LABELS);

  const pressed =
    surface.querySelector("[data-color-id][aria-pressed='true'], [data-color-index][aria-pressed='true'], [aria-checked='true']") ??
    document.querySelector("[data-color-id][aria-pressed='true'], [data-color-index][aria-pressed='true'], [aria-checked='true']");

  let colorId: GcalColorId | undefined;
  if (pressed instanceof HTMLElement) {
    const idAttr =
      pressed.getAttribute("data-color-id") ??
      pressed.getAttribute("data-color-index") ??
      pressed.getAttribute("data-colorid");
    if (idAttr && idAttr in COLOR_NAMES) {
      colorId = idAttr as GcalColorId;
    } else {
      const label = (pressed.getAttribute("aria-label") ?? "").toLowerCase();
      for (const [name, id] of Object.entries(COLOR_NAME_TO_ID)) {
        if (label.includes(name)) {
          colorId = id;
          break;
        }
      }
    }
  }

  return {
    name: titleInput.value.trim() || "Untitled template",
    description: readFieldText(description) || undefined,
    location: location?.value.trim() || undefined,
    colorId,
  };
}

export function findTitleInputIn(root: ParentNode = document): HTMLInputElement | null {
  const inputs = Array.from(root.querySelectorAll("input"));
  return inputs.find((input) => isTitleInput(input)) ?? null;
}

export function findSaveControls(root: ParentNode = document): {
  saveButton: HTMLElement | null;
  moreActions: HTMLElement | null;
} {
  const buttons = Array.from(root.querySelectorAll("button, div[role='button']"));
  const save =
    buttons.find((el) => {
      const text = (el.textContent ?? "").trim();
      const aria = el.getAttribute("aria-label") ?? "";
      return text === "Save" || aria === "Save";
    }) ?? null;

  const more =
    buttons.find((el) => {
      const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
      const text = (el.textContent ?? "").trim().toLowerCase();
      return (
        aria.includes("more actions") ||
        aria.includes("expand more") ||
        text === "more actions"
      );
    }) ?? null;

  return {
    saveButton: save instanceof HTMLElement ? save : null,
    moreActions: more instanceof HTMLElement ? more : null,
  };
}
