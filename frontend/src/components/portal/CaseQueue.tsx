"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Search, FolderOpen, LayoutGrid, List, Copy, Check, X, Files, ListTodo,
  Hourglass, SlidersHorizontal, CircleAlert, Stethoscope, UserRound,
} from "lucide-react";

import { RequestInformationDialog } from "@/components/portal/RequestInformationDialog";
import { waitingLabel } from "@/components/portal/MyWork";
import { matchesKpi, type KpiFilter } from "@/components/portal/RoleDashboardSummary";
import type { Locale } from "@/lib/i18n";

export type QueueCase = { id:string; caseNumber:string; patientName?:string|null; status:string; waitingOn?:string|null; waitingReason?:string|null; country:string; preferredLanguage?:string; careCategory?:string; coordinatorSubject?:string; coordinatorName?:string; doctorName?:string; travelPackageRequested?:boolean; createdAt:string; updatedAt:string; assignmentId?:string; assignmentStatus?:string; openTaskCount?:number; overdueTaskCount?:number; documentCount?:number; blockingOverdueCount?:number; highPriorityCount?:number; nextDueAt?:string|null; patientResponsePending?:boolean };
export type QueueState = { view:string; tab:string; kpi:KpiFilter; search:string; status:string; country:string;careArea:string;consultant:string;coordinator:string;createdFrom:string;createdTo:string;updatedFrom:string;updatedTo:string;sort:string;page:number };
export const initialQueue: QueueState = { view:"work", tab:"", kpi:"", search:"", status:"active",country:"",careArea:"",consultant:"",coordinator:"",createdFrom:"",createdTo:"",updatedFrom:"",updatedTo:"",sort:"attention",page:1 };

const terminal = new Set(["CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE"]);

export function ownershipTab(item: QueueCase, subject?: string) { return !item.coordinatorSubject ? "unowned" : item.coordinatorSubject === subject ? "mine" : "team"; }

export function filterQueue<T extends QueueCase>(cases:T[], state:QueueState, coordinator:boolean, subject?:string, role="") {
  const query=state.search.trim().toLocaleLowerCase();
  const start=(value:string)=>value?new Date(`${value}T00:00:00`).getTime():-Infinity,end=(value:string)=>value?new Date(`${value}T23:59:59.999`).getTime():Infinity;
  const filtered=cases.filter(item => (!coordinator || ownershipTab(item,subject)===state.tab) && matchesKpi(item,state.kpi??"",role||(coordinator?"coordinator":"")) && (state.status==="all" || state.status==="active" && !terminal.has(item.status) || item.status===state.status) && (!state.country||item.country===state.country)&&(!state.careArea||item.careCategory===state.careArea)&&(!state.consultant||item.doctorName===state.consultant)&&(!state.coordinator||item.coordinatorName===state.coordinator)&&new Date(item.createdAt).getTime()>=start(state.createdFrom)&&new Date(item.createdAt).getTime()<=end(state.createdTo)&&new Date(item.updatedAt).getTime()>=start(state.updatedFrom)&&new Date(item.updatedAt).getTime()<=end(state.updatedTo)&&(!query || [item.caseNumber,item.patientName,item.country,item.coordinatorName,item.doctorName,item.careCategory].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)));
  if(state.sort==="attention")return filtered.sort((a,b)=>attentionRank(a)-attentionRank(b)||+new Date(b.updatedAt)-+new Date(a.updatedAt));
  return filtered.sort((a,b)=>state.sort==="created-asc"?+new Date(a.createdAt)-+new Date(b.createdAt):state.sort==="created-desc"?+new Date(b.createdAt)-+new Date(a.createdAt):state.sort==="updated-asc"?+new Date(a.updatedAt)-+new Date(b.updatedAt):+new Date(b.updatedAt)-+new Date(a.updatedAt));
}

const DUE_SOON_MS = 24 * 60 * 60 * 1000;

/**
 * How much this case needs a human, derived entirely from its open work items — the case itself carries
 * no priority field and none is introduced. Lower rank means "look at this first".
 *
 * 0 overdue blocking work · 1 high-priority open work · 2 due soon · 3 patient response awaiting staff
 * 4 other open work · 5 nothing open
 */
