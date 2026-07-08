import { describe, expect, it } from "vitest";
import type { EventTemplate } from "../types";
import { searchTemplates } from "./template-search";

const fixtures: EventTemplate[] = [
  {
    id: "1",
    name: "Focus block",
    keywords: ["deep work"],
    updatedAt: 0,
  },
  {
    id: "2",
    name: "Gym",
    keywords: ["workout", "lift"],
    updatedAt: 0,
  },
  {
    id: "3",
    name: "1:1",
    keywords: ["meeting"],
    updatedAt: 0,
  },
];

describe("searchTemplates", () => {
  it("returns all templates when query is empty", () => {
    expect(searchTemplates(fixtures, "")).toHaveLength(3);
  });

  it("matches name prefix", () => {
    expect(searchTemplates(fixtures, "foc").map((t) => t.name)).toEqual([
      "Focus block",
    ]);
  });

  it("matches keywords", () => {
    expect(searchTemplates(fixtures, "lift").map((t) => t.name)).toEqual(["Gym"]);
  });

  it("is case insensitive", () => {
    expect(searchTemplates(fixtures, "GYM").map((t) => t.name)).toEqual(["Gym"]);
  });

  it("returns empty when nothing matches", () => {
    expect(searchTemplates(fixtures, "dentist")).toEqual([]);
  });
});
