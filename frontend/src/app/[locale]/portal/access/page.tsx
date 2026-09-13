import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AccessGovernance } from "@/components/platform-control-center/AccessGovernance";

export default async function AccessPage({params}:{params:Promise<{locale:string}>}) {
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  return <AccessGovernance locale={locale}/>;
}
