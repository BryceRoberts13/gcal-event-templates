import {
  DEFAULT_TEMPLATES,
  EMPTY_STORE,
  type EventTemplate,
  type TemplateStore,
} from "../types";
import {
  STORAGE_KEY,
  loadStoreViaMessaging,
  saveStoreViaMessaging,
  storageGet,
  storageSet,
} from "./storage";

async function readStore(): Promise<TemplateStore | undefined> {
  try {
    const result = await storageGet(STORAGE_KEY);
    return result[STORAGE_KEY] as TemplateStore | undefined;
  } catch {
    return (await loadStoreViaMessaging()) ?? undefined;
  }
}

async function writeStore(store: TemplateStore): Promise<void> {
  try {
    await storageSet({ [STORAGE_KEY]: store });
  } catch {
    const ok = await saveStoreViaMessaging(store);
    if (!ok) {
      throw new Error("Unable to persist templates (chrome.storage unavailable)");
    }
  }
}

export async function loadTemplateStore(): Promise<TemplateStore> {
  const stored = await readStore();

  if (!stored || stored.schemaVersion !== 1) {
    return seedDefaultStore();
  }

  if (!Array.isArray(stored.templates) || stored.templates.length === 0) {
    return seedDefaultStore();
  }

  return stored;
}

export async function saveTemplateStore(store: TemplateStore): Promise<void> {
  await writeStore(store);
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

export async function resetToDefaultTemplates(): Promise<TemplateStore> {
  return seedDefaultStore();
}
