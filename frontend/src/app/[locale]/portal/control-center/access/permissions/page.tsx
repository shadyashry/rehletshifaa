import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AccessGovernance } from "@/components/platform-control-center/AccessGovernance";

export default async function AccessPermissionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ subject?: string; organization?: string }> }) {
  const { locale } = await params;
  const { subject, organization } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <AccessGovernance locale={locale} view="permissions" initialSubject={subject} initialOrganization={organization} />;
}
