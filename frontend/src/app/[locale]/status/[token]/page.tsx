import { notFound } from "next/navigation";
import { CaseStatusAccess } from "@/components/CaseStatusAccess";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "@/lib/dictionary";

export default async function StatusPage({params}:{params:Promise<{locale:string;token:string}>}){
 const {locale,token}=await params;if(!isLocale(locale)||!token)notFound();
 const d=getDictionary(locale);
 return <CaseStatusAccess locale={locale} token={token} emergency={d.common.emergencyNotice}
  copy={{ ...d.secureLink.status, workingDays: d.portalWork.plural.workingDays, stamp: d.portalWork.myCare.stamp, caseNumber: d.form.caseNumber }} journeyCopy={d.secureLink.journey}
  treatmentCopy={{ ...d.portalWork.myCare.treatment, review: d.portalWork.myCare.steps.REVIEW_CHANGE_ORDER }}
  dischargeCopy={{ goingHome: d.portalWork.myCare.goingHome, statement: d.portalWork.statement }}/>;
}
