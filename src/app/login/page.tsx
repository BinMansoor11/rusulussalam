import type { Metadata } from "next";
import { AuthScreen } from "@/app/auth/auth-screen";
import { getSiteLanguage } from "@/app/ui/locale";
import { redirectIfSignedIn } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  await redirectIfSignedIn();
  const { notice } = await searchParams;

  return <AuthScreen mode="login" language={await getSiteLanguage()} confirmationFailed={notice === "confirmation-failed"} />;
}
