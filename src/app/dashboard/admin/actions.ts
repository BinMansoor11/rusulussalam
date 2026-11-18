"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getDashboardProfile } from "@/lib/auth";
import { isConversationId, isLanguage } from "@/lib/conversations";
import { rememberLanguage } from "@/lib/language-preference";
import { rememberSiteLanguage } from "@/app/ui/locale";
import { createClient } from "@/lib/supabase/server";
import { supportedLanguages } from "@/lib/volunteer";
import { isReviewStatus } from "./reports";

const path = "/dashboard/admin";

async function administrator() {
  const client = await createClient("mutation");
  const profile = await getDashboardProfile(client);
  if (profile?.role !== "admin") notFound();
  return { client, profile };
}

export async function setAdminLanguage(form: FormData) {
  const { profile } = await administrator();
  const language = form.get("interfaceLanguage");
  if (isLanguage(language)) {
    await rememberLanguage(profile.public_id, language);
    await rememberSiteLanguage(language);
  }
  redirect(path);
}

export async function reviewReport(form: FormData) {
  const { client } = await administrator();
  const id = form.get("reportId");
  const status = form.get("status");
  const notes = form.get("adminNotes");
  if (!isConversationId(id)) redirect(`${path}?notice=review-invalid`);
  const focus = `&report=${id.toLowerCase()}#report-${id.toLowerCase()}`;
  if (!isReviewStatus(status) || typeof notes !== "string" || Array.from(notes).length > 2000 ||
    form.get("confirmReview") !== "on") redirect(`${path}?notice=review-invalid${focus}`);

  const { error } = await client.rpc("admin_review_report", {
    p_report_id: id, p_status: status, p_admin_notes: notes.trim() ? notes : null,
  }).retry(false);
  revalidatePath(path);
  redirect(`${path}?notice=${error ? "review-failed" : "reviewed"}${focus}`);
}

export async function promoteVolunteer(form: FormData) {
  const { client } = await administrator();
  const id = form.get("publicId");
  const confirmId = form.get("confirmId");
  const languages = form.getAll("supportedLanguages");
  const target = typeof id === "string" ? id.trim().toUpperCase() : "";
  if (!/^VIS-[0-9A-F]{12}$/.test(target) || typeof confirmId !== "string" ||
    confirmId.trim().toUpperCase() !== target || form.get("verified") !== "on" ||
    !supportedLanguages(languages)) redirect(`${path}?notice=promotion-invalid#approval`);

  const { data, error } = await client.rpc("admin_promote_volunteer", {
    p_public_id: target, p_languages: languages,
  }).retry(false);
  if (error?.code === "P0001" && error.message === "Visitor has an open conversation") {
    redirect(`${path}?notice=promotion-open#approval`);
  }
  if (error || typeof data !== "string" || !/^VOL-[0-9A-F]{12}$/.test(data)) {
    redirect(`${path}?notice=promotion-failed#approval`);
  }
  revalidatePath("/dashboard");
  redirect(`${path}?notice=promoted#approval`);
}
