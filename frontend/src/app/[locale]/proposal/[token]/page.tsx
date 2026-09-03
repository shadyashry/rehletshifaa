import { notFound } from "next/navigation";

import { ProposalSign } from "@/components/ProposalSign";
import { isLocale } from "@/lib/i18n";

export default async function ProposalPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  return <ProposalSign locale={locale} token={token} />;
}
