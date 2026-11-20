"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createClient(isSingleton = true) {
  const { url, key } = getSupabaseConfig();
  return createBrowserClient(url, key, { isSingleton });
}
