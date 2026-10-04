import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { StaffingRequestsPage } from "@/components/platform-control-center/WorkforcePages";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <StaffingRequestsPage locale={locale} />;
}
