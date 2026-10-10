import type { HiddenEventRecord, HiddenEventStore } from "../types";

export const HIDE_EVENT_ACTION = "hide-event";
export const HIDE_EVENT_ROW_ID = "gcet-hide-event-row";
export const SHOW_HIDDEN_ID = "gcet-show-hidden";

const WEEKDAY =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const CLOCK_TIME = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const SKIP_LINE =
  /^(created by|guests?\b|going\b|yes$|no$|maybe$|join with|notification|organizer|rsvp\b|accepted|declined|tentative)/i;
const FOREIGN_SECTION_MARKERS = [
  "Other calendars",
  "Booking pages",
  "Search for people",
];

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function dateToken(when: string): string | null {
  const text = normalizeText(when);
  for (const month of MONTHS) {
    const match = text.match(new RegExp(`\\b${month}\\s+\\d{1,2}\\b`));
    if (match) {
      return match[0];
    }
  }
  return null;
}

/** Start time as `h:mmam` / `h:mmpm`, or null for all-day text. */
export function startTimeToken(when: string): string | null {
  const text = normalizeText(when);
  const match = text.match(CLOCK_TIME);
  if (!match) {
    return null;
  }
  const hour = String(Number(match[1]));
  const minutes = match[2] ?? "00";
  return `${hour}:${minutes}${match[3].toLowerCase()}`;
}

export function isWhenLine(line: string): boolean {
  if (line.includes("·")) {
    return true;
  }
  if (WEEKDAY.test(line) || CLOCK_TIME.test(line)) {
    return true;
  }
  const normalized = normalizeText(line);
  return MONTHS.some((month) => normalized.includes(month)) && /\b\d{1,2}\b/.test(normalized);
}

export function isCalendarChip(element: HTMLElement): boolean {
  if (!element.hasAttribute("data-eventid")) {
    return false;
  }
  if (element.closest('[role="dialog"], [role="menu"]')) {
    return false;
  }
  if (element.querySelector('[aria-label="Options"], [aria-label="Close"]')) {
    return false;
  }
  return true;
}

export interface EventCardDetails {
  eventId: string | null;
  title: string;
  when: string;
  calendar: string;
}

function leafLines(root: HTMLElement): string[] {
  const lines: string[] = [];
  const nodes = root.querySelectorAll("span, div, h1, h2, h3, p, time");
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node.closest('[role="menu"]')) {
      continue;
    }
    if (node.children.length > 0) {
      continue;
    }
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 160) {
      continue;
    }
    if (!lines.includes(text)) {
      lines.push(text);
    }
  }
  return lines;
}

export function readEventCard(card: HTMLElement): EventCardDetails {
  const nestedId = Array.from(card.querySelectorAll("[data-eventid]")).find(
    (element) => element !== card,
  );
  const eventId =
    card.getAttribute("data-eventid") ??
    nestedId?.getAttribute("data-eventid") ??
    null;

  const heading = card.querySelector('[role="heading"], h1, h2, h3');
  let title = (heading?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!title) {
    const dialogLabel = (card.getAttribute("aria-label") ?? "").trim();
    if (dialogLabel && !/^(event details|create|edit)$/i.test(dialogLabel)) {
      title = dialogLabel;
    }
  }

  const lines = leafLines(card);
  const when = lines.filter((line) => isWhenLine(line)).join(" ");
  const calendar =
    lines.find((line) => {
      if (normalizeText(line) === normalizeText(title)) {
        return false;
      }
      if (isWhenLine(line) || SKIP_LINE.test(line)) {
        return false;
      }
      return true;
    }) ?? "";

  return {
    eventId,
    title: normalizeText(title),
    when: normalizeText(when),
    calendar: normalizeText(calendar),
  };
}