export function attentionRank(item: QueueCase, now = Date.now()) {
  if ((item.blockingOverdueCount ?? 0) > 0) return 0;
  if ((item.highPriorityCount ?? 0) > 0) return 1;
  const due = item.nextDueAt ? new Date(item.nextDueAt).getTime() : null;
  if ((item.overdueTaskCount ?? 0) > 0) return 2; // overdue, but nothing blocking
  if (due !== null && due - now <= DUE_SOON_MS) return 2;
  if (item.patientResponsePending) return 3;
  if ((item.openTaskCount ?? 0) > 0) return 4;
  return 5;
}

/** The one-word reason a case is near the top, so the ordering is never a mystery. */
function attentionChip(item: QueueCase, ar: boolean, now = Date.now()) {
  const rank = attentionRank(item, now);
  if (rank === 0) return { label: ar ? "متأخر ويوقف التقدم" : "Overdue · blocking", tone: "bg-alert-50 text-alert-800" };
  if (rank === 1) return { label: ar ? "أولوية عالية" : "High priority", tone: "bg-amber-50 text-amber-900" };
  if (rank === 2) return (item.overdueTaskCount ?? 0) > 0
    ? { label: ar ? "متأخر" : "Overdue", tone: "bg-alert-50 text-alert-800" }
    : { label: ar ? "مستحق قريبًا" : "Due soon", tone: "bg-amber-50 text-amber-900" };
  if (rank === 3) return { label: ar ? "رد المريض بانتظار المراجعة" : "Patient responded", tone: "bg-sky-50 text-sky-900" };
  return null;
}

function statusTone(status:string){return ["INFORMATION_REQUIRED","REVISION_REQUESTED","EXPIRED"].includes(status)?"border-amber-200 bg-amber-50 text-amber-900":["CANCELLED","DECLINED","CLINICALLY_NOT_SUITABLE"].includes(status)?"border-alert-200 bg-alert-50 text-alert-800":["CLOSED","DISCHARGED","FOLLOW_UP"].includes(status)?"border-line bg-mist text-ink-600":"border-brand-200 bg-brand-50 text-brand-800";}

/**
 * The operational case list.
 *
 * <p>List-first by default because staff scan and act rather than browse; grid stays available for the
 * people who prefer it. The toolbar carries only search, filters, sort and view — everything else lives
 * in the filter panel and surfaces as removable chips, so the page shows work rather than controls.
 */
