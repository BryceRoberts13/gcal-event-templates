import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { HiddenEventStore } from "../types";
import {
  applyHiddenFlags,
  buildHiddenRecord,
  chipMatches,
  findEventOptionsMenus,
  findOpenEventCard,
  findShowHiddenMountPoint,
  hideEvent,
  injectHideMenuItem,
  isEventOptionsMenu,
  readEventCard,
  resolveActiveChip,
  sameEvent,
  syncHiddenCalendarUi,
  unhideEvent,
} from "./hidden-events";

const fixture = readFileSync(resolve(__dirname, "fixtures/event-popover.html"), "utf8");

function emptyStore(): HiddenEventStore {
  return { schemaVersion: 1, showHidden: false, events: [] };
}

describe("hidden event identity", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture;
  });

  it("reads the open event card title, time, and calendar", () => {
    const card = document.getElementById("event-card") as HTMLElement;
    expect(readEventCard(card)).toEqual({
      eventId: null,
      title: "composite photos",
      when: "wednesday, october 14 · 11:00am – 1:00pm",
      calendar: "delta tau delta 2026",
    });
  });

  it("treats the options menu as the event menu and ignores the color menu", () => {
    const options = document.getElementById("event-options") as HTMLElement;
    const colors = document.getElementById("color-menu") as HTMLElement;
    expect(isEventOptionsMenu(options)).toBe(true);
    expect(isEventOptionsMenu(colors)).toBe(false);
    expect(findEventOptionsMenus(document).map((menu) => menu.id)).toEqual(["event-options"]);
  });

  it("injects Hide event once, styled from the native menu item", () => {
    const menu = document.getElementById("event-options") as HTMLElement;
    const item = injectHideMenuItem(menu, "Hide event");
    expect(item?.textContent).toContain("Hide event");
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(6);
    expect(item?.querySelector("span")?.textContent).toBe("Hide event");

    injectHideMenuItem(menu, "Unhide event");
    expect(menu.querySelectorAll("[data-gcet-action='hide-event']")).toHaveLength(1);
    expect(
      menu.querySelector("[data-gcet-action='hide-event']")?.textContent?.replace(/\s+/g, " ").trim(),
    ).toBe("Unhide event");
    expect(document.getElementById("color-menu")?.textContent).not.toContain("Hide event");
  });

  it("places Show hidden at the top of the My calendars list", () => {
    const mount = findShowHiddenMountPoint(document);
    expect(mount?.parent.id).toBe("calendar-list");
    expect(mount?.before).toBe(document.querySelector("#calendar-list > [role='treeitem']"));
  });

  it("hides only the matching event id", () => {
    const chip = document.getElementById("chip-composite") as HTMLElement;
    const card = findOpenEventCard(document);
    const record = buildHiddenRecord({ chip, card, now: 5 });
    expect(record?.eventId).toBe("evt_composite");
    expect(record?.title).toBe("composite photos");

    const store = hideEvent(emptyStore(), record!);
    applyHiddenFlags(document, store);

    expect(chip.getAttribute("data-gcet-hidden")).toBe("true");
    expect(document.getElementById("chip-pset")?.hasAttribute("data-gcet-hidden")).toBe(false);
    expect(document.getElementById("event-card")?.hasAttribute("data-gcet-hidden")).toBe(false);
  });

  it("does not hide a same-titled event at a different time when ids differ", () => {
    const morning = document.getElementById("chip-office-am") as HTMLElement;
    const evening = document.getElementById("chip-office-pm") as HTMLElement;
    const store = hideEvent(emptyStore(), {
      eventId: "evt_office_am",
      title: "office hours",
      when: "wednesday, october 14, 11:00 am",
      calendar: "",
      ariaLabel: "",
      hiddenAt: 1,
    });
    applyHiddenFlags(document, store);
    expect(morning.getAttribute("data-gcet-hidden")).toBe("true");
    expect(evening.hasAttribute("data-gcet-hidden")).toBe(false);
  });

  it("matches a chip by title and time when the event id is missing", () => {
    const morning = document.getElementById("chip-office-am") as HTMLElement;
    morning.removeAttribute("data-eventid");
    const record = {
      eventId: null,
      title: "office hours",
      when: "wednesday, october 14 · 11:00am – 12:00pm",
      calendar: "",
      ariaLabel: "",
      hiddenAt: 1,
    };
    expect(chipMatches(morning, record)).toBe(true);
    expect(chipMatches(document.getElementById("chip-office-pm") as HTMLElement, record)).toBe(
      false,
    );
  });

  it("resolves the clicked chip and can unhide it", () => {
    const chip = document.getElementById("chip-composite") as HTMLElement;
    const resolved = resolveActiveChip(document, findOpenEventCard(document), chip);
    expect(resolved).toBe(chip);

    const record = buildHiddenRecord({ chip, card: findOpenEventCard(document), now: 1 })!;
    const hidden = hideEvent(emptyStore(), record);
    expect(sameEvent(hidden.events[0], record)).toBe(true);
    expect(unhideEvent(hidden, record).events).toHaveLength(0);
  });

  it("syncs the menu label and the show-hidden flag", () => {
    const chip = document.getElementById("chip-composite") as HTMLElement;
    const record = buildHiddenRecord({
      chip,
      card: findOpenEventCard(document),
      now: 1,
    })!;
    const store = hideEvent({ ...emptyStore(), showHidden: true }, record);
    syncHiddenCalendarUi(document, store, chip);

    expect(document.documentElement.getAttribute("data-gcet-show-hidden")).toBe("true");
    expect(document.getElementById("event-options")?.textContent).toContain("Unhide event");
    expect(chip.getAttribute("data-gcet-hidden")).toBe("true");
  });
});
