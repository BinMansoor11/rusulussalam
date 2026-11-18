import Link from "next/link";
import { isSignedIn } from "@/lib/auth";
import { ArchArt, Card } from "./ui/primitives";
import { getSiteLanguage } from "./ui/locale";

const content = {
  en: {
    title: "Purpose of Life",
    intro: "Explore what Islam teaches about who we are, why we are here, and our relationship with Allah. Whether you’re new to Islam or reconnecting with your faith, you can ask your questions in a private Dawah conversation with a volunteer.",
    start: "Create an account", signIn: "Sign in", dashboard: "Go to your dashboard", how: "How it works",
    steps: [
      ["Create an account", "Sign up with your email and receive a public ID for conversations."],
      ["Request a conversation", "Choose your preferred language. Your request waits for an available volunteer who speaks it."],
      ["Ask at your own pace", "Talk privately about Islam, belief, or worship. You can end the conversation or submit a safeguarding report."],
    ],
    privacy: "Your privacy in conversations",
    privacyText: "The person you talk with sees your public ID. Your email is used to sign in. Share only the details you’re comfortable sharing.",
    limits: "When you need urgent help",
    limitsText: "Purpose of Life offers volunteer-led conversations about Islam. For emergency help, contact local emergency services. For professional therapy, contact a qualified provider. Immediate assistance is not guaranteed.",
  },
  ur: {
    title: "مقصدِ زندگی",
    intro: "جانیے کہ اسلام ہماری شناخت، زندگی کے مقصد اور اللہ سے ہمارے تعلق کے بارے میں کیا سکھاتا ہے۔ چاہے آپ پہلی بار اسلام کے بارے میں جان رہے ہوں یا اپنے ایمان سے دوبارہ جڑنا چاہتے ہوں، کسی رضاکار سے نجی دعوتی گفتگو میں اپنے سوالات پوچھ سکتے ہیں۔",
    start: "اکاؤنٹ بنائیں", signIn: "سائن اِن", dashboard: "اپنے ڈیش بورڈ پر جائیں", how: "طریقہ کار",
    steps: [
      ["اکاؤنٹ بنائیں", "اپنی ای میل سے رجسٹر ہوں اور گفتگو کے لیے عوامی شناخت حاصل کریں۔"],
      ["گفتگو کی درخواست کریں", "اپنی پسند کی زبان منتخب کریں۔ درخواست اسی زبان بولنے والے دستیاب رضاکار کا انتظار کرے گی۔"],
      ["اپنی سہولت سے سوال پوچھیں", "اسلام، ایمان یا عبادت کے بارے میں نجی گفتگو کریں۔ آپ گفتگو ختم کر سکتے ہیں یا حفاظتی رپورٹ بھیج سکتے ہیں۔"],
    ],
    privacy: "گفتگو میں آپ کی رازداری",
    privacyText: "گفتگو میں دوسرے شخص کو آپ کی عوامی شناخت دکھائی دیتی ہے۔ آپ کی ای میل سائن اِن کے لیے استعمال ہوتی ہے۔ صرف وہ معلومات شیئر کریں جو آپ دینا چاہیں۔",
    limits: "جب فوری مدد درکار ہو",
    limitsText: "مقصدِ زندگی پر رضاکار اسلام کے بارے میں گفتگو کرتے ہیں۔ ہنگامی مدد کے لیے مقامی ہنگامی خدمات سے رابطہ کریں۔ پیشہ ورانہ علاج کے لیے کسی اہل معالج سے رجوع کریں۔ فوری مدد کی ضمانت نہیں ہے۔",
  },
};

export default async function Home() {
  const [language, signedIn] = await Promise.all([getSiteLanguage(), isSignedIn()]);
  const copy = content[language];
  return (
    <main className="site-shell space-y-12 pb-14 pt-7 sm:space-y-16 sm:pb-20 sm:pt-10">
      <section className="grid items-center gap-7 rounded-[2rem] border border-line bg-surface p-4 sm:p-7 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div className="px-2 py-4 sm:px-4 lg:py-9">
          <h1 className="display-heading max-w-[12ch] text-[clamp(2.8rem,7vw,5.6rem)] leading-[.98] text-brand">
            {copy.title}
          </h1>
          <div className="mt-6 h-px w-14 bg-gold" aria-hidden="true" />
          <p className="mt-5 max-w-[36rem] text-base leading-relaxed text-muted sm:text-lg">{copy.intro}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={signedIn ? "/dashboard" : "/register"} className="button min-h-12 gap-3">
              {signedIn ? copy.dashboard : copy.start}<span aria-hidden="true" className="rtl:rotate-180">→</span>
            </Link>
            {!signedIn && <Link href="/login" className="button-secondary min-h-12">{copy.signIn}</Link>}
          </div>
        </div>
        <ArchArt className="sm:min-h-[23rem] lg:min-h-[29rem]" />
      </section>
      <section id="how-it-works" className="scroll-mt-5" aria-labelledby="how-heading">
        <h2 id="how-heading" className="display-heading text-3xl text-brand sm:text-5xl">{copy.how}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {copy.steps.map(([title, text], index) => (
            <Card key={title}>
              <span aria-hidden="true" className="mb-4 inline-grid size-9 place-items-center rounded-full bg-sage font-mono text-sm text-brand">
                {index + 1}
              </span>
              <h3 className="text-lg font-semibold text-brand">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{text}</p>
            </Card>
          ))}
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <Card id="privacy" className="scroll-mt-5 bg-sage">
          <h2 className="display-heading text-2xl text-brand sm:text-3xl">{copy.privacy}</h2>
          <p className="mt-3 leading-relaxed text-muted">{copy.privacyText}</p>
        </Card>
        <Card>
          <h2 className="display-heading text-2xl text-brand sm:text-3xl">{copy.limits}</h2>
          <p className="mt-3 leading-relaxed text-muted">{copy.limitsText}</p>
        </Card>
      </div>
    </main>
  );
}
