"use client";

import { useState } from "react";
import { ArrowRight, Search, FolderOpen, MapPin, Stethoscope, UserRound, Plane, CalendarClock } from "lucide-react";
import type { Locale } from "@/lib/i18n";

export type QueueCase = { id:string; caseNumber:string; patientName?:string|null; status:string; country:string; careCategory?:string; coordinatorSubject?:string; coordinatorName?:string; doctorName?:string; travelPackageRequested?:boolean; updatedAt:string };
export type QueueState = { tab:string; search:string; status:string; page:number };
export const initialQueue: QueueState = { tab:"", search:"", status:"active", page:1 };
const terminal = new Set(["CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE"]);
export function ownershipTab(item: QueueCase, subject?: string) { return !item.coordinatorSubject ? "unowned" : item.coordinatorSubject === subject ? "mine" : "team"; }
export function filterQueue<T extends QueueCase>(cases:T[], state:QueueState, coordinator:boolean, subject?:string) {
  const query=state.search.trim().toLocaleLowerCase();
  return cases.filter(item => (!coordinator || ownershipTab(item,subject)===state.tab) && (state.status==="all" || state.status==="active" && !terminal.has(item.status) || item.status===state.status) && (!query || [item.caseNumber,item.patientName,item.country,item.coordinatorName,item.careCategory].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)));
}

