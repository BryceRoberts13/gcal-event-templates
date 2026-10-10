export type GcalColorId =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11";

export interface EventTemplate {
  id: string;
  name: string;
  keywords?: string[];
  description?: string;
  location?: string;
  colorId?: GcalColorId;
  updatedAt: number;
}

export interface TemplateStore {
  schemaVersion: 1;
  templates: EventTemplate[];
}

export const EMPTY_STORE: TemplateStore = {
  schemaVersion: 1,
  templates: [],
};

export const DEFAULT_TEMPLATES: EventTemplate[] = [
  {
    id: "default-focus",
    name: "Focus block",
    keywords: ["deep work", "study"],
    description: "No meetings — heads-down work.",
    colorId: "9",
    updatedAt: 0,
  },
  {
    id: "default-gym",
    name: "Gym",
    keywords: ["workout", "lift"],
    location: "Z Center",
    colorId: "10",
    updatedAt: 0,
  },
  {
    id: "default-1on1",
    name: "1:1",
    keywords: ["meeting", "catch up"],
    description: "Notes:\n- \n- ",
    colorId: "7",
    updatedAt: 0,
  },
  {
    id: "default-family",
    name: "See family",
    keywords: ["g", "dad", "parents"],
    description: "Catch up / hangout.",
    colorId: "4",
    updatedAt: 0,
  },
];

export interface HiddenEventRecord {
  /** Google Calendar `data-eventid` when the chip exposes one. */
  eventId: string | null;
  /** Lowercased event title. */
  title: string;
  /** Lowercased date/time line from the event card. */
  when: string;
  /** Lowercased calendar name from the event card. */
  calendar: string;
  /** Lowercased chip aria-label captured when the event was hidden. */
  ariaLabel: string;
  hiddenAt: number;
}

export interface HiddenEventStore {
  schemaVersion: 1;
  /** When true, hidden events stay on the grid, dimmed, so they can be unhidden. */
  showHidden: boolean;
  events: HiddenEventRecord[];
}
