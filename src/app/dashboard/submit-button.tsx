"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ label, pendingLabel, className, formAction }: {
  label: string;
  pendingLabel: string;
  className: string;
  formAction?: (form: FormData) => Promise<void>;
}) {
  const status = useFormStatus();
  return <button className={className} type="submit" disabled={status.pending} formAction={formAction}>
    {status.pending && (!formAction || status.action === formAction) ? pendingLabel : label}
  </button>;
}
