import type { EventTemplate } from "../types";

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function findMatchingTemplate(
  title: string,
  templates: EventTemplate[],
): EventTemplate | null {
  const needle = normalizeName(title);
  if (!needle) {
    return null;
  }

  let best: EventTemplate | null = null;
  for (const template of templates) {
    if (normalizeName(template.name) !== needle) {
      continue;
    }
    if (!best || template.updatedAt > best.updatedAt) {
      best = template;
    }
  }
  return best;
}
