import {
  extractTemplateFromSurface,
  findSaveControls,
  findTitleInputIn,
} from "../gcal/dom-adapter";
import { openTemplateManager } from "../open-options";
import { isExtensionContextInvalidated } from "../store/extension-context";
import { listTemplates, upsertTemplate } from "../store/template-store";
import type { EventTemplate } from "../types";
import { findMatchingTemplate } from "./match-template";
import { showExtensionRefreshBanner } from "./refresh-banner";

const MENU_ID = "gcet-save-menu";
const BTN_ID = "gcet-save-as-template-btn";
const COMBINED_SAVE_LABEL = "Save & update template";
const NATIVE_SAVE_ATTR = "data-gcet-native-save";

let menuTeardown: (() => void) | null = null;
let matchedTemplate: EventTemplate | null = null;
let labeledSaveButton: HTMLElement | null = null;
let originalSaveLabel: { text: string; aria: string | null } | null = null;
let titleBlurBound: HTMLInputElement | null = null;
let saveClickBound: HTMLElement | null = null;
let saveInFlight = false;
let saveMatchEvaluationGeneration = 0;
let pendingSaveMatchEvaluation: Promise<void> | null = null;

function closeMenu(): void {
  menuTeardown?.();
  menuTeardown = null;
  document.getElementById(MENU_ID)?.remove();
}

async function saveCurrentAsTemplate(): Promise<void> {
  const titleInput = findTitleInputIn(document);
  if (!titleInput) {
    window.alert("Could not find the event title field.");
    return;
  }

  const draft = extractTemplateFromSurface(titleInput);
  const name = window.prompt("Template name", draft.name);
  if (name === null) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    window.alert("Template name cannot be empty.");
    return;
  }

  try {
    await upsertTemplate({
      id: crypto.randomUUID(),
      ...draft,
      name: trimmed,
      updatedAt: Date.now(),
    });
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      showExtensionRefreshBanner();
      window.alert("Refresh this Calendar tab, then try saving again.");
      return;
    }
    throw error;
  }

  closeMenu();
  showToast(`Saved template “${trimmed}”`);
}

function showToast(message: string): void {
  const existing = document.getElementById("gcet-toast");
  existing?.remove();
  const toast = document.createElement("div");
  toast.id = "gcet-toast";
  toast.className = "gcet-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2500);
}

function setSaveLabel(saveButton: HTMLElement, label: string): void {
  saveButton.textContent = label;
  saveButton.setAttribute("aria-label", label);
}

async function updateMatchedTemplateFromForm(
  template: EventTemplate,
): Promise<void> {
  const titleInput = findTitleInputIn(document);
  if (!titleInput) {
    throw new Error("Could not find the event title field.");
  }
  const draft = extractTemplateFromSurface(titleInput);
  await upsertTemplate({
    ...template,
    ...draft,
    id: template.id,
    keywords: template.keywords,
    updatedAt: Date.now(),
  });
}

