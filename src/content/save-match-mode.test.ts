import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listTemplates, upsertTemplate } from "../store/template-store";
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

const gymTemplate = {
  id: "gym",
  name: "Gym",
  keywords: ["workout"],
  location: "Z Center",
  colorId: "10" as const,
  updatedAt: 100,
};

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
    vi.mocked(listTemplates).mockResolvedValue([gymTemplate]);
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

  it("discards in-flight match evaluation when watcher stops", async () => {
    const { save } = mountEditor("Gym");
    await reevaluateSaveMatch();
    expect(save.textContent?.trim()).toBe("Save & update template");

    let resolveTemplates!: (templates: typeof gymTemplate[]) => void;
    vi.mocked(listTemplates).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTemplates = resolve;
      }),
    );

    const evaluation = reevaluateSaveMatch();
    stop();
    expect(save.textContent?.trim()).toBe("Save");

    resolveTemplates([gymTemplate]);
    await evaluation;

    expect(save.textContent?.trim()).toBe("Save");
  });

  it("discards an older match evaluation that resolves last", async () => {
    stop();
    stop = () => undefined;
    let resolveOlder!: (templates: typeof gymTemplate[]) => void;
    let resolveNewer!: (templates: typeof gymTemplate[]) => void;
    vi.mocked(listTemplates)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlder = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNewer = resolve;
        }),
      );
    const { save } = mountEditor("Gym");

    const older = reevaluateSaveMatch();
    const newer = reevaluateSaveMatch();
    resolveNewer([]);
    await newer;
    resolveOlder([gymTemplate]);
    await older;

    expect(save.textContent?.trim()).toBe("Save");
  });

  it("waits for blur re-evaluation before opening the caret menu", async () => {
    const { titleInput } = mountEditor("Something else");
    await reevaluateSaveMatch();
    let resolveBlur!: (templates: typeof gymTemplate[]) => void;
    vi.mocked(listTemplates).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBlur = resolve;
      }),
    );

    titleInput.value = "Gym";
    titleInput.dispatchEvent(new Event("blur"));
    (document.querySelector(".gcet-save-caret") as HTMLButtonElement).click();

    expect(document.getElementById("gcet-save-menu")).toBeNull();
    resolveBlur([gymTemplate]);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-gcet-action="save-only"]')).not.toBeNull();
    });
  });

  it("upgrades a fallback caret when Save appears later", async () => {
    document.body.innerHTML = `
      <div role="dialog">
        <input aria-label="Add title" value="Gym" />
        <button type="button" aria-label="More actions">More</button>
      </div>
    `;
    await vi.waitFor(() => {
      expect(document.querySelector(".gcet-save-caret")).not.toBeNull();
    });
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";
    dialog.insertBefore(save, dialog.querySelector('[aria-label="More actions"]'));

    await vi.waitFor(() => {
      expect(save.textContent?.trim()).toBe("Save & update template");
      expect(document.querySelectorAll(".gcet-save-caret")).toHaveLength(1);
    });
    (document.querySelector(".gcet-save-caret") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-gcet-action="save-only"]')).not.toBeNull();
    });
  });

  it("relabels a recreated Save button while still matched", async () => {
    const { save } = mountEditor("Gym");
    await reevaluateSaveMatch();
    await vi.waitFor(() => {
      expect(document.querySelector(".gcet-save-caret")).not.toBeNull();
    });

    const replacement = document.createElement("button");
    replacement.type = "button";
    replacement.textContent = "Save";
    save.replaceWith(replacement);

    await vi.waitFor(() => {
      expect(replacement.textContent?.trim()).toBe("Save & update template");
      expect(replacement.getAttribute("aria-label")).toBe("Save & update template");
    });
  });

  it("clears the matched template when the editor closes", async () => {
    const { save } = mountEditor("Gym");
    await reevaluateSaveMatch();
    expect(save.textContent?.trim()).toBe("Save & update template");

    document.body.innerHTML = "";

    await vi.waitFor(() => {
      expect(save.textContent?.trim()).toBe("Save");
    });

    vi.mocked(upsertTemplate).mockClear();
    const reopened = mountEditor("Something else").save;
    const nativeHandler = vi.fn();
    reopened.addEventListener("click", nativeHandler);
    reopened.click();

    expect(nativeHandler).toHaveBeenCalledOnce();
    expect(upsertTemplate).not.toHaveBeenCalled();
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
    await vi.waitFor(() => {
      expect(document.querySelector('[data-gcet-action="save-only"]')).not.toBeNull();
    });
    const saveOnly = document.querySelector<HTMLButtonElement>(
      '[data-gcet-action="save-only"]',
    );
    expect(saveOnly?.textContent).toBe("Save only");

    saveOnly?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(nativeSave).toHaveBeenCalledOnce();
  });

  it("updates matched template then clicks native Save", async () => {
    const { save } = mountEditor("Gym");
    const nativeHandler = vi.fn();
    save.addEventListener("click", nativeHandler);

    await reevaluateSaveMatch();

    save.click();
    await vi.waitFor(() => expect(upsertTemplate).toHaveBeenCalled());

    expect(upsertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "gym",
        name: "Gym",
        keywords: ["workout"],
      }),
    );
    await vi.waitFor(() => expect(nativeHandler).toHaveBeenCalled());
  });

  it("preserves stored optional fields when the form omits them", async () => {
    const templateWithOptionalFields = {
      ...gymTemplate,
      description: "Leg day",
    };
    vi.mocked(listTemplates).mockResolvedValue([templateWithOptionalFields]);
    const { save } = mountEditor("Gym");

    await reevaluateSaveMatch();
    save.click();
    await vi.waitFor(() => expect(upsertTemplate).toHaveBeenCalled());

    expect(upsertTemplate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        description: "Leg day",
        location: "Z Center",
        colorId: "10",
      }),
    );
  });

  it("submits only once when Save is clicked twice during an upsert", async () => {
    let resolveUpsert!: () => void;
    vi.mocked(upsertTemplate).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveUpsert = resolve;
      }),
    );
    const { save } = mountEditor("Gym");
    const nativeHandler = vi.fn();
    save.addEventListener("click", nativeHandler);

    await reevaluateSaveMatch();
    save.click();
    save.click();

    expect(upsertTemplate).toHaveBeenCalledOnce();
    expect(nativeHandler).not.toHaveBeenCalled();

    resolveUpsert();
    await vi.waitFor(() => expect(nativeHandler).toHaveBeenCalledOnce());
    expect(upsertTemplate).toHaveBeenCalledOnce();
  });

  it("uses the captured template and clears bypass if the intercept is unbound", async () => {
    let resolveUpsert!: () => void;
    vi.mocked(upsertTemplate).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveUpsert = resolve;
      }),
    );
    const { save } = mountEditor("Gym");
    const nativeHandler = vi.fn();
    save.addEventListener("click", nativeHandler);
    vi.spyOn(window, "alert").mockImplementation(() => undefined);

    await reevaluateSaveMatch();
    save.click();
    resolveUpsert();
    stop();

    await vi.waitFor(() => expect(nativeHandler).toHaveBeenCalledOnce());
    expect(document.getElementById("gcet-toast")?.textContent).toBe(
      "Updated template “Gym”",
    );
    await vi.waitFor(() => expect(save.getAttribute("data-gcet-native-save")).toBeNull());
  });

  it("clears the native Save bypass after Save only when unbound", async () => {
    const { save } = mountEditor("Gym");
    await reevaluateSaveMatch();
    (document.querySelector(".gcet-save-caret") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-gcet-action="save-only"]')).not.toBeNull();
    });
    const saveOnly = document.querySelector<HTMLButtonElement>(
      '[data-gcet-action="save-only"]',
    );
    vi.spyOn(save, "click").mockImplementation(() => {
      stop();
      HTMLButtonElement.prototype.click.call(save);
    });

    saveOnly?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(save.getAttribute("data-gcet-native-save")).toBeNull();
  });

  it("does not native-save when upsert fails", async () => {
    vi.mocked(upsertTemplate).mockRejectedValueOnce(new Error("storage down"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const { save } = mountEditor("Gym");
    const nativeHandler = vi.fn();
    save.addEventListener("click", nativeHandler);

    await reevaluateSaveMatch();
    save.click();
    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(nativeHandler).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