export function buildHiddenRecord(input: {
  chip: HTMLElement | null;
  card: HTMLElement | null;
  now: number;
}): HiddenEventRecord | null {
  const info = input.card
    ? readEventCard(input.card)
    : { eventId: null, title: "", when: "", calendar: "" };
  const eventId = input.chip?.getAttribute("data-eventid") ?? info.eventId;
  const ariaLabel = normalizeText(input.chip?.getAttribute("aria-label") ?? "");
  let title = info.title;
  if (!title) {
    const chipText = (input.chip?.textContent ?? "").replace(/\s+/g, " ").trim();
    title = normalizeText(chipText || ariaLabel.split(",")[0] || "");
  }
  if (!eventId && !title) {
    return null;
  }
  return {
    eventId: eventId || null,
    title,
    when: info.when,
    calendar: info.calendar,
    ariaLabel,
    hiddenAt: input.now,
  };
}

function blobIncludesTime(blob: string, when: string): boolean {
  const token = startTimeToken(when);
  if (!token) {
    return true;
  }
  const match = token.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (!match) {
    return true;
  }
  const pattern = new RegExp(`\\b${match[1]}(?::${match[2]})?\\s*${match[3]}\\b`);
  return pattern.test(normalizeText(blob));
}

export function sameEvent(a: HiddenEventRecord, b: HiddenEventRecord): boolean {
  if (a.eventId && b.eventId) {
    return a.eventId === b.eventId;
  }
  if (a.ariaLabel && b.ariaLabel && a.ariaLabel === b.ariaLabel) {
    return true;
  }
  if (!a.title || a.title !== b.title) {
    return false;
  }
  const aDate = a.when ? dateToken(a.when) : null;
  const bDate = b.when ? dateToken(b.when) : null;
  if (aDate && bDate && aDate !== bDate) {
    return false;
  }
  const aTime = a.when ? startTimeToken(a.when) : null;
  const bTime = b.when ? startTimeToken(b.when) : null;
  if (aTime && bTime && aTime !== bTime) {
    return false;
  }
  return true;
}

export function chipMatches(chip: HTMLElement, record: HiddenEventRecord): boolean {
  if (chip.closest('[role="dialog"], [role="menu"]')) {
    return false;
  }
  if (chip.querySelector('[aria-label="Options"], [aria-label="Close"]')) {
    return false;
  }
  const eventId = chip.getAttribute("data-eventid");
  if (record.eventId && eventId) {
    return record.eventId === eventId;
  }
  const label = normalizeText(chip.getAttribute("aria-label") ?? "");
  if (record.ariaLabel && label && record.ariaLabel === label) {
    return true;
  }
  if (!record.title) {
    return false;
  }
  const blob = normalizeText(
    `${chip.getAttribute("aria-label") ?? ""} ${chip.textContent ?? ""}`,
  );
  if (!blob.includes(record.title)) {
    return false;
  }
  const date = record.when ? dateToken(record.when) : null;
  if (date && !blob.includes(date)) {
    return false;
  }
  if (record.when && !blobIncludesTime(blob, record.when)) {
    return false;
  }
  return true;
}

export function hideEvent(
  store: HiddenEventStore,
  record: HiddenEventRecord,
): HiddenEventStore {
  return {
    ...store,
    events: [...store.events.filter((existing) => !sameEvent(existing, record)), record],
  };
}

export function unhideEvent(
  store: HiddenEventStore,
  record: HiddenEventRecord,
): HiddenEventStore {
  return {
    ...store,
    events: store.events.filter((existing) => !sameEvent(existing, record)),
  };
}

export function isEventHidden(
  store: HiddenEventStore,
  record: HiddenEventRecord,
): boolean {
  return store.events.some((existing) => sameEvent(existing, record));
}

