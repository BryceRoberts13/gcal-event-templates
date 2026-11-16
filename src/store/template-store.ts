import {
  DEFAULT_TEMPLATES,
  EMPTY_STORE,
  type EventTemplate,
  type TemplateStore,
} from "../types";
import { applyStoreMutation, type StoreMutation } from "./store-mutation";
import { mutateStoreViaMessaging, readPersistedStore, writePersistedStore } from "./storage";
import { isExtensionContextInvalidated } from "./extension-context";
import { parseTemplateStoreJson } from "./validate-store";

export async function loadTemplateStore(): Promise<TemplateStore> {
  const stored = await readPersistedStore();

  // Seed only when storage is missing/invalid. An empty templates array is a
  // valid user choice (e.g. after deleting the last template).
  if (stored?.schemaVersion !== 1 || !Array.isArray(stored?.templates)) {
    return seedDefaultStore();
  }

  return stored;
}

export async function saveTemplateStore(store: TemplateStore): Promise<void> {
  await writePersistedStore(store);
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

async function commitMutation(mutation: StoreMutation): Promise<void> {
  try {
    if (await mutateStoreViaMessaging(mutation)) {
      return;
    }
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      throw error;
    }
  }

  const store = await loadTemplateStore();
  await saveTemplateStore(applyStoreMutation(store, mutation));
}

export async function upsertTemplate(template: EventTemplate): Promise<void> {
  await commitMutation({ op: "upsert", template });
}

export async function deleteTemplate(id: string): Promise<void> {
  await commitMutation({ op: "delete", id });
}

export function createEmptyStore(): TemplateStore {
  return structuredClone(EMPTY_STORE);
}

export async function exportStoreJson(): Promise<string> {
  const store = await loadTemplateStore();
  return JSON.stringify(store, null, 2);
}

export async function importStoreJson(raw: string): Promise<void> {
  const parsed = parseTemplateStoreJson(raw);
  await commitMutation({ op: "replace", store: parsed });
}

export async function resetToDefaultTemplates(): Promise<TemplateStore> {
  return seedDefaultStore();
}
