"use client";

import { useRef, useState, type FormEvent } from "react";
import { type Language, isConversationId } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/browser";
import { chatCopy } from "./chat-copy";
import { MESSAGE_LIMIT } from "./messages";

export function ChatReport({ id, locale, online, refresh }: {
  id: string;
  locale: Language;
  online: boolean;
  refresh: () => void;
}) {
  const copy = chatCopy[locale];
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "invalid" | "failed">();
  const inFlight = useRef(false);

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const reason = data.get("reason");
    const notes = data.get("notes");
    if (typeof reason !== "string" || !Object.hasOwn(copy.reasons, reason) ||
      typeof notes !== "string" || Array.from(notes).length > MESSAGE_LIMIT) {
      setFeedback("invalid");
      return;
    }

    inFlight.current = true;
    setPending(true);
    setFeedback(undefined);
    try {
      const { data, error } = await createClient().rpc("submit_safeguarding_report", {
        p_conversation_id: id, p_reason: reason, p_notes: notes.trim() || null,
      }).retry(false).abortSignal(AbortSignal.timeout(15000));
      if (error || !isConversationId(data)) throw new Error("Report unavailable");
      form.reset();
      setFeedback("saved");
    } catch {
      setFeedback("failed");
    } finally {
      inFlight.current = false;
      setPending(false);
      refresh();
    }
  }

  return (
    <details className="rounded-xl border border-line bg-background px-3 sm:px-4">
      <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-semibold text-brand">{copy.report}</summary>
      <p className="mt-3 text-sm text-muted">{copy.reportNotice}</p>
      <form method="post" onSubmit={report} className="my-4 grid max-w-lg gap-3">
        <label className="text-sm font-medium">
          {copy.reason}
          <select name="reason" className="field" defaultValue="" required disabled={pending}>
            <option value="" disabled>{copy.chooseReason}</option>
            {Object.entries(copy.reasons).map(([reason, label]) =>
              <option key={reason} value={reason}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          {copy.notes}
          <textarea name="notes" dir="auto" className="field resize-y" rows={3} disabled={pending} />
        </label>
        <button className="button-danger w-fit" type="submit" disabled={!online || pending}>
          {pending ? copy.submitting : copy.report}
        </button>
      </form>
      {feedback === "saved" && <p role="status" className="mt-3 text-sm text-brand">{copy.reportSaved}</p>}
      {(feedback === "failed" || feedback === "invalid") && (
        <p role="alert" className="mt-3 text-sm text-red-900">
          {feedback === "failed" ? copy.reportFailed : copy.invalidReport}
        </p>
      )}
    </details>
  );
}