export function findOpenEventCard(root: ParentNode): HTMLElement | null {
  const buttons = root.querySelectorAll(
    '[aria-label="Options"], [aria-label="More options"], [aria-label="More actions"]',
  );
  for (const button of buttons) {
    if (!(button instanceof HTMLElement)) {
      continue;
    }
    const expanded = button.getAttribute("aria-expanded") === "true";
    const controls = button.getAttribute("aria-controls");
    const menuOpen =
      controls != null &&
      Array.from(root.querySelectorAll("[id]")).some(
        (element) => element.id === controls && element.getAttribute("role") === "menu",
      );
    if (!expanded && !menuOpen) {
      continue;
    }
    const dialog = button.closest('[role="dialog"]');
    if (dialog instanceof HTMLElement) {
      return dialog;
    }
    let node: HTMLElement | null = button.parentElement;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const hasHeading = node.querySelector('[role="heading"], h1, h2, h3');
      const hasClose = node.querySelector('[aria-label="Close"]');
      if (hasHeading && hasClose) {
        return node;
      }
      node = node.parentElement;
    }
  }
  return null;
}

export function resolveActiveChip(
  root: ParentNode,
  card: HTMLElement | null,
  lastChip: HTMLElement | null,
): HTMLElement | null {
  const chips = Array.from(root.querySelectorAll("[data-eventid]")).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && isCalendarChip(element),
  );
  const selected = chips.find((chip) => {
    const flag =
      chip.getAttribute("aria-selected") ??
      chip.getAttribute("aria-pressed") ??
      chip.getAttribute("aria-current");
    return flag === "true";
  });
  if (selected) {
    return selected;
  }

  const cardTitle = card ? readEventCard(card).title : "";
  if (lastChip && isCalendarChip(lastChip)) {
    if (!cardTitle) {
      return lastChip;
    }
    const blob = normalizeText(
      `${lastChip.getAttribute("aria-label") ?? ""} ${lastChip.textContent ?? ""}`,
    );
    if (blob.includes(cardTitle)) {
      return lastChip;
    }
  }

  if (card) {
    const probe = buildHiddenRecord({ chip: null, card, now: 0 });
    if (probe) {
      const matches = chips.filter((chip) => chipMatches(chip, { ...probe, eventId: null }));
      if (matches.length === 1) {
        return matches[0];
      }
    }
  }

  return null;
}

function optionLabel(element: HTMLElement): string {
  if (element.id === HIDE_EVENT_ROW_ID || element.closest(`#${HIDE_EVENT_ROW_ID}`)) {
    return "";
  }
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const aria = (element.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const raw = aria || text;
  if (!raw || raw.length > 48) {
    return "";
  }
  if (raw === "print" || raw.startsWith("print ")) {
    return "print";
  }
  if (raw === "duplicate" || raw.startsWith("duplicate ")) {
    return "duplicate";
  }
  if (raw === "report as spam" || raw.startsWith("report as spam")) {
    return "report as spam";
  }
  return "";
}

function walkElements(root: ParentNode, visit: (element: HTMLElement) => void): void {
  for (const node of root.querySelectorAll("*")) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    visit(node);
    if (node.shadowRoot) {
      walkElements(node.shadowRoot, visit);
    }
  }
}

function parentAcross(element: HTMLElement): HTMLElement | null {
  if (element.parentElement) {
    return element.parentElement;
  }
  const root = element.getRootNode();
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    return root.host;
  }
  return null;
}

/** The row that owns this label, not the whole menu. */
function optionRow(element: HTMLElement): HTMLElement {
  let node = element;
  let parent = parentAcross(node);
  while (parent && parent !== document.body) {
    const parentLabel = optionLabel(parent);
    const nodeLabel = optionLabel(node);
    if (parentLabel && parentLabel === nodeLabel) {
      node = parent;
      parent = parentAcross(node);
      continue;
    }
    const role = parent.getAttribute("role");
    if (role === "menuitem" || role === "option" || parent.tagName === "LI") {
      return parent;
    }
    break;
  }
  return node;
}

function isOnScreen(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width >= 40 && rect.height >= 12 && rect.bottom > 0 && rect.right > 0;
}

export interface OptionsMenuAnchor {
  rows: HTMLElement[];
  left: number;
  width: number;
  top: number;
}

/**
 * Google Calendar rebuilds the ⋮ menu from its own model and drops nodes we
 * insert. Anchor off the visible Print / Duplicate rows instead.
 */
