"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Conversation, Language } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/browser";
import { EmptyState, Notice } from "@/app/ui/primitives";
import { chatCopy } from "./chat-copy";
import { ChatReport } from "./chat-report";
import { conversationCopy } from "./copy";
import { MESSAGE_LIMIT, parseMessage, type Participant } from "./messages";
import { useChat } from "./use-chat";

export function Chat({ id, initialStatus, role, publicId, locale, assigned }: {
  id: string;
  initialStatus: Conversation["status"];
  role: Participant;
  publicId: string;
  locale: Language;
  assigned: boolean;
}) {
  const chat = useChat(id, initialStatus);
  const copy = chatCopy[locale];
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<"invalid" | "failed" | "closed">();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const sendingRef = useRef(false);
  const olderInFlight = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const restorePosition = useRef<{ height: number; top: number } | null>(null);
  const timeFormat = new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en", {
    dateStyle: "medium", timeStyle: "short",
  });
  const status = initialStatus === "ended" || initialStatus === "flagged" ? initialStatus : chat.status;
  const canSend = status === "active" && chat.online;

  useEffect(() => {
    const node = log.current;
    if (!node) return;
    if (restorePosition.current) {
      const { height, top } = restorePosition.current;
      node.scrollTop = top + node.scrollHeight - height;
      restorePosition.current = null;
    } else if (followLatest.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [chat.messages]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || sendingRef.current) return;
    const content = draft;
    if (!content.trim() || Array.from(content).length > MESSAGE_LIMIT) {
      setSendError("invalid");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError(undefined);
    try {
      const { data, error } = await createClient().rpc("send_message", {
        p_conversation_id: id, p_content: content,
      }).retry(false).abortSignal(AbortSignal.timeout(15000));
      if (error?.code === "P0001" && error.message === "Conversation is closed to messages") {
        setSendError("closed");
        return;
      }
      const message = error ? null : parseMessage(data);
      if (!message) throw new Error("Message persistence unconfirmed");
      followLatest.current = true;
      chat.merge([message]);
      setDraft("");
    } catch {
      setSendError("failed");
    } finally {
      sendingRef.current = false;
      setSending(false);
      chat.refresh();
    }
  }

  async function loadOlder() {
    if (!chat.online || olderInFlight.current) return;
    olderInFlight.current = true;
    setLoadingOlder(true);
    setOlderError(false);
    const node = log.current;
    if (node) restorePosition.current = { height: node.scrollHeight, top: node.scrollTop };
    try {
      await chat.loadOlder();
    } catch {
      restorePosition.current = null;
      setOlderError(true);
    } finally {
      olderInFlight.current = false;
      setLoadingOlder(false);
    }
  }

  if (chat.accessLost) return <p className="panel" role="alert">{copy.unavailable}</p>;

  return (
    <section className="panel space-y-4" aria-labelledby="messages-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <h2 id="messages-heading" className="display-heading text-2xl text-brand sm:text-3xl">{copy.messages}</h2>
        <button type="button" className="button-secondary" onClick={chat.refresh} disabled={!chat.online}>
          {conversationCopy[locale].refresh}
        </button>
      </div>
      <p className="text-sm text-muted">{copy.peerSupport}</p>
      {!chat.online ? <Notice>{copy.offline}</Notice> :
        chat.syncError ? <Notice error>{copy.syncFailed}</Notice> :
        !chat.connected && status !== "ended" && status !== "flagged" &&
          <Notice>{copy.reconnecting}</Notice>}
      {status !== "waiting" && (
        <>
          {chat.hasOlder && (
            <button type="button" onClick={loadOlder} disabled={loadingOlder || !chat.online}
              className="button-secondary">
              {loadingOlder ? copy.loadingOlder : copy.older}
            </button>
          )}
          {olderError && <Notice error>{copy.olderFailed}</Notice>}
          {chat.loading ? <Notice>{copy.loading}</Notice> :
            !chat.messages.length && !chat.syncError && <EmptyState>{copy.empty}</EmptyState>}
          <div ref={log} tabIndex={chat.messages.length ? 0 : undefined} role="log" aria-labelledby="messages-heading"
            className={`max-h-[min(40dvh,28rem)] overflow-y-auto overscroll-contain rounded-card bg-[#f0f2e9] sm:max-h-[min(42dvh,30rem)] ${chat.messages.length ? "border border-line p-2.5 sm:p-4" : ""}`}
            onScroll={event => {
              const node = event.currentTarget;
              followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
            }}>
            <ol className="space-y-3">
              {chat.messages.map(message => {
                const mine = message.role === role && message.publicId === publicId;
                return (
                  <li key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div className={`min-w-0 max-w-[91%] rounded-card px-3 py-2.5 sm:max-w-[78%] sm:px-4 ${mine ? "rounded-ee-sm bg-brand text-white" : "rounded-es-sm border border-line bg-surface"}`}>
                      <p className="flex flex-wrap items-center gap-x-1 text-xs opacity-90">
                        <bdi>{message.publicId}</bdi>
                        {" · "}<time dateTime={message.createdAt}>{timeFormat.format(new Date(message.createdAt))}</time>
                      </p>
                      <p dir="auto" className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
      {status === "active" ? (
        <form method="post" onSubmit={send} className="rounded-card border border-line bg-background p-3 sm:p-4" aria-busy={sending}>
          <label htmlFor="message" className="block text-sm font-medium">{copy.message}</label>
          <textarea id="message" dir="auto" required rows={3}
            className="field resize-y" value={draft} onChange={event => setDraft(event.target.value)}
            readOnly={sending} />
          <button type="submit" className="button mt-3 w-full sm:w-auto" disabled={!canSend || sending}>
            {sending ? copy.sending : copy.send}
          </button>
        </form>
      ) : status !== "waiting" && <Notice>{copy.closed}</Notice>}
      {sendError && <Notice error>
        {sendError === "invalid" ? copy.invalid : sendError === "closed" ? copy.closed : copy.sendFailed}
      </Notice>}
      {(assigned || status === "active") && <ChatReport id={id} locale={locale} online={chat.online} refresh={chat.refresh} />}
    </section>
  );
}
