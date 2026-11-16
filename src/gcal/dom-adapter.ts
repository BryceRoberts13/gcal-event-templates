import {
  COLOR_PICK_INITIAL_DELAY_MS,
  COLOR_PICK_MAX_ATTEMPTS,
  COLOR_PICK_RETRY_DELAY_MS,
  setValidatedTimeout,
} from "../poll";
import type { EventTemplate, GcalColorId } from "../types";
import { isGcalColorId } from "../store/validate-store";
import {
  readContentEditableText,
  setContentEditableText,
  setInputValue,
  setTextareaValue,
} from "./dom-utils";

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

/** Classic + modern GCal palette hexes (lowercase, no #) keyed by color id. */
const COLOR_HEX_TO_ID: Record<string, GcalColorId> = {
  // Classic API event colors
  a4bdfc: "1",
  "7ae7bf": "2",
  dbadff: "3",
  ff887c: "4",
  fbd75b: "5",
  ffb878: "6",
  "46d6db": "7",
  e1e1e1: "8",
  "5484ed": "9",
  "51b749": "10",
  dc2127: "11",
  // Modern Material palette used in the web UI chips
  "7986cb": "1",
  "33b679": "2",
  "8e24aa": "3",
  e67c73: "4",
  f6bf26: "5",
  f4511e: "6",
  "039be5": "7",
  "616161": "8",
  "3f51b5": "9",
  "0b8043": "10",
  d50000: "11",
};

function colorIdFromLabel(label: string): GcalColorId | undefined {
  const lower = label.toLowerCase();
  for (const [name, id] of Object.entries(COLOR_NAME_TO_ID)) {
    if (lower.includes(name)) {
      return id;
    }
  }
  return undefined;
}

function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return hex;
  }
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return [r, g, b]
    .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
    .join("");
}

function colorIdFromCssColor(value: string): GcalColorId | undefined {
  const trimmed = value.trim().toLowerCase();
  const hex = normalizeHex(trimmed);
  if (hex && hex in COLOR_HEX_TO_ID) {
    return COLOR_HEX_TO_ID[hex];
  }
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const asHex = rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
    return COLOR_HEX_TO_ID[asHex];
  }
  return undefined;
}

function colorIdFromElementStyles(el: HTMLElement): GcalColorId | undefined {
  const inline = el.getAttribute("style") ?? "";
  const bgMatch = inline.match(/background(?:-color)?\s*:\s*([^;]+)/i);
  if (bgMatch) {
    const fromInline = colorIdFromCssColor(bgMatch[1]);
    if (fromInline) {
      return fromInline;
    }
  }
  const computed = typeof window.getComputedStyle === "function" ? window.getComputedStyle(el) : null;
  if (computed) {
    const fromComputed = colorIdFromCssColor(computed.backgroundColor);
    if (fromComputed) {
      return fromComputed;
    }
  }
  for (const child of Array.from(el.querySelectorAll("[style]"))) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    const fromChild = colorIdFromElementStyles(child);
    if (fromChild) {
      return fromChild;
    }
  }
  return undefined;
}

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

function isColorPickerTrigger(el: HTMLElement): boolean {
  const label = (el.getAttribute("aria-label") ?? "").toLowerCase();
  return (
    label.includes("event color") ||
    label.includes("calendar color") ||
    /^color$/i.test(label.trim())
  );
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
    `[role="option"][aria-label="${name}"]`,
    `[aria-label="${name}"]`,
  ];

  for (const selector of selectors) {
    try {
      const match = root.querySelector(selector);
      if (match instanceof HTMLElement && !isColorPickerTrigger(match)) {
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
    if (!(node instanceof HTMLElement) || isColorPickerTrigger(node)) {
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

let colorWatch: { observer: MutationObserver; timer: number } | null = null;

function stopColorWatch(): void {
  colorWatch?.observer.disconnect();
  if (colorWatch) {
    window.clearTimeout(colorWatch.timer);
  }
  colorWatch = null;
}

function applyColor(root: ParentNode, colorId: GcalColorId): void {
  if (!isGcalColorId(colorId)) {
    return;
  }

  const pick = (): boolean => {
    const palette = findColorSwatch(document, colorId) ?? findColorSwatch(root, colorId);
    if (!palette) {
      return false;
    }
    clickSwatch(palette);
    return true;
  };

  if (pick()) {
    stopColorWatch();
    return;
  }

  const colorButton = findColorPickerButton(root) ?? findColorPickerButton(document);
  if (!colorButton) {
    // Best-effort: title/description/location already applied. Don't spam Errors.
    console.debug("[gcal-event-templates] color control not found; skipped color", colorId);
    return;
  }

  colorButton.click();
  if (pick()) {
    stopColorWatch();
    return;
  }

  stopColorWatch();
  const observer = new MutationObserver(() => {
    if (pick()) {
      stopColorWatch();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "data-color-id", "style"],
  });
  const deadline =
    COLOR_PICK_INITIAL_DELAY_MS + COLOR_PICK_RETRY_DELAY_MS * COLOR_PICK_MAX_ATTEMPTS;
  const timer = setValidatedTimeout(() => {
    observer.disconnect();
    if (colorWatch?.observer === observer) {
      colorWatch = null;
    }
    if (!pick()) {
      console.debug(
        "[gcal-event-templates] color swatch not found for",
        colorId,
        COLOR_NAMES[colorId],
      );
    }
  }, deadline);
  colorWatch = { observer, timer };
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
  return readContentEditableText(field).trim();
}

export function extractTemplateFromSurface(
  titleInput: HTMLInputElement,
): Omit<EventTemplate, "id" | "updatedAt"> {
  const surface = findEventSurface(titleInput) ?? document.body;
  const description = findDescriptionField(surface);
  const location = findInputByLabels(surface, LOCATION_LABELS);

  const pressed =
    surface.querySelector(
      "[data-color-id][aria-pressed='true'], [data-color-index][aria-pressed='true'], [role='menuitemradio'][aria-checked='true'], [role='option'][aria-selected='true'], [aria-checked='true']",
    ) ??
    document.querySelector(
      "[data-color-id][aria-pressed='true'], [data-color-index][aria-pressed='true'], [role='menuitemradio'][aria-checked='true'], [role='option'][aria-selected='true'], [aria-checked='true']",
    );

  let colorId: GcalColorId | undefined;
  if (pressed instanceof HTMLElement) {
    const idAttr =
      pressed.getAttribute("data-color-id") ??
      pressed.getAttribute("data-color-index") ??
      pressed.getAttribute("data-colorid");
    if (idAttr && idAttr in COLOR_NAMES) {
      colorId = idAttr as GcalColorId;
    } else {
      colorId = colorIdFromLabel(pressed.getAttribute("aria-label") ?? pressed.textContent ?? "");
    }
  }

  if (!colorId) {
    const colorButton =
      findColorPickerButton(surface) ?? findColorPickerButton(document);
    if (colorButton) {
      colorId =
        colorIdFromLabel(colorButton.getAttribute("aria-label") ?? "") ??
        colorIdFromLabel(colorButton.getAttribute("title") ?? "") ??
        colorIdFromElementStyles(colorButton);
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
