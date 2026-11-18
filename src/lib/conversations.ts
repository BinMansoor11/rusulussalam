import type { createClient } from "@/lib/supabase/server";

export type UserClient = Awaited<ReturnType<typeof createClient>>;
export type Language = "en" | "ur";
export type Conversation = {
  id: string;
  language: Language;
  status: "waiting" | "active" | "ended" | "flagged";
  visitorPublicId: string;
  volunteerPublicId: string | null;
};

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "ur";
}

export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function parseConversation(value: unknown): Conversation | null {
  if (typeof value !== "object" || value === null ||
    !("id" in value) || !isConversationId(value.id) ||
    !("language" in value) || !isLanguage(value.language) ||
    !("status" in value) || (value.status !== "waiting" && value.status !== "active" &&
      value.status !== "ended" && value.status !== "flagged") ||
    !("visitor_public_id" in value) || typeof value.visitor_public_id !== "string" ||
    !/^VIS-[0-9A-F]{12}$/.test(value.visitor_public_id) ||
    !("volunteer_public_id" in value) ||
    (value.volunteer_public_id !== null && (typeof value.volunteer_public_id !== "string" ||
      !/^VOL-[0-9A-F]{12}$/.test(value.volunteer_public_id)))) return null;

  return {
    id: value.id,
    language: value.language,
    status: value.status,
    visitorPublicId: value.visitor_public_id,
    volunteerPublicId: value.volunteer_public_id,
  };
}

export function isOpen(conversation: Conversation) {
  return conversation.status === "waiting" || conversation.status === "active";
}

export async function getMyConversations(client: UserClient) {
  const { data, error } = await client.rpc("get_my_conversations");
  if (error || !Array.isArray(data)) return null;
  const conversations: Conversation[] = [];
  for (const entry of data) {
    const conversation = parseConversation(entry);
    if (!conversation) return null;
    conversations.push(conversation);
  }
  return conversations;
}

export async function getVisitorConversation(client: UserClient) {
  const conversations = await getMyConversations(client);
  if (!conversations) return { conversation: null, failed: true };
  const open = conversations.find(isOpen);
  return { conversation: open ?? conversations[0] ?? null, failed: false };
}
