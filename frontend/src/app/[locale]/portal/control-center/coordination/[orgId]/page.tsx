import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CareCoordinationWorkspace, type CoordinationTab } from "@/components/platform-control-center/CareCoordinationWorkspace";

const TABS = ["overview", "teams", "preferences", "policy", "simulation", "queue", "audit"] as const;

export default async function CareCoordinationWorkspacePage({ params, searchParams }: { params: Promise<{ locale: string; orgId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale, orgId } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  const initialTab = (TABS as readonly string[]).includes(tab ?? "") ? (tab as CoordinationTab) : undefined;
  return <CareCoordinationWorkspace locale={locale} orgId={orgId} initialTab={initialTab} />;
}
