import Link from "next/link";
import type { Language } from "@/lib/conversations";
import { GeometricPattern, Notice } from "../ui/primitives";
import { AuthForm } from "./auth-form";
import { authCopy } from "./copy";

export function AuthScreen({ mode, language, confirmationFailed }: {
  mode: "login" | "register"; language: Language; confirmationFailed?: boolean;
}) {
  const copy = authCopy[language];
  const login = mode === "login";
  return (
    <main className="site-shell py-7 sm:py-12">
      <div className="mx-auto grid max-w-[62rem] overflow-hidden rounded-shell border border-line bg-surface md:grid-cols-[1.15fr_1fr]">
        <section className="min-w-0 p-5 sm:p-9 lg:p-11">
          <h1 className="display-heading text-3xl text-brand sm:text-5xl">{copy[mode]}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{login ? copy.loginIntro : copy.signupIntro}</p>
          {confirmationFailed && <Notice className="mt-4" error>{copy.failed}</Notice>}
          <AuthForm mode={mode} language={language} />
          <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
            {login ? copy.new : copy.existing}{" "}
            <Link href={login ? "/register" : "/login"} className="text-link">{login ? copy.register : copy.login}</Link>
          </p>
        </section>
        <aside className="auth-illustration">
          <GeometricPattern />
          <div>
            <h2 className="display-heading text-2xl sm:text-3xl">{copy.aside}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#e5eee3]">{copy.asideText}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
