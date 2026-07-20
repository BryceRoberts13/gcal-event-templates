import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { watchForSaveTemplateControl, reevaluateSaveMatch } from "./save-as-template";

vi.mock("../store/template-store", async () => {
  const actual = await vi.importActual<typeof import("../store/template-store")>(
    "../store/template-store",
  );
  return {
    ...actual,
    listTemplates: vi.fn(async () => [
      {
        id: "gym",
        name: "Gym",
        keywords: ["workout"],
        location: "Z Center",
        colorId: "10" as const,
        updatedAt: 100,
      },
    ]),
    upsertTemplate: vi.fn(async () => undefined),
  };
});

function mountEditor(title: string): {
  save: HTMLButtonElement;
  titleInput: HTMLInputElement;
} {
  document.body.innerHTML = `
    <div role="dialog">
      <input aria-label="Add title" value="${title}" />
      <button type="button">Save</button>
      <button type="button" aria-label="More actions">More</button>
    </div>
  `;
  const titleInput = document.querySelector("input") as HTMLInputElement;
  const save = document.querySelector("button") as HTMLButtonElement;
  return { save, titleInput };
}

describe("save match mode UI", () => {
  let stop: () => void;

  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn(), id: "test" },
      storage: {
        sync: { get: vi.fn(), set: vi.fn() },
        local: { get: vi.fn(), set: vi.fn() },
      },
    });
    stop = watchForSaveTemplateControl();
  });

  afterEach(() => {
    stop();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("relabels Save when title matches a template", async () => {
    const { save } = mountEditor("Gym");
    await reevaluateSaveMatch();
    expect(save.textContent?.trim()).toBe("Save & update template");
    expect(save.getAttribute("aria-label")).toBe("Save & update template");
  });

  it("restores Save when title does not match", async () => {
    const { save, titleInput } = mountEditor("Gym");
    await reevaluateSaveMatch();
    titleInput.value = "Something else";
    await reevaluateSaveMatch();
    expect(save.textContent?.trim()).toBe("Save");
  });

  it("re-evaluates match mode when the title blurs", async () => {
    const { save, titleInput } = mountEditor("Something else");
    await reevaluateSaveMatch();

    titleInput.value = "Gym";
    titleInput.dispatchEvent(new Event("blur"));

    await vi.waitFor(() => {
      expect(save.textContent?.trim()).toBe("Save & update template");
    });
  });

  it("offers Save only in matched mode and clicks native Save", async () => {
    const { save } = mountEditor("Gym");
    const nativeSave = vi.fn();
    save.addEventListener("click", nativeSave);
    await reevaluateSaveMatch();
    await vi.waitFor(() => {
      expect(document.querySelector(".gcet-save-caret")).not.toBeNull();
    });

    (document.querySelector(".gcet-save-caret") as HTMLButtonElement).click();
    const saveOnly = document.querySelector(
      '[data-gcet-action="save-only"]',
    ) as HTMLButtonElement;
    expect(saveOnly?.textContent).toBe("Save only");

    saveOnly.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(nativeSave).toHaveBeenCalledOnce();
  });
});
