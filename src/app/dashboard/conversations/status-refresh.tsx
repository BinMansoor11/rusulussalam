"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

export function StatusRefresh({ intervalMs, label, pendingLabel }: {
  intervalMs?: number;
  label: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (pending) return;
    function refreshWhenVisible() {
      if (document.visibilityState === "visible" && navigator.onLine) {
        startTransition(() => router.refresh());
      }
    }

    window.addEventListener("online", refreshWhenVisible);
    const interval = intervalMs ? window.setInterval(refreshWhenVisible, intervalMs) : undefined;
    return () => {
      window.removeEventListener("online", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [pending, router, intervalMs]);

  return (
    <button type="button" className="button-secondary" disabled={pending}
      onClick={() => startTransition(() => router.refresh())}>
      {pending ? pendingLabel : label}
    </button>
  );
}
