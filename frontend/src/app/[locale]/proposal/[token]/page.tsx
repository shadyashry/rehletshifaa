import { notFound } from "next/navigation";

import { ProposalSign } from "@/components/ProposalSign";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";

export default async function ProposalPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  return <ProposalSign locale={locale} token={token} copy={{ ...d.secureLink.proposal, assisted: d.portalProposal.assisted, services: d.portalWork.plural.services, stampEstimateReady: d.portalWork.myCare.stamp.estimateReady, estimateBar: d.portalWork.myCare.estimate.bar }} />;
}
