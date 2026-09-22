import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AccessGovernance } from "@/components/platform-control-center/AccessGovernance";

export default async function AccessPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{tab?:string}>}) {
  const {locale}=await params;
  const {tab}=await searchParams;
  if(!isLocale(locale))notFound();
  const initialTab=tab==="permissions"||tab==="effective"||tab==="audit"?tab:"roles";
  return <AccessGovernance locale={locale} initialTab={initialTab}/>;
}
