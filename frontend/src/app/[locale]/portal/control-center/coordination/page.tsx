import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CareCoordinationWorkspace } from "@/components/platform-control-center/CareCoordinationWorkspace";

// Kept local: a server page must not import non-component values from a "use client" module.
type Section = "cases" | "teams" | "conversations" | "preferences" | "rules" | "advanced";
const SECTIONS: Section[] = ["cases", "teams", "conversations", "preferences", "rules", "advanced"];

export default async function CoordinationSetupPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <CareCoordinationWorkspace locale={locale} initialSection={SECTIONS.find((s) => s === tab)} />;
}
