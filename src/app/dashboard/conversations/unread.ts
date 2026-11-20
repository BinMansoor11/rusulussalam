import { isConversationId, type Language, type UserClient } from "@/lib/conversations";

export async function getUnreadCounts(client: UserClient) {
  const { data, error } = await client.rpc("get_unread_conversation_counts");
  const counts = new Map<string, number>();
  if (!error && Array.isArray(data)) {
    for (const row of data) {
      if (isConversationId(row?.conversation_id) && Number.isSafeInteger(row.unread_count) && row.unread_count > 0) {
        counts.set(row.conversation_id, row.unread_count);
      }
    }
  }
  return counts;
}

export function unreadLabel(count: number, language: Language) {
  if (language === "ur") return count === 1 ? "نیا پیغام" : `${count} نئے پیغامات`;
  return count === 1 ? "New message" : `${count} unread`;
}
