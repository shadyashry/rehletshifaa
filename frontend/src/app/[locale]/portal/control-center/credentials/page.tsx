import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CredentialQueue } from "@/components/platform-control-center/CredentialQueue";

export default async function CredentialQueuePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ org?: string; view?: string }> }) {
  const { locale } = await params;
  const { org, view } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <CredentialQueue locale={locale} initialOrg={org} initialView={view === "direct" ? "direct" : undefined} />;
}