export function findOptionsMenuAnchor(root: ParentNode): OptionsMenuAnchor | null {
  const rows: HTMLElement[] = [];
  walkElements(root, (element) => {
    if (!optionLabel(element) || !isOnScreen(element)) {
      return;
    }
    const row = optionRow(element);
    if (!rows.includes(row)) {
      rows.push(row);
    }
  });

  const labels = new Set(rows.map((row) => optionLabel(row)).filter(Boolean));
  if (!labels.has("print") || !labels.has("duplicate")) {
    return null;
  }

  let left = Number.POSITIVE_INFINITY;
  let right = 0;
  let bottom = 0;
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  return {
    rows,
    left,
    width: Math.max(160, right - left),
    top: bottom,
  };
}

export function isEventOptionsMenu(menu: Element): boolean {
  const labels = new Set<string>();
  walkElements(menu, (element) => {
    const label = optionLabel(element);
    if (label) {
      labels.add(label);
    }
  });
  return labels.has("print") && labels.has("duplicate");
}

export function findEventOptionsMenus(root: ParentNode): HTMLElement[] {
  const anchor = findOptionsMenuAnchor(root);
  if (!anchor) {
    return [];
  }
  const menu = anchor.rows[0]?.closest('[role="menu"], [role="listbox"]');
  if (menu instanceof HTMLElement) {
    return [menu];
  }
  const parent = anchor.rows[0]?.parentElement;
  return parent ? [parent] : [];
}

export function hideMenuLabel(
  store: HiddenEventStore,
  record: HiddenEventRecord | null,
): "Hide event" | "Unhide event" {
  if (record && isEventHidden(store, record)) {
    return "Unhide event";
  }
  return "Hide event";
}

/** A row painted on top of the open ⋮ menu, not inside Calendar's menu tree. */
export function anchorHideEventRow(doc: Document, label: string): HTMLElement | null {
  const anchor = findOptionsMenuAnchor(doc);
  const existing = doc.getElementById(HIDE_EVENT_ROW_ID);
  if (!anchor) {
    existing?.remove();
    return null;
  }

  let row: HTMLButtonElement;
  if (existing instanceof HTMLButtonElement) {
    row = existing;
  } else {
    existing?.remove();
    row = doc.createElement("button");
    row.type = "button";
    row.id = HIDE_EVENT_ROW_ID;
    row.className = "gcet-hide-event-row";
    row.setAttribute("data-gcet-action", HIDE_EVENT_ACTION);
    row.setAttribute("role", "menuitem");
    doc.body.appendChild(row);
  }

  row.textContent = label;
  row.setAttribute("aria-label", label);
  row.style.left = `${anchor.left}px`;
  row.style.top = `${anchor.top}px`;
  row.style.width = `${anchor.width}px`;
  return row;
}

export function findMyCalendarsHeader(root: ParentNode): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestSize = Number.POSITIVE_INFINITY;
  for (const node of root.querySelectorAll("span, div, h1, h2, h3, p")) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node.closest(`#${SHOW_HIDDEN_ID}`)) {
      continue;
    }
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text !== "My calendars") {
      continue;
    }
    const size = node.querySelectorAll("*").length;
    if (size < bestSize) {
      best = node;
      bestSize = size;
    }
  }
  return best;
}

function parentHasOutsideMarker(parent: HTMLElement, current: HTMLElement): boolean {
  const outside = (parent.textContent ?? "").replace(current.textContent ?? "", "");
  if (FOREIGN_SECTION_MARKERS.some((marker) => outside.includes(marker))) {
    return true;
  }
  return Array.from(parent.querySelectorAll("[data-eventid]")).some(
    (chip) => !current.contains(chip),
  );
}

export function findMyCalendarsSection(header: HTMLElement): HTMLElement {
  let node = header;
  while (node.parentElement) {
    const parent = node.parentElement;
    if (parent === document.body || parent === document.documentElement) {
      break;
    }
    if (parentHasOutsideMarker(parent, node)) {
      return node;
    }
    node = parent;
  }
  return node;
}

