export const conversationLanguages = {
  en: "English",
  ur: "اردو",
  ar: "العربية",
  ps: "پښتو",
  sd: "سنڌي",
} as const;

export type ConversationLanguage = keyof typeof conversationLanguages;

export function isConversationLanguage(value: unknown): value is ConversationLanguage {
  return typeof value === "string" && Object.hasOwn(conversationLanguages, value);
}
