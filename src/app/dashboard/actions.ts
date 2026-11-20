"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDashboardProfile } from "@/lib/auth";
import { getVisitorConversation, isConversationId, isOpen, parseConversation } from "@/lib/conversations";
import { isConversationLanguage } from "@/lib/conversation-language";
import { createClient } from "@/lib/supabase/server";

async function visitorContext() {
  const client = await createClient("mutation");
  const profile = await getDashboardProfile(client);
  if (profile?.role !== "visitor") redirect("/dashboard");
  return { client, profile };
}

export async function saveLanguage(form: FormData) {
  const { client } = await visitorContext();
  const language = form.get("language");
  if (!isConversationLanguage(language)) redirect("/dashboard?notice=invalid-language");
  const { error } = await client.rpc("set_initial_conversation_language", { p_language: language });
  if (error) redirect("/dashboard?notice=invalid-language");
  redirect("/dashboard?notice=language-saved");
}

export async function startConversation() {
  const { client } = await visitorContext();
  const { data, error } = await client.rpc("request_conversation");
  const created = error ? null : parseConversation(data);
  if (created) {
    revalidatePath("/dashboard");
    redirect(`/dashboard/conversations/${created.id}`);
  }

  // The RPC arbitrates concurrent requests. Recover its open conversation on retry.
  const { conversation } = await getVisitorConversation(client);
  if (conversation && isOpen(conversation)) {
    revalidatePath("/dashboard");
    redirect(`/dashboard/conversations/${conversation.id}`);
  }
  redirect("/dashboard?notice=request-failed");
}

export async function endConversation(form: FormData) {
  const client = await createClient("mutation");
  const profile = await getDashboardProfile(client);
  if (profile?.role !== "visitor" && profile?.role !== "volunteer") redirect("/dashboard");
  const id = form.get("conversationId");
  if (!isConversationId(id)) redirect("/dashboard?notice=end-failed");

  const { data, error } = await client.rpc("end_conversation", { p_conversation_id: id });
  const conversation = error ? null : parseConversation(data);
  if (!conversation || conversation.id !== id.toLowerCase() || isOpen(conversation)) {
    redirect(`/dashboard/conversations/${id}?notice=end-failed`);
  }
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/conversations/${id}`);
  redirect(`/dashboard/conversations/${id}`);
}
