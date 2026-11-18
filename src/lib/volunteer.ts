import { isConversationId, isLanguage, type Language } from "./conversations";

export function supportedLanguages(values: unknown[]): values is Language[] {
  return values.length > 0 && values.length <= 2 &&
    values.every(isLanguage) && new Set(values).size === values.length;
}

export function parseVolunteerSettings(value: unknown) {
  if (typeof value !== "object" || value === null ||
    !("is_available" in value) || typeof value.is_available !== "boolean" ||
    !("supported_languages" in value) || !Array.isArray(value.supported_languages) ||
    !supportedLanguages(value.supported_languages)) return null;

  const capacity = "max_active_conversations" in value && typeof value.max_active_conversations === "number" &&
    Number.isInteger(value.max_active_conversations) && value.max_active_conversations >= 1
    ? value.max_active_conversations : null;
  return { available: value.is_available, languages: value.supported_languages, capacity };
}

export function parseQueue(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows: { id: string; language: Language; createdAt: string }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || !isConversationId(item.id) ||
      !isLanguage(item.language) || typeof item.created_at !== "string" ||
      !Number.isFinite(Date.parse(item.created_at))) return null;
    rows.push({ id: item.id, language: item.language, createdAt: item.created_at });
  }
  return rows;
}
