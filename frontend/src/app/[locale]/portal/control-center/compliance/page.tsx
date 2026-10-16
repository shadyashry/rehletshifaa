import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { CompliancePage } from "@/components/platform-control-center/CompliancePage";

/** Reviews & Safety › Compliance (P1-19): the hospital-agreement audit. Compliance reviews; Consultant Operations read. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; review?: string; flags?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { tab, review, flags } = await searchParams;
  const work = getDictionary(locale).portalWork;
  return <CompliancePage locale={locale} copy={{ ...work.compliance, kinds: work.affiliations.kindsShort }} query={{ tab, review, flags }} />;
}
