import {
  extractTemplateFromSurface,
  findSaveControls,
  findTitleInputIn,
} from "../gcal/dom-adapter";
import { isExtensionContextInvalidated } from "../store/extension-context";
import { listTemplates, upsertTemplate } from "../store/template-store";
import type { EventTemplate } from "../types";
import { findMatchingTemplate } from "./match-template";
import { showExtensionRefreshBanner } from "./refresh-banner";
import { mountOverlay, removeOverlay } from "./shadow-host";

export const SAVE_MENU_ID = "gcet-save-menu";

const COMBINED_SAVE_LABEL = "Save & update template";
const NATIVE_SAVE_ATTR = "data-gcet-native-save";

/**
 * Match mode for one Calendar tab: which template the title matches, the
 * Save-button label, and the in-flight evaluation. One instance owns all of
 * that state so the watchers are not a pile of module globals.
 */
export class SaveMatchSession {
  private menuTeardown: (() => void) | null = null;
  private matched: EventTemplate | null = null;
  private labeledSaveButton: HTMLElement | null = null;
  private originalSaveLabel: { text: string; aria: string | null } | null = null;
  private titleBlurBound: HTMLInputElement | null = null;
  private saveClickBound: HTMLElement | null = null;
  private saveInFlight = false;
  private generation = 0;
  private pendingEvaluation: Promise<void> | null = null;

  get matchedTemplate(): EventTemplate | null {
    return this.matched;
  }

  get boundSaveButton(): HTMLElement | null {
    return this.saveClickBound;
  }

  get labeledButton(): HTMLElement | null {
    return this.labeledSaveButton;
  }

  get pending(): Promise<void> | null {
    return this.pendingEvaluation;
  }

  setMenuTeardown(teardown: (() => void) | null): void {
    this.menuTeardown = teardown;
  }

  closeMenu(): void {
    this.menuTeardown?.();
    this.menuTeardown = null;
    removeOverlay(SAVE_MENU_ID);
  }

  clickNativeSave(saveButton: HTMLElement): void {
    saveButton.setAttribute(NATIVE_SAVE_ATTR, "1");
    try {
      saveButton.click();
    } finally {
      saveButton.removeAttribute(NATIVE_SAVE_ATTR);
    }
  }

  bindSaveIntercept(saveButton: HTMLElement): void {
    if (this.saveClickBound === saveButton) {
      return;
    }
    this.saveClickBound?.removeEventListener("click", this.onSaveClickCapture, true);
    this.saveClickBound = saveButton;
    saveButton.addEventListener("click", this.onSaveClickCapture, true);
  }

  reevaluate(): Promise<void> {
    const generation = ++this.generation;
    const evaluation = this.evaluate(generation);
    this.pendingEvaluation = evaluation;
    void evaluation.finally(() => {
      if (this.pendingEvaluation === evaluation) {
        this.pendingEvaluation = null;
      }
    });
    return evaluation;
  }

  /** Drop match mode without cancelling the watcher. Used when the dialog closes. */
  clearMatch(): void {
    this.leave();
  }

  stop(): void {
    this.closeMenu();
    this.titleBlurBound?.removeEventListener("blur", this.onTitleBlur);
    this.titleBlurBound = null;
    this.generation += 1;
    this.leave();
  }

  private onTitleBlur = (): void => {
    void this.reevaluate();
  };

  private onSaveClickCapture = (event: Event): void => {
    const saveButton = event.currentTarget;
    if (!(saveButton instanceof HTMLElement)) {
      return;
    }
    if (saveButton.getAttribute(NATIVE_SAVE_ATTR) === "1") {
      saveButton.removeAttribute(NATIVE_SAVE_ATTR);
      return;
    }
    const template = this.matched;
    if (!template) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (this.saveInFlight) {
      return;
    }
    this.saveInFlight = true;

    void (async () => {
      try {
        await this.updateMatchedTemplate(template);
        showToast(`Updated template “${template.name}”`);
        this.clickNativeSave(saveButton);
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
        this.saveInFlight = false;
      }
    })();
  };

