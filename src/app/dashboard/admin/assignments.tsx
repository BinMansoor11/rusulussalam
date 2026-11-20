import { conversationLanguages, type ConversationLanguage } from "@/lib/conversation-language";
import type { Language } from "@/lib/conversations";
import { EmptyState, Notice } from "@/app/ui/primitives";
import { SubmitButton } from "../submit-button";
import { assignConversation, removeParticipant, reviewVolunteer } from "./actions";
import { assignmentCopy } from "./copy";

type Account = {
  id: string;
  public_id: string;
  full_name: string | null;
  email: string | null;
  role: "visitor" | "volunteer";
  application_status: "pending" | "approved" | "rejected" | null;
  conversation_language: ConversationLanguage | null;
  verified: boolean;
};

export type AssignmentData = {
  users: Account[];
  capacity: (Account & { supported_languages: ConversationLanguage[]; active_count: number; capacity: number })[];
  conversations: {
    id: string;
    visitor_id: string;
    volunteer_id: string | null;
    visitor_public_id: string;
    volunteer_public_id: string | null;
    status: "waiting" | "active";
    language: ConversationLanguage;
  }[];
};

const nameOf = (account?: Account) => account?.full_name ?? account?.public_id;

export function Assignments({ data, language, notice }: { data: AssignmentData | null; language: Language; notice?: string | string[] }) {
  const copy = assignmentCopy[language];
  if (!data) return <Notice error>{copy.failed}</Notice>;
  const { users, capacity, conversations } = data;
  const byId = new Map(users.map(user => [user.id, user]));
  const pending = users.filter(user => user.application_status === "pending");
  const waiting = conversations.filter(chat => chat.status === "waiting");
  const active = conversations.filter(chat => chat.status === "active");

  return <div id="assignments" className="space-y-5">
    {notice === "assignment-failed" && <Notice error>{copy.saveFailed}</Notice>}
    {notice === "assignment-saved" && <Notice>{copy.saved}</Notice>}
    <section className="panel">
      <h2 className="display-heading text-2xl text-brand">{copy.pending}</h2>
      {pending.length === 0 ? <EmptyState>{copy.noPending}</EmptyState> :
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pending.map(user => <li key={user.id} className="rounded-card border border-line p-4">
            <h3 className="break-words font-semibold">{nameOf(user)}</h3>
            <p className="break-all text-sm text-muted"><bdi>{user.email}</bdi></p>
            <p className="text-sm">{user.conversation_language && conversationLanguages[user.conversation_language]}</p>
            {!user.verified && <p className="text-sm text-muted">{copy.unverified}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {user.verified && <Decision id={user.id} status="approved" label={copy.accept} pendingLabel={copy.saving} />}
              <Decision id={user.id} status="rejected" label={copy.reject} pendingLabel={copy.saving} />
            </div>
          </li>)}
        </ul>}
    </section>
    <section className="panel">
      <h2 className="display-heading text-2xl text-brand">{copy.waiting}</h2>
      {waiting.length === 0 ? <EmptyState>{copy.noWaiting}</EmptyState> : <ul className="inset-list mt-4">
        {waiting.map(chat => {
          const matches = capacity.filter(user => user.supported_languages.includes(chat.language));
          return <li key={chat.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
            <p>{nameOf(byId.get(chat.visitor_id)) ?? chat.visitor_public_id} · {conversationLanguages[chat.language]}</p>
            {matches.length > 0 ? <form action={assignConversation} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="conversationId" value={chat.id} />
              <label className="text-sm font-medium">{copy.assignLabel}
                <select name="volunteerId" required defaultValue="" className="field">
                  <option value="" disabled>{copy.choose}</option>
                  {matches.map(user => <option key={user.id} value={user.id}>
                    {nameOf(user)} ({copy.load(user.active_count, user.capacity)})
                  </option>)}
                </select>
              </label>
              <SubmitButton label={copy.assign} pendingLabel={copy.assigning} className="button" />
            </form> : <p className="text-sm text-muted">{copy.noMatch}</p>}
          </li>;
        })}
      </ul>}
    </section>
    <section className="panel">
      <h2 className="display-heading text-2xl text-brand">{copy.capacity}</h2>
      {capacity.length === 0 ? <EmptyState>{copy.noCapacity}</EmptyState> : <ul className="inset-list mt-4">
        {capacity.map(user => <li key={user.id} className="py-3">
          {nameOf(user)} · {user.supported_languages.map(language => conversationLanguages[language]).join(", ")} · {copy.load(user.active_count, user.capacity)}
        </li>)}
      </ul>}
    </section>
    <section className="panel">
      <h2 className="display-heading text-2xl text-brand">{copy.active}</h2>
      {active.length === 0 ? <EmptyState>{copy.noActive}</EmptyState> : <ul className="inset-list mt-4">
        {active.map(chat => <li key={chat.id} className="py-3">
          <p className="mb-2">{nameOf(byId.get(chat.visitor_id)) ?? chat.visitor_public_id} · {chat.volunteer_id && nameOf(byId.get(chat.volunteer_id)) || chat.volunteer_public_id} · {conversationLanguages[chat.language]}</p>
          <div className="flex flex-wrap gap-2">
            <Removal id={chat.id} role="volunteer" label={copy.removeVolunteer} pendingLabel={copy.removing} />
            <Removal id={chat.id} role="visitor" label={copy.removeVisitor} pendingLabel={copy.removing} />
          </div>
        </li>)}
      </ul>}
    </section>
    <section className="panel">
      <h2 className="display-heading text-2xl text-brand">{copy.all}</h2>
      {users.length === 0 ? <EmptyState>{copy.noUsers}</EmptyState> : <ul className="inset-list mt-4">
        {users.map(user => <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="min-w-0">
            <p className="break-words font-semibold">{nameOf(user)} · {copy[user.role]}</p>
            <p className="break-all text-sm text-muted"><bdi>{user.email}</bdi> · {user.conversation_language ? conversationLanguages[user.conversation_language] : copy.noLanguage} {user.application_status && `· ${copy.statuses[user.application_status]}`}</p>
          </div>
          {user.application_status === "rejected" && <Decision id={user.id} status="pending" label={copy.reopen} pendingLabel={copy.saving} />}
        </li>)}
      </ul>}
    </section>
  </div>;
}

function Decision({ id, status, label, pendingLabel }: { id: string; status: string; label: string; pendingLabel: string }) {
  return <form action={reviewVolunteer}>
    <input type="hidden" name="userId" value={id} />
    <input type="hidden" name="status" value={status} />
    <SubmitButton label={label} pendingLabel={pendingLabel} className="button-secondary" />
  </form>;
}

function Removal({ id, role, label, pendingLabel }: { id: string; role: "visitor" | "volunteer"; label: string; pendingLabel: string }) {
  return <form action={removeParticipant}>
    <input type="hidden" name="conversationId" value={id} />
    <input type="hidden" name="role" value={role} />
    <SubmitButton label={label} pendingLabel={pendingLabel} className="button-secondary" />
  </form>;
}
