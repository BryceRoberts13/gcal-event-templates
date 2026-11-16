import { findSaveControls, findTitleInputIn } from "../gcal/dom-adapter";
import { DIALOG_SCAN_INTERVAL_MS, setValidatedInterval } from "../poll";
import { toggleSaveMenu } from "./save-menu";
import { SaveMatchSession } from "./save-match-session";
import { mountShadowHost } from "./shadow-host";

const BTN_ID = "gcet-save-as-template-btn";

let session = new SaveMatchSession();

export function reevaluateSaveMatch(): Promise<void> {
  return session.reevaluate();
}

function mountSplitControl(saveButton: HTMLElement): void {
  if (document.getElementById(BTN_ID)) {
    return;
  }

  const parent = saveButton.parentElement;
  if (!parent) {
    return;
  }

  const { host, root } = mountShadowHost();
  host.className = "gcet-save-split";
  host.id = BTN_ID;
  host.dataset.gcetPlacement = "save";

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
    void toggleSaveMenu(session, caret);
  });

  root.appendChild(caret);
  parent.insertBefore(host, saveButton.nextSibling);
}

function tryAttach(): void {
  const title = findTitleInputIn(document);
  if (!title) {
    session.clearMatch();
    return;
  }
  const existing = document.getElementById(BTN_ID);
  const { saveButton, moreActions } = findSaveControls(document);
  if (saveButton) {
    const saveButtonChanged = session.boundSaveButton !== saveButton;
    if (session.matchedTemplate) {
      session.bindSaveIntercept(saveButton);
    }
    if (existing?.dataset.gcetPlacement === "save") {
      if (saveButtonChanged && session.matchedTemplate) {
        void session.reevaluate();
      }
      return;
    }
    existing?.remove();
    mountSplitControl(saveButton);
    void session.reevaluate();
    return;
  }
  if (existing) {
    return;
  }
  // Fall back: attach near More actions if Save isn't found yet.
  if (moreActions?.parentElement) {
    const caretHost = moreActions.parentElement;
    const { host, root } = mountShadowHost();
    host.className = "gcet-save-split";
    host.id = BTN_ID;
    host.dataset.gcetPlacement = "fallback";
    host.style.minWidth = "96px";
    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = "gcet-save-caret";
    caret.setAttribute("aria-label", "Save as template");
    caret.textContent = "▾ Template";
    caret.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void toggleSaveMenu(session, caret);
    });
    root.appendChild(caret);
    caretHost.insertBefore(host, moreActions);
  }
}

export function watchForSaveTemplateControl(): () => void {
  tryAttach();
  const observer = new MutationObserver(() => tryAttach());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const intervalId = setValidatedInterval(tryAttach, DIALOG_SCAN_INTERVAL_MS);
  return () => {
    observer.disconnect();
    window.clearInterval(intervalId);
    document.getElementById(BTN_ID)?.remove();
    session.stop();
    session = new SaveMatchSession();
  };
}