export function CaseQueue<T extends QueueCase>({locale,role,cases,subject,lead,busy,state,onChange,onOpen,statusLabel,categoryLabel}: {
  locale:Locale; role:string; cases:T[]; subject?:string; lead:boolean; busy:boolean; state:QueueState;
  onChange:(value:QueueState)=>void; onOpen:(item:T)=>void; statusLabel:(value:string)=>string; categoryLabel:(value:string)=>string;
}) {
  const ar=locale==="ar", coordinator=role==="coordinator";
  const [focused,setFocused]=useState<string|null>(null);
  const text=ar?{title:"قائمة العمل",unowned:"تحتاج إلى منسق",mine:"حالاتي",team:"حالات الفريق",search:"ابحث برقم الحالة أو الاسم أو مجال الرعاية",status:"حالة الطلب",active:"الحالات النشطة",all:"جميع الحالات",empty:"لا توجد حالات في هذه القائمة",emptyHint:"ستظهر الحالات هنا عندما تصبح متاحة لك.",noMatch:"لا توجد نتائج مطابقة",reset:"مسح البحث والفلاتر",open:"فتح مساحة العمل",review:"مراجعة الحالة",routing:"طلب رعاية جديد",owner:"المنسق",updated:"آخر تحديث",previous:"السابق",next:"التالي",results:"حالة",loading:"جارٍ تحميل الحالات…",history:"تشمل الحالات المكتملة",reviewHint:"راجع معلومات الاستقبال قبل تولّي المسؤولية."}
    :{title:"Work queue",unowned:"Needs ownership",mine:"My cases",team:"Team cases",search:"Search case number, name or care area",status:"Case status",active:"Active cases",all:"All cases",empty:"No cases in this queue",emptyHint:"Cases will appear here when they become available to you.",noMatch:"No matching cases",reset:"Clear search and filters",open:"Open workspace",review:"Review case",routing:"New care request",owner:"Coordinator",updated:"Updated",previous:"Previous",next:"Next",results:"cases",loading:"Loading cases…",history:"Includes completed cases",reviewHint:"Review the intake before taking ownership."};
  const selected=state.tab || (cases.some(item=>ownershipTab(item,subject)==="mine"&&!terminal.has(item.status))?"mine":"unowned");
  const current={...state,tab:selected};
  const tabs=[{id:"unowned",label:text.unowned},{id:"mine",label:text.mine},...(lead?[{id:"team",label:text.team}]:[])];
  const list=filterQueue(cases,current,coordinator,subject);
  const pages=Math.max(1,Math.ceil(list.length/10)), page=Math.min(current.page,pages);
  const change=(patch:Partial<QueueState>)=>onChange({...current,page:1,...patch});
  const scope=coordinator?cases.filter(item=>ownershipTab(item,subject)===selected):cases;
  return <section aria-label={text.title} className="space-y-5" aria-busy={busy}>
    {coordinator && <div role="tablist" aria-label={text.title} className="flex flex-wrap gap-1 border-b border-line-strong">{tabs.map((tab,index)=><button key={tab.id} id={`queue-tab-${tab.id}`} role="tab" aria-controls="queue-panel" aria-selected={selected===tab.id} tabIndex={(focused??selected)===tab.id?0:-1} onFocus={()=>setFocused(tab.id)} onClick={()=>change({tab:tab.id,status:"active"})} onKeyDown={event=>{const direction=event.key==="ArrowRight"?(ar?-1:1):event.key==="ArrowLeft"?(ar?1:-1):0;const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:direction?(index+direction+tabs.length)%tabs.length:-1;if(next>=0){event.preventDefault();change({tab:tabs[next].id,status:"active"});document.getElementById(`queue-tab-${tabs[next].id}`)?.focus();}}} className={`flex min-h-12 items-center gap-2 border-b-[3px] px-4 py-3 text-sm font-semibold max-sm:gap-1 max-sm:px-2 ${selected===tab.id?"rounded-t-lg border-brand-700 bg-brand-50 text-brand-800":"border-transparent text-ink-500"}`}>{tab.label}<span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs">{cases.filter(item=>ownershipTab(item,subject)===tab.id&&!terminal.has(item.status)).length}</span></button>)}</div>}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="block flex-1 text-sm font-semibold"><span>{text.search}</span><span className="relative mt-2 block"><Search aria-hidden size={18} className="absolute start-3 top-3.5 text-ink-500"/><input type="search" className="field ps-10" value={state.search} onChange={event=>change({search:event.target.value})}/></span></label>
      <label className="block text-sm font-semibold sm:w-56">{text.status}<select className="field mt-2" value={state.status} onChange={event=>change({status:event.target.value})}><option value="active">{text.active}</option><option value="all">{text.all}</option>{[...new Set(scope.map(item=>item.status))].sort().map(status=><option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
    </div>
    <div id="queue-panel" role={coordinator?"tabpanel":undefined} aria-labelledby={coordinator?`queue-tab-${selected}`:undefined} tabIndex={0}>
      <p role="status" className="mb-3 text-sm text-ink-500">{busy?text.loading:`${list.length} ${text.results}`}</p>
      {!busy&&!list.length?<div className="card px-6 py-12 text-center"><FolderOpen className="mx-auto mb-3 text-brand-600" size={30}/><h2 className="title">{state.search||state.status!=="active"?text.noMatch:text.empty}</h2><p className="mt-2 text-sm text-ink-500">{text.emptyHint}</p>{(state.search||state.status!=="active")&&<button className="btn-secondary mt-5" onClick={()=>change({search:"",status:"active"})}>{text.reset}</button>}</div>:
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.slice((page-1)*10,page*10).map(item=><article key={item.id} className="group flex min-h-80 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
        <div className="border-b border-line bg-gradient-to-br from-brand-50 to-white p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold tracking-wide text-brand-700" dir="ltr">{item.caseNumber}</p><h2 className="mt-1 truncate text-lg font-bold text-ink-900">{item.patientName||text.routing}</h2></div><span className="status-badge shrink-0">{statusLabel(item.status)}</span></div>{item.careCategory&&<p className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink-600 ring-1 ring-line">{categoryLabel(item.careCategory)}</p>}</div>
        <div className="grid flex-1 content-start gap-3 p-5 text-sm"><p className="flex items-center gap-2 text-ink-600"><MapPin size={16} className="text-brand-600"/><span>{item.country}</span></p><p className="flex items-center gap-2 text-ink-600"><CalendarClock size={16} className="text-brand-600"/><span>{text.updated}: {new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(item.updatedAt))}</span></p>{item.coordinatorName&&<p className="flex items-center gap-2 text-ink-600"><UserRound size={16} className="text-brand-600"/><span>{text.owner}: {item.coordinatorName}</span></p>}{item.doctorName&&<p className="flex items-center gap-2 text-ink-600"><Stethoscope size={16} className="text-brand-600"/><span>{ar?"الاستشاري":"Consultant"}: {item.doctorName}</span></p>}{item.travelPackageRequested&&<p className="flex items-center gap-2 font-semibold text-accent-800"><Plane size={16}/><span>{ar?"تشمل ترتيبات السفر":"Travel support requested"}</span></p>}{coordinator&&!item.coordinatorSubject&&<p className="rounded-lg bg-accent-50 p-2.5 text-xs text-ink-600">{text.reviewHint}</p>}</div>
        <div className="border-t border-line p-4"><button className="btn-secondary w-full" disabled={busy} onClick={()=>{onChange(current);onOpen(item);}} aria-label={`${coordinator&&!item.coordinatorSubject?text.review:text.open} ${item.caseNumber}`}>{coordinator&&!item.coordinatorSubject?text.review:text.open}<ArrowRight size={16} className="rtl:rotate-180"/></button></div>
      </article>)}</div>}
      {pages>1&&<nav className="mt-4 flex items-center justify-between gap-3" aria-label={ar?"صفحات الحالات":"Case pages"}><button className="btn-secondary" disabled={page===1} onClick={()=>change({page:page-1})}>{text.previous}</button><span className="text-sm">{page} / {pages}</span><button className="btn-secondary" disabled={page===pages} onClick={()=>change({page:page+1})}>{text.next}</button></nav>}
    </div>
  </section>;
}
