import { describe, expect, it } from "vitest";
import type { EventTemplate } from "../types";
import { findMatchingTemplate } from "./match-template";

function tpl(
  partial: Pick<EventTemplate, "id" | "name" | "updatedAt"> &
    Partial<EventTemplate>,
): EventTemplate {
  return { ...partial };
}

describe("findMatchingTemplate", () => {
  const gym = tpl({ id: "gym", name: "Gym", updatedAt: 100 });
  const focus = tpl({ id: "focus", name: "Focus block", updatedAt: 200 });

  it("returns null for empty or whitespace-only title", () => {
    expect(findMatchingTemplate("", [gym])).toBeNull();
    expect(findMatchingTemplate("   ", [gym])).toBeNull();
  });

  it("matches trimmed case-insensitive exact name", () => {
    expect(findMatchingTemplate("  gym  ", [gym, focus])).toEqual(gym);
    expect(findMatchingTemplate("GYM", [gym])).toEqual(gym);
  });

  it("does not substring-match", () => {
    expect(findMatchingTemplate("Gym night", [gym])).toBeNull();
  });

  it("picks greatest updatedAt among duplicate names", () => {
    const older = tpl({ id: "a", name: "1:1", updatedAt: 10 });
    const newer = tpl({ id: "b", name: "1:1", updatedAt: 99 });
    expect(findMatchingTemplate("1:1", [older, newer])).toEqual(newer);
    expect(findMatchingTemplate("1:1", [newer, older])).toEqual(newer);
  });
});
