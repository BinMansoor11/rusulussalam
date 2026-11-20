"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getDashboardProfile } from "@/lib/auth";
import { isConversationId, isLanguage } from "@/lib/conversations";
import { rememberLanguage } from "@/lib/language-preference";
import { rememberSiteLanguage } from "@/app/ui/locale";
import { createClient } from "@/lib/supabase/server";
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

function finishAssignment(failed: boolean): never {
  revalidatePath(path);
  redirect(`${path}?notice=${failed ? "assignment-failed" : "assignment-saved"}#assignments`);
}

export async function reviewVolunteer(form: FormData) {
  const { client } = await administrator();
  const id = form.get("userId");
  const status = form.get("status");
  if (!isConversationId(id) || (status !== "approved" && status !== "rejected" && status !== "pending")) finishAssignment(true);
  const { error } = await client.rpc("admin_review_volunteer", { p_id: id, p_status: status }).retry(false);
  finishAssignment(Boolean(error));
}

export async function assignConversation(form: FormData) {
  const { client } = await administrator();
  const id = form.get("conversationId");
  const volunteerId = form.get("volunteerId");
  if (!isConversationId(id) || !isConversationId(volunteerId)) finishAssignment(true);
  const { error } = await client.rpc("admin_assign_conversation", { p_conversation_id: id, p_volunteer_id: volunteerId }).retry(false);
  finishAssignment(Boolean(error));
}

export async function removeParticipant(form: FormData) {
  const { client } = await administrator();
  const id = form.get("conversationId");
  const role = form.get("role");
  if (!isConversationId(id) || (role !== "visitor" && role !== "volunteer")) finishAssignment(true);
  const { error } = await client.rpc("admin_remove_participant", { p_conversation_id: id, p_role: role }).retry(false);
  finishAssignment(Boolean(error));
}
