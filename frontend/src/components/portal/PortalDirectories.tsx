"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
type Api=<T,>(path:string,init?:RequestInit)=>Promise<T>;
type Member={subject:string;name:string;role:string;managerSubject?:string};

export function ReportingTeam({api,locale,editable}:{api:Api;locale:Locale;editable:boolean}) {
  const [members,setMembers]=useState<Member[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  const [subject,setSubject]=useState(""),[manager,setManager]=useState(""),[reason,setReason]=useState("");
  const ar=locale==="ar";
  const load=useCallback(async()=>{setLoading(true);setError("");try{setMembers(await api<Member[]>("/admin/reporting"));}catch(e){setError(e instanceof Error?e.message:"Unable to load team");}finally{setLoading(false);}},[api]);
  useEffect(()=>{void load();},[load]);
  return <section className="card mt-6 p-5"><h2 className="title">{ar?"هيكل فريق التنسيق":"Coordinator reporting team"}</h2><p className="mt-2 text-sm text-ink-500">{ar?"يرى القائد حالات المنسقين الذين يتبعونه مباشرة أو عبر قادة آخرين. لا يُمنح الوصول حتى تُحدّد العلاقة.":"Leads can view cases owned by their direct and indirect reports. Access starts when a reporting relationship is assigned."}</p>
    {loading&&<p role="status" className="mt-4">{ar?"جارٍ التحميل…":"Loading team…"}</p>}
    {error&&<p role="alert" className="mt-4 text-alert-800">{error} <button className="link-cta" onClick={()=>void load()}>{ar?"إعادة المحاولة":"Retry"}</button></p>}
    {!loading&&!members.length&&!error&&<p className="mt-4 text-sm">{ar?"أضف حسابات المنسقين أولًا.":"Add coordinator accounts to start building your team."}</p>}
    <ul className="mt-4 divide-y divide-line">{members.map(member=><li className="flex flex-wrap justify-between gap-2 py-3 text-sm" key={member.subject}><span className="font-semibold">{member.name}{member.role==="COORDINATOR_LEAD"?ar?" · قائد":" · Lead":""}</span><span className="text-ink-500">{member.managerSubject?`${ar?"يتبع":"Reports to"} ${members.find(m=>m.subject===member.managerSubject)?.name??member.managerSubject}`:ar?"لم يُحدّد قائد":"No reporting lead assigned"}</span></li>)}</ul>
    {editable&&members.length>0&&<form className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2" onSubmit={async event=>{event.preventDefault();setBusy(true);setError("");setSaved(false);try{await api(`/admin/reporting/${encodeURIComponent(subject)}`,{method:"PUT",body:JSON.stringify({managerSubject:manager||null,reason})});await load();setSaved(true);setReason("");}catch(e){setError(e instanceof Error?e.message:"Unable to save team");}finally{setBusy(false);}}}>
      <label className="text-sm font-semibold">{ar?"المنسق":"Coordinator"}<select className="field mt-2" required value={subject} onChange={e=>{setSubject(e.target.value);setManager(members.find(m=>m.subject===e.target.value)?.managerSubject??"");setSaved(false);}}><option value="">{ar?"اختر المنسق":"Select coordinator"}</option>{members.map(m=><option key={m.subject} value={m.subject}>{m.name}</option>)}</select></label>
      <label className="text-sm font-semibold">{ar?"القائد المباشر":"Reports to"}<select className="field mt-2" value={manager} onChange={e=>setManager(e.target.value)}><option value="">{ar?"بدون قائد":"No reporting lead"}</option>{members.filter(m=>m.role==="COORDINATOR_LEAD"&&m.subject!==subject).map(m=><option key={m.subject} value={m.subject}>{m.name}</option>)}</select></label>
      <label className="text-sm font-semibold sm:col-span-2">{ar?"سبب التغيير":"Reason for change"}<input className="field mt-2" value={reason} required maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
      <div><button className="btn-primary" disabled={busy||!subject||!reason.trim()}>{ar?"حفظ العلاقة":"Save reporting relationship"}</button></div>
      {saved&&<p role="status" className="text-sm text-brand-700">{ar?"تم تحديث الفريق.":"Reporting team updated."}</p>}
    </form>}
  </section>;
}

export function PractitionerDirectory({api,locale,value,onChange}:{api:Api;locale:Locale;value:string;onChange:(id:string)=>void}) {
  const [items,setItems]=useState<{id:string;displayName?:string;specialty?:string}[]>([]),[search,setSearch]=useState(""),[error,setError]=useState("");
  useEffect(()=>{let alive=true;void api<typeof items>("/admin/practitioners").then(rows=>{if(alive)setItems(rows);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:"Unable to load consultants");});return()=>{alive=false;};},[api]);
  return <div className="space-y-3">{error&&<p role="alert" className="text-sm text-alert-800">{error}</p>}<label className="block text-sm font-semibold">{locale==="ar"?"البحث عن استشاري موجود":"Find an existing consultant"}<input type="search" className="field mt-2" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="block text-sm font-semibold">{locale==="ar"?"الاستشاري":"Consultant"}<select className="field mt-2" value={value} onChange={e=>onChange(e.target.value)}><option value="">{locale==="ar"?"اختر الاستشاري":"Select consultant"}</option>{items.filter(item=>item.id===value||`${item.displayName??""} ${item.specialty??""}`.toLowerCase().includes(search.toLowerCase())).map(item=><option key={item.id} value={item.id}>{item.displayName??item.id}{item.specialty?` · ${item.specialty}`:""}</option>)}</select></label></div>;
}

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
