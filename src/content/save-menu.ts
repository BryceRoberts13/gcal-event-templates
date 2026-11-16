import {
  extractTemplateFromSurface,
  findSaveControls,
  findTitleInputIn,
} from "../gcal/dom-adapter";
import { openTemplateManager } from "../open-options";
import { isExtensionContextInvalidated } from "../store/extension-context";
import { upsertTemplate } from "../store/template-store";
import { showExtensionRefreshBanner } from "./refresh-banner";
import { SAVE_MENU_ID, type SaveMatchSession } from "./save-match-session";
import { composedTarget, mountOverlay, removeOverlay } from "./shadow-host";

export async function toggleSaveMenu(
  session: SaveMatchSession,
  anchor: HTMLElement,
): Promise<void> {
  const existing = document.querySelector(`[data-gcet-overlay="${SAVE_MENU_ID}"]`);
  if (existing) {
    session.closeMenu();
    return;
  }
  await session.pending;
  if (!anchor.isConnected || document.querySelector(`[data-gcet-overlay="${SAVE_MENU_ID}"]`)) {
    return;
  }
  openSaveMenu(session, anchor);
}

function openSaveMenu(session: SaveMatchSession, anchor: HTMLElement): void {
  session.closeMenu();
  const overlay = mountOverlay(SAVE_MENU_ID, "2147483647");
  const menu = document.createElement("div");
  menu.id = SAVE_MENU_ID;
  menu.className = "gcet-save-menu";
  menu.setAttribute("role", "menu");

  if (session.matchedTemplate) {
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
  overlay.root.appendChild(menu);
  document.body.appendChild(overlay.host);

  // Window capture: handle our UI and block GCal document outside-click handlers.
  let handledSave = false;
  const shield = (event: Event) => {
    const target = composedTarget(event);
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
          session.closeMenu();
          void openTemplateManager();
          return;
        }
        if (target.closest('[data-gcet-action="save-only"]')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          session.closeMenu();
          const { saveButton } = findSaveControls(document);
          const nativeSaveButton = saveButton ?? session.labeledButton;
          if (nativeSaveButton) {
            session.clickNativeSave(nativeSaveButton);
          }
          return;
        }
        if (target.closest('[data-gcet-action="save-as-template"]')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!handledSave) {
            handledSave = true;
            void saveCurrentAsTemplate(session);
          }
          return;
        }
      }
      event.stopImmediatePropagation();
      return;
    }
    session.closeMenu();
  };

  session.setMenuTeardown(() => {
    window.removeEventListener("mousedown", shield, true);
    window.removeEventListener("mouseup", shield, true);
    window.removeEventListener("click", shield, true);
    window.removeEventListener("pointerdown", shield, true);
    window.removeEventListener("pointerup", shield, true);
  });

  window.addEventListener("mousedown", shield, true);
  window.addEventListener("mouseup", shield, true);
  window.addEventListener("click", shield, true);
  window.addEventListener("pointerdown", shield, true);
  window.addEventListener("pointerup", shield, true);
}

async function saveCurrentAsTemplate(session: SaveMatchSession): Promise<void> {
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

  session.closeMenu();
  showSavedToast(`Saved template “${trimmed}”`);
}

function showSavedToast(message: string): void {
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