  private async updateMatchedTemplate(template: EventTemplate): Promise<void> {
    const titleInput = findTitleInputIn(document);
    if (!titleInput) {
      throw new Error("Could not find the event title field.");
    }
    const draft = extractTemplateFromSurface(titleInput);
    const next: EventTemplate = {
      ...template,
      name: draft.name,
      id: template.id,
      keywords: template.keywords,
      updatedAt: Date.now(),
    };
    if (draft.description !== undefined) {
      next.description = draft.description;
    }
    if (draft.location !== undefined) {
      next.location = draft.location;
    }
    if (draft.colorId !== undefined) {
      next.colorId = draft.colorId;
    }
    await upsertTemplate(next);
  }

  private enter(saveButton: HTMLElement, template: EventTemplate): void {
    this.matched = template;
    this.bindSaveIntercept(saveButton);
    if (this.labeledSaveButton !== saveButton || !this.originalSaveLabel) {
      this.originalSaveLabel = {
        text: (saveButton.textContent ?? "Save").trim() || "Save",
        aria: saveButton.getAttribute("aria-label"),
      };
      this.labeledSaveButton = saveButton;
    }
    setSaveLabel(saveButton, COMBINED_SAVE_LABEL, "#fff");
  }

  private leave(): void {
    this.matched = null;
    this.saveClickBound?.removeEventListener("click", this.onSaveClickCapture, true);
    this.saveClickBound = null;
    if (this.labeledSaveButton && this.originalSaveLabel) {
      setSaveLabel(this.labeledSaveButton, this.originalSaveLabel.text, "");
      if (this.originalSaveLabel.aria == null) {
        this.labeledSaveButton.removeAttribute("aria-label");
      } else {
        this.labeledSaveButton.setAttribute("aria-label", this.originalSaveLabel.aria);
      }
    }
    this.labeledSaveButton = null;
    this.originalSaveLabel = null;
  }

  private bindTitleBlur(titleInput: HTMLInputElement): void {
    if (this.titleBlurBound === titleInput) {
      return;
    }
    this.titleBlurBound?.removeEventListener("blur", this.onTitleBlur);
    this.titleBlurBound = titleInput;
    titleInput.addEventListener("blur", this.onTitleBlur);
  }

  private async evaluate(generation: number): Promise<void> {
    const titleInput = findTitleInputIn(document);
    const foundSaveButton = findSaveControls(document).saveButton;
    const saveButton =
      foundSaveButton ?? (this.labeledSaveButton?.isConnected ? this.labeledSaveButton : null);
    if (!titleInput || !saveButton) {
      if (generation === this.generation) {
        this.leave();
      }
      return;
    }

    this.bindTitleBlur(titleInput);

    let templates: EventTemplate[];
    try {
      templates = await listTemplates();
    } catch {
      if (generation === this.generation) {
        this.leave();
      }
      return;
    }

    if (generation !== this.generation) {
      return;
    }
    const match = findMatchingTemplate(titleInput.value, templates);
    if (match) {
      this.enter(saveButton, match);
    } else {
      this.leave();
    }
  }
}

function setSaveLabel(saveButton: HTMLElement, label: string, color?: string): void {
  saveButton.textContent = label;
  saveButton.setAttribute("aria-label", label);
  if (color !== undefined) {
    saveButton.style.color = color;
  }
}

function showToast(message: string): void {
  removeOverlay("gcet-toast");
  const overlay = mountOverlay("gcet-toast", "2147483647");
  const toast = document.createElement("div");
  toast.id = "gcet-toast";
  toast.className = "gcet-toast";
  toast.textContent = message;
  overlay.root.appendChild(toast);
  document.body.appendChild(overlay.host);
  window.setTimeout(() => removeOverlay("gcet-toast"), 2500);
}
