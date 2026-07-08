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
