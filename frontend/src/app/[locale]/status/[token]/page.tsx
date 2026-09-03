import { notFound } from "next/navigation";
import { CaseStatusAccess } from "@/components/CaseStatusAccess";
import { isLocale } from "@/lib/i18n";

export default async function StatusPage({params}:{params:Promise<{locale:string;token:string}>}){
 const {locale,token}=await params;if(!isLocale(locale)||!token)notFound();
 return <CaseStatusAccess locale={locale} token={token}/>;
}
