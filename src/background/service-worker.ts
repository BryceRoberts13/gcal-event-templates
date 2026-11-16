import { DEFAULT_TEMPLATES, type HiddenEventStore, type TemplateStore } from "../types";
import { readHiddenStore, writeHiddenStore } from "../store/hidden-store";
import { STORAGE_KEY } from "../store/storage";
import { enqueueStoreTask } from "../store/store-lock";
import { applyStoreMutation, type StoreMutation } from "../store/store-mutation";
import { assertTemplateStore } from "../store/validate-store";

type Message =
  | { type: "gcet/get-store" }
  | { type: "gcet/set-store"; store: TemplateStore }
  | { type: "gcet/mutate"; mutation: StoreMutation }
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

function isStoreMutation(value: unknown): value is StoreMutation {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const op = (value as { op?: unknown }).op;
  return op === "upsert" || op === "delete" || op === "replace";
}

async function readStore(): Promise<TemplateStore> {
  const result = await storageArea().get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as TemplateStore | undefined;

  // Seed only when storage is missing/invalid. Empty templates[] is intentional.
  if (stored?.schemaVersion !== 1 || !Array.isArray(stored?.templates)) {
    const seeded: TemplateStore = {
      schemaVersion: 1,
      templates: DEFAULT_TEMPLATES.map((template) => ({
        ...template,
        updatedAt: Date.now(),
      })),
    };
    await persist(seeded);
    return seeded;
  }

  return stored;
}

async function notifyCalendarTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://calendar.google.com/*" });
  for (const tab of tabs) {
    if (tab.id == null) {
      continue;
    }
    void chrome.tabs.sendMessage(tab.id, { type: "gcet/store-changed" }).catch(() => undefined);
  }
}

async function persist(store: TemplateStore): Promise<void> {
  const valid = assertTemplateStore(store);
  await storageArea().set({ [STORAGE_KEY]: valid });
  await notifyCalendarTabs();
}

async function mutate(mutation: StoreMutation): Promise<void> {
  if (mutation.op === "replace") {
    await persist(mutation.store);
    return;
  }
  const current = await readStore();
  await persist(applyStoreMutation(current, mutation));
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
    tabs.flatMap((tab) => (tab.id == null ? [] : [chrome.tabs.reload(tab.id)])),
  );
}

chrome.runtime.onInstalled.addListener((details) => {
  void enqueueStoreTask(() => readStore()).then(() => {
    console.info("[gcal-event-templates] defaults ensured on install");
  });

  // Stale content scripts cannot message the worker after an extension reload.
  if (details.reason === "update") {
    void refreshCalendarTabs();
  }
});

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.type === "gcet/get-store") {
    void enqueueStoreTask(() => readStore())
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
    void enqueueStoreTask(() => persist(message.store))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (message?.type === "gcet/mutate") {
    if (!isStoreMutation(message.mutation)) {
      sendResponse({ ok: false, error: "Invalid template mutation" });
      return false;
    }
    void enqueueStoreTask(() => mutate(message.mutation))
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
    void enqueueStoreTask(() => readHiddenStore(localStorageArea()))
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
    void enqueueStoreTask(async () => {
      const store = await writeHiddenStore(localStorageArea(), message.store);
      await broadcastHidden(store);
    })
      .then(() => sendResponse({ ok: true }))
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

const workerVersion = chrome.runtime.getManifest?.().version ?? "0.4.0";
console.info(`[gcal-event-templates] service worker ready (v${workerVersion})`);
