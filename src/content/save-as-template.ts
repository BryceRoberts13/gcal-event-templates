import {
  extractTemplateFromSurface,
  findSaveControls,
  findTitleInputIn,
} from "../gcal/dom-adapter";
import { openTemplateManager } from "../open-options";
import { isExtensionContextInvalidated } from "../store/extension-context";
import { upsertTemplate } from "../store/template-store";
import { showExtensionRefreshBanner } from "./refresh-banner";

const MENU_ID = "gcet-save-menu";
const BTN_ID = "gcet-save-as-template-btn";

let menuTeardown: (() => void) | null = null;

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

function openMenuNear(anchor: HTMLElement): void {
  closeMenu();
  const menu = document.createElement("div");
  menu.id = MENU_ID;
  menu.className = "gcet-save-menu";
  menu.setAttribute("role", "menu");

  const item = document.createElement("button");
  item.type = "button";
  item.className = "gcet-save-menu-item";
  item.setAttribute("role", "menuitem");
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
        if (target.closest(".gcet-save-menu-item")) {
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
    const existing = document.getElementById(MENU_ID);
    if (existing) {
      closeMenu();
      return;
    }
    openMenuNear(caret);
  });

  // Prefer inserting next to the save button's container (same row as More actions).
  parent.insertBefore(split, saveButton.nextSibling);
  split.appendChild(caret);
}

function tryAttach(): void {
  if (document.getElementById(BTN_ID)) {
    return;
  }
  const title = findTitleInputIn(document);
  if (!title) {
    return;
  }
  const { saveButton, moreActions } = findSaveControls(document);
  if (saveButton) {
    mountSplitControl(saveButton);
    return;
  }
  // Fall back: attach near More actions if Save isn't found yet.
  if (moreActions?.parentElement && !document.getElementById(BTN_ID)) {
    const caretHost = moreActions.parentElement;
    const split = document.createElement("div");
    split.className = "gcet-save-split";
    split.id = BTN_ID;
    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = "gcet-save-caret";
    caret.setAttribute("aria-label", "Save as template");
    caret.textContent = "▾ Template";
    caret.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenuNear(caret);
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
  };
}
