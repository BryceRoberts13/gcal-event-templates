import { beforeEach, describe, expect, it, vi } from "vitest";
import { openTemplateManager } from "./open-options";

describe("openTemplateManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("asks the service worker to open the options page", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        openOptionsPage: vi.fn(),
      },
    });

    await openTemplateManager();

    expect(sendMessage).toHaveBeenCalledWith({ type: "gcet/open-options" });
    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it("falls back to openOptionsPage when messaging fails", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("no worker"));
    const openOptionsPage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        openOptionsPage,
      },
    });

    await openTemplateManager();

    expect(openOptionsPage).toHaveBeenCalled();
  });
});
