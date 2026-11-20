"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDashboardProfile } from "@/lib/auth";
import { isLanguage } from "@/lib/conversations";
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
