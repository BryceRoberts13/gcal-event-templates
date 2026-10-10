import type { HiddenEventRecord, HiddenEventStore } from "../types";
import {
  ExtensionContextInvalidatedError,
  isExtensionContextInvalidated,
  isExtensionContextValid,
} from "./extension-context";

export const HIDDEN_EVENTS_KEY = "hiddenEvents";

export const EMPTY_HIDDEN_STORE: HiddenEventStore = {
  schemaVersion: 1,
  showHidden: false,
  events: [],
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeRecord(value: unknown): HiddenEventRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<HiddenEventRecord>;
  const eventId =
    typeof raw.eventId === "string" && raw.eventId.trim() ? raw.eventId.trim() : null;
  const title = typeof raw.title === "string" ? normalizeText(raw.title) : "";
  if (!eventId && !title) {
    return null;
  }
  return {
    eventId,
    title,
    when: typeof raw.when === "string" ? normalizeText(raw.when) : "",
    calendar: typeof raw.calendar === "string" ? normalizeText(raw.calendar) : "",
    ariaLabel: typeof raw.ariaLabel === "string" ? normalizeText(raw.ariaLabel) : "",
    hiddenAt: typeof raw.hiddenAt === "number" ? raw.hiddenAt : 0,
  };
}

export function normalizeHiddenStore(value: unknown): HiddenEventStore {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_HIDDEN_STORE, events: [] };
  }
  const raw = value as Partial<HiddenEventStore>;
  const events = Array.isArray(raw.events)
    ? raw.events.flatMap((entry) => {
        const record = normalizeRecord(entry);
        return record ? [record] : [];
      })
    : [];
  return {
    schemaVersion: 1,
    showHidden: raw.showHidden === true,
    events,
  };
}

export async function readHiddenStore(
  area: chrome.storage.StorageArea,
): Promise<HiddenEventStore> {
  const result = await area.get(HIDDEN_EVENTS_KEY);
  return normalizeHiddenStore(result[HIDDEN_EVENTS_KEY]);
}

export async function writeHiddenStore(
  area: chrome.storage.StorageArea,
  store: HiddenEventStore,
): Promise<HiddenEventStore> {
  const normalized = normalizeHiddenStore(store);
  await area.set({ [HIDDEN_EVENTS_KEY]: normalized });
  return normalized;
}

export async function loadHiddenStoreFromBackground(): Promise<HiddenEventStore> {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return { ...EMPTY_HIDDEN_STORE, events: [] };
  }
  if (!isExtensionContextValid()) {
    throw new ExtensionContextInvalidatedError();
  }
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "gcet/get-hidden",
    })) as { ok?: boolean; store?: unknown; error?: string } | undefined;
    if (response?.ok) {
      return normalizeHiddenStore(response.store);
    }
    if (response?.error) {
      console.warn("[gcal-event-templates] get-hidden failed:", response.error);
    }
  } catch (error) {
    if (isExtensionContextInvalidated(error) || !isExtensionContextValid()) {
      throw new ExtensionContextInvalidatedError();
    }
    console.warn("[gcal-event-templates] messaging get-hidden failed:", error);
  }
  return { ...EMPTY_HIDDEN_STORE, events: [] };
}

export async function saveHiddenStoreToBackground(store: HiddenEventStore): Promise<void> {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return;
  }
  if (!isExtensionContextValid()) {
    throw new ExtensionContextInvalidatedError();
  }
  const normalized = normalizeHiddenStore(store);
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "gcet/set-hidden",
      store: normalized,
    })) as { ok?: boolean; error?: string } | undefined;
    if (response?.ok) {
      return;
    }
    throw new Error(response?.error ?? "Unable to save hidden events");
  } catch (error) {
    if (isExtensionContextInvalidated(error) || !isExtensionContextValid()) {
      throw new ExtensionContextInvalidatedError();
    }
    throw error;
  }
}
