import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { PeoplePage } from "@/components/platform-control-center/WorkforcePages";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PeoplePage locale={locale} />;
}
