"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Language } from "@/lib/conversations";
import { SubmitButton } from "@/app/dashboard/submit-button";
import { setSiteLanguage } from "./actions";

export function SiteNav({ language, signedIn }: { language: Language; signedIn: boolean }) {
  const path = usePathname();
  const urdu = language === "ur";
  const home = path === "/";
  return (
    <header className="border-b border-line bg-surface">
      <div className="site-shell py-3 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
          <Link href="/" className="inline-flex min-h-11 min-w-0 items-center gap-2.5 font-semibold text-brand">
            <span aria-hidden="true" className="brand-mark" />
            <span>{urdu ? "مقصدِ زندگی" : "Purpose of Life"}</span>
          </Link>
          {home && (
            <nav aria-label={urdu ? "اہم روابط" : "Main navigation"} className="hidden items-center gap-7 text-sm text-muted md:flex">
              <Link href="/#how-it-works" className="hover:text-brand">{urdu ? "طریقہ کار" : "How it works"}</Link>
              <Link href="/#privacy" className="hover:text-brand">{urdu ? "رازداری" : "Privacy"}</Link>
            </nav>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <form action={setSiteLanguage} lang={urdu ? "en" : "ur"}>
              <input type="hidden" name="siteLanguage" value={urdu ? "en" : "ur"} />
              <SubmitButton label={urdu ? "English" : "اردو"} pendingLabel={urdu ? "Switching…" : "تبدیل ہو رہی ہے…"} className="button-secondary" />
            </form>
            {home && (
              <Link href={signedIn ? "/dashboard" : "/login"} className="text-link inline-flex min-h-11 items-center text-sm">
                {signedIn ? (urdu ? "ڈیش بورڈ" : "Dashboard") : (urdu ? "سائن اِن" : "Sign in")}
              </Link>
            )}
          </div>
        </div>
        {home && (
          <nav aria-label={urdu ? "اہم روابط" : "Main navigation"} className="mt-1 flex gap-5 text-sm text-muted md:hidden">
            <Link href="/#how-it-works" className="inline-flex min-h-11 items-center">{urdu ? "طریقہ کار" : "How it works"}</Link>
            <Link href="/#privacy" className="inline-flex min-h-11 items-center">{urdu ? "رازداری" : "Privacy"}</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
