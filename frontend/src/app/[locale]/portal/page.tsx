import { notFound } from "next/navigation";
import { Portal } from "@/components/portal/Portal";
import { isLocale } from "@/lib/i18n";

export default async function PortalPage({params}:{params:Promise<{locale:string}>}){const{locale}=await params;if(!isLocale(locale))notFound();return <Portal locale={locale}/>;}
