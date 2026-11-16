import { describe, expect, it } from "vitest";
import type { TemplateStore } from "../types";
import { enqueueStoreTask } from "./store-lock";
import { applyStoreMutation } from "./store-mutation";

describe("enqueueStoreTask", () => {
  it("keeps both upserts when two read-modify-writes overlap", async () => {
    let store: TemplateStore = { schemaVersion: 1, templates: [] };

    const write = (id: string) =>
      enqueueStoreTask(async () => {
        const snapshot = store;
        await new Promise((resolve) => setTimeout(resolve, 20));
        store = applyStoreMutation(snapshot, {
          op: "upsert",
          template: { id, name: id, updatedAt: 1 },
        });
      });

    await Promise.all([write("a"), write("b")]);

    expect(store.templates.map((template) => template.id).sort()).toEqual(["a", "b"]);
  });
});
