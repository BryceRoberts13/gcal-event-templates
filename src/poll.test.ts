import { describe, expect, it } from "vitest";
import {
  COLOR_PICK_INITIAL_DELAY_MS,
  COLOR_PICK_RETRY_DELAY_MS,
  CONTEXT_CHECK_INTERVAL_MS,
  DIALOG_SCAN_INTERVAL_MS,
  STORAGE_RETRY_DELAY_MS,
  assertDelayMs,
} from "./poll";

describe("assertDelayMs", () => {
  it("accepts the intervals the extension actually uses", () => {
    expect(assertDelayMs(DIALOG_SCAN_INTERVAL_MS, "Dialog scan")).toBe(1500);
    expect(assertDelayMs(CONTEXT_CHECK_INTERVAL_MS, "Context check")).toBe(3000);
    expect(assertDelayMs(COLOR_PICK_INITIAL_DELAY_MS, "Color pick")).toBe(40);
    expect(assertDelayMs(COLOR_PICK_RETRY_DELAY_MS, "Color retry")).toBe(60);
    expect(assertDelayMs(STORAGE_RETRY_DELAY_MS, "Storage retry")).toBe(100);
  });

  it("rejects missing, zero, and unbounded delays", () => {
    expect(() => assertDelayMs(0, "Poll interval")).toThrow("Poll interval");
    expect(() => assertDelayMs(-1, "Poll interval")).toThrow(/integer from/);
    expect(() => assertDelayMs(Number.POSITIVE_INFINITY, "Poll interval")).toThrow(
      /integer from/,
    );
    expect(() => assertDelayMs(120_000, "Poll interval")).toThrow(/60000/);
  });
});
