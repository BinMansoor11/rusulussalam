import { getSiteLanguage } from "@/app/ui/locale";
import { Notice } from "@/app/ui/primitives";

export default async function LoadingAdminDashboard() {
  const language = await getSiteLanguage();
  return (
    <main className="workspace">
      <Notice>{language === "ur" ? "لوڈ ہو رہا ہے…" : "Loading…"}</Notice>
    </main>
  );
}
