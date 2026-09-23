import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ControlCenterOverview } from "@/components/platform-control-center/ControlCenterOverview";

export default async function ControlCenterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ControlCenterOverview locale={locale} />;
}
