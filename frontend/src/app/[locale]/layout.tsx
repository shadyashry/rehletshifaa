import { notFound } from "next/navigation";

import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { AuthProvider } from "@/components/AuthProvider";
import { BRAND_THEME_BOOT, BrandThemeSwitch } from "@/components/brand/BrandThemeSwitch";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HideInControlCenter, SiteMain } from "@/components/nav/HideInControlCenter";
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
      // The brand-preview boot script may set data-brand-theme before hydration.
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
          <Footer locale={locale} d={d} />
          <BrandThemeSwitch locale={locale} />
        </HideInControlCenter>
        <AnalyticsScripts />
      </body>
    </html>
  );
}
