import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: Direct consultants open in the clinician page family. */
const TABS: Record<string, string> = { overview: "overview", approval: "approval", pricing: "prices", access: "access" };

export default async function LegacyDirectConsultantPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const { locale, id } = await params;
  const { tab, created } = await searchParams;
  if (!isLocale(locale)) notFound();
  const query = new URLSearchParams();
  if (tab && TABS[tab]) query.set("tab", TABS[tab]);
  if (created === "1") query.set("invited", "1");
  const q = query.toString();
  redirect(`/${locale}/portal/control-center/providers/clinicians/direct/${id}${q ? `?${q}` : ""}`);
}
