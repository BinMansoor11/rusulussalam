import { cookies } from "next/headers";
import type { Language } from "./conversations";
import { secureCookies } from "@/lib/supabase/server";

export async function preferredLanguage(publicId?: string, fallback: Language = "en"): Promise<Language> {
  const preference = (await cookies()).get("hc_language")?.value;
  if (publicId && preference === `${publicId}:ur`) return "ur";
  if (publicId && preference === `${publicId}:en`) return "en";
  return fallback;
}

export async function rememberLanguage(publicId: string, language: Language) {
  (await cookies()).set("hc_language", `${publicId}:${language}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    maxAge: 60 * 60 * 24 * 365,
  });
}
