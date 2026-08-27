import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { getDictionary } from "@/lib/dictionary";
import { isLocale, locales } from "@/lib/i18n";

export function generateStaticParams() { return locales.map((locale) => ({ locale })); }

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: value } = await params;
  if (!isLocale(value)) notFound();
  const d = getDictionary(value);
  return <html lang={value} dir={value === "ar" ? "rtl" : "ltr"}><body><EmergencyNotice text={d.common.emergency} /><Header locale={value} d={d} /><main>{children}</main><Footer locale={value} d={d} /><AnalyticsScripts /></body></html>;
}
