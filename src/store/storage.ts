import type { TemplateStore } from "../types";

export const STORAGE_KEY = "templateStore";

type StorageAreaName = "sync" | "local";

function getChromeStorageArea(
  preferred: StorageAreaName = "sync",
): chrome.storage.StorageArea | null {
  const storage = globalThis.chrome?.storage;
  if (!storage) {
    return null;
  }
  return storage[preferred] ?? storage.local ?? null;
}

/** Direct storage — extension pages / service worker only. */
export async function storageGet(
  key: string,
): Promise<Record<string, unknown>> {
  const area = getChromeStorageArea("sync") ?? getChromeStorageArea("local");
  if (!area) {
    throw new Error("chrome.storage unavailable in this context");
  }
  return (await area.get(key)) as Record<string, unknown>;
}

export async function storageSet(values: Record<string, unknown>): Promise<void> {
  const area = getChromeStorageArea("sync") ?? getChromeStorageArea("local");
  if (!area) {
    throw new Error("chrome.storage unavailable in this context");
  }
  await area.set(values);
}

function isCalendarContentPage(): boolean {
  try {
    return (
      typeof location !== "undefined" &&
      location.hostname === "calendar.google.com"
    );
  } catch {
    return false;
  }
}

export async function loadStoreViaMessaging(): Promise<TemplateStore | null> {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return null;
  }
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "gcet/get-store",
    })) as { ok: boolean; store?: TemplateStore; error?: string } | undefined;
    if (response?.ok && response.store) {
      return response.store;
    }
    if (response?.error) {
      console.warn("[gcal-event-templates] get-store failed:", response.error);
    }
  } catch (error) {
    console.warn("[gcal-event-templates] messaging get-store failed:", error);
  }
  return null;
}

export async function saveStoreViaMessaging(store: TemplateStore): Promise<boolean> {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return false;
  }
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "gcet/set-store",
      store,
    })) as { ok: boolean; error?: string } | undefined;
    if (response?.ok) {
      return true;
    }
    if (response?.error) {
      console.warn("[gcal-event-templates] set-store failed:", response.error);
    }
  } catch (error) {
    console.warn("[gcal-event-templates] messaging set-store failed:", error);
  }
  return false;
}

/**
 * Calendar content scripts always talk to the service worker.
 * Options / other extension pages can use chrome.storage directly.
 */
export async function readPersistedStore(): Promise<TemplateStore | undefined> {
  if (isCalendarContentPage()) {
    const viaMessage = await loadStoreViaMessaging();
    if (viaMessage) {
      return viaMessage;
    }
    throw new Error(
      "Background worker did not return templates. In chrome://extensions, remove this extension and Load unpacked from dist/ (version 0.3.0).",
    );
  }

  try {
    const result = await storageGet(STORAGE_KEY);
    return result[STORAGE_KEY] as TemplateStore | undefined;
  } catch {
    return (await loadStoreViaMessaging()) ?? undefined;
  }
}

export async function writePersistedStore(store: TemplateStore): Promise<void> {
  if (isCalendarContentPage()) {
    const ok = await saveStoreViaMessaging(store);
    if (!ok) {
      throw new Error(
        "Unable to save templates via background worker. Reload the unpacked extension from dist/.",
      );
    }
    return;
  }

  try {
    await storageSet({ [STORAGE_KEY]: store });
  } catch {
    const ok = await saveStoreViaMessaging(store);
    if (!ok) {
      throw new Error("Unable to persist templates");
    }
  }
}
