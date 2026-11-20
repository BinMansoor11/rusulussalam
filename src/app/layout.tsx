import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSiteLanguage } from "./ui/locale";
import { SiteNav } from "./ui/site-nav";
import { getSignedInProfile, isSignedIn, volunteerApplicationStatus } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Purpose of Life", template: "%s | Purpose of Life" },
  description: "Explore Islam, ask questions about faith and the purpose of life, and chat privately with a volunteer in your chosen language.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [language, signedIn, profile] = await Promise.all([getSiteLanguage(), isSignedIn(), getSignedInProfile()]);
  return (
    <html
      lang={language}
      dir={language === "ur" ? "rtl" : "ltr"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="button skip-link">
          {language === "ur" ? "مرکزی مواد پر جائیں" : "Skip to main content"}
        </a>
        {!volunteerApplicationStatus(profile) && <SiteNav language={language} signedIn={signedIn} />}
        <div id="main-content" tabIndex={-1} className="min-w-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
