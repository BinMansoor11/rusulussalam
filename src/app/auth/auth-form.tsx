"use client";

import { useActionState } from "react";
import type { Language } from "@/lib/conversations";
import { conversationLanguages } from "@/lib/conversation-language";
import { FieldLabel, Notice } from "../ui/primitives";
import { login, register, type AuthState } from "./actions";
import { authCopy, urduAuthErrors } from "./copy";

const initialState: AuthState = {};

export function AuthForm({ mode, language }: { mode: "login" | "register"; language: Language }) {
  const signingUp = mode === "register";
  const [state, action, pending] = useActionState(signingUp ? register : login, initialState);
  const copy = authCopy[language];
  const form = (
    <form action={action} className="mt-7 space-y-4" aria-busy={pending}>
      {signingUp && <>
        <FieldLabel id="fullName" label={language === "ur" ? "پورا نام" : "Full name"}>
          <input id="fullName" name="fullName" autoComplete="name" className="field" defaultValue={state.fullName} maxLength={120} required />
        </FieldLabel>
        <FieldLabel id="language" label={language === "ur" ? "گفتگو کی زبان" : "Conversation language"}>
          <select id="language" name="language" className="field" defaultValue={state.language ?? ""} required>
            <option value="" disabled>{language === "ur" ? "زبان منتخب کریں" : "Choose a language"}</option>
            {Object.entries(conversationLanguages).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel id="role" label={language === "ur" ? "کردار" : "Role"}>
          <select id="role" name="role" className="field" defaultValue={state.role ?? ""} required>
            <option value="" disabled>{language === "ur" ? "کردار منتخب کریں" : "Choose a role"}</option>
            <option value="visitor">{language === "ur" ? "مدعو (ملاقاتی)" : "Mad’oo (Visitor)"}</option>
            <option value="volunteer">{language === "ur" ? "داعی (رضاکار)" : "Da’ee (Volunteer)"}</option>
          </select>
        </FieldLabel>
      </>}
      <FieldLabel id="email" label={copy.email}>
        <input id="email" name="email" type="email" dir="ltr" autoComplete="email" className="field"
          defaultValue={state.email} maxLength={254} required />
      </FieldLabel>
      <FieldLabel id="password" label={copy.password}>
        <input id="password" name="password" type="password" dir="ltr" className="field" required
          autoComplete={signingUp ? "new-password" : "current-password"}
          minLength={signingUp ? 8 : undefined}
          aria-describedby={signingUp ? "password-hint" : undefined} />
      </FieldLabel>
      {signingUp && (
        <>
          <p id="password-hint" className="-mt-2 text-sm text-muted">{copy.hint}</p>
          <FieldLabel id="confirmation" label={copy.confirm}>
            <input id="confirmation" name="confirmation" type="password" dir="ltr" autoComplete="new-password"
              className="field" required />
          </FieldLabel>
        </>
      )}
      {state.error && <Notice error>{language === "ur" ? urduAuthErrors[state.error] ?? state.error : state.error}</Notice>}
      <button className="button min-h-12 w-full" type="submit" disabled={pending}>
        {signingUp ? (pending ? copy.creating : copy.create) : (pending ? copy.signing : copy.login)}
      </button>
    </form>
  );
  if (!state.notice) return form;
  return (
    <div className="mt-6 rounded-card border border-line bg-sage p-5">
      <h2 className="text-xl font-semibold text-brand">{copy.verify}</h2>
      <p role="status" className="mt-2 text-sm leading-relaxed text-muted">{copy.verification}</p>
      <details className="mt-3">
        <summary className="text-link min-h-11 cursor-pointer py-2 text-sm">{copy.differentEmail}</summary>
        {form}
      </details>
    </div>
  );
}
