import { notFound } from "next/navigation";
import { Portal } from "@/components/portal/Portal";
import { careAreaAtlas } from "@/lib/care-area-catalog";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";

export default async function PortalPage({params}:{params:Promise<{locale:string}>}){const{locale}=await params;if(!isLocale(locale))notFound();const d=getDictionary(locale);const careAreas=Object.fromEntries(careAreaAtlas(locale,d).map(area=>[area.slug,area.title]));return <Portal locale={locale} proposalCopy={d.portalProposal} workCopy={{...d.portalWork,careAreas}}/>;}
