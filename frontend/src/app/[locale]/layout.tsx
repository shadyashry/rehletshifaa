import { notFound } from "next/navigation";

import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { AuthProvider } from "@/components/AuthProvider";
import { BRAND_THEME_BOOT, BrandTheme } from "@/components/brand/BrandTheme";
import { Footer } from "@/components/Footer";
import { PortalFooter } from "@/components/PortalFooter";
import { FooterSwitch } from "@/components/nav/FooterSwitch";
import { Header } from "@/components/Header";
import { HideInControlCenter, SiteMain } from "@/components/nav/HideInControlCenter";
import { MobileCaseBar } from "@/components/nav/MobileCaseBar";
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
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={fontVariables}
      data-scroll-behavior="smooth"
      // The brand boot script sets data-brand-theme before hydration.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BRAND_THEME_BOOT }} />
      </head>
      <body>
        <HideInControlCenter>
          <a href="#main" className="skip-link">
            {d.common.skip}
          </a>
          <Header locale={locale} d={d} />
        </HideInControlCenter>
        <AuthProvider><SiteMain>{children}</SiteMain></AuthProvider>
        <HideInControlCenter>
          <FooterSwitch portal={<PortalFooter locale={locale} d={d} />}>
            <Footer locale={locale} d={d} />
          </FooterSwitch>
          <MobileCaseBar
            locale={locale}
            label={d.home.primaryAction}
            note={locale === "ar" ? "لا التزام عند البدء — نرشدك خطوة بخطوة." : "No commitment to start — we guide every step."}
          />
          <BrandTheme />
        </HideInControlCenter>
        <AnalyticsScripts />
      </body>
    </html>
  );
}
