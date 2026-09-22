import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ProviderOrganizationDetail } from "@/components/platform-control-center/ProviderOrganizationDetail";

export default async function ProviderOrganizationDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return <ProviderOrganizationDetail locale={locale} organizationId={id} />;
}
