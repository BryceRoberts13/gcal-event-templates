import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("applyTemplate preserves description newlines in the editor", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    applyTemplate(input, {
      id: "t-nl",
      name: "Gym",
      description: "First paragraph\n\nSecond paragraph",
      updatedAt: 0,
    });

    const description = document.querySelector(
      '[aria-label="Add description"]',
    ) as HTMLElement;
    expect(description.querySelector("br, div, p")).not.toBeNull();
    expect(extractTemplateFromSurface(input).description).toBe(
      "First paragraph\n\nSecond paragraph",
    );
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

  it("applyTemplate opens the picker when only the closed button mentions the color", async () => {
    vi.useFakeTimers();
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    document.querySelector('[aria-label="Event colors"]')?.remove();
    const colorButton = document.querySelector(
      '[aria-label="Calendar color"]',
    ) as HTMLElement;
    // Button label includes a *different* color name than the template target.
    colorButton.setAttribute("aria-label", "Event color Blueberry");

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Event colors");
    const basil = document.createElement("div");
    basil.setAttribute("role", "menuitemradio");
    basil.setAttribute("aria-label", "Basil");
    menu.appendChild(basil);
    colorButton.addEventListener("click", () => {
      document.querySelector('[role="dialog"]')?.appendChild(menu);
    });

    applyTemplate(input, {
      id: "t3",
      name: "Gym",
      colorId: "10",
      updatedAt: 0,
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(basil.getAttribute("aria-pressed")).toBe("true");
    vi.useRealTimers();
  });

  it("applyTemplate does not treat the closed color button as a swatch", async () => {
    vi.useFakeTimers();
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    document.querySelector('[aria-label="Event colors"]')?.remove();
    const colorButton = document.querySelector(
      '[aria-label="Calendar color"]',
    ) as HTMLElement;
    colorButton.setAttribute("aria-label", "Event color Basil");

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Event colors");
    const basil = document.createElement("div");
    basil.setAttribute("role", "menuitemradio");
    basil.setAttribute("aria-label", "Basil");
    menu.appendChild(basil);
    colorButton.addEventListener("click", () => {
      document.querySelector('[role="dialog"]')?.appendChild(menu);
    });

    applyTemplate(input, {
      id: "t4",
      name: "Gym",
      colorId: "10",
      updatedAt: 0,
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(basil.getAttribute("aria-pressed")).toBe("true");
    expect(colorButton.getAttribute("aria-pressed")).not.toBe("true");
    vi.useRealTimers();
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

  it("extractTemplateFromSurface preserves description paragraph breaks", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    const description = document.querySelector(
      '[aria-label="Add description"]',
    ) as HTMLElement;
    description.innerHTML = "<div>First paragraph</div><div>Second paragraph</div>";

    const draft = extractTemplateFromSurface(input);
    expect(draft.description).toBe("First paragraph\nSecond paragraph");
  });

  it("extractTemplateFromSurface preserves line breaks from br tags", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    const description = document.querySelector(
      '[aria-label="Add description"]',
    ) as HTMLElement;
    description.innerHTML = "First paragraph<br>Second paragraph";

    const draft = extractTemplateFromSurface(input);
    expect(draft.description).toBe("First paragraph\nSecond paragraph");
  });

  it("extractTemplateFromSurface preserves blank lines in the description", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    const description = document.querySelector(
      '[aria-label="Add description"]',
    ) as HTMLElement;
    description.innerHTML =
      "<div>First paragraph</div><div><br></div><div>Second paragraph</div>";

    const draft = extractTemplateFromSurface(input);
    expect(draft.description).toBe("First paragraph\n\nSecond paragraph");
  });

  it("extractTemplateFromSurface reads color from checked palette swatch", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    const basil = document.querySelector('[aria-label="Basil"]') as HTMLElement;
    basil.setAttribute("aria-checked", "true");

    const draft = extractTemplateFromSurface(input);
    expect(draft.colorId).toBe("10");
  });

  it("extractTemplateFromSurface reads color from closed picker button label", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    document.querySelector('[aria-label="Event colors"]')?.remove();
    const colorButton = document.querySelector(
      '[aria-label="Calendar color"]',
    ) as HTMLElement;
    colorButton.setAttribute("aria-label", "Event color Basil");

    const draft = extractTemplateFromSurface(input);
    expect(draft.colorId).toBe("10");
  });

  it("extractTemplateFromSurface reads color from closed picker chip background", () => {
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    document.querySelector('[aria-label="Event colors"]')?.remove();
    const colorButton = document.querySelector(
      '[aria-label="Calendar color"]',
    ) as HTMLElement;
    colorButton.setAttribute("style", "background-color: rgb(11, 128, 67)");

    const draft = extractTemplateFromSurface(input);
    expect(draft.colorId).toBe("10");
  });

  it("findSaveControls locates Save and More actions", () => {
    const { saveButton, moreActions } = findSaveControls(document);
    expect(saveButton?.textContent).toContain("Save");
    expect(moreActions?.getAttribute("aria-label")).toBe("More actions");
  });
});
