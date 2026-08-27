import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
const legalPaths = ["privacy", "terms", "medical-disclaimer"] as const;
type LegalPath = (typeof legalPaths)[number];
type Props = { params: Promise<{ locale: string; legal: string }> };
function isLegal(value: string): value is LegalPath { return legalPaths.includes(value as LegalPath); }
function titleFor(path: LegalPath, d: ReturnType<typeof getDictionary>) { return path === "privacy" ? d.legal.privacyTitle : path === "terms" ? d.legal.termsTitle : d.legal.disclaimerTitle; }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale, legal } = await params; if (!isLocale(locale) || !isLegal(legal)) return {}; const d = getDictionary(locale); const title = titleFor(legal, d); return pageMetadata(locale, legal, title, d.legal.review); }
export default async function LegalPage({ params }: Props) { const { locale, legal } = await params; if (!isLocale(locale) || !isLegal(legal)) notFound(); const d = getDictionary(locale); return <article className="container-site py-20 md:py-28"><p className="eyebrow">{d.legal.review}</p><h1 className="headline mt-5">{titleFor(legal, d)}</h1><p className="lead mt-8 max-w-3xl">{d.legal.body}</p></article>; }

