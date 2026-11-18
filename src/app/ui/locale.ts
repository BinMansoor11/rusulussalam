import { cookies } from "next/headers";
import type { Language } from "@/lib/conversations";
import { secureCookies } from "@/lib/supabase/server";

export async function getSiteLanguage(fallback: Language = "en"): Promise<Language> {
  const value = (await cookies()).get("hc_site_language")?.value;
  return value === "en" || value === "ur" ? value : fallback;
}

export async function rememberSiteLanguage(language: Language) {
  (await cookies()).set("hc_site_language", language, {
    path: "/", sameSite: "lax", httpOnly: true, secure: secureCookies(), maxAge: 31536000,
  });
}
