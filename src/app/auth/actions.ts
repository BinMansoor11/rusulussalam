"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string; email?: string };

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function credentials(form: FormData) {
  const email = field(form, "email").trim();
  const password = field(form, "password");
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { email, password, error: "Enter a valid email address." };
  }
  if (!password) return { email, password, error: "Enter your password." };
  return { email, password };
}

export async function register(_state: AuthState, form: FormData): Promise<AuthState> {
  const { email, password, error: validationError } = credentials(form);
  if (validationError) return { error: validationError, email };
  if (Array.from(password).length < 8 || new TextEncoder().encode(password).length > 72) {
    return { error: "Use at least 8 characters and no more than 72 bytes for your password.", email };
  }
  if (password !== field(form, "confirmation")) {
    return { error: "Enter the same password in both fields.", email };
  }

  const supabase = await createClient("mutation");
  const site = process.env.AUTH_SITE_URL;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: site ? { emailRedirectTo: new URL("/auth/confirm", site).href } : undefined,
  });
  if (data.session) redirect("/dashboard");
  if (!error || error.code === "user_already_exists" || error.code === "email_exists") {
    return { notice: "Check your email for a confirmation link. If you already have an account, you can sign in.", email };
  }
  if (error.code === "weak_password") {
    return { error: "Choose a stronger password that meets the account security requirements.", email };
  }
  return { error: "We couldn’t create an account right now. Try again shortly.", email };
}

export async function login(_state: AuthState, form: FormData): Promise<AuthState> {
  const { email, password, error: validationError } = credentials(form);
  if (validationError) return { error: validationError, email };

  const supabase = await createClient("mutation");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.session) redirect("/dashboard");
  if (error && ["invalid_credentials", "email_not_confirmed", "user_not_found"].includes(error.code ?? "")) {
    return { error: "We couldn’t sign you in. Check your email and password, and confirm your email if prompted.", email };
  }
  return { error: "Sign-in is temporarily unavailable. Try again shortly.", email };
}

export async function logout(): Promise<void> {
  const supabase = await createClient("mutation");
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) redirect("/dashboard?notice=signout-failed");
  redirect("/login");
}
