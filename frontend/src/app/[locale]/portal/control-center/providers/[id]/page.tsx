import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ProviderOrganizationDetail, type OrganizationTab } from "@/components/platform-control-center/ProviderOrganizationDetail";

const TABS: OrganizationTab[] = ["overview", "people", "setup"];

export default async function ProviderOrganizationDetailPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale, id } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <ProviderOrganizationDetail locale={locale} organizationId={id} initialTab={TABS.find((t) => t === tab)} />;
}
