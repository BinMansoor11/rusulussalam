"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDashboardProfile } from "@/lib/auth";
import { isConversationId, isLanguage, parseConversation } from "@/lib/conversations";
import { rememberLanguage } from "@/lib/language-preference";
import { rememberSiteLanguage } from "@/app/ui/locale";
import { createClient } from "@/lib/supabase/server";
import { parseVolunteerSettings, supportedLanguages } from "@/lib/volunteer";

async function volunteerContext() {
  const client = await createClient("mutation");
  const profile = await getDashboardProfile(client);
  if (profile?.role !== "volunteer") redirect("/dashboard");
  return { client, profile };
}

export async function setVolunteerLanguage(form: FormData) {
  const { profile } = await volunteerContext();
  const language = form.get("interfaceLanguage");
  if (isLanguage(language)) {
    await rememberLanguage(profile.public_id, language);
    await rememberSiteLanguage(language);
  }
  redirect("/dashboard");
}

export async function saveVolunteerSettings(form: FormData) {
  const { client } = await volunteerContext();
  const availability = form.get("availability");
  const languages = form.getAll("supportedLanguages");
  if ((availability !== "on" && availability !== null) || !supportedLanguages(languages)) {
    redirect("/dashboard?notice=volunteer-invalid-settings");
  }

  const { data, error } = await client.rpc("update_volunteer_settings", {
    p_is_available: availability === "on",
    p_supported_languages: languages,
  });
  revalidatePath("/dashboard");
  if (error || !parseVolunteerSettings(data)) redirect("/dashboard?notice=volunteer-save-failed");
  redirect("/dashboard?notice=volunteer-saved");
}

export async function claimConversation(form: FormData) {
  const { client, profile } = await volunteerContext();
  const id = form.get("conversationId");
  if (!isConversationId(id)) redirect("/dashboard?notice=claim-failed");

  const { data, error } = await client.rpc("claim_conversation", { p_conversation_id: id });
  const conversation = error ? null : parseConversation(data);
  revalidatePath("/dashboard");
  if (conversation?.status === "active" && conversation.id === id.toLowerCase() &&
    conversation.volunteerPublicId === profile.public_id) {
    revalidatePath(`/dashboard/conversations/${conversation.id}`);
    redirect(`/dashboard/conversations/${conversation.id}`);
  }

  if (error?.code === "P0001") {
    if (error.message === "Volunteer capacity reached") redirect("/dashboard?notice=claim-capacity");
    if (error.message === "Conversation unavailable" || error.message === "Volunteer is unavailable") {
      redirect("/dashboard?notice=claim-unavailable");
    }
  }
  redirect("/dashboard?notice=claim-failed");
}
