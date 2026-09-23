"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
type Api=<T,>(path:string,init?:RequestInit)=>Promise<T>;
type Identity={id:string;subjectType:string;status:string;documentType?:string;issuingCountry?:string;documentReferenceMasked?:string;requestedAt:string;method?:string};
export function IdentityReviewQueue({api,locale}:{api:Api;locale:Locale}) {
  const [items,setItems]=useState<Identity[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const ar=locale==="ar";
  const load=useCallback(async()=>{setLoading(true);setError("");try{setItems(await api<Identity[]>("/identity-review/queue"));}catch(e){setError(e instanceof Error?e.message:"Unable to load identity reviews");}finally{setLoading(false);}},[api]);
  useEffect(()=>{void load();},[load]);
  return <section className="space-y-4" aria-label={ar?"طلبات التحقق":"Verification requests"}>
    {loading&&<p role="status">{ar?"جارٍ التحميل…":"Loading requests…"}</p>}{error&&<p role="alert" className="card p-4 text-alert-800">{error} <button className="link-cta" onClick={()=>void load()}>{ar?"إعادة المحاولة":"Retry"}</button></p>}{notice&&<p role="status" className="card p-4 text-brand-700">{notice}</p>}
    {!loading&&!items.length&&!error&&<div className="card p-8"><h2 className="title">{ar?"لا توجد طلبات بانتظار المراجعة":"No verification requests waiting"}</h2><p className="mt-2 text-sm text-ink-500">{ar?"ستظهر الطلبات الجديدة هنا.":"New requests will appear here."}</p></div>}
    {items.map(item=><article key={item.id} className="card p-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="title">{item.subjectType==="PATIENT"?ar?"هوية المريض":"Patient identity":ar?"هوية الممثل":"Representative identity"}</h2><span className="status-badge">{ar?"بانتظار المراجعة":"Awaiting review"}</span></div><dl className="mt-4 grid gap-3 sm:grid-cols-3">{[[ar?"المستند":"Document",item.documentType],[ar?"بلد الإصدار":"Issuing country",item.issuingCountry],[ar?"مرجع المستند":"Document reference",item.documentReferenceMasked]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt className="text-xs text-ink-500">{label}</dt><dd className="text-sm font-semibold" dir="auto">{value}</dd></div>)}</dl>
      <p className="mt-4 text-sm text-ink-500">{ar?"سجّل القرار بعد مراجعة دليل الهوية عبر الإجراء المعتمد.":"Record a decision after reviewing identity evidence through the approved process."}</p>
      <form className="mt-4 space-y-3" onSubmit={async event=>{event.preventDefault();const data=new FormData(event.currentTarget);setBusy(true);setError("");try{await api(`/identity-review/${item.id}/decision`,{method:"POST",body:JSON.stringify({decision:data.get("decision"),reason:data.get("reason")})});await load();setNotice(ar?"تم تسجيل القرار.":"Decision recorded.");}catch(e){setError(e instanceof Error?e.message:"Unable to record decision");}finally{setBusy(false);}}}>
        <label className="block text-sm font-semibold">{ar?"القرار":"Decision"}<select name="decision" className="field mt-2" required defaultValue=""><option value="" disabled>{ar?"اختر القرار":"Select decision"}</option><option value="VERIFY">{ar?"تم التحقق":"Verify identity"}</option><option value="REJECT">{ar?"لم يتم التحقق":"Reject verification"}</option></select></label>
        <label className="block text-sm font-semibold">{ar?"سبب القرار":"Reason for decision"}<textarea name="reason" className="field mt-2" required maxLength={2000}/></label><button className="btn-primary" disabled={busy}>{ar?"تسجيل القرار":"Record decision"}</button>
      </form></article>)}
  </section>;
}
