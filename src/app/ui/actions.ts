"use server";

import { isLanguage } from "@/lib/conversations";
import { rememberSiteLanguage } from "./locale";

export async function setSiteLanguage(form: FormData) {
  const language = form.get("siteLanguage");
  if (isLanguage(language)) await rememberSiteLanguage(language);
}
