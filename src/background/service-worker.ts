import type { TemplateStore } from "../types";
import { STORAGE_KEY } from "../store/storage";

type Message =
  | { type: "gcet/get-store" }
  | { type: "gcet/set-store"; store: TemplateStore };

async function getStore(): Promise<TemplateStore | undefined> {
  const area = chrome.storage.sync ?? chrome.storage.local;
  const result = await area.get(STORAGE_KEY);
  return result[STORAGE_KEY] as TemplateStore | undefined;
}

async function setStore(store: TemplateStore): Promise<void> {
  const area = chrome.storage.sync ?? chrome.storage.local;
  await area.set({ [STORAGE_KEY]: store });
}

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

  return false;
});

console.info("[gcal-event-templates] service worker ready");
