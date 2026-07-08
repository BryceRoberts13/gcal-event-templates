import {
  extractTemplateFromSurface,
  findSaveControls,
  findTitleInputIn,
} from "../gcal/dom-adapter";
import { upsertTemplate } from "../store/template-store";

const MENU_ID = "gcet-save-menu";
const BTN_ID = "gcet-save-as-template-btn";

function closeMenu(): void {
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

  await upsertTemplate({
    id: crypto.randomUUID(),
    ...draft,
    name: trimmed,
    updatedAt: Date.now(),
  });

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
  item.addEventListener("click", () => {
    void saveCurrentAsTemplate();
  });
  menu.appendChild(item);

  const rect = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.max(8, rect.right - 200)}px`;
  menu.style.zIndex = "2147483647";
  document.body.appendChild(menu);

  const onDocClick = (event: MouseEvent) => {
    if (!(event.target instanceof Node) || menu.contains(event.target) || anchor.contains(event.target)) {
      return;
    }
    closeMenu();
    document.removeEventListener("mousedown", onDocClick, true);
  };
  document.addEventListener("mousedown", onDocClick, true);
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