function clickNativeSave(saveButton: HTMLElement): void {
  saveButton.setAttribute(NATIVE_SAVE_ATTR, "1");
  try {
    saveButton.click();
  } finally {
    saveButton.removeAttribute(NATIVE_SAVE_ATTR);
  }
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
  const template = matchedTemplate;
  if (!template) {
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
      await updateMatchedTemplateFromForm(template);
      showToast(`Updated template “${template.name}”`);
      clickNativeSave(saveButton);
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

function enterMatchedMode(saveButton: HTMLElement, template: EventTemplate): void {
  matchedTemplate = template;
  bindSaveIntercept(saveButton);
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
  saveClickBound?.removeEventListener("click", onSaveClickCapture, true);
  saveClickBound = null;
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

async function evaluateSaveMatch(generation: number): Promise<void> {
  const titleInput = findTitleInputIn(document);
  const foundSaveButton = findSaveControls(document).saveButton;
  const saveButton =
    foundSaveButton ?? (labeledSaveButton?.isConnected ? labeledSaveButton : null);
  if (!titleInput || !saveButton) {
    if (generation === saveMatchEvaluationGeneration) {
      leaveMatchedMode();
    }
    return;
  }

  bindTitleBlur(titleInput);

  let templates: EventTemplate[];
  try {
    templates = await listTemplates();
  } catch {
    if (generation === saveMatchEvaluationGeneration) {
      leaveMatchedMode();
    }
    return;
  }

  if (generation !== saveMatchEvaluationGeneration) {
    return;
  }
  const match = findMatchingTemplate(titleInput.value, templates);
  if (match) {
    enterMatchedMode(saveButton, match);
  } else {
    leaveMatchedMode();
  }
}

export function reevaluateSaveMatch(): Promise<void> {
  const generation = ++saveMatchEvaluationGeneration;
  const evaluation = evaluateSaveMatch(generation);
  pendingSaveMatchEvaluation = evaluation;
  void evaluation.finally(() => {
    if (pendingSaveMatchEvaluation === evaluation) {
      pendingSaveMatchEvaluation = null;
    }
  });
  return evaluation;
}

async function toggleMenuNear(anchor: HTMLElement): Promise<void> {
  const existing = document.getElementById(MENU_ID);
  if (existing) {
    closeMenu();
    return;
  }
  await pendingSaveMatchEvaluation;
  if (!anchor.isConnected || document.getElementById(MENU_ID)) {
    return;
  }
  openMenuNear(anchor);
}

function openMenuNear(anchor: HTMLElement): void {
  closeMenu();
  const menu = document.createElement("div");
  menu.id = MENU_ID;
  menu.className = "gcet-save-menu";
  menu.setAttribute("role", "menu");

  if (matchedTemplate) {
    const saveOnly = document.createElement("button");
    saveOnly.type = "button";
    saveOnly.className = "gcet-save-menu-item";
    saveOnly.setAttribute("role", "menuitem");
    saveOnly.dataset.gcetAction = "save-only";
    saveOnly.textContent = "Save only";
    menu.appendChild(saveOnly);
  }

  const item = document.createElement("button");
  item.type = "button";
  item.className = "gcet-save-menu-item";
  item.setAttribute("role", "menuitem");
  item.dataset.gcetAction = "save-as-template";
  item.textContent = "Save as template";
  menu.appendChild(item);

  const manageItem = document.createElement("button");
  manageItem.type = "button";
  manageItem.className = "gcet-save-menu-item";
  manageItem.setAttribute("role", "menuitem");
  manageItem.dataset.gcetAction = "manage";
  manageItem.textContent = "Manage templates…";
  menu.appendChild(manageItem);

  const rect = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.max(8, rect.right - 200)}px`;
  menu.style.zIndex = "2147483647";
  document.body.appendChild(menu);

  // Window capture: handle our UI and block GCal document outside-click handlers.
  let handledSave = false;
  const shield = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (menu.contains(target) || anchor.contains(target)) {
      if (
        (event.type === "mousedown" || event.type === "pointerdown") &&
        target instanceof Element
      ) {
        if (target.closest('[data-gcet-action="manage"]')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeMenu();
          void openTemplateManager();
          return;
        }
        if (target.closest('[data-gcet-action="save-only"]')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeMenu();
          const { saveButton } = findSaveControls(document);
          const nativeSaveButton = saveButton ?? labeledSaveButton;
          if (nativeSaveButton) {
            clickNativeSave(nativeSaveButton);
          }
          return;
        }
        if (target.closest('[data-gcet-action="save-as-template"]')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!handledSave) {
            handledSave = true;
            void saveCurrentAsTemplate();
          }
          return;
        }
      }
      event.stopImmediatePropagation();
      return;
    }
    closeMenu();
  };

  const teardown = () => {
    window.removeEventListener("mousedown", shield, true);
    window.removeEventListener("mouseup", shield, true);
    window.removeEventListener("click", shield, true);
    window.removeEventListener("pointerdown", shield, true);
    window.removeEventListener("pointerup", shield, true);
  };
  menuTeardown = teardown;

  window.addEventListener("mousedown", shield, true);
  window.addEventListener("mouseup", shield, true);
  window.addEventListener("click", shield, true);
  window.addEventListener("pointerdown", shield, true);
  window.addEventListener("pointerup", shield, true);
}

function mountSplitControl(saveButton: HTMLElement): void {
  if (document.getElementById(BTN_ID)) {
    return;
  }

  const parent = saveButton.parentElement;
  if (!parent) {
    return;
  }

  const split = document.createElement("div");
  split.className = "gcet-save-split";
  split.id = BTN_ID;
  split.dataset.gcetPlacement = "save";

  const caret = document.createElement("button");
  caret.type = "button";
  caret.className = "gcet-save-caret";
  caret.setAttribute("aria-label", "Save options");
  caret.setAttribute("aria-haspopup", "menu");
  caret.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>';
  caret.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleMenuNear(caret);
  });

  // Prefer inserting next to the save button's container (same row as More actions).
  parent.insertBefore(split, saveButton.nextSibling);
  split.appendChild(caret);
}

function tryAttach(): void {
  const title = findTitleInputIn(document);
  if (!title) {
    return;
  }
  const existing = document.getElementById(BTN_ID);
  const { saveButton, moreActions } = findSaveControls(document);
  if (saveButton) {
    if (matchedTemplate) {
      bindSaveIntercept(saveButton);
    }
    if (existing?.dataset.gcetPlacement === "save") {
      return;
    }
    existing?.remove();
    mountSplitControl(saveButton);
    void reevaluateSaveMatch();
    return;
  }
  if (existing) {
    return;
  }
  // Fall back: attach near More actions if Save isn't found yet.
  if (moreActions?.parentElement) {
    const caretHost = moreActions.parentElement;
    const split = document.createElement("div");
    split.className = "gcet-save-split";
    split.id = BTN_ID;
    split.dataset.gcetPlacement = "fallback";
    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = "gcet-save-caret";
    caret.setAttribute("aria-label", "Save as template");
    caret.textContent = "▾ Template";
    caret.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void toggleMenuNear(caret);
    });
    split.appendChild(caret);
    caretHost.insertBefore(split, moreActions);
  }
}

export function watchForSaveTemplateControl(): () => void {
  tryAttach();
  const observer = new MutationObserver(() => tryAttach());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const intervalId = window.setInterval(tryAttach, 1500);
  return () => {
    observer.disconnect();
    window.clearInterval(intervalId);
    closeMenu();
    document.getElementById(BTN_ID)?.remove();
    titleBlurBound?.removeEventListener("blur", onTitleBlur);
    titleBlurBound = null;
    saveMatchEvaluationGeneration++;
    leaveMatchedMode();
  };
}
