import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CareCoordinationWorkspace } from "@/components/platform-control-center/CareCoordinationWorkspace";

// Section keys, plus the pre-UX-7 tab names so saved links still land in the right place.
// Kept local: a server page must not import non-component values from a "use client" module.
type Section = "teams" | "preferences" | "rules" | "advanced";
const SECTIONS: Record<string, Section> = {
  teams: "teams", preferences: "preferences", rules: "rules", advanced: "advanced",
  overview: "teams", policy: "rules", simulation: "advanced", queue: "advanced", audit: "advanced",
};

export default async function CareCoordinationWorkspacePage({ params, searchParams }: { params: Promise<{ locale: string; orgId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale, orgId } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <CareCoordinationWorkspace locale={locale} orgId={orgId} initialSection={tab ? SECTIONS[tab] : undefined} />;
}
