import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Notice, PageHeading } from "@/app/ui/primitives";
import { getSiteLanguage } from "@/app/ui/locale";
import { getDashboardProfile } from "@/lib/auth";
import { conversationLanguages, type ConversationLanguage } from "@/lib/conversation-language";
import { isConversationId } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/server";
import { assignmentCopy } from "../copy";
import type { ReportStatus } from "../reports";

export const metadata: Metadata = { title: "Conversation history" };

const path = "/dashboard/admin/history";
const pageSize = 25;

type History = {
  conversations: {
    id: string;
    visitor_public_id: string;
    volunteer_public_id: string | null;
    language: ConversationLanguage;
    status: "ended" | "flagged";
    admin_removed_role: "visitor" | "volunteer" | null;
    report_status: ReportStatus | null;
    started_at: string | null;
    ended_at: string;
  }[];
  transcript: {
    id: string;
    expired: boolean;
    messages: { id: string; sender_public_id: string; content: string; created_at: string }[];
  } | null;
};

const historyCopy = {
  en: {
    back: "Back to admin dashboard", failed: "Could not load conversation history. Refresh the page to try again.",
    transcript: "Transcript", unavailable: "This conversation is unavailable.", expired: "The transcript has expired.",
    noMessages: "No messages were sent.", past: "Past conversations", empty: "No past conversations on this page.",
    unassigned: "Unassigned", assigned: "Assigned", flagged: "Flagged", ended: "Ended", report: "Report",
    volunteer: "Admin removed the Da’ee", visitor: "Admin removed the Mad’oo", open: "View transcript",
    pages: "History pages", newer: "Newer conversations", older: "Older conversations",
    reportStatuses: { pending: "Pending", reviewed: "Reviewed", dismissed: "Dismissed", escalated: "Escalated" },
  },
  ur: {
    back: "منتظم کے ڈیش بورڈ پر واپس جائیں", failed: "گفتگو کا ریکارڈ نہیں کھل سکا۔ صفحہ تازہ کر کے دوبارہ کوشش کریں۔",
    transcript: "گفتگو کے پیغامات", unavailable: "یہ گفتگو دستیاب نہیں ہے۔", expired: "پیغامات محفوظ رکھنے کی مدت ختم ہو چکی ہے۔",
    noMessages: "کوئی پیغام نہیں بھیجا گیا۔", past: "گزشتہ گفتگو", empty: "اس صفحے پر کوئی گزشتہ گفتگو نہیں ہے۔",
    unassigned: "داعی مقرر نہیں ہوا", assigned: "مقرر ہوا", flagged: "نشان زد", ended: "ختم ہوئی", report: "رپورٹ",
    volunteer: "منتظم نے داعی کو ہٹا دیا", visitor: "منتظم نے مدعو کو ہٹا دیا", open: "پیغامات دیکھیں",
    pages: "ریکارڈ کے صفحات", newer: "نئی گفتگو", older: "پرانی گفتگو",
    reportStatuses: { pending: "زیرِ غور", reviewed: "جائزہ مکمل", dismissed: "خارج", escalated: "آگے بھیجی گئی" },
  },
};

export default async function ConversationHistory({ searchParams }: PageProps<"/dashboard/admin/history">) {
  const client = await createClient();
  const profile = await getDashboardProfile(client);
  if (profile?.role !== "admin") notFound();
  const language = await getSiteLanguage();
  const copy = historyCopy[language];
  const timeFormat = new Intl.DateTimeFormat(language === "ur" ? "ur-PK" : "en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  });
  const time = (value: string) => <time dateTime={value}>{timeFormat.format(new Date(value))} <bdi>UTC</bdi></time>;
  const { offset, conversation } = await searchParams;
  const start = typeof offset === "string" && /^\d{1,8}$/.test(offset) ? Number(offset) : 0;
  const selected = isConversationId(conversation) ? conversation : undefined;
  const { data, error } = await client.rpc("admin_conversation_history", { p_offset: start, p_conversation_id: selected });
  const history: History | null = error ? null : data;

  return <main className="workspace">
    <PageHeading title={assignmentCopy[language].history} actions={<Link href="/dashboard/admin" className="button-secondary">{copy.back}</Link>} />
    {!history ? <Notice error>{copy.failed}</Notice> : <>
      {selected && <section className="panel" id="transcript">
        <h2 className="display-heading text-2xl text-brand">{copy.transcript}</h2>
        {!history.transcript ? <EmptyState>{copy.unavailable}</EmptyState> :
          history.transcript.expired ? <EmptyState>{copy.expired}</EmptyState> :
          history.transcript.messages.length === 0 ? <EmptyState>{copy.noMessages}</EmptyState> :
          <ol className="inset-list mt-4">
            {history.transcript.messages.map(message => <li key={message.id} className="py-3">
              <p className="text-sm text-muted"><bdi>{message.sender_public_id}</bdi> · {time(message.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap break-words" dir="auto">{message.content}</p>
            </li>)}
          </ol>}
      </section>}
      <section className="panel">
        <h2 className="display-heading text-2xl text-brand">{copy.past}</h2>
        {history.conversations.length === 0 ? <EmptyState>{copy.empty}</EmptyState> :
          <ul className="inset-list mt-4">
            {history.conversations.slice(0, pageSize).map(chat => <li key={chat.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold"><bdi>{chat.visitor_public_id}</bdi> · <bdi>{chat.volunteer_public_id ?? copy.unassigned}</bdi> · {conversationLanguages[chat.language]}</p>
                <p className="text-sm text-muted">{chat.started_at && <>{copy.assigned} {time(chat.started_at)} · </>}
                  {copy[chat.status]} {time(chat.ended_at)}
                  {chat.admin_removed_role && ` · ${copy[chat.admin_removed_role]}`}
                  {chat.report_status && ` · ${copy.report} ${copy.reportStatuses[chat.report_status]}`}
                </p>
              </div>
              <Link className="button-secondary" prefetch={false} href={`${path}?offset=${start}&conversation=${chat.id}#transcript`}>{copy.open}</Link>
            </li>)}
          </ul>}
        {(start > 0 || history.conversations.length > pageSize) && <nav aria-label={copy.pages} className="mt-4 flex gap-3">
          {start > 0 && <Link className="button-secondary" href={`${path}?offset=${Math.max(0, start - pageSize)}`}>{copy.newer}</Link>}
          {history.conversations.length > pageSize && <Link className="button-secondary" href={`${path}?offset=${start + pageSize}`}>{copy.older}</Link>}
        </nav>}
      </section>
    </>}
  </main>;
}
