import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventTemplate } from "../types";
import { mountTemplateCombobox } from "./combobox";

const templates: EventTemplate[] = [
  { id: "1", name: "Focus block", updatedAt: 0 },
  { id: "2", name: "Gym", keywords: ["workout"], updatedAt: 0 },
];

describe("mountTemplateCombobox", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    input = document.createElement("input");
    input.setAttribute("aria-label", "Add title");
    document.getElementById("host")!.appendChild(input);
  });

  it("opens dropdown on focus and filters on input", () => {
    mountTemplateCombobox(input, templates, vi.fn());
    input.dispatchEvent(new Event("focus"));

    const dropdown = document.querySelector(".gcet-dropdown");
    expect(dropdown).not.toBeNull();
    expect(dropdown!.querySelectorAll(".gcet-dropdown-item")).toHaveLength(2);

    input.value = "gym";
    input.dispatchEvent(new Event("input"));

    expect(dropdown!.querySelectorAll(".gcet-dropdown-item")).toHaveLength(1);
    expect(dropdown!.textContent).toContain("Gym");
  });

  it("shows all templates when current title matches nothing", () => {
    input.value = "See G and Dad";
    mountTemplateCombobox(input, templates, vi.fn());
    input.dispatchEvent(new Event("focus"));

    const dropdown = document.querySelector(".gcet-dropdown");
    expect(dropdown!.querySelectorAll(".gcet-dropdown-item")).toHaveLength(2);
  });

  it("calls onSelect when Enter pressed on highlighted item", () => {
    const onSelect = vi.fn();
    mountTemplateCombobox(input, templates, onSelect);
    input.dispatchEvent(new Event("focus"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(onSelect).toHaveBeenCalledWith(templates[0]);
  });

  it("calls onSelect when an item is clicked", () => {
    const onSelect = vi.fn();
    mountTemplateCombobox(input, templates, onSelect);
    input.dispatchEvent(new Event("focus"));

    const item = document.querySelector(".gcet-dropdown-item") as HTMLElement;
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(onSelect).toHaveBeenCalledWith(templates[0]);
  });

  it("stops mousedown from reaching document so GCal cannot treat it as outside click", () => {
    const onSelect = vi.fn();
    const documentSpy = vi.fn();
    document.addEventListener("mousedown", documentSpy, true);

    mountTemplateCombobox(input, templates, onSelect);
    input.dispatchEvent(new Event("focus"));

    const item = document.querySelector(".gcet-dropdown-item") as HTMLElement;
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(onSelect).toHaveBeenCalledWith(templates[0]);
    expect(documentSpy).not.toHaveBeenCalled();

    document.removeEventListener("mousedown", documentSpy, true);
  });

  it("shows a manage templates footer in the dropdown", () => {
    mountTemplateCombobox(input, templates, vi.fn());
    input.dispatchEvent(new Event("focus"));

    const manage = document.querySelector(".gcet-dropdown-manage");
    expect(manage).not.toBeNull();
    expect(manage!.textContent).toContain("Manage templates");
  });
});
