import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionContextInvalidatedError } from "./extension-context";
import { loadStoreViaMessaging } from "./storage";
import type { TemplateStore } from "../types";

const store: TemplateStore = {
  schemaVersion: 1,
  templates: [{ id: "a", name: "Test", updatedAt: 1 }],
};

describe("loadStoreViaMessaging", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries before giving up when the worker does not respond", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      runtime: { id: "ext-id", sendMessage },
    });

    const result = await loadStoreViaMessaging();

    expect(result).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it("returns the store on a later retry", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ok: true, store });
    vi.stubGlobal("chrome", {
      runtime: { id: "ext-id", sendMessage },
    });

    const result = await loadStoreViaMessaging();

    expect(result).toEqual(store);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("throws immediately when the extension context is already invalid", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: {
        id: undefined,
        sendMessage,
      },
    });

    await expect(loadStoreViaMessaging()).rejects.toBeInstanceOf(
      ExtensionContextInvalidatedError,
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("throws when the extension context was invalidated", async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValue(new Error("Extension context invalidated."));
    vi.stubGlobal("chrome", {
      runtime: { id: "ext-id", sendMessage },
    });

    await expect(loadStoreViaMessaging()).rejects.toBeInstanceOf(
      ExtensionContextInvalidatedError,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
