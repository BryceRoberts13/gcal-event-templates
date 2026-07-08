import {
  DEFAULT_TEMPLATES,
  EMPTY_STORE,
  type EventTemplate,
  type TemplateStore,
} from "../types";

const STORAGE_KEY = "templateStore";

export async function loadTemplateStore(): Promise<TemplateStore> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as TemplateStore | undefined;

  if (!stored || stored.schemaVersion !== 1) {
    return seedDefaultStore();
  }

  return stored;
}

export async function saveTemplateStore(store: TemplateStore): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: store });
}

async function seedDefaultStore(): Promise<TemplateStore> {
  const store: TemplateStore = {
    schemaVersion: 1,
    templates: DEFAULT_TEMPLATES.map((template) => ({
      ...template,
      updatedAt: Date.now(),
    })),
  };
  await saveTemplateStore(store);
  return store;
}

export async function listTemplates(): Promise<EventTemplate[]> {
  const store = await loadTemplateStore();
  return store.templates;
}

export async function upsertTemplate(template: EventTemplate): Promise<void> {
  const store = await loadTemplateStore();
  const index = store.templates.findIndex((t) => t.id === template.id);
  const next = { ...template, updatedAt: Date.now() };

  if (index >= 0) {
    store.templates[index] = next;
  } else {
    store.templates.push(next);
  }

  await saveTemplateStore(store);
}

export async function deleteTemplate(id: string): Promise<void> {
  const store = await loadTemplateStore();
  store.templates = store.templates.filter((t) => t.id !== id);
  await saveTemplateStore(store);
}

export function createEmptyStore(): TemplateStore {
  return structuredClone(EMPTY_STORE);
}

export async function exportStoreJson(): Promise<string> {
  const store = await loadTemplateStore();
  return JSON.stringify(store, null, 2);
}

export async function importStoreJson(raw: string): Promise<void> {
  const parsed = JSON.parse(raw) as TemplateStore;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.templates)) {
    throw new Error("Invalid template store JSON");
  }
  await saveTemplateStore(parsed);
}
