import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateStore } from "../types";
import {
  deleteTemplate,
  exportStoreJson,
  importStoreJson,
  listTemplates,
  loadTemplateStore,
} from "./template-store";

const STORAGE_KEY = "templateStore";
const storage: Record<string, unknown> = {};

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  const area = {
    get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
    set: vi.fn(async (obj: Record<string, unknown>) =>
      Object.assign(storage, obj),
    ),
  };
  vi.stubGlobal("chrome", {
    storage: {
      sync: area,
      local: area,
    },
    runtime: {
      sendMessage: vi.fn(),
    },
  });
});

const validStore: TemplateStore = {
  schemaVersion: 1,
  templates: [
    {
      id: "custom-1",
      name: "Custom template",
      keywords: ["custom"],
      updatedAt: 1_700_000_000_000,
    },
  ],
};

describe("importStoreJson", () => {
  it("rejects wrong schemaVersion", async () => {
    const invalid = JSON.stringify({ schemaVersion: 2, templates: [] });
    await expect(importStoreJson(invalid)).rejects.toThrow(
      "Invalid template store JSON",
    );
  });

  it("rejects missing templates array", async () => {
    const invalid = JSON.stringify({ schemaVersion: 1 });
    await expect(importStoreJson(invalid)).rejects.toThrow(
      "Invalid template store JSON",
    );
  });
});

describe("exportStoreJson", () => {
  it("round-trips valid store data", async () => {
    storage[STORAGE_KEY] = validStore;

    const exported = await exportStoreJson();
    storage[STORAGE_KEY] = { schemaVersion: 1, templates: [] };

    await importStoreJson(exported);

    const loaded = await loadTemplateStore();
    expect(loaded).toEqual(validStore);
  });
});

describe("deleteTemplate", () => {
  it("removes a template and keeps the rest", async () => {
    storage[STORAGE_KEY] = {
      schemaVersion: 1,
      templates: [
        { id: "a", name: "A", updatedAt: 1 },
        { id: "b", name: "B", updatedAt: 2 },
      ],
    };

    await deleteTemplate("a");

    const remaining = await listTemplates();
    expect(remaining.map((t) => t.id)).toEqual(["b"]);
  });

  it("keeps an empty store after deleting the last template", async () => {
    storage[STORAGE_KEY] = {
      schemaVersion: 1,
      templates: [{ id: "only", name: "Only", updatedAt: 1 }],
    };

    await deleteTemplate("only");

    const remaining = await listTemplates();
    expect(remaining).toEqual([]);
  });
});

describe("loadTemplateStore", () => {
  it("does not reseed when the stored templates array is empty", async () => {
    storage[STORAGE_KEY] = { schemaVersion: 1, templates: [] };

    const loaded = await loadTemplateStore();
    expect(loaded).toEqual({ schemaVersion: 1, templates: [] });
  });
});
