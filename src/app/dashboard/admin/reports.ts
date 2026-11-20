import { isConversationLanguage, type ConversationLanguage } from "@/lib/conversation-language";
import { isConversationId } from "@/lib/conversations";

export const reviewStatuses = ["reviewed", "escalated", "dismissed"] as const;
export type ReviewStatus = typeof reviewStatuses[number];
export type ReportStatus = "pending" | ReviewStatus;
const reasons = ["harassment", "crisis_emergency", "inappropriate", "other"] as const;

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return reviewStatuses.some(status => status === value);
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

export type Report = {
  id: string;
  language: ConversationLanguage;
  reporterRole: "visitor" | "volunteer";
  reporter: string;
  reported: string | null;
  reason: typeof reasons[number];
  notes: string | null;
  status: ReportStatus;
  adminNotes: string | null;
  created: string;
  reviewed: string | null;
};

function parseReport(value: unknown): Report | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const reason = reasons.find(reason => reason === row.reason);
  const isPublicId = (value: unknown): value is string =>
    typeof value === "string" && /^(VIS|VOL)-[0-9A-F]{12}$/.test(value);
  if (!isConversationId(row.id) || !isConversationLanguage(row.language) || !reason ||
    (row.reporter_role !== "visitor" && row.reporter_role !== "volunteer") ||
    !isPublicId(row.reporter_public_id) || (row.reported_public_id !== null && !isPublicId(row.reported_public_id)) ||
    (row.notes !== null && typeof row.notes !== "string") ||
    (row.status !== "pending" && !isReviewStatus(row.status)) ||
    (row.admin_notes !== null && typeof row.admin_notes !== "string") ||
    !isTimestamp(row.created_at) || (row.reviewed_at !== null && !isTimestamp(row.reviewed_at))) return null;

  return {
    id: row.id, language: row.language, reason, reporterRole: row.reporter_role,
    reporter: row.reporter_public_id, reported: row.reported_public_id,
    notes: row.notes, status: row.status, adminNotes: row.admin_notes,
    created: row.created_at, reviewed: row.reviewed_at,
  };
}

export function parseReports(value: unknown): Report[] | null {
  if (!Array.isArray(value)) return null;
  const reports: Report[] = [];
  for (const row of value) {
    const report = parseReport(row);
    if (!report) return null;
    reports.push(report);
  }
  return reports;
}
