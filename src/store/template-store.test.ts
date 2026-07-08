import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateStore } from "../types";
import {
  exportStoreJson,
  importStoreJson,
  loadTemplateStore,
} from "./template-store";

const STORAGE_KEY = "templateStore";
const storage: Record<string, unknown> = {};

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  vi.stubGlobal("chrome", {
    storage: {
      sync: {
        get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) =>
          Object.assign(storage, obj),
        ),
      },
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
