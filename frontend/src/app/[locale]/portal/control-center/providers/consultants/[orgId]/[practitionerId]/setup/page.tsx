import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ConsultantOnboardingWizard, type WizardStep } from "@/components/platform-control-center/ConsultantOnboardingWizard";

const STEPS: WizardStep[] = ["details", "professional", "working", "review"];

export default async function ConsultantSetupPage({ params, searchParams }: { params: Promise<{ locale: string; orgId: string; practitionerId: string }>; searchParams: Promise<{ step?: string }> }) {
  const { locale, orgId, practitionerId } = await params;
  const { step } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <ConsultantOnboardingWizard locale={locale} organizationId={orgId} practitionerId={practitionerId} initialStep={STEPS.find((s) => s === step)} />;
}
