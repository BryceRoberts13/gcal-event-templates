import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { EventTemplate } from "../types";
import {
  applyTemplate,
  extractTemplateFromSurface,
  findEventSurface,
  findSaveControls,
  isTitleInput,
} from "./dom-adapter";

const fixture = readFileSync(
  resolve(__dirname, "fixtures/quick-create.html"),
  "utf8",
);

describe("dom-adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture;
  });

  it("isTitleInput matches GCal title fields", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    expect(isTitleInput(input)).toBe(true);
  });

  it("findEventSurface returns root containing title", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    const surface = findEventSurface(input);
    expect(surface?.getAttribute("role")).toBe("dialog");
  });

  it("applyTemplate fills title, description, location, and color", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    const template: EventTemplate = {
      id: "t1",
      name: "Gym",
      description: "Leg day",
      location: "Z Center",
      colorId: "10",
      updatedAt: 0,
    };

    applyTemplate(input, template);

    expect((document.querySelector('input[aria-label="Title"]') as HTMLInputElement).value).toBe(
      "Gym",
    );
    expect(
      (document.querySelector('[aria-label="Add description"]') as HTMLElement).textContent,
    ).toBe("Leg day");
    expect(
      (document.querySelector('input[aria-label="Add location"]') as HTMLInputElement).value,
    ).toBe("Z Center");
    expect(document.querySelector('[aria-label="Basil"][aria-pressed="true"]')).not.toBeNull();
  });

  it("applyTemplate prefers color names when data-color-id is absent", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    applyTemplate(input, {
      id: "t2",
      name: "Focus",
      colorId: "9",
      updatedAt: 0,
    });
    expect(
      document.querySelector('[aria-label="Blueberry"][aria-pressed="true"]'),
    ).not.toBeNull();
  });

  it("extractTemplateFromSurface reads current fields", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    input.value = "Custom event";
    (document.querySelector('[aria-label="Add description"]') as HTMLElement).textContent =
      "Notes";
    (document.querySelector('input[aria-label="Add location"]') as HTMLInputElement).value =
      "Baker";

    const draft = extractTemplateFromSurface(input);
    expect(draft.name).toBe("Custom event");
    expect(draft.description).toBe("Notes");
    expect(draft.location).toBe("Baker");
  });

  it("findSaveControls locates Save and More actions", () => {
    const { saveButton, moreActions } = findSaveControls(document);
    expect(saveButton?.textContent).toContain("Save");
    expect(moreActions?.getAttribute("aria-label")).toBe("More actions");
  });
});