export function CaseQueue<T extends QueueCase>({locale,role,cases,subject,lead,busy,state,scope="all",onChange,onOpen,onMutate,statusLabel,categoryLabel}: {
  locale:Locale; role:string; cases:T[]; subject?:string; lead:boolean; busy:boolean; state:QueueState; scope?:"mine"|"team"|"all";
  onChange:(value:QueueState)=>void; onOpen:(item:T)=>void; onMutate:(path:string,body?:unknown,method?:string)=>Promise<unknown>; statusLabel:(value:string)=>string; categoryLabel:(value:string)=>string;
}) {
  const ar=locale==="ar", coordinator=role==="coordinator";
  const [focused,setFocused]=useState<string|null>(null);
  const [view,setView]=useState<"grid"|"list">("list");
  const [copied,setCopied]=useState<string|null>(null);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [infoDialog,setInfoDialog]=useState(false);
  const [selectedIds,setSelectedIds]=useState<Set<string>>(new Set());
  const filterPanel=useRef<HTMLDivElement>(null);
  const filterButton=useRef<HTMLButtonElement>(null);

  useEffect(()=>{try{const saved=localStorage.getItem(`portal-case-view:${role}`);if(saved==="grid"||saved==="list")setView(saved);}catch{}},[role]);
  function changeView(next:"grid"|"list"){setView(next);try{localStorage.setItem(`portal-case-view:${role}`,next);}catch{}}

  useEffect(()=>{
    if(!filtersOpen)return;
    const away=(event:PointerEvent)=>{if(filterPanel.current?.contains(event.target as Node)||filterButton.current?.contains(event.target as Node))return;setFiltersOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setFiltersOpen(false);filterButton.current?.focus();}};
    document.addEventListener("pointerdown",away);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",away);document.removeEventListener("keydown",escape);};
  },[filtersOpen]);

  const text=ar
    ?{title:"قائمة الحالات",unowned:"تحتاج إلى منسق",team:"حالات الفريق",search:"ابحث برقم الحالة أو الاسم أو مجال الرعاية",status:"حالة الطلب",active:"الحالات النشطة",all:"جميع الحالات",empty:"لا توجد حالات هنا",emptyHint:"ستظهر الحالات هنا عندما تصبح متاحة لك.",noMatch:"لا توجد نتائج مطابقة",loading:"جارٍ التحميل…",results:"حالة",filters:"الفلاتر",clearAll:"مسح الكل",sort:"الترتيب",display:"طريقة العرض",list:"قائمة",grid:"بطاقات",open:"فتح",claim:"استلام الحالة",requestInfo:"طلب معلومات",selected:"محددة",clearSelection:"إلغاء التحديد",previous:"السابق",next:"التالي",waiting:"بانتظار",owner:"المنسق",consultant:"الاستشاري",unassigned:"غير مسند",updated:"آخر تحديث",overdue:"متأخر",openWork:"مهام مفتوحة",docs:"مستندات",copy:"نسخ رقم الحالة",copied:"تم النسخ",country:"الدولة",careArea:"مجال الرعاية",createdFrom:"أُنشئت من",createdTo:"أُنشئت إلى",updatedFrom:"حُدّثت من",updatedTo:"حُدّثت إلى",accept:"قبول التعيين"}
    :{title:"Case list",unowned:"Needs ownership",team:"Team cases",search:"Search case number, name or care area",status:"Case status",active:"Active cases",all:"All cases",empty:"No cases here",emptyHint:"Cases appear here when they become available to you.",noMatch:"No cases match these filters",loading:"Loading…",results:"cases",filters:"Filters",clearAll:"Clear all",sort:"Sort",display:"View",list:"List",grid:"Cards",open:"Open",claim:"Take ownership",requestInfo:"Request info",selected:"selected",clearSelection:"Clear selection",previous:"Previous",next:"Next",waiting:"Waiting",owner:"Coordinator",consultant:"Consultant",unassigned:"Unassigned",updated:"Updated",overdue:"Overdue",openWork:"open",docs:"files",copy:"Copy case number",copied:"Copied",country:"Country",careArea:"Care area",createdFrom:"Created from",createdTo:"Created to",updatedFrom:"Updated from",updatedTo:"Updated to",accept:"Accept assignment"};

  // "My cases" is a single accountable list; the team queue keeps the ownership sub-tabs.
  const selected=scope==="mine"?"mine":(state.tab&&state.tab!=="mine"?state.tab:"unowned");
  const current={...state,tab:selected};
  const tabs=scope==="team"?[{id:"unowned",label:text.unowned},...(lead?[{id:"team",label:text.team}]:[])]:[];
  const list=filterQueue(cases,current,coordinator,subject,role);
  const selectedCases=list.filter(item=>selectedIds.has(item.id));
  const pages=Math.max(1,Math.ceil(list.length/12)), page=Math.min(current.page,pages);
  const pageItems=list.slice((page-1)*12,page*12);
  const pageSelected=pageItems.length>0&&pageItems.every(item=>selectedIds.has(item.id));
  const canBulkClaim=coordinator&&selectedCases.length>0&&selectedCases.every(item=>!item.coordinatorSubject&&item.status==="RECEIVED");
  const canBulkRequestInfo=coordinator&&selectedCases.length>0&&selectedCases.every(item=>item.coordinatorSubject===subject&&item.status==="INTAKE_REVIEW");
  const toggle=(id:string)=>setSelectedIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
  const clearSelection=()=>setSelectedIds(new Set());
  const change=(patch:Partial<QueueState>)=>onChange({...current,page:1,...patch});

  const scoped=coordinator?cases.filter(item=>ownershipTab(item,subject)===selected):cases;
  const unique=(values:(string|undefined)[])=>[...new Set(values.filter((value):value is string=>!!value))].sort((a,b)=>a.localeCompare(b));
  const countries=unique(scoped.map(item=>item.country)),careAreas=unique(scoped.map(item=>item.careCategory)),consultants=unique(scoped.map(item=>item.doctorName)),coordinators=unique(scoped.map(item=>item.coordinatorName));

  // Every active refinement becomes a removable chip so the current view is never a mystery.
  const chips:{key:keyof QueueState;label:string;value:string}[]=[];
  if(current.status!=="active")chips.push({key:"status",label:text.status,value:current.status==="all"?text.all:statusLabel(current.status)});
  if(current.country)chips.push({key:"country",label:text.country,value:current.country});
  if(current.careArea)chips.push({key:"careArea",label:text.careArea,value:categoryLabel(current.careArea)});
  if(current.consultant)chips.push({key:"consultant",label:text.consultant,value:current.consultant});
  if(current.coordinator)chips.push({key:"coordinator",label:text.owner,value:current.coordinator});
  if(current.createdFrom)chips.push({key:"createdFrom",label:text.createdFrom,value:current.createdFrom});
  if(current.createdTo)chips.push({key:"createdTo",label:text.createdTo,value:current.createdTo});
  if(current.updatedFrom)chips.push({key:"updatedFrom",label:text.updatedFrom,value:current.updatedFrom});
  if(current.updatedTo)chips.push({key:"updatedTo",label:text.updatedTo,value:current.updatedTo});
  const clearChip=(key:keyof QueueState)=>change({[key]:key==="status"?"active":""} as Partial<QueueState>);
  const clearAll=()=>change({status:"active",country:"",careArea:"",consultant:"",coordinator:"",createdFrom:"",createdTo:"",updatedFrom:"",updatedTo:""});

  return <section aria-label={text.title} className="space-y-4" aria-busy={busy}>
    {infoDialog&&<RequestInformationDialog locale={locale} caseIds={selectedCases.map(item=>item.id)} busy={busy} mutate={onMutate as (path:string,body?:unknown,method?:string)=>Promise<unknown>} onClose={()=>setInfoDialog(false)} onDone={clearSelection}/>}

    {tabs.length>0&&<div role="tablist" aria-label={text.title} className="flex flex-wrap gap-1 border-b border-line-strong">
      {tabs.map((tab,index)=><button key={tab.id} id={`queue-tab-${tab.id}`} role="tab" aria-controls="queue-panel" aria-selected={selected===tab.id}
        tabIndex={(focused??selected)===tab.id?0:-1} type="button"
        className={`-mb-px border-b-2 px-3.5 py-2 text-[0.85rem] font-bold transition ${selected===tab.id?"border-brand-600 text-brand-800":"border-transparent text-ink-500 hover:text-ink-800"}`}
        onFocus={()=>setFocused(tab.id)}
        onKeyDown={event=>{const step=event.key==="ArrowRight"?1:event.key==="ArrowLeft"?-1:0;if(!step)return;event.preventDefault();const next=tabs[(index+step+tabs.length)%tabs.length];setFocused(next.id);document.getElementById(`queue-tab-${next.id}`)?.focus();}}
        onClick={()=>change({tab:tab.id})}>{tab.label}</button>)}
    </div>}

    {/* Toolbar: search, filters, sort, view — nothing else competes for attention. */}
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 basis-56">
        <span className="sr-only">{text.search}</span>
        <Search aria-hidden size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-400"/>
        <input type="search" className="field ps-9" placeholder={text.search} value={state.search} onChange={event=>change({search:event.target.value})}/>
      </label>

      <div className="relative">
        <button ref={filterButton} type="button" aria-expanded={filtersOpen} aria-controls="queue-filters"
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-[0.85rem] font-semibold transition ${chips.length?"border-brand-600 bg-brand-50 text-brand-800":"border-line-strong bg-white text-ink-700 hover:border-brand-300"}`}
                onClick={()=>setFiltersOpen(value=>!value)}>
          <SlidersHorizontal size={16} aria-hidden/>{text.filters}
          {chips.length>0&&<span className="rounded-full bg-brand-600 px-1.5 text-[0.7rem] font-bold text-white">{chips.length}</span>}
        </button>
        {filtersOpen&&<div ref={filterPanel} id="queue-filters" role="dialog" aria-label={text.filters}
             className="absolute end-0 top-12 z-40 w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-4 shadow-xl">
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterSelect label={text.status} value={current.status} options={[...new Set(scoped.map(item=>item.status))]} render={statusLabel} allLabel={text.all} onChange={value=>change({status:value||"active"})} baseLabel={text.active} baseValue="active"/>
            <FilterSelect label={text.country} value={current.country} options={countries} allLabel={ar?"الكل":"All"} onChange={value=>change({country:value})}/>
            <FilterSelect label={text.careArea} value={current.careArea} options={careAreas} render={categoryLabel} allLabel={ar?"الكل":"All"} onChange={value=>change({careArea:value})}/>
            <FilterSelect label={text.consultant} value={current.consultant} options={consultants} allLabel={ar?"الكل":"All"} onChange={value=>change({consultant:value})}/>
            {coordinator&&<FilterSelect label={text.owner} value={current.coordinator} options={coordinators} allLabel={ar?"الكل":"All"} onChange={value=>change({coordinator:value})}/>}
            <DateFilter label={text.createdFrom} value={current.createdFrom} onChange={value=>change({createdFrom:value})}/>
            <DateFilter label={text.createdTo} value={current.createdTo} onChange={value=>change({createdTo:value})}/>
            <DateFilter label={text.updatedFrom} value={current.updatedFrom} onChange={value=>change({updatedFrom:value})}/>
            <DateFilter label={text.updatedTo} value={current.updatedTo} onChange={value=>change({updatedTo:value})}/>
          </div>
          <div className="mt-4 flex justify-between gap-2 border-t border-line pt-3">
            <button type="button" className="text-[0.85rem] font-semibold text-ink-500 hover:text-brand-700" onClick={clearAll}>{text.clearAll}</button>
            <button type="button" className="btn-secondary !min-h-9 !px-3 !text-[0.85rem]" onClick={()=>{setFiltersOpen(false);filterButton.current?.focus();}}>{ar?"تم":"Done"}</button>
          </div>
        </div>}
      </div>

      <label className="min-w-0">
        <span className="sr-only">{text.sort}</span>
        <select className="field !min-h-11 !w-auto !py-0 !text-[0.85rem]" value={current.sort} onChange={event=>change({sort:event.target.value})}>
          <option value="attention">{ar?"الأكثر إلحاحًا":"Needs attention"}</option>
          <option value="updated-desc">{ar?"آخر تحديث":"Last updated"}</option>
          <option value="updated-asc">{ar?"الأقدم تحديثًا":"Least recently updated"}</option>
          <option value="created-desc">{ar?"الأحدث إنشاءً":"Newest first"}</option>
          <option value="created-asc">{ar?"الأقدم إنشاءً":"Oldest first"}</option>
        </select>
      </label>

      <div className="flex rounded-xl border border-line-strong bg-white p-0.5" role="group" aria-label={text.display}>
        {([["list",List,text.list],["grid",LayoutGrid,text.grid]] as const).map(([mode,Icon,label])=>
          <button key={mode} type="button" aria-pressed={view===mode} title={label}
                  className={`flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] font-semibold transition ${view===mode?"bg-brand-100 text-brand-800":"text-ink-500 hover:text-ink-800"}`}
                  onClick={()=>changeView(mode)}><Icon size={15} aria-hidden/><span className="sr-only sm:not-sr-only">{label}</span></button>)}
      </div>
    </div>

    {chips.length>0&&<div className="flex flex-wrap items-center gap-2">
      {chips.map(chip=><span key={String(chip.key)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-mist px-2.5 py-1 text-[0.78rem] font-semibold text-ink-700">
        <span className="text-ink-500">{chip.label}:</span>{chip.value}
        <button type="button" className="rounded-full p-0.5 text-ink-500 hover:bg-white hover:text-alert-700" aria-label={`${ar?"إزالة":"Remove"} ${chip.label}`} onClick={()=>clearChip(chip.key)}><X size={13}/></button>
      </span>)}
      <button type="button" className="text-[0.78rem] font-semibold text-brand-700 underline-offset-4 hover:underline" onClick={clearAll}>{text.clearAll}</button>
    </div>}

    {/* Bulk actions exist only once something is selected. */}
    {selectedCases.length>0&&<div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
      <p className="text-[0.85rem] font-bold text-brand-900">{selectedCases.length} {text.selected}</p>
      <div className="ms-auto flex flex-wrap gap-2">
        {canBulkClaim&&<button type="button" className="btn-primary !min-h-9 !px-3 !text-[0.82rem]" disabled={busy} onClick={async()=>{for(const item of selectedCases)await onMutate(`/coordinator/cases/${item.id}/claim`);clearSelection();}}><Check size={14}/>{text.claim}</button>}
        {canBulkRequestInfo&&<button type="button" className="btn-secondary !min-h-9 !px-3 !text-[0.82rem]" disabled={busy} onClick={()=>setInfoDialog(true)}>{text.requestInfo}</button>}
        <button type="button" className="text-[0.82rem] font-semibold text-ink-600 hover:text-brand-700" onClick={clearSelection}>{text.clearSelection}</button>
      </div>
    </div>}

    <div id="queue-panel" role={tabs.length?"tabpanel":undefined} aria-labelledby={tabs.length?`queue-tab-${selected}`:undefined} tabIndex={tabs.length?0:undefined}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p role="status" className="text-[0.82rem] text-ink-500">{busy?text.loading:`${list.length} ${text.results}`}</p>
        {coordinator&&pageItems.length>0&&<label className="flex items-center gap-2 text-[0.8rem] font-semibold text-ink-600">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={pageSelected}
                 onChange={event=>setSelectedIds(currentIds=>{const next=new Set(currentIds);for(const item of pageItems){if(event.target.checked)next.add(item.id);else next.delete(item.id);}return next;})}/>
          {ar?"تحديد الصفحة":"Select page"}
        </label>}
      </div>

      {!busy&&!list.length
        ?<div className="card px-6 py-10 text-center"><FolderOpen className="mx-auto mb-3 text-brand-600" size={26} aria-hidden/><h3 className="font-bold text-ink-900">{chips.length||state.search?text.noMatch:text.empty}</h3><p className="mt-1.5 text-[0.85rem] text-ink-500">{text.emptyHint}</p>{(chips.length>0||state.search)&&<button type="button" className="link-cta mt-4 text-[0.85rem]" onClick={()=>{clearAll();change({search:""});}}>{text.clearAll}</button>}</div>
        :<ul className={view==="grid"?"grid gap-3 md:grid-cols-2 xl:grid-cols-3":"divide-y divide-line overflow-hidden rounded-xl border border-line bg-white"}>
          {pageItems.map(item=>{
            const pending=item.assignmentStatus==="PENDING"&&item.assignmentId;
            const claimable=coordinator&&!item.coordinatorSubject&&item.status==="RECEIVED";
            const overdue=(item.overdueTaskCount??0)>0;
            const attention=attentionChip(item,ar);
            const quick=async(path:string,body?:unknown)=>{await onMutate(path,body);};
            const meta=<>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.72rem] font-bold ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
              {item.waitingOn&&item.waitingOn!=="NONE"&&<span className="inline-flex items-center gap-1 text-[0.75rem] text-ink-600"><Hourglass size={12} className="text-brand-600" aria-hidden/>{text.waiting}: <strong className="font-semibold text-ink-800">{waitingLabel(item.waitingOn,locale)}</strong></span>}
              {attention&&<span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.72rem] font-bold ${attention.tone}`}>{overdue&&<CircleAlert size={12} aria-hidden/>}{attention.label}</span>}
            </>;
            const people=<>
              <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-600"><UserRound size={13} className="text-ink-400" aria-hidden/>{item.coordinatorName??text.unassigned}</span>
              {item.doctorName&&<span className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-600"><Stethoscope size={13} className="text-ink-400" aria-hidden/>{item.doctorName}</span>}
              {(item.openTaskCount??0)>0&&<span className="inline-flex items-center gap-1 text-[0.75rem] text-ink-500"><ListTodo size={13} aria-hidden/>{item.openTaskCount} {text.openWork}</span>}
              {(item.documentCount??0)>0&&<span className="inline-flex items-center gap-1 text-[0.75rem] text-ink-500"><Files size={13} aria-hidden/>{item.documentCount} {text.docs}</span>}
            </>;
            const actions=<>
              {claimable&&<button type="button" className="btn-primary !min-h-9 !px-3 !text-[0.82rem]" disabled={busy} onClick={()=>void quick(`/coordinator/cases/${item.id}/claim`)}><Check size={14} aria-hidden/>{text.claim}</button>}
              {pending&&<button type="button" className="btn-primary !min-h-9 !px-3 !text-[0.82rem]" disabled={busy} onClick={()=>void quick(`/${role}/cases/${item.id}/assignments/${item.assignmentId}`,{accept:true})}>{text.accept}</button>}
              <button type="button" className={`${claimable||pending?"btn-secondary":"btn-primary"} !min-h-9 !px-3 !text-[0.82rem]`} disabled={busy} onClick={()=>onOpen(item)}>{text.open}<ArrowRight size={14} aria-hidden className="rtl:rotate-180"/></button>
            </>;

            if(view==="grid")return <li key={item.id} className="card flex flex-col p-4">
              <div className="flex items-start gap-2">
                {coordinator&&<input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-brand-600" checked={selectedIds.has(item.id)} onChange={()=>toggle(item.id)} aria-label={`${text.selected} ${item.caseNumber}`}/>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink-900">{item.patientName||item.caseNumber}</p>
                  <p className="mt-0.5 text-[0.75rem] font-semibold text-brand-700" dir="ltr">{item.caseNumber}{item.careCategory?` · ${categoryLabel(item.careCategory)}`:""}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">{meta}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">{people}</div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div>
            </li>;

            return <li key={item.id} className="flex flex-col gap-3 p-3.5 transition hover:bg-brand-50/40 sm:flex-row sm:items-center sm:gap-4">
              {coordinator&&<input type="checkbox" className="h-4 w-4 flex-none accent-brand-600" checked={selectedIds.has(item.id)} onChange={()=>toggle(item.id)} aria-label={`${text.selected} ${item.caseNumber}`}/>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <p className="truncate font-bold text-ink-900">{item.patientName||item.caseNumber}</p>
                  <span className="text-[0.75rem] font-semibold text-brand-700" dir="ltr">{item.caseNumber}</span>
                  {item.careCategory&&<span className="text-[0.75rem] text-ink-500">{categoryLabel(item.careCategory)}</span>}
                  <button type="button" className="text-ink-400 transition hover:text-brand-700" title={copied===item.id?text.copied:text.copy} aria-label={text.copy}
                          onClick={()=>{void navigator.clipboard?.writeText(item.caseNumber).then(()=>{setCopied(item.id);setTimeout(()=>setCopied(null),1500);}).catch(()=>{});}}>
                    {copied===item.id?<Check size={13}/>:<Copy size={13}/>}
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">{meta}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">{people}
                  <span className="text-[0.75rem] text-ink-400">{text.updated} {new Intl.DateTimeFormat(locale,{day:"numeric",month:"short"}).format(new Date(item.updatedAt))}</span>
                </div>
              </div>
              <div className="flex flex-none flex-wrap gap-2 sm:justify-end">{actions}</div>
            </li>;
          })}
        </ul>}

      {pages>1&&<nav className="mt-4 flex items-center justify-between gap-3" aria-label={ar?"صفحات الحالات":"Case pages"}>
        <button type="button" className="btn-secondary !min-h-9 !px-3 !text-[0.82rem]" disabled={page===1} onClick={()=>change({page:page-1})}>{text.previous}</button>
        <span className="text-[0.82rem] text-ink-500">{page} / {pages}</span>
        <button type="button" className="btn-secondary !min-h-9 !px-3 !text-[0.82rem]" disabled={page===pages} onClick={()=>change({page:page+1})}>{text.next}</button>
      </nav>}
    </div>
  </section>;
}

function FilterSelect({label,value,options,render,onChange,allLabel="All",baseLabel,baseValue}:{label:string;value:string;options:string[];render?:(value:string)=>string;onChange:(value:string)=>void;allLabel?:string;baseLabel?:string;baseValue?:string}){
  return <label className="text-[0.8rem] font-semibold text-ink-700">{label}
    <select className="field mt-1.5 !min-h-10 !text-[0.85rem]" value={value} onChange={event=>onChange(event.target.value)}>
      {baseValue!==undefined&&<option value={baseValue}>{baseLabel}</option>}
      <option value={baseValue!==undefined?"all":""}>{allLabel}</option>
      {options.filter(option=>option!==baseValue).sort().map(option=><option key={option} value={option}>{render?render(option):option}</option>)}
    </select>
  </label>;
}

function DateFilter({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
  return <label className="text-[0.8rem] font-semibold text-ink-700">{label}
    <input className="field mt-1.5 !min-h-10 !text-[0.85rem]" type="date" value={value} onChange={event=>onChange(event.target.value)}/>
  </label>;
}
