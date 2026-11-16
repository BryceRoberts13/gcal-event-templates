import type { EventTemplate, TemplateStore } from "../types";
import { assertTemplateStore, normalizeTemplate } from "./validate-store";

export type StoreMutation =
  | { op: "upsert"; template: EventTemplate }
  | { op: "delete"; id: string }
  | { op: "replace"; store: TemplateStore };

/** Pure read-modify-write step. Callers serialize this so two tabs cannot clobber each other. */
export function applyStoreMutation(store: TemplateStore, mutation: StoreMutation): TemplateStore {
  if (mutation.op === "replace") {
    return assertTemplateStore(mutation.store);
  }

  if (mutation.op === "delete") {
    if (typeof mutation.id !== "string" || mutation.id.length === 0) {
      throw new Error("Invalid template id");
    }
    return {
      schemaVersion: 1,
      templates: store.templates.filter((template) => template.id !== mutation.id),
    };
  }

  const template = {
    ...normalizeTemplate(mutation.template),
    updatedAt: Date.now(),
  };
  const templates = store.templates.slice();
  const index = templates.findIndex((item) => item.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.push(template);
  }
  return { schemaVersion: 1, templates };
}
