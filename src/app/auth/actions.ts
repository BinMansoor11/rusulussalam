"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isConversationLanguage } from "@/lib/conversation-language";

export type AuthState = {
  error?: string;
  notice?: string;
  email?: string;
  fullName?: string;
  language?: string;
  role?: string;
};

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
  const fullName = field(form, "fullName").trim();
  const language = field(form, "language");
  const role = field(form, "role");
  const profileFields = {
    email: email.slice(0, 254),
    fullName: fullName.slice(0, 120),
    language: isConversationLanguage(language) ? language : undefined,
    role: role === "visitor" || role === "volunteer" ? role : undefined,
  };
  if (validationError) return { ...profileFields, error: validationError };
  if (!fullName || Array.from(fullName).length > 120 || !isConversationLanguage(language) ||
    (role !== "visitor" && role !== "volunteer")) {
    return { ...profileFields, error: "Enter your full name and choose a language and role." };
  }
  if (Array.from(password).length < 8 || new TextEncoder().encode(password).length > 72) {
    return { ...profileFields, error: "Use at least 8 characters and no more than 72 bytes for your password." };
  }
  if (password !== field(form, "confirmation")) {
    return { ...profileFields, error: "Enter the same password in both fields." };
  }

  const supabase = await createClient("mutation");
  const site = process.env.AUTH_SITE_URL;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: site ? new URL("/auth/confirm", site).href : undefined,
      data: { full_name: fullName, conversation_language: language, signup_role: role },
    },
  });
  if (data.session) redirect("/dashboard");
  if (!error || error.code === "user_already_exists" || error.code === "email_exists") {
    return { notice: "Check your email for a confirmation link. If you already have an account, you can sign in.", email };
  }
  if (error.code === "weak_password") {
    return { ...profileFields, error: "Choose a stronger password that meets the account security requirements." };
  }
  return { ...profileFields, error: "We couldn’t create an account right now. Try again shortly." };
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
