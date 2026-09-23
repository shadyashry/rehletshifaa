import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ConsultantOnboardingWizard } from "@/components/platform-control-center/ConsultantOnboardingWizard";

export default async function AddConsultantPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ org?: string }> }) {
  const { locale } = await params;
  const { org } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <ConsultantOnboardingWizard locale={locale} initialOrg={org} />;
}
