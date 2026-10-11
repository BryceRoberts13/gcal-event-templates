import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { HiddenEventStore } from "../types";
import {
  anchorHideEventRow,
  applyHiddenFlags,
  buildHiddenRecord,
  chipMatches,
  findEventOptionsMenus,
  findOpenEventCard,
  findOptionsMenuAnchor,
  findShowHiddenMountPoint,
  hideEvent,
  hideMenuLabel,
  isEventOptionsMenu,
  nextStoreAfterHideAction,
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

function box(top: number, left = 400, width = 280, height = 44): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function layoutOptionsMenu(): void {
  const rows = Array.from(document.querySelectorAll("#event-options [role='menuitem']"));
  rows.forEach((row, index) => {
    const top = 120 + index * 48;
    (row as HTMLElement).getBoundingClientRect = () => box(top);
  });
}

describe("hidden event identity", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture;
    layoutOptionsMenu();
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

  it("anchors Hide event under the open menu without editing Calendar's menu", () => {
    const menu = document.getElementById("event-options") as HTMLElement;
    const anchor = findOptionsMenuAnchor(document);
    expect(anchor?.top).toBe(120 + 4 * 48 + 44);

    const row = anchorHideEventRow(document, "Hide event");
    expect(row?.textContent).toBe("Hide event");
    expect(row?.parentElement).toBe(document.body);
    expect(menu.querySelector("[data-gcet-action='hide-event']")).toBeNull();
    expect(row?.style.top).toBe(`${anchor?.top}px`);
    expect(row?.style.width).toBe("280px");

    anchorHideEventRow(document, "Unhide event");
    expect(document.querySelectorAll("[data-gcet-action='hide-event']")).toHaveLength(1);
    expect(document.getElementById("gcet-hide-event-row")?.textContent).toBe("Unhide event");
    expect(document.getElementById("color-menu")?.textContent).not.toContain("Hide event");
  });

  it("finds a Print/Duplicate menu that has no ARIA roles", () => {
    document.getElementById("event-options")?.remove();
    const plain = document.createElement("div");
    plain.id = "plain-menu";
    plain.innerHTML = "<div>Print</div><div>Duplicate</div><div>Report as spam</div>";
    document.body.appendChild(plain);
    Array.from(plain.children).forEach((row, index) => {
      (row as HTMLElement).getBoundingClientRect = () => box(200 + index * 40, 500, 260, 36);
    });

    const anchor = findOptionsMenuAnchor(document);
    expect(anchor).not.toBeNull();
    expect(anchor?.left).toBe(500);
    expect(anchor?.width).toBe(260);
    expect(document.getElementById("gcet-hide-event-row")).toBeNull();
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

  it("toggles the same menu row between Hide event and Unhide event", () => {
    const chip = document.getElementById("chip-composite") as HTMLElement;
    const card = findOpenEventCard(document);
    const record = buildHiddenRecord({ chip, card, now: 1 })!;
    const row = anchorHideEventRow(document, "Hide event")!;

    let store = nextStoreAfterHideAction(emptyStore(), record, chip);
    applyHiddenFlags(document, store);
    const hiddenLabel = hideMenuLabel(store, record, chip);
    anchorHideEventRow(document, hiddenLabel);

    expect(document.getElementById("gcet-hide-event-row")).toBe(row);
    expect(row.textContent).toBe("Unhide event");
    expect(chip.getAttribute("data-gcet-hidden")).toBe("true");

    const reopened = {
      ...record,
      eventId: null,
      ariaLabel: "",
    };
    expect(hideMenuLabel(store, reopened, chip)).toBe("Unhide event");
    store = nextStoreAfterHideAction(store, reopened, chip);
    applyHiddenFlags(document, store);
    anchorHideEventRow(document, hideMenuLabel(store, reopened, chip));

    expect(row.textContent).toBe("Hide event");
    expect(store.events).toHaveLength(0);
    expect(chip.hasAttribute("data-gcet-hidden")).toBe(false);
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
    expect(document.getElementById("gcet-hide-event-row")?.textContent).toBe("Unhide event");
    expect(chip.getAttribute("data-gcet-hidden")).toBe("true");
  });
});
