import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("extension manifest", () => {
  it("puts the version in the name shown on the Chrome extensions card", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "manifest.json"), "utf8"),
    ) as { name: string; version: string; description: string };

    expect(manifest.version).toBe("0.4.2");
    expect(manifest.name).toBe(
      `Google Calendar Event Templates ${manifest.version}`,
    );
    expect(manifest.description).toContain("Hide individual events");
  });
});
