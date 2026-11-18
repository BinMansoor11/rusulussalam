import type { Metadata } from "next";
import { AuthScreen } from "@/app/auth/auth-screen";
import { getSiteLanguage } from "@/app/ui/locale";
import { redirectIfSignedIn } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };

export default async function Register() {
  await redirectIfSignedIn();

  return <AuthScreen mode="register" language={await getSiteLanguage()} />;
}
