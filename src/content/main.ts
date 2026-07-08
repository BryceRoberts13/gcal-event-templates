import { applyTemplate } from "../gcal/dom-adapter";
import { watchForEventTitleInputs } from "../gcal/popover-detector";
import { listTemplates } from "../store/template-store";
import { mountTemplateCombobox } from "./combobox";
import { watchForSaveTemplateControl } from "./save-as-template";

const cleanups = new Map<HTMLInputElement, () => void>();
let trackedInputs: HTMLInputElement[] = [];

async function attachCombobox(titleInput: HTMLInputElement): Promise<void> {
  if (cleanups.has(titleInput)) {
    return;
  }

  let templates;
  try {
    templates = await listTemplates();
  } catch (error) {
    console.error("[gcal-event-templates] failed to load templates", error);
    return;
  }

  console.info(
    "[gcal-event-templates] mounting combobox with",
    templates.length,
    "templates",
  );
  const cleanup = mountTemplateCombobox(titleInput, templates, (template) => {
    applyTemplate(titleInput, template);
  });
  cleanups.set(titleInput, cleanup);
  if (!trackedInputs.includes(titleInput)) {
    trackedInputs.push(titleInput);
  }
}

function remountAll(): void {
  for (const cleanup of cleanups.values()) {
    cleanup();
  }
  cleanups.clear();
  const inputs = [...trackedInputs];
  trackedInputs = [];
  for (const input of inputs) {
    if (input.isConnected) {
      void attachCombobox(input);
    }
  }
}

watchForEventTitleInputs((titleInput) => {
  void attachCombobox(titleInput);
});

watchForSaveTemplateControl();

const storage = globalThis.chrome?.storage;
if (storage?.onChanged) {
  storage.onChanged.addListener((changes, area) => {
    if ((area !== "sync" && area !== "local") || !changes.templateStore) {
      return;
    }
    remountAll();
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "gcet/store-changed") {
    remountAll();
  }
});

console.info("[gcal-event-templates] content script ready");