export function findShowHiddenMountPoint(
  root: ParentNode,
): { parent: HTMLElement; before: Node | null } | null {
  const header = findMyCalendarsHeader(root);
  if (!header) {
    return null;
  }
  const section = findMyCalendarsSection(header);
  const headerRow =
    header.parentElement &&
    section.contains(header.parentElement) &&
    header.parentElement !== section
      ? header.parentElement
      : header;

  if (headerRow.parentElement === section) {
    const list = headerRow.nextElementSibling;
    if (list instanceof HTMLElement) {
      return { parent: list, before: list.firstElementChild };
    }
    return { parent: section, before: null };
  }

  if (section.parentElement) {
    return { parent: section.parentElement, before: section };
  }
  return null;
}

export function applyHiddenFlags(root: ParentNode, store: HiddenEventStore): void {
  const chips = Array.from(root.querySelectorAll("[data-eventid]")).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && isCalendarChip(element),
  );
  for (const chip of chips) {
    const hidden = store.events.some((record) => chipMatches(chip, record));
    if (hidden) {
      chip.setAttribute("data-gcet-hidden", "true");
    } else {
      chip.removeAttribute("data-gcet-hidden");
    }
  }
}

function cardFromControl(control: HTMLElement): HTMLElement | null {
  const dialog = control.closest('[role="dialog"]');
  if (dialog instanceof HTMLElement) {
    return dialog;
  }
  let node: HTMLElement | null = control.parentElement;
  for (let depth = 0; depth < 8 && node; depth += 1) {
    const hasHeading = node.querySelector('[role="heading"], h1, h2, h3');
    const hasClose = node.querySelector('[aria-label="Close"]');
    if (hasHeading && hasClose) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** The event card that owns the options menu the user just used. */
export function findCardForHideTarget(target: Element, root: ParentNode): HTMLElement | null {
  const menu = target.closest('[role="menu"], [role="listbox"]');
  const menuId = menu?.id;
  if (menuId) {
    const owner = Array.from(root.querySelectorAll("[aria-controls]")).find(
      (element) => element.getAttribute("aria-controls") === menuId,
    );
    if (owner instanceof HTMLElement) {
      const card = cardFromControl(owner);
      if (card) {
        return card;
      }
    }
  }
  return findOpenEventCard(root);
}

export function hiddenMenuRecord(
  root: ParentNode,
  lastChip: HTMLElement | null,
  target?: Element | null,
): HiddenEventRecord | null {
  const card =
    (target ? findCardForHideTarget(target, root) : null) ?? findOpenEventCard(root);
  const chip = resolveActiveChip(root, card, lastChip);
  return buildHiddenRecord({ chip, card, now: 0 });
}

export function syncHiddenCalendarUi(
  doc: Document,
  store: HiddenEventStore,
  lastChip: HTMLElement | null,
): void {
  doc.documentElement.setAttribute(
    "data-gcet-show-hidden",
    store.showHidden ? "true" : "false",
  );
  applyHiddenFlags(doc, store);
  const record = hiddenMenuRecord(doc, lastChip);
  const label = hideMenuLabel(store, record);
  anchorHideEventRow(doc, label);
}

export function rememberChipTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const chip = target.closest("[data-eventid]");
  if (!(chip instanceof HTMLElement) || !isCalendarChip(chip)) {
    return null;
  }
  return chip;
}

export function dismissEventPopover(doc: Document, card: HTMLElement | null): void {
  const close = card?.querySelector('[aria-label="Close"]');
  if (close instanceof HTMLElement) {
    close.click();
  }
  doc.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

export function nextStoreAfterHideAction(
  store: HiddenEventStore,
  record: HiddenEventRecord,
): HiddenEventStore {
  return isEventHidden(store, record) ? unhideEvent(store, record) : hideEvent(store, record);
}
