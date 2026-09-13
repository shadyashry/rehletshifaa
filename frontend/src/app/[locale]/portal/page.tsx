import { notFound } from "next/navigation";
import { Portal } from "@/components/portal/Portal";
import { isLocale } from "@/lib/i18n";
import { AccessNavigation } from "@/components/platform-control-center/AccessNavigation";

export default async function PortalPage({params}:{params:Promise<{locale:string}>}){const{locale}=await params;if(!isLocale(locale))notFound();return <><div className="mx-auto max-w-7xl px-4"><AccessNavigation locale={locale}/></div><Portal locale={locale}/></>;}
