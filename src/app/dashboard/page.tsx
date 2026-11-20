import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { getDashboardProfile } from "@/lib/auth";
import { getVisitorConversation, isOpen } from "@/lib/conversations";
import { conversationLanguages } from "@/lib/conversation-language";
import { preferredLanguage } from "@/lib/language-preference";
import { createClient } from "@/lib/supabase/server";
import { getSiteLanguage } from "../ui/locale";
import { Card, FieldLabel, Notice, PageHeading, StatusPill } from "../ui/primitives";
import { saveLanguage, startConversation } from "./actions";
import { ConversationStatus } from "./conversations/conversation-status";
import { conversationCopy } from "./conversations/copy";
import { StatusRefresh } from "./conversations/status-refresh";
import { SubmitButton } from "./submit-button";
import { VolunteerDashboard } from "./volunteer/dashboard";

export const metadata: Metadata = { title: "Dashboard" };
const dashboardCopy = {
  en: {
    title: "Welcome to Purpose of Life", intro: "When you’re ready, request a private conversation about Islam with a volunteer.",
    profile: "Your conversation identity", id: "Public ID", visitor: "Visitor", signout: "Sign out", signing: "Signing out…",
    failed: "We couldn’t load your profile. Refresh this page or try signing in again.",
    signoutFailed: "We couldn’t sign you out. Try again shortly.",
    privacy: "The person you talk with sees this ID. Your email is used to sign in.",
  },
  ur: {
    title: "مقصدِ زندگی میں خوش آمدید", intro: "جب آپ تیار ہوں، اسلام کے بارے میں کسی رضاکار سے نجی گفتگو کی درخواست کریں۔",
    profile: "گفتگو میں آپ کی شناخت", id: "عوامی شناخت", visitor: "مہمان", signout: "سائن آؤٹ", signing: "سائن آؤٹ ہو رہا ہے…",
    failed: "آپ کا پروفائل نہیں کھل سکا۔ صفحہ تازہ کریں یا دوبارہ سائن اِن کریں۔",
    signoutFailed: "سائن آؤٹ نہیں ہو سکا۔ کچھ دیر بعد دوبارہ کوشش کریں۔",
    privacy: "دوسرا شخص یہ شناخت دیکھتا ہے۔ آپ کی ای میل سائن اِن کے لیے استعمال ہوتی ہے۔",
  },
};

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const client = await createClient();
  const profile = await getDashboardProfile(client);
  const { notice } = await searchParams;
  if (profile?.role === "admin") {
    redirect(notice === "signout-failed" ? "/dashboard/admin?notice=signout-failed" : "/dashboard/admin");
  }
  const language = await preferredLanguage(profile?.public_id, await getSiteLanguage());
  const locale = await getSiteLanguage(language);
  if (profile?.role === "volunteer") {
    return <VolunteerDashboard client={client} publicId={profile.public_id} language={locale} notice={notice} />;
  }
  const copy = conversationCopy[locale];
  const ui = dashboardCopy[locale];
  const visitorState = profile?.role === "visitor" ? await getVisitorConversation(client) : null;

  return (
    <main lang={locale} dir={locale === "ur" ? "rtl" : "ltr"} className="workspace">
      <PageHeading title={ui.title} description={ui.intro} actions={
        <form action={logout}>
          <SubmitButton label={ui.signout} pendingLabel={ui.signing} className="button-secondary" />
        </form>
      } />
      {notice === "signout-failed" && <Notice error>{ui.signoutFailed}</Notice>}
      {!profile ? (
        <Notice error>{ui.failed}</Notice>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0 space-y-5">
            {visitorState ? (
              <>
                {visitorState.conversation && <ConversationStatus conversation={visitorState.conversation} interfaceLanguage={locale} />}
                {visitorState.failed ? (
                  <Card>
                    <Notice error>{copy.loadFailed}</Notice>
                    <StatusRefresh label={copy.refresh} pendingLabel={copy.refreshing} />
                  </Card>
                ) : (!visitorState.conversation || !isOpen(visitorState.conversation)) && (
                  <Card>
                    <h2 className="display-heading text-2xl text-brand sm:text-3xl">{copy.request}</h2>
                    {profile.conversation_language && <p className="mt-2 text-sm text-muted">
                      {copy.language} · {conversationLanguages[profile.conversation_language]}
                    </p>}
                    <form action={profile.conversation_language ? startConversation : saveLanguage} className="mt-5 flex flex-wrap items-end gap-3">
                      {!profile.conversation_language && <>
                      <div className="min-w-0 flex-[1_1_13rem]">
                      <FieldLabel id="language" label={copy.language}>
                        <select id="language" name="language" defaultValue={language} className="field">
                          {Object.entries(conversationLanguages).map(([code, label]) => <option key={code} value={code} lang={code}>{label}</option>)}
                        </select>
                      </FieldLabel>
                      </div>
                      </>}
                      {profile.conversation_language
                        ? <SubmitButton label={copy.request} pendingLabel={copy.requesting} className="button" />
                        : <SubmitButton label={copy.saveLanguage} pendingLabel={copy.saving} className="button" />}
                    </form>
                    {notice === "language-saved" && <Notice className="mt-3">{copy.saved}</Notice>}
                    {notice === "invalid-language" && <Notice className="mt-3" error>{copy.invalidLanguage}</Notice>}
                    {notice === "request-failed" && <Notice className="mt-3" error>{copy.requestFailed}</Notice>}
                    {notice === "end-failed" && <Notice className="mt-3" error>{copy.endFailed}</Notice>}
                  </Card>
                )}
              </>
            ) : null}
          </div>
          <Card className="bg-sage">
            <h2 className="text-lg font-semibold text-brand">{ui.profile}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusPill>{ui.visitor}</StatusPill>
              <dl className="min-w-0">
                <dt className="text-xs text-muted">{ui.id}</dt>
                <dd className="mt-1 break-all font-mono text-sm font-semibold text-brand" dir="ltr">{profile.public_id}</dd>
              </dl>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">{ui.privacy}</p>
          </Card>
        </div>
      )}
    </main>
  );
}
