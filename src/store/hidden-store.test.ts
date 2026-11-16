import { describe, expect, it, vi } from "vitest";
import type { HiddenEventStore } from "../types";
import {
  EMPTY_HIDDEN_STORE,
  loadHiddenStoreFromBackground,
  normalizeHiddenStore,
  readHiddenStore,
  saveHiddenStoreToBackground,
  writeHiddenStore,
} from "./hidden-store";

function memoryArea(initial: Record<string, unknown> = {}): chrome.storage.StorageArea {
  const data = { ...initial };
  return {
    get: async (key: string) => ({ [key]: data[key] }),
    set: async (values: Record<string, unknown>) => {
      Object.assign(data, values);
    },
  } as chrome.storage.StorageArea;
}

describe("hidden event store", () => {
  it("drops malformed records and defaults showHidden off", () => {
    expect(normalizeHiddenStore(null)).toEqual(EMPTY_HIDDEN_STORE);
    expect(
      normalizeHiddenStore({
        showHidden: true,
        events: [
          { eventId: "evt_1", title: "Composite Photos", when: "October 14", hiddenAt: 4 },
          { title: "   " },
          "nope",
        ],
      }),
    ).toEqual({
      schemaVersion: 1,
      showHidden: true,
      events: [
        {
          eventId: "evt_1",
          title: "composite photos",
          when: "october 14",
          calendar: "",
          ariaLabel: "",
          hiddenAt: 4,
        },
      ],
    });
  });

  it("round-trips through a storage area", async () => {
    const area = memoryArea();
    const store: HiddenEventStore = {
      schemaVersion: 1,
      showHidden: false,
      events: [
        {
          eventId: "evt_composite",
          title: "composite photos",
          when: "wednesday, october 14",
          calendar: "delta tau delta 2026",
          ariaLabel: "",
          hiddenAt: 9,
        },
      ],
    };

    await writeHiddenStore(area, store);
    await expect(readHiddenStore(area)).resolves.toEqual(store);
    await expect(readHiddenStore(memoryArea())).resolves.toEqual(EMPTY_HIDDEN_STORE);
  });

  it("loads and saves through the background worker", async () => {
    const stored: HiddenEventStore = {
      ...EMPTY_HIDDEN_STORE,
      events: [
        {
          eventId: "evt_1",
          title: "gym",
          when: "",
          calendar: "",
          ariaLabel: "",
          hiddenAt: 1,
        },
      ],
    };
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === "gcet/get-hidden") {
        return { ok: true, store: stored };
      }
      return { ok: true };
    });
    vi.stubGlobal("chrome", { runtime: { id: "ext", sendMessage } });

    await expect(loadHiddenStoreFromBackground()).resolves.toEqual(stored);
    await saveHiddenStoreToBackground(stored);
    expect(sendMessage).toHaveBeenCalledWith({ type: "gcet/set-hidden", store: stored });

    vi.unstubAllGlobals();
  });
});
