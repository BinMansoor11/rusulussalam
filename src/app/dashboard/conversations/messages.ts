import { isConversationId, type UserClient } from "@/lib/conversations";

export const MESSAGE_LIMIT = 2000;
export const PAGE_SIZE = 30;
export type Participant = "visitor" | "volunteer";
export type Message = {
  id: string;
  createdAt: string;
  role: Participant;
  publicId: string;
  content: string;
};

export function parseMessage(value: unknown): Message | null {
  if (typeof value !== "object" || value === null ||
    !("id" in value) || !isConversationId(value.id) ||
    !("created_at" in value) || typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    !("sender_role" in value) || (value.sender_role !== "visitor" && value.sender_role !== "volunteer") ||
    !("sender_public_id" in value) || typeof value.sender_public_id !== "string" ||
    !/^(VIS|VOL)-[A-F0-9]{12}$/.test(value.sender_public_id) ||
    !("content" in value) || typeof value.content !== "string") return null;
  return {
    id: value.id, createdAt: value.created_at, role: value.sender_role,
    publicId: value.sender_public_id, content: value.content,
  };
}

function microseconds(value: string) {
  return (value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6);
}

// Postgres orders by full timestamp precision, then by UUID.
export function compareMessages(a: Message, b: Message) {
  const milliseconds = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (milliseconds) return milliseconds;
  const fraction = Number(microseconds(a.createdAt)) - Number(microseconds(b.createdAt));
  return fraction || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function mergeMessages(current: Message[], incoming: Message[]) {
  const rows = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) rows.set(message.id, message);
  return [...rows.values()].sort(compareMessages);
}

export async function fetchMessages(client: UserClient, id: string, signal: AbortSignal, before?: Message) {
  const { data, error } = await client.rpc("get_messages", {
    p_conversation_id: id, p_limit: PAGE_SIZE,
    ...(before && { p_before: before.createdAt, p_before_id: before.id }),
  }).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(12000)]));
  if (error || !Array.isArray(data)) throw new Error("History unavailable");
  const page: Message[] = [];
  for (const row of data) {
    const message = parseMessage(row);
    if (!message) throw new Error("Invalid history response");
    page.push(message);
  }
  return page;
}
