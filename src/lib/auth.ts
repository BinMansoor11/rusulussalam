import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

type Profile = { public_id: string; role: "visitor" | "volunteer" | "admin" };

function isProfile(value: unknown): value is Profile {
  return typeof value === "object" && value !== null &&
    "public_id" in value && typeof value.public_id === "string" &&
    "role" in value && (value.role === "visitor" || value.role === "volunteer" || value.role === "admin");
}

export const isSignedIn = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims.sub);
});

export async function redirectIfSignedIn() {
  if (await isSignedIn()) redirect("/dashboard");
}

export async function getDashboardProfile(client?: Awaited<ReturnType<typeof createClient>>) {
  const supabase = client ?? await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) redirect("/login");

  const { data: profile, error } = await supabase.rpc("get_my_profile");
  return !error && isProfile(profile) ? profile : null;
}
