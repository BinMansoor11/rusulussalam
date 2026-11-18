import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDashboardProfile } from "@/lib/auth";
import { isConversationId, parseConversation } from "@/lib/conversations";
import { preferredLanguage } from "@/lib/language-preference";
import { createClient } from "@/lib/supabase/server";
import { getSiteLanguage } from "@/app/ui/locale";
import { Chat } from "../chat";
import { ConversationStatus } from "../conversation-status";
import { conversationCopy } from "../copy";
import { StatusRefresh } from "../status-refresh";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params, searchParams }: PageProps<"/dashboard/conversations/[id]">) {
  const client = await createClient();
  const profile = await getDashboardProfile(client);
  if (profile?.role !== "visitor" && profile?.role !== "volunteer") redirect("/dashboard");

  const { id } = await params;
  if (!isConversationId(id)) notFound();
  const { data, error } = await client.rpc("get_conversation", { p_conversation_id: id });
  if (!error && data === null) notFound();
  const conversation = error ? null : parseConversation(data);
  const volunteerLanguage = profile.role === "volunteer"
    ? await getSiteLanguage(await preferredLanguage(profile.public_id)) : undefined;
  if (conversation && volunteerLanguage && conversation.volunteerPublicId !== profile.public_id) notFound();
  const { notice } = await searchParams;
  const locale = volunteerLanguage ?? await getSiteLanguage(conversation?.language);
  const copy = conversationCopy[locale];

  return (
    <main lang={locale} dir={locale === "ur" ? "rtl" : "ltr"}
      className="workspace">
      <Link href="/dashboard" className="button-secondary gap-2">
        <span aria-hidden="true" className="rtl:rotate-180">←</span>{copy.back}
      </Link>
      {conversation ? (
        <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
          <ConversationStatus conversation={conversation} details volunteerLanguage={volunteerLanguage}
            interfaceLanguage={locale} ownPublicId={profile.public_id} endFailed={notice === "end-failed"} />
          <Chat key={`${conversation.id}:${profile.public_id}`} id={conversation.id}
            initialStatus={conversation.status} role={profile.role} publicId={profile.public_id}
            locale={locale} assigned={conversation.volunteerPublicId !== null} />
        </div>
      ) : (
        <section className="panel">
          <h1 className="text-xl font-semibold text-brand">{copy.title}</h1>
          <p className="mt-3 text-sm text-red-900" role="alert">{copy.loadFailed}</p>
          <StatusRefresh label={copy.refresh} pendingLabel={copy.refreshing} />
        </section>
      )}
    </main>
  );
}
