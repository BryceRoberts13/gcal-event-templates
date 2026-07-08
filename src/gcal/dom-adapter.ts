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

function applyColor(root: ParentNode, colorId: GcalColorId): void {
  const swatch = root.querySelector(`[data-color-id="${colorId}"]`);
  if (swatch instanceof HTMLElement) {
    swatch.click();
    swatch.setAttribute("aria-pressed", "true");
    root.querySelectorAll("[data-color-id]").forEach((node) => {
      if (node !== swatch) {
        node.removeAttribute("aria-pressed");
      }
    });
    return;
  }

  const colorButton = root.querySelector(
    'button[aria-label*="color" i], button[aria-label*="Color" i], div[aria-label*="calendar color" i]',
  );
  if (!(colorButton instanceof HTMLElement)) {
    console.warn("[gcal-event-templates] color control not found");
    return;
  }
  colorButton.click();
  window.setTimeout(() => {
    const paletteSwatch = document.querySelector(`[data-color-id="${colorId}"]`);
    if (paletteSwatch instanceof HTMLElement) {
      paletteSwatch.click();
    } else {
      console.warn("[gcal-event-templates] color swatch not found for", colorId);
    }
  }, 50);
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
  const pressed = surface.querySelector("[data-color-id][aria-pressed='true']");
  const colorIdAttr = pressed?.getAttribute("data-color-id") ?? undefined;

  return {
    name: titleInput.value.trim() || "Untitled template",
    description: readFieldText(description) || undefined,
    location: location?.value.trim() || undefined,
    colorId: colorIdAttr as GcalColorId | undefined,
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
