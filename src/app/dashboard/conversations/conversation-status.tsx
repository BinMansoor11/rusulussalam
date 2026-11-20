import Link from "next/link";
import { isOpen, type Conversation, type Language } from "@/lib/conversations";
import { Notice, StatusPill } from "@/app/ui/primitives";
import { endConversation } from "../actions";
import { SubmitButton } from "../submit-button";
import { conversationCopy, languageNames } from "./copy";
import { StatusRefresh } from "./status-refresh";

export function ConversationStatus({ conversation, details = false, endFailed = false, volunteerLanguage, ownPublicId, interfaceLanguage }: {
  conversation: Conversation;
  details?: boolean;
  endFailed?: boolean;
  volunteerLanguage?: Language;
  ownPublicId?: string;
  interfaceLanguage?: Language;
}) {
  const { id, language, status, volunteerPublicId } = conversation;
  const locale = interfaceLanguage ?? volunteerLanguage ?? (language === "ur" ? "ur" : "en");
  const copy = conversationCopy[locale];
  const participantId = volunteerLanguage ? conversation.visitorPublicId : volunteerPublicId;
  const description = status === "waiting" ? copy.waitingText :
    status === "active" && !details ? (volunteerLanguage ? copy.assigned : copy.activeText) : null;
  const Heading = details ? "h1" : "h2";

  return (
    <section lang={locale} dir={locale === "ur" ? "rtl" : "ltr"} className={`panel ${status === "waiting" ? "bg-sage" : ""}`}>
      <Heading className="display-heading text-2xl text-brand sm:text-3xl">{copy.title}</Heading>
      <div role="status" className="mt-4">
        <StatusPill tone={status === "waiting" ? "attention" : status === "active" ? "positive" : undefined}>{copy[status]}</StatusPill>
        {description && <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      <dl className={`mt-4 gap-x-3 gap-y-3 border-t border-line pt-4 text-sm ${details ? "grid grid-cols-2" : "flex flex-wrap"}`}>
        <div className={details ? "col-span-2" : undefined}>
          <dt className="text-muted">{copy.language}</dt>
          <dd lang={language}>{languageNames[language]}</dd>
        </div>
        {ownPublicId && (
          <div>
            <dt className="text-muted">{copy.yourId}</dt>
            <dd className="font-mono text-xs" dir="ltr">{ownPublicId}</dd>
          </div>
        )}
        {participantId && (
          <div>
            <dt className="text-muted">{volunteerLanguage ? copy.visitor : copy.volunteer}</dt>
            <dd className="font-mono text-xs" dir="ltr">{participantId}</dd>
          </div>
        )}
      </dl>
      {endFailed && <Notice className="mt-4" error>{copy.endFailed}</Notice>}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {!details && <Link className="button" href={`/dashboard/conversations/${id}`}>{copy.view}</Link>}
        {details && status === "active" && <a href="#message" className="button lg:hidden">{copy.write}</a>}
        {!details && isOpen(conversation) && (
          <StatusRefresh intervalMs={status === "waiting" ? 8000 : undefined} label={copy.refresh} pendingLabel={copy.refreshing} />
        )}
        {isOpen(conversation) && (
          <form action={endConversation}>
            <input type="hidden" name="conversationId" value={id} />
            <SubmitButton label={copy.end} pendingLabel={copy.ending} className="button-danger" />
          </form>
        )}
      </div>
    </section>
  );
}
