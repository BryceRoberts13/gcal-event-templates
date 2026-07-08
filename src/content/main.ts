import { applyTemplate } from "../gcal/dom-adapter";
import { watchForEventTitleInputs } from "../gcal/popover-detector";
import { listTemplates } from "../store/template-store";
import { mountTemplateCombobox } from "./combobox";

const cleanups = new Map<HTMLInputElement, () => void>();

async function attachCombobox(titleInput: HTMLInputElement): Promise<void> {
  if (cleanups.has(titleInput)) {
    return;
  }

  const templates = await listTemplates();
  const cleanup = mountTemplateCombobox(titleInput, templates, (template) => {
    applyTemplate(titleInput, template);
  });
  cleanups.set(titleInput, cleanup);
}

watchForEventTitleInputs((titleInput) => {
  void attachCombobox(titleInput);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.templateStore) {
    return;
  }
  for (const cleanup of cleanups.values()) {
    cleanup();
  }
  cleanups.clear();
});
