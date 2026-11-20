import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isConversationLanguage, type ConversationLanguage } from "./conversation-language";

type Profile = {
  public_id: string;
  role: "visitor" | "volunteer" | "admin";
  application_status?: "pending" | "approved" | "rejected" | null;
  conversation_language?: ConversationLanguage | null;
};

function isProfile(value: unknown): value is Profile {
  return typeof value === "object" && value !== null &&
    "public_id" in value && typeof value.public_id === "string" &&
    "role" in value && (value.role === "visitor" || value.role === "volunteer" || value.role === "admin") &&
    (!("application_status" in value) || value.application_status === null || value.application_status === "pending" ||
      value.application_status === "approved" || value.application_status === "rejected") &&
    (!("conversation_language" in value) || value.conversation_language === null || isConversationLanguage(value.conversation_language));
}

export function volunteerApplicationStatus(profile: Profile | null) {
  const status = profile?.application_status;
  return profile?.role === "volunteer" && (status === "pending" || status === "rejected") ? status : null;
}

async function readProfile(client: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await client.rpc("get_my_profile");
  return !error && isProfile(data) ? data : null;
}

export const isSignedIn = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims.sub);
});

export async function redirectIfSignedIn() {
  if (await isSignedIn()) redirect(volunteerApplicationStatus(await getSignedInProfile()) ? "/" : "/dashboard");
}

export const getSignedInProfile = cache(async () => {
  if (!(await isSignedIn())) return null;
  return readProfile(await createClient());
});

export async function getDashboardProfile(client?: Awaited<ReturnType<typeof createClient>>) {
  const supabase = client ?? await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) redirect("/login");

  const profile = await readProfile(supabase);
  if (volunteerApplicationStatus(profile)) redirect("/");
  return profile;
}
