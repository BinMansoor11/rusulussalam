import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

export function secureCookies() {
  const site = process.env.AUTH_SITE_URL;
  if (site && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(site)) {
    return false;
  }
  return process.env.NODE_ENV === "production" || site?.startsWith("https://") === true;
}

export async function createClient(context: "render" | "mutation" = "render") {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig();

  return createServerClient(url, key, {
    cookieOptions: { sameSite: "lax", secure: secureCookies() },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        // The proxy handles session refreshes on Server Component requests.
        if (context === "render") return;
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
