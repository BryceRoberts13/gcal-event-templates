import { DEFAULT_TEMPLATES, type HiddenEventStore, type TemplateStore } from "../types";
import { readHiddenStore, writeHiddenStore } from "../store/hidden-store";
import { STORAGE_KEY } from "../store/storage";

type Message =
  | { type: "gcet/get-store" }
  | { type: "gcet/set-store"; store: TemplateStore }
  | { type: "gcet/open-options" }
  | { type: "gcet/get-hidden" }
  | { type: "gcet/set-hidden"; store: HiddenEventStore };

function storageArea(): chrome.storage.StorageArea {
  const area = chrome.storage?.sync ?? chrome.storage?.local;
  if (!area) {
    throw new Error("chrome.storage is missing in service worker");
  }
  return area;
}

async function getStore(): Promise<TemplateStore> {
  const result = await storageArea().get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as TemplateStore | undefined;

  if (!stored || stored.schemaVersion !== 1 || !Array.isArray(stored.templates) || stored.templates.length === 0) {
    const seeded: TemplateStore = {
      schemaVersion: 1,
      templates: DEFAULT_TEMPLATES.map((template) => ({
        ...template,
        updatedAt: Date.now(),
      })),
    };
    await storageArea().set({ [STORAGE_KEY]: seeded });
    return seeded;
  }

  return stored;
}

async function setStore(store: TemplateStore): Promise<void> {
  await storageArea().set({ [STORAGE_KEY]: store });
  // Notify open Calendar tabs so comboboxes remount with fresh data.
  const tabs = await chrome.tabs.query({ url: "https://calendar.google.com/*" });
  for (const tab of tabs) {
    if (tab.id == null) {
      continue;
    }
    void chrome.tabs.sendMessage(tab.id, { type: "gcet/store-changed" }).catch(() => undefined);
  }
}

function localStorageArea(): chrome.storage.StorageArea {
  const area = chrome.storage?.local;
  if (!area) {
    throw new Error("chrome.storage.local is missing in service worker");
  }
  return area;
}

async function broadcastHidden(store: HiddenEventStore): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://calendar.google.com/*" });
  for (const tab of tabs) {
    if (tab.id == null) {
      continue;
    }
    void chrome.tabs
      .sendMessage(tab.id, { type: "gcet/hidden-changed", store })
      .catch(() => undefined);
  }
}

async function refreshCalendarTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://calendar.google.com/*" });
  await Promise.all(
    tabs
      .filter((tab) => tab.id != null)
      .map((tab) => chrome.tabs.reload(tab.id!)),
  );
}

chrome.runtime.onInstalled.addListener((details) => {
  void getStore().then(() => {
    console.info("[gcal-event-templates] defaults ensured on install");
  });

  // Stale content scripts cannot message the worker after an extension reload.
  if (details.reason === "update") {
    void refreshCalendarTabs();
  }
});

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.type === "gcet/get-store") {
    void getStore()
      .then((store) => sendResponse({ ok: true, store }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (message?.type === "gcet/set-store") {
    void setStore(message.store)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (message?.type === "gcet/get-hidden") {
    void readHiddenStore(localStorageArea())
      .then((store) => sendResponse({ ok: true, store }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (message?.type === "gcet/set-hidden") {
    void writeHiddenStore(localStorageArea(), message.store)
      .then((store) => broadcastHidden(store).then(() => sendResponse({ ok: true, store })))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (message?.type === "gcet/open-options") {
    void chrome.runtime
      .openOptionsPage()
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  return false;
});

console.info("[gcal-event-templates] service worker ready (v0.3.2)");
