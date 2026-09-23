import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { IdentityChecks } from "@/components/platform-control-center/CareOperationsPages";

export default async function IdentityChecksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <IdentityChecks locale={locale} />;
}
