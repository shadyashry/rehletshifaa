import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CredentialReview } from "@/components/platform-control-center/CredentialReview";

export default async function CredentialReviewPage({ params }: { params: Promise<{ locale: string; organizationId: string; revisionId: string }> }) {
  const { locale, organizationId, revisionId } = await params;
  if (!isLocale(locale)) notFound();
  return <CredentialReview locale={locale} organizationId={organizationId} revisionId={revisionId} />;
}
