import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { getDashboardProfile } from "@/lib/auth";
import { isConversationId } from "@/lib/conversations";
import { preferredLanguage } from "@/lib/language-preference";
import { createClient } from "@/lib/supabase/server";
import { Confirmation, EmptyState, Notice, PageHeading, StatusPill } from "@/app/ui/primitives";
import { getSiteLanguage } from "@/app/ui/locale";
import { chatCopy } from "../conversations/chat-copy";
import { languageNames } from "../conversations/copy";
import { SubmitButton } from "../submit-button";
import { promoteVolunteer, reviewReport, setAdminLanguage } from "./actions";
import { adminCopy } from "./copy";
import { isReviewStatus, isTimestamp, parseReports, reviewStatuses } from "./reports";

export const metadata: Metadata = { title: "Administrator dashboard" };
const PAGE_SIZE = 20;
const path = "/dashboard/admin";

export default async function AdminDashboard({ searchParams }: PageProps<"/dashboard/admin">) {
  const client = await createClient();
  const profile = await getDashboardProfile(client);
  if (profile?.role !== "admin") notFound();
  const language = await getSiteLanguage(await preferredLanguage(profile.public_id));
  const copy = adminCopy[language];
  const { status, before, beforeId, notice, report: focused } = await searchParams;
  const filter = status === "pending" || isReviewStatus(status) ? status : undefined;
  const cursor = isTimestamp(before) && isConversationId(beforeId) ? { p_before: before, p_before_id: beforeId } : {};
  const { data, error } = await client.rpc("admin_list_reports", {
    p_status: filter, p_limit: PAGE_SIZE + 1, ...cursor,
  });
  const reports = error ? null : parseReports(data);
  const page = reports?.slice(0, PAGE_SIZE);
  const last = page?.at(-1);
  const dateFormat = new Intl.DateTimeFormat(language === "ur" ? "ur-PK" : "en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  });
  const newest = filter ? `${path}?status=${filter}` : path;
  const older = reports && reports.length > PAGE_SIZE && last &&
    `${path}?${new URLSearchParams({ ...(filter && { status: filter }), before: last.created, beforeId: last.id })}`;
  const reviewError = notice === "review-invalid" ? copy.reviewInvalid : notice === "review-failed" ? copy.reviewFailed : null;
  const focusedVisible = page?.some(report => report.id === focused);
  const promotionError = notice === "promotion-invalid" ? copy.promotionInvalid :
    notice === "promotion-open" ? copy.promotionOpen : notice === "promotion-failed" ? copy.promotionFailed : null;

  return (
    <main lang={language} dir={language === "ur" ? "rtl" : "ltr"}
      className="workspace">
      <PageHeading title={copy.title} description={
        <span className="flex flex-wrap items-center gap-2">{copy.publicId} <bdi className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-foreground">{profile.public_id}</bdi></span>
      } actions={
        <div className="flex flex-wrap items-end gap-3">
          <form action={setAdminLanguage} className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">
              {copy.locale}
              <select key={language} name="interfaceLanguage" defaultValue={language} className="field">
                <option value="en" lang="en">English</option>
                <option value="ur" lang="ur">اردو</option>
              </select>
            </label>
            <SubmitButton label={copy.apply} pendingLabel={copy.saving} className="button-secondary" />
          </form>
          <form action={logout}>
            <SubmitButton label={copy.signOut} pendingLabel={copy.signingOut} className="button-secondary" />
          </form>
        </div>
      } />
      {notice === "signout-failed" && <Notice error>{copy.signOutFailed}</Notice>}

      <section className="panel" aria-labelledby="reports-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="display-heading text-2xl text-brand sm:text-3xl" id="reports-heading">{copy.reports}</h2>
          <form action={path} className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium">
              {copy.filter}
              <select key={filter ?? "all"} name="status" defaultValue={filter ?? ""} className="field">
                <option value="">{copy.all}</option>
                {(["pending", ...reviewStatuses] as const).map(status =>
                  <option key={status} value={status}>{copy.status[status]}</option>)}
              </select>
            </label>
            <button type="submit" className="button-secondary">{copy.apply}</button>
          </form>
        </div>
        {!focusedVisible && notice === "reviewed" && <Notice className="mt-3">{copy.reviewed}</Notice>}
        {!focusedVisible && reviewError && <Notice className="mt-3" error>{reviewError}</Notice>}
        {!page ? (
          <p role="alert" className="mt-4 text-sm text-red-900">
            {copy.error} <Link href={newest} className="text-link">{copy.newest}</Link>
          </p>
        ) : page.length === 0 ? <EmptyState>{copy.empty}</EmptyState> : (
          <ul className="inset-list mt-4 space-y-3">
            {page.map(report => (
              <li key={report.id} id={`report-${report.id}`} className="py-3">
                <details open={report.id === focused || undefined}>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand">
                    <span>{chatCopy[language].reasons[report.reason]}</span>{" "}
                    <StatusPill tone={report.status === "escalated" ? "danger" : report.status === "reviewed" ? "positive" : report.status === "pending" ? "attention" : undefined}>{copy.status[report.status]}</StatusPill>
                    <span className="mx-2 font-normal text-muted">
                      <time dateTime={report.created}>{dateFormat.format(new Date(report.created))} UTC</time>
                    </span>
                  </summary>
                  {report.id === focused && notice === "reviewed" && <p role="status" className="mt-3 text-sm text-brand">{copy.reviewed}</p>}
                  {report.id === focused && reviewError && <p role="alert" className="mt-3 text-sm text-red-900">{reviewError}</p>}
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div className="min-w-0 space-y-3">
                      <h3 className="font-semibold">{copy.details}</h3>
                      <dl className="space-y-2 text-sm">
                        <div>
                          <dt className="text-muted">{copy.reporter}</dt>
                          <dd><bdi className="font-mono">{report.reporter}</bdi> · {copy.role[report.reporterRole]}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">{copy.reported}</dt>
                          <dd>{report.reported ? <bdi className="font-mono">{report.reported}</bdi> : copy.missing}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">{copy.submitted}</dt>
                          <dd><time dateTime={report.created}>{dateFormat.format(new Date(report.created))} UTC</time></dd>
                        </div>
                        {report.reviewed && (
                          <div>
                            <dt className="text-muted">{copy.reviewedAt}</dt>
                            <dd><time dateTime={report.reviewed}>{dateFormat.format(new Date(report.reviewed))} UTC</time></dd>
                          </div>
                        )}
                      </dl>
                      <div>
                        <h4 className="text-sm font-semibold">{copy.evidence} · <span lang={report.language}>{languageNames[report.language]}</span></h4>
                        <p dir="auto" className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{report.notes ?? copy.noNotes}</p>
                      </div>
                    </div>
                    <form action={reviewReport} key={`${report.id}:${report.reviewed}`} className="min-w-0 space-y-3">
                      <input type="hidden" name="reportId" value={report.id} />
                      <label className="block text-sm font-medium">
                        {copy.reviewStatus}
                        <select name="status" className="field" required defaultValue={report.status === "pending" ? "" : report.status}>
                          <option value="" disabled>{copy.reviewStatus}</option>
                          {reviewStatuses.map(status => <option key={status} value={status}>{copy.status[status]}</option>)}
                        </select>
                      </label>
                      <label className="block text-sm font-medium">
                        {copy.adminNotes}
                        <textarea className="field resize-y" dir="auto" name="adminNotes" rows={3}
                          defaultValue={report.adminNotes ?? ""} />
                      </label>
                      <Confirmation name="confirmReview">{copy.reviewConfirm}</Confirmation>
                      <SubmitButton label={copy.save} pendingLabel={copy.saving} className="button" />
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        {(Object.keys(cursor).length > 0 || older) && (
          <nav className="mt-3 flex flex-wrap gap-4">
            {Object.keys(cursor).length > 0 && <Link href={newest} className="button-secondary">{copy.newest}</Link>}
            {older && <Link href={older} className="button-secondary" prefetch={false}>{copy.older}</Link>}
          </nav>
        )}
      </section>

      <section className="panel border-s-[#b89b60] sm:border-s-4" id="approval" aria-labelledby="approval-heading">
        <h2 className="display-heading text-2xl text-brand sm:text-3xl" id="approval-heading">{copy.approval}</h2>
        <p className="mt-2 max-w-prose text-sm text-muted">{copy.approvalHelp}</p>
        <form action={promoteVolunteer} className="mt-4 grid max-w-xl gap-3">
          <label className="text-sm font-medium">
            {copy.target}
            <input className="field font-mono" name="publicId" autoComplete="off" dir="ltr" required placeholder="VIS-…" />
          </label>
          <label className="text-sm font-medium">
            {copy.confirmTarget}
            <input className="field font-mono" name="confirmId" autoComplete="off" dir="ltr" required />
          </label>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-2 text-sm font-medium">{copy.languages}</legend>
            {(["en", "ur"] as const).map(option => (
              <label key={option} className="flex min-h-11 items-center gap-2 rounded-control border border-line bg-background px-3 text-sm">
                <input type="checkbox" name="supportedLanguages" value={option} className="size-4 accent-brand" />
                <span lang={option}>{languageNames[option]}</span>
              </label>
            ))}
          </fieldset>
          <Confirmation name="verified">{copy.confirmPromotion}</Confirmation>
          <SubmitButton label={copy.promote} pendingLabel={copy.promoting} className="button w-fit" />
        </form>
        {notice === "promoted" && <Notice className="mt-3">{copy.promoted}</Notice>}
        {promotionError && <Notice className="mt-3" error>{promotionError}</Notice>}
      </section>
    </main>
  );
}
