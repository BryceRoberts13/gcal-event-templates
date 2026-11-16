import { describe, expect, it, vi } from "vitest";
import {
  readContentEditableText,
  setContentEditableText,
  setInputValue,
  setTextareaValue,
} from "./dom-utils";

describe("dom-utils", () => {
  it("setInputValue updates value and dispatches input event", () => {
    const input = document.createElement("input");
    const handler = vi.fn();
    input.addEventListener("input", handler);

    setInputValue(input, "Focus block");

    expect(input.value).toBe("Focus block");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("setTextareaValue updates value and dispatches input event", () => {
    const textarea = document.createElement("textarea");
    const handler = vi.fn();
    textarea.addEventListener("input", handler);

    setTextareaValue(textarea, "Notes here");

    expect(textarea.value).toBe("Notes here");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("readContentEditableText converts br tags to newlines", () => {
    const element = document.createElement("div");
    element.innerHTML = "First paragraph<br>Second paragraph";
    expect(readContentEditableText(element)).toBe("First paragraph\nSecond paragraph");
  });

  it("setContentEditableText round-trips multiline text", () => {
    const element = document.createElement("div");
    const handler = vi.fn();
    element.addEventListener("input", handler);

    setContentEditableText(element, "First paragraph\n\nSecond paragraph");

    expect(readContentEditableText(element)).toBe("First paragraph\n\nSecond paragraph");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
