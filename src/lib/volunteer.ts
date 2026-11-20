import { isConversationLanguage, type ConversationLanguage } from "./conversation-language";

export function supportedLanguages(values: unknown[]): values is ConversationLanguage[] {
  return values.length > 0 && values.length <= 2 &&
    values.every(isConversationLanguage) && new Set(values).size === values.length;
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
