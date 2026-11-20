import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { getMyConversations, type Language, type UserClient } from "@/lib/conversations";
import { parseVolunteerSettings } from "@/lib/volunteer";
import { EmptyState, Notice, PageHeading, StatusPill } from "@/app/ui/primitives";
import { conversationCopy, languageNames } from "../conversations/copy";
import { DashboardMessageRefresh } from "../conversations/dashboard-message-refresh";
import { getUnreadCounts, unreadLabel } from "../conversations/unread";
import { StatusRefresh } from "../conversations/status-refresh";
import { SubmitButton } from "../submit-button";
import { saveVolunteerSettings, setVolunteerLanguage } from "./actions";
import { volunteerCopy } from "./copy";

const languages = ["en", "ur"] as const;

export async function VolunteerDashboard({ client, publicId, language, notice }: {
  client: UserClient;
  publicId: string;
  language: Language;
  notice?: string | string[];
}) {
  const copy = volunteerCopy[language];
  const capacityLabel = language === "ur" ? "فعال گفتگوؤں کی حد" : "Conversation capacity";
  const [settingsResult, conversations, unread] = await Promise.all([
    client.rpc("get_my_volunteer_settings"),
    getMyConversations(client),
    getUnreadCounts(client),
  ]);
  const settings = settingsResult.error ? null : parseVolunteerSettings(settingsResult.data);
  const active = conversations?.filter(chat => chat.status === "active" && chat.volunteerPublicId === publicId);
  return (
    <main lang={language} dir={language === "ur" ? "rtl" : "ltr"}
      className="workspace">
      <DashboardMessageRefresh topics={active?.map(chat => chat.id).sort().join(",") ?? ""} />
      <PageHeading title={copy.title} description={<span className="flex flex-wrap items-center gap-3">
        <bdi className="font-mono text-sm font-semibold text-brand">{publicId}</bdi>
        {settings && <StatusPill tone={settings.available ? "positive" : undefined}>{settings.available ? copy.available : copy.unavailable}</StatusPill>}
      </span>} actions={
        <form action={logout}>
          <SubmitButton label={copy.signOut} pendingLabel={copy.signingOut} className="button-secondary" />
        </form>
      } />
      {notice === "signout-failed" && <Notice error>{copy.signOutFailed}</Notice>}
      <section className="panel flex flex-wrap items-end justify-between gap-5">
        {active && settings?.capacity && <dl>
          <dt className="text-sm font-semibold text-muted">{capacityLabel}</dt>
          <dd className="mt-1 text-xl font-semibold text-brand"><bdi>{active.length} / {settings.capacity}</bdi></dd>
        </dl>}
        <form action={setVolunteerLanguage} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium" htmlFor="interface-language">
            {copy.interfaceLanguage}
            <select key={language} id="interface-language" name="interfaceLanguage" className="field" defaultValue={language}>
              {languages.map(option => <option key={option} value={option} lang={option}>{languageNames[option]}</option>)}
            </select>
          </label>
          <SubmitButton label={copy.changeLanguage} pendingLabel={copy.changingLanguage} className="button-secondary" />
        </form>
      </section>
      <div className="grid items-start gap-5 md:grid-cols-[1fr_1.15fr]">
        <section className="panel">
          <h2 className="display-heading text-2xl text-brand">{copy.settings}</h2>
          {!settings ? <Notice className="mt-3" error>{copy.settingsFailed}</Notice> : (
            <form action={saveVolunteerSettings} key={JSON.stringify(settings)} className="mt-4 space-y-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-sage p-3 text-sm font-semibold">
                <input type="checkbox" role="switch" name="availability" defaultChecked={settings.available} className="size-5 shrink-0 accent-brand" />
                {copy.toggle}
              </label>
              <fieldset>
                <legend className="text-sm font-medium">{copy.languages}</legend>
                {Object.entries(languageNames).map(([option, label]) => (
                  <label key={option} className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-background px-3 text-sm">
                    <input type="checkbox" name="supportedLanguages" value={option}
                      defaultChecked={settings.languages.some(language => language === option)} className="size-5 accent-brand" />
                    <span lang={option}>{label}</span>
                  </label>
                ))}
              </fieldset>
              <SubmitButton label={copy.save} pendingLabel={copy.saving} className="button" />
            </form>
          )}
          {notice === "volunteer-saved" && <Notice className="mt-3">{copy.saved}</Notice>}
          {notice === "volunteer-invalid-settings" && <Notice className="mt-3" error>{copy.invalidSettings}</Notice>}
          {notice === "volunteer-save-failed" && <Notice className="mt-3" error>{copy.saveFailed}</Notice>}
        </section>
        <section className="panel">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="display-heading text-2xl text-brand">{copy.active}</h2>
            {active && <span className="rounded-md bg-background px-2 text-sm" role="status">{active.length}</span>}
          </div>
          {!active ? <Notice className="mt-3" error>{copy.activeFailed}</Notice> :
            active.length === 0 ? <EmptyState>{copy.activeEmpty}</EmptyState> : (
              <ul className="inset-list mt-4 space-y-3">
                {active.map(chat => (
                  <li key={chat.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <bdi className="font-mono">{chat.visitorPublicId}</bdi>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
                        <StatusPill tone="positive">{copy.activeLabel}</StatusPill>
                        <span lang={chat.language}>{languageNames[chat.language]}</span>
                        {unread.has(chat.id) && <span role="status">
                          <StatusPill tone="attention">{unreadLabel(unread.get(chat.id) ?? 0, language)}</StatusPill>
                        </span>}
                      </p>
                    </div>
                    <Link href={`/dashboard/conversations/${chat.id}`} className="button-secondary">{conversationCopy[language].view}</Link>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>
      <StatusRefresh intervalMs={active?.length ? undefined : 20000} label={conversationCopy[language].refresh} pendingLabel={conversationCopy[language].refreshing} />
    </main>
  );
}
