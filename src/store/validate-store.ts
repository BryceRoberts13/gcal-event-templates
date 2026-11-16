import type { EventTemplate, GcalColorId, TemplateStore } from "../types";

const COLOR_IDS = new Set<GcalColorId>([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
]);

const MAX_JSON_CHARS = 1_000_000;
const MAX_TEMPLATES = 500;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS = 30;
const MAX_DESCRIPTION_LENGTH = 8_000;
const MAX_LOCATION_LENGTH = 500;

export function isGcalColorId(value: string): value is GcalColorId {
  return COLOR_IDS.has(value as GcalColorId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(detail: string): Error {
  return new Error(`Invalid template store JSON: ${detail}`);
}

export function normalizeTemplate(value: unknown, index = 0): EventTemplate {
  if (!isRecord(value)) {
    throw invalid(`template ${index} is not an object`);
  }

  const { id, name, updatedAt } = value;
  if (typeof id !== "string" || id.trim() === "" || id.length > MAX_ID_LENGTH) {
    throw invalid(`template ${index} has a bad id`);
  }
  if (typeof name !== "string" || name.trim() === "" || name.length > MAX_NAME_LENGTH) {
    throw invalid(`template ${index} has a bad name`);
  }
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) {
    throw invalid(`template ${index} has a bad updatedAt`);
  }

  const template: EventTemplate = {
    id,
    name: name.trim(),
    updatedAt,
  };

  if (value.keywords !== undefined) {
    if (
      !Array.isArray(value.keywords) ||
      value.keywords.length > MAX_KEYWORDS ||
      value.keywords.some(
        (keyword) => typeof keyword !== "string" || keyword.length > MAX_KEYWORD_LENGTH,
      )
    ) {
      throw invalid(`template ${index} has bad keywords`);
    }
    const keywords = value.keywords.map((keyword) => keyword.trim()).filter(Boolean);
    if (keywords.length > 0) {
      template.keywords = keywords;
    }
  }

  if (value.description !== undefined) {
    if (typeof value.description !== "string" || value.description.length > MAX_DESCRIPTION_LENGTH) {
      throw invalid(`template ${index} has a bad description`);
    }
    if (value.description.length > 0) {
      template.description = value.description;
    }
  }

  if (value.location !== undefined) {
    if (typeof value.location !== "string" || value.location.length > MAX_LOCATION_LENGTH) {
      throw invalid(`template ${index} has a bad location`);
    }
    if (value.location.length > 0) {
      template.location = value.location;
    }
  }

  if (value.colorId !== undefined && value.colorId !== "") {
    if (typeof value.colorId !== "string" || !isGcalColorId(value.colorId)) {
      throw invalid(`template ${index} has a bad colorId`);
    }
    template.colorId = value.colorId;
  }

  return template;
}

export function assertTemplateStore(value: unknown): TemplateStore {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.templates)) {
    throw new Error("Invalid template store JSON");
  }
  if (value.templates.length > MAX_TEMPLATES) {
    throw invalid(`more than ${MAX_TEMPLATES} templates`);
  }

  const templates = value.templates.map((item, index) => normalizeTemplate(item, index));
  const seen = new Set<string>();
  for (const template of templates) {
    if (seen.has(template.id)) {
      throw invalid(`duplicate id ${template.id}`);
    }
    seen.add(template.id);
  }

  return { schemaVersion: 1, templates };
}

export function parseTemplateStoreJson(raw: string): TemplateStore {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_JSON_CHARS) {
    throw new Error("Invalid template store JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid template store JSON");
  }

  return assertTemplateStore(parsed);
}
