import {
  HIDE_EVENT_ACTION,
  HIDE_EVENT_ROW_ID,
  SHOW_HIDDEN_ID,
  dismissEventPopover,
  findCardForHideTarget,
  findShowHiddenMountPoint,
  hiddenMenuRecord,
  nextStoreAfterHideAction,
  rememberChipTarget,
  syncHiddenCalendarUi,
} from "../gcal/hidden-events";
import type { HiddenEventStore } from "../types";
import { isExtensionContextInvalidated } from "../store/extension-context";
import {
  EMPTY_HIDDEN_STORE,
  loadHiddenStoreFromBackground,
  normalizeHiddenStore,
  saveHiddenStoreToBackground,
} from "../store/hidden-store";
import { showExtensionRefreshBanner } from "./refresh-banner";

export interface HiddenEventsOptions {
  document?: Document;
  load?: () => Promise<HiddenEventStore>;
  save?: (store: HiddenEventStore) => Promise<void>;
  now?: () => number;
}

function hiddenCountLabel(count: number): string {
  if (count === 1) {
    return "Show hidden, 1 event hidden";
  }
  if (count > 1) {
    return `Show hidden, ${count} events hidden`;
  }
  return "Show hidden";
}

function renderShowHiddenButton(button: HTMLButtonElement, store: HiddenEventStore): void {
  button.setAttribute("aria-pressed", store.showHidden ? "true" : "false");
  button.setAttribute("aria-label", hiddenCountLabel(store.events.length));
  const count = button.querySelector(".gcet-show-hidden-count");
  if (count) {
    if (store.events.length > 0) {
      count.textContent = String(store.events.length);
      count.removeAttribute("hidden");
    } else {
      count.textContent = "";
      count.setAttribute("hidden", "");
    }
  }
}

function createShowHiddenButton(
  doc: Document,
  store: HiddenEventStore,
  onToggle: () => void,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.id = SHOW_HIDDEN_ID;
  button.className = "gcet-show-hidden";

  const box = doc.createElement("span");
  box.className = "gcet-show-hidden-box";
  box.setAttribute("aria-hidden", "true");
  box.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

  const label = doc.createElement("span");
  label.className = "gcet-show-hidden-label";
  label.textContent = "Show hidden";

  const count = doc.createElement("span");
  count.className = "gcet-show-hidden-count";

  button.append(box, label, count);
  renderShowHiddenButton(button, store);

  const shield = (event: Event) => {
    event.stopPropagation();
  };
  button.addEventListener("pointerdown", shield, true);
  button.addEventListener("mousedown", shield, true);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  });
  return button;
}

function mountShowHiddenButton(
  doc: Document,
  store: HiddenEventStore,
  onToggle: () => void,
): void {
  const mount = findShowHiddenMountPoint(doc);
  const existing = doc.getElementById(SHOW_HIDDEN_ID);
  if (!mount) {
    return;
  }
  if (existing instanceof HTMLButtonElement) {
    if (existing.parentElement !== mount.parent || mount.before !== existing) {
      mount.parent.insertBefore(existing, mount.before);
    }
    renderShowHiddenButton(existing, store);
    return;
  }
  const button = createShowHiddenButton(doc, store, onToggle);
  mount.parent.insertBefore(button, mount.before);
}

export function startHiddenEvents(options: HiddenEventsOptions = {}): () => void {
  const doc = options.document ?? document;
  const load = options.load ?? loadHiddenStoreFromBackground;
  const save = options.save ?? saveHiddenStoreToBackground;
  const now = options.now ?? Date.now;

  let state: HiddenEventStore = { ...EMPTY_HIDDEN_STORE, events: [] };
  let lastChip: HTMLElement | null = null;
  let dirty = false;
  let pendingSave: HiddenEventStore | null = null;

  const sync = () => {
    syncHiddenCalendarUi(doc, state, lastChip);
    mountShowHiddenButton(doc, state, () => {
      dirty = true;
      state = { ...state, showHidden: !state.showHidden };
      sync();
      void persist();
    });
  };

  const persist = async () => {
    const snapshot = state;
    pendingSave = snapshot;
    try {
      await save(snapshot);
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        showExtensionRefreshBanner();
        return;
      }
      console.warn("[gcal-event-templates] could not save hidden events", error);
    } finally {
      if (pendingSave === snapshot) {
        pendingSave = null;
      }
    }
  };

  const remember = (event: Event) => {
    const chip = rememberChipTarget(event.target);
    if (chip) {
      lastChip = chip;
    }
  };

  const onHidePointer = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (!target.closest(`[data-gcet-action="${HIDE_EVENT_ACTION}"]`)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    const card = findCardForHideTarget(target, doc);
    const record = hiddenMenuRecord(doc, lastChip, target);
    if (!record) {
      window.alert("Couldn't identify this event to hide.");
      return;
    }
    const stamped = { ...record, hiddenAt: now() };
    dirty = true;
    state = nextStoreAfterHideAction(state, stamped);
    sync();
    dismissEventPopover(doc, card);
    void persist();
  };

  const onMessage = (message: { type?: string; store?: unknown }) => {
    if (message?.type !== "gcet/hidden-changed" || pendingSave) {
      return;
    }
    state = normalizeHiddenStore(message.store);
    sync();
  };

  doc.addEventListener("pointerdown", remember, true);
  doc.addEventListener("mousedown", remember, true);
  doc.addEventListener("keydown", remember, true);
  // Capture on window so we run before Google Calendar's document click handlers.
  // pointerdown and mousedown both fire for one click; ignore the second.
  let actedAt = Number.NEGATIVE_INFINITY;
  const onHideGesture = (event: Event) => {
    const nowMs = Date.now();
    if (nowMs - actedAt < 400) {
      const target = event.target;
      if (target instanceof Element && target.closest(`[data-gcet-action="${HIDE_EVENT_ACTION}"]`)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    actedAt = nowMs;
    onHidePointer(event);
    if (!(event.target instanceof Element) || !event.target.closest(`[data-gcet-action="${HIDE_EVENT_ACTION}"]`)) {
      actedAt = 0;
    }
  };
  window.addEventListener("pointerdown", onHideGesture, true);
  window.addEventListener("mousedown", onHideGesture, true);

  const runtime = globalThis.chrome?.runtime;
  if (runtime?.onMessage) {
    runtime.onMessage.addListener(onMessage);
  }

  sync();
  void load()
    .then((store) => {
      if (dirty) {
        return;
      }
      state = normalizeHiddenStore(store);
      sync();
    })
    .catch((error: unknown) => {
      if (isExtensionContextInvalidated(error)) {
        showExtensionRefreshBanner();
      }
    });

  let scheduled = 0;
  const schedule = () => {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(sync, 50);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  doc.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  const intervalId = window.setInterval(sync, 1000);

  return () => {
    observer.disconnect();
    window.clearTimeout(scheduled);
    window.clearInterval(intervalId);
    doc.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    doc.getElementById(HIDE_EVENT_ROW_ID)?.remove();
    doc.removeEventListener("pointerdown", remember, true);
    doc.removeEventListener("mousedown", remember, true);
    doc.removeEventListener("keydown", remember, true);
    window.removeEventListener("pointerdown", onHideGesture, true);
    window.removeEventListener("mousedown", onHideGesture, true);
    runtime?.onMessage?.removeListener(onMessage);
    doc.getElementById(SHOW_HIDDEN_ID)?.remove();
  };
}
