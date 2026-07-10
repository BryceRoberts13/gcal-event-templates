import { applyTemplate } from "../gcal/dom-adapter";
import { watchForEventTitleInputs } from "../gcal/popover-detector";
import {
  isExtensionContextInvalidated,
  isExtensionContextValid,
} from "../store/extension-context";
import { listTemplates } from "../store/template-store";
import { DEFAULT_TEMPLATES, type EventTemplate } from "../types";
import { mountTemplateCombobox } from "./combobox";
import { showExtensionRefreshBanner } from "./refresh-banner";
import { watchForSaveTemplateControl } from "./save-as-template";

const cleanups = new Map<HTMLInputElement, () => void>();
let trackedInputs: HTMLInputElement[] = [];
let cachedTemplates: EventTemplate[] | null = null;

function fallbackTemplates(): EventTemplate[] {
  return (cachedTemplates ?? DEFAULT_TEMPLATES).map((template) => ({
    ...template,
    updatedAt: template.updatedAt || Date.now(),
  }));
}

function mountComboboxOn(
  titleInput: HTMLInputElement,
  templates: EventTemplate[],
): void {
  const existing = cleanups.get(titleInput);
  if (existing) {
    existing();
    cleanups.delete(titleInput);
  }

  const cleanup = mountTemplateCombobox(titleInput, templates, (template) => {
    applyTemplate(titleInput, template);
  });
  cleanups.set(titleInput, cleanup);
  if (!trackedInputs.includes(titleInput)) {
    trackedInputs.push(titleInput);
  }
}

async function attachCombobox(titleInput: HTMLInputElement): Promise<void> {
  // Mount immediately so the dropdown is never blocked on background messaging.
  mountComboboxOn(titleInput, fallbackTemplates());

  if (!isExtensionContextValid()) {
    showExtensionRefreshBanner();
    return;
  }

  try {
    const templates = await listTemplates();
    cachedTemplates = templates;
    mountComboboxOn(titleInput, templates);
    console.info(
      "[gcal-event-templates] loaded",
      templates.length,
      "templates from storage",
    );
  } catch (error) {
    if (isExtensionContextInvalidated(error) || !isExtensionContextValid()) {
      showExtensionRefreshBanner();
      return;
    }
    console.warn(
      "[gcal-event-templates] keeping default templates after load failure",
      error,
    );
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

window.setInterval(() => {
  if (!isExtensionContextValid()) {
    showExtensionRefreshBanner();
  }
}, 3000);

const storage = globalThis.chrome?.storage;
if (storage?.onChanged) {
  storage.onChanged.addListener((changes, area) => {
    if ((area !== "sync" && area !== "local") || !changes.templateStore) {
      return;
    }
    remountAll();
  });
}

try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "gcet/store-changed") {
      remountAll();
    }
  });
} catch {
  showExtensionRefreshBanner();
}

console.info("[gcal-event-templates] content script ready");
