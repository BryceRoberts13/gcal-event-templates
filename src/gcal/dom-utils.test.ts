import { describe, expect, it, vi } from "vitest";
import { setInputValue, setTextareaValue } from "./dom-utils";

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
});
