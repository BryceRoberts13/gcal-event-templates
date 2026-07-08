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

export async function storageGet(
  key: string,
): Promise<Record<string, unknown>> {
  const area = getChromeStorageArea("sync") ?? getChromeStorageArea("local");
  if (!area) {
    throw new Error(
      "chrome.storage is unavailable — reload the extension after npm run build",
    );
  }
  return (await area.get(key)) as Record<string, unknown>;
}

export async function storageSet(values: Record<string, unknown>): Promise<void> {
  const area = getChromeStorageArea("sync") ?? getChromeStorageArea("local");
  if (!area) {
    throw new Error(
      "chrome.storage is unavailable — reload the extension after npm run build",
    );
  }
  await area.set(values);
}

export async function loadStoreViaMessaging(): Promise<TemplateStore | null> {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return null;
  }
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "gcet/get-store",
    })) as { ok: boolean; store?: TemplateStore } | undefined;
    if (response?.ok && response.store) {
      return response.store;
    }
  } catch {
    // Extension context invalidated / no SW yet
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
    })) as { ok: boolean } | undefined;
    return response?.ok === true;
  } catch {
    return false;
  }
}
