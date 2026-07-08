import type { EventTemplate, GcalColorId } from "../types";
import { setContentEditableText, setInputValue, setTextareaValue } from "./dom-utils";

const TITLE_LABELS = ["Add title", "Add title and time", "Title"];
const LOCATION_LABELS = ["Add location", "Location"];
const DESCRIPTION_LABELS = ["Description", "Add description"];

export function isTitleInput(element: Element | null): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  const label = element.getAttribute("aria-label") ?? "";
  return TITLE_LABELS.some((candidate) => label === candidate);
}

export function findEventSurface(titleInput: HTMLInputElement): HTMLElement | null {
  return (
    titleInput.closest('[role="dialog"]') ??
    titleInput.closest('[role="main"] form') ??
    titleInput.closest("form") ??
    titleInput.parentElement
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
  return null;
}

function findDescriptionField(root: ParentNode): HTMLTextAreaElement | HTMLElement | null {
  for (const label of DESCRIPTION_LABELS) {
    const textarea = root.querySelector(`textarea[aria-label="${label}"]`);
    if (textarea instanceof HTMLTextAreaElement) {
      return textarea;
    }
    const editable = root.querySelector(`div[aria-label="${label}"][contenteditable="true"]`);
    if (editable instanceof HTMLElement) {
      return editable;
    }
  }
  return null;
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
    root
      .querySelectorAll("[data-color-id]")
      .forEach((node) => {
        if (node !== swatch) {
          node.removeAttribute("aria-pressed");
        }
      });
    return;
  }

  const colorButton = root.querySelector('button[aria-label*="color" i], button[aria-label*="Color" i]');
  if (!(colorButton instanceof HTMLElement)) {
    console.warn("[gcal-event-templates] color control not found");
    return;
  }
  colorButton.click();
  const paletteSwatch = document.querySelector(`[data-color-id="${colorId}"]`);
  if (paletteSwatch instanceof HTMLElement) {
    paletteSwatch.click();
  } else {
    console.warn("[gcal-event-templates] color swatch not found for", colorId);
  }
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
