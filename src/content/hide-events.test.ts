import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHOW_HIDDEN_ID } from "../gcal/hidden-events";
import type { HiddenEventStore } from "../types";
import { startHiddenEvents } from "./hide-events";

const fixture = readFileSync(
  resolve(__dirname, "../gcal/fixtures/event-popover.html"),
  "utf8",
);

function emptyStore(): HiddenEventStore {
  return { schemaVersion: 1, showHidden: false, events: [] };
}

describe("startHiddenEvents", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    document.body.innerHTML = fixture;
    document.documentElement.removeAttribute("data-gcet-show-hidden");
    const rows = Array.from(document.querySelectorAll("#event-options [role='menuitem']"));
    rows.forEach((row, index) => {
      const top = 120 + index * 48;
      (row as HTMLElement).getBoundingClientRect = () =>
        ({
          x: 400,
          y: top,
          left: 400,
          top,
          right: 680,
          bottom: top + 44,
          width: 280,
          height: 44,
          toJSON() {
            return {};
          },
        }) as DOMRect;
    });
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("hides the clicked event from the ⋮ menu and shows it again from the sidebar", async () => {
    const saved: HiddenEventStore[] = [];
    stop = startHiddenEvents({
      load: async () => emptyStore(),
      save: async (store) => {
        saved.push(store);
      },
    });

    const showHidden = document.getElementById(SHOW_HIDDEN_ID) as HTMLButtonElement;
    expect(showHidden).not.toBeNull();
    expect(showHidden.parentElement?.id).toBe("calendar-list");
    expect(showHidden.getAttribute("aria-pressed")).toBe("false");
    expect(showHidden.textContent).toContain("Show hidden");

    const press = (element: Element) => {
      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    };

    const chip = document.getElementById("chip-composite") as HTMLElement;
    press(chip);

    const hideItem = document.querySelector("[data-gcet-action='hide-event']") as HTMLElement;
    expect(hideItem.textContent).toContain("Hide event");
    let closed = false;
    document.getElementById("close-event")!.addEventListener("click", () => {
      closed = true;
    });
    press(hideItem);

    expect(chip.getAttribute("data-gcet-hidden")).toBe("true");
    expect(document.getElementById("chip-pset")?.hasAttribute("data-gcet-hidden")).toBe(false);
    expect(document.documentElement.getAttribute("data-gcet-show-hidden")).toBe("false");
    expect(closed).toBe(true);
    expect(saved.at(-1)?.events).toHaveLength(1);
    expect(saved.at(-1)?.events[0].eventId).toBe("evt_composite");
    expect(showHidden.textContent).toContain("1");

    showHidden.click();
    expect(showHidden.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.getAttribute("data-gcet-show-hidden")).toBe("true");
    expect(saved.at(-1)?.showHidden).toBe(true);

    const unhide = document.querySelector("[data-gcet-action='hide-event']") as HTMLElement;
    expect(unhide.textContent).toContain("Unhide event");
    vi.setSystemTime(new Date("2026-10-10T12:00:02Z"));
    press(unhide);
    expect(chip.hasAttribute("data-gcet-hidden")).toBe(false);
    expect(saved.at(-1)?.events).toHaveLength(0);
    expect(unhide.textContent).toContain("Hide event");

    vi.setSystemTime(new Date("2026-10-10T12:00:04Z"));
    press(unhide);
    expect(chip.getAttribute("data-gcet-hidden")).toBe("true");
    expect(unhide.textContent).toContain("Unhide event");
    expect(saved.at(-1)?.events).toHaveLength(1);
  });

  it("restores previously hidden events after load", async () => {
    const stored: HiddenEventStore = {
      schemaVersion: 1,
      showHidden: false,
      events: [
        {
          eventId: "evt_pset",
          title: "1210 pset 2 checkoff",
          when: "",
          calendar: "",
          ariaLabel: "",
          hiddenAt: 1,
        },
      ],
    };
    let resolveLoad: (store: HiddenEventStore) => void = () => undefined;
    const load = new Promise<HiddenEventStore>((resolve) => {
      resolveLoad = resolve;
    });
    stop = startHiddenEvents({
      load: () => load,
      save: async () => undefined,
    });

    expect(document.getElementById("chip-pset")?.hasAttribute("data-gcet-hidden")).toBe(false);
    resolveLoad(stored);
    await load;
    await Promise.resolve();

    expect(document.getElementById("chip-pset")?.getAttribute("data-gcet-hidden")).toBe("true");
    expect(document.getElementById("chip-composite")?.hasAttribute("data-gcet-hidden")).toBe(
      false,
    );
  });
});
