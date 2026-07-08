import type { EventTemplate } from "../types";

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

function scoreTemplate(template: EventTemplate, query: string): number {
  if (!query) {
    return 0;
  }

  const name = template.name.toLowerCase();
  const keywords = (template.keywords ?? []).map((k) => k.toLowerCase());

  if (name === query) {
    return 100;
  }
  if (name.startsWith(query)) {
    return 80;
  }
  if (name.includes(query)) {
    return 60;
  }

  for (const keyword of keywords) {
    if (keyword === query) {
      return 70;
    }
    if (keyword.startsWith(query)) {
      return 50;
    }
    if (keyword.includes(query)) {
      return 40;
    }
  }

  return -1;
}

export function searchTemplates(
  templates: EventTemplate[],
  rawQuery: string,
  limit = 12,
): EventTemplate[] {
  const query = normalize(rawQuery);

  if (!query) {
    return [...templates].slice(0, limit);
  }

  return templates
    .map((template) => ({ template, score: scoreTemplate(template, query) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name))
    .slice(0, limit)
    .map(({ template }) => template);
}
