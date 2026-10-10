"use client";
import { useState } from "react";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { ConversationDetail } from "@/components/portal/ConversationsView";

const copy={
  en:{title:"WhatsApp before the case",loading:"Loading…",none:"This case did not start from a WhatsApp conversation.",them:"Patient",team:"Care team",template:"Template"},
  ar:{title:"واتساب قبل الحالة",loading:"جارٍ التحميل…",none:"لم تبدأ هذه الحالة من محادثة واتساب.",them:"المريض",team:"فريق الرعاية",template:"قالب"},
};

/** The WhatsApp conversation a case started from, read-only. Loaded when the coordinator opens it. */
export function IntakeHistory({locale,caseId,load}:{locale:Locale;caseId:string;load:(caseId:string)=>Promise<ConversationDetail>}){
  const t=copy[locale==="ar"?"ar":"en"];
  const [state,setState]=useState<"idle"|"loading"|"none"|"ready">("idle");
  const [detail,setDetail]=useState<ConversationDetail|null>(null);
  const when=(iso:string)=>new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"short",timeStyle:"short"}).format(new Date(iso));
  function open(event:React.SyntheticEvent<HTMLDetailsElement>){
    if(!event.currentTarget.open||state!=="idle")return;
    setState("loading");
    load(caseId).then(value=>{setDetail(value);setState("ready");},()=>setState("none"));
  }
  return <details className="mt-6" onToggle={open}>
    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700">{t.title}</summary>
    {state==="loading"&&<p role="status" className="mt-2 text-sm text-ink-500">{t.loading}</p>}
    {state==="none"&&<p className="mt-2 text-sm text-ink-500">{t.none}</p>}
    {state==="ready"&&detail&&<div className="mt-3 space-y-3">{detail.messages.map(m=><article key={m.id} className={`rounded-lg p-3 ${m.direction==="OUT"?"ms-6 bg-brand-100":"me-6 bg-brand-50"}`}>
      <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-bold"><bdi>{m.direction==="IN"?(detail.summary.name||t.them):(m.senderName??t.team)}</bdi>{m.kind==="TEMPLATE"&&<span className="ms-2 text-[0.8125rem] font-normal text-ink-500">{t.template}</span>}</p><time className="text-[0.8125rem] text-ink-500" dateTime={m.createdAt}>{when(m.createdAt)}</time></div>
      {m.body&&<p className="mt-1 whitespace-pre-wrap break-words text-sm" dir="auto">{m.body}</p>}
      {m.fileName&&<p className="mt-1 text-[0.8125rem] text-ink-500"><bdi>{m.fileName}</bdi></p>}
    </article>)}</div>}
  </details>;
}
