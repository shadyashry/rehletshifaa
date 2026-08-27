import { notFound } from "next/navigation";

import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getDictionary } from "@/lib/dictionary";
import { fontVariables } from "@/lib/fonts";
import { isLocale, locales } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={fontVariables}>
      <body>
        <a href="#main" className="skip-link">
          {d.common.skip}
        </a>
        <EmergencyNotice label={d.common.emergencyLabel} text={d.common.emergency} />
        <Header locale={locale} d={d} />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer locale={locale} d={d} />
        <AnalyticsScripts />
      </body>
    </html>
  );
}
