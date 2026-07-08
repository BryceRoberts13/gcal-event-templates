import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { EventTemplate } from "../types";
import { applyTemplate, findEventSurface, isTitleInput } from "./dom-adapter";

const fixture = readFileSync(
  resolve(__dirname, "fixtures/quick-create.html"),
  "utf8",
);

describe("dom-adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture;
  });

  it("isTitleInput matches GCal title fields", () => {
    const input = document.querySelector('input[aria-label="Add title"]') as HTMLInputElement;
    expect(isTitleInput(input)).toBe(true);
  });

  it("findEventSurface returns root containing title", () => {
    const input = document.querySelector('input[aria-label="Add title"]') as HTMLInputElement;
    const surface = findEventSurface(input);
    expect(surface?.getAttribute("role")).toBe("dialog");
  });

  it("applyTemplate fills title, description, location, and color", () => {
    const input = document.querySelector('input[aria-label="Add title"]') as HTMLInputElement;
    const template: EventTemplate = {
      id: "t1",
      name: "Gym",
      description: "Leg day",
      location: "Z Center",
      colorId: "10",
      updatedAt: 0,
    };

    applyTemplate(input, template);

    expect((document.querySelector('input[aria-label="Add title"]') as HTMLInputElement).value).toBe("Gym");
    expect((document.querySelector('textarea[aria-label="Description"]') as HTMLTextAreaElement).value).toBe("Leg day");
    expect((document.querySelector('input[aria-label="Add location"]') as HTMLInputElement).value).toBe("Z Center");
    expect(document.querySelector('[data-color-id="10"][aria-pressed="true"]')).not.toBeNull();
  });
});
