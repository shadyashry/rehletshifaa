"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/i18n";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { fillTemplate } from "@/lib/portal-labels";
import type { DirectoryFacility } from "@/components/portal/portal-model";

type CaseSummary={id:string;status:string;version:number;careCategory?:string};
type CaseDocument={documentId:string;fileName:string;status:string};
type Mutate=(path:string,body?:unknown,method?:string)=>Promise<unknown>;
const words={en:{travel:"Update travel plan",arrival:"Planned arrival",facility:"Facility",chooseFacility:"Choose a facility",noFacilities:"No active facility is set up yet. Ask Consultant Operations to add one in the Control Center.",save:"Save"},ar:{travel:"تحديث خطة السفر",arrival:"موعد الوصول المخطط",facility:"المنشأة الطبية",chooseFacility:"اختر منشأة",noFacilities:"لا توجد منشأة نشطة بعد. اطلب من عمليات الاستشاريين إضافتها في مركز التحكم.",save:"حفظ"}};

/**
 * Stage forms outside the action contract's panels: Operations' travel plan, and the Consultant's start of treatment.
 *
 * <p>UX 3-1 retired the Consultant's legacy treatment-episode and follow-up forms, which duplicated the admission, treatment,
 * discharge and follow-up panels (P1-15..P1-18) and could record facts that contradict them. What stays is the one act the
 * backend still has no other path for: opening treatment for an arrived, cleared patient (`/treatment-episodes` moves the case
 * from ARRIVAL_CONFIRMED through ADMISSION_READY into TREATMENT_IN_PROGRESS). Recorded as backend follow-up B-3-1: move that
 * transition onto the admission (the hospital's admission number) and retire the endpoint.
 */
export function CaseWorkflowActions({locale,role,caseSummary,availableActions=[],mutate,facilities=[],travelPlan=null,busy=false,load}:{locale:Locale;role:string;caseSummary:CaseSummary;availableActions?:string[];patientAction?:unknown;mutate:Mutate;busy?:boolean;/** Reads the admission view (its clearance) for the Consultant's start of treatment. */load?:<T>(path:string)=>Promise<T>;doctors?:unknown[];categories?:unknown[];staff?:unknown[];documents?:CaseDocument[];/** P0-5: the facility directory; the picker replaces the free-text field. */facilities?:DirectoryFacility[];/** The stored plan, so the form reopens on the chosen facility and status. */travelPlan?:{facilityId?:string|null;status?:string}|null;travelPackage?:boolean;financeRequired?:boolean}){const t=words[locale];const operationsSupported=role==="operations"&&availableActions.includes("UPDATE_TRAVEL_PLAN")&&["ACCEPTED","TRAVEL_COORDINATION"].includes(caseSummary.status);
 if(role==="doctor"&&START_STAGES.has(caseSummary.status))return <StartTreatment caseId={caseSummary.id} stage={caseSummary.status} facilities={facilities} busy={busy} mutate={mutate} load={load}/>;
 if(!operationsSupported)return null;return <section className="card p-5"><div className="grid gap-6 lg:grid-cols-2">
 {operationsSupported&&<form className="space-y-3" onSubmit={event=>submit(event,data=>mutate(`/operations/cases/${caseSummary.id}/travel`,{plannedArrival:date(data.get("arrival")),confirmedArrival:data.get("confirmedArrival")?date(data.get("confirmedArrival")):null,visaStatus:data.get("visaStatus"),flightDetails:data.get("flightDetails"),facilityId:data.get("facilityId")||null,status:data.get("status")},"PUT"))}><h4 className="font-bold">{t.travel}</h4><label className="block text-sm font-semibold">{t.arrival}<input className="field" name="arrival" type="datetime-local"/></label><label className="block text-sm font-semibold">{locale==="ar"?"الوصول المؤكد":"Confirmed arrival"}<input className="field" name="confirmedArrival" type="datetime-local"/></label><label className="block text-sm font-semibold">{locale==="ar"?"حالة التأشيرة":"Visa status"}<input className="field" name="visaStatus" placeholder={locale==="ar"?"مثال: صادرة":"For example: issued"}/></label><label className="block text-sm font-semibold">{locale==="ar"?"تفاصيل الرحلة":"Flight details"}<input className="field" name="flightDetails" placeholder={locale==="ar"?"رقم الرحلة وموعدها":"Flight number and time"}/></label><label className="block text-sm font-semibold">{t.facility}<select className="field" name="facilityId" defaultValue={travelPlan?.facilityId??""}><option value="">{t.chooseFacility}</option>{facilities.map(f=><option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}</select></label>{facilities.length===0&&<p className="text-sm text-ink-500">{t.noFacilities}</p>}<label className="block text-sm font-semibold">{locale==="ar"?"الحالة":"Status"}<select className="field" name="status" defaultValue={travelPlan?.status??"PLANNING"}><option value="PLANNING">{locale==="ar"?"قيد التخطيط":"Planning"}</option><option value="CONFIRMED">{locale==="ar"?"حجز مؤكد":"Confirmed booking"}</option><option value="ARRIVED">{locale==="ar"?"تم الوصول":"Arrived"}</option></select></label><button className="btn-primary">{t.save}</button></form>}
 </div></section>}

/** The stages in which the backend opens treatment from the Consultant's record (before that, it refuses; after, it is open). */
const START_STAGES:ReadonlySet<string>=new Set(["ARRIVAL_CONFIRMED","ADMISSION_READY"]);

/**
 * Opening treatment: where, when, and the hospital's admission number (P1-15). Offered only once the admission view says the
 * patient is cleared (no admission blockers: final quote accepted, procedure consent, balance evidenced), and confirmed first —
 * the case moves into treatment and that is not undone here. The backend checks the same clearance and refuses otherwise.
 * A secondary action: the Consultant's step at arrival is the final assessment.
 */
function StartTreatment({caseId,stage,facilities,busy,mutate,load}:{caseId:string;stage:string;facilities:DirectoryFacility[];busy:boolean;mutate:Mutate;load?:<T>(path:string)=>Promise<T>}){
 const work=useWorkCopy();const t=work.caseView.startTreatment;const number=work.admission.forms;const id=useId();
 const[cleared,setCleared]=useState<boolean|null>(stage==="ADMISSION_READY"?true:null);
 useEffect(()=>{if(stage==="ADMISSION_READY"||!load)return;let live=true;
  void load<{admissionBlockers?:string[]}>(`/doctor/cases/${caseId}/admission`).then(view=>{if(live)setCleared((view?.admissionBlockers??[]).length===0);},()=>{if(live)setCleared(false);});
  return()=>{live=false;};},[caseId,stage,load]);
 const[error,setError]=useState(false);const[pending,setPending]=useState<FormData|null>(null);const formRef=useRef<HTMLFormElement>(null);
 const facilityName=(data:FormData)=>facilities.find(f=>f.id===data.get("facilityId"))?.name??"";
 const ask=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget);
  if(!data.get("facilityId")||!data.get("startAt")){setError(true);(event.currentTarget.querySelector<HTMLElement>(data.get("facilityId")?"[name=startAt]":"[name=facilityId]"))?.focus();return;}
  setError(false);setPending(data);};
 const start=(data:FormData)=>void mutate(`/doctor/cases/${caseId}/treatment-episodes`,{facilityId:data.get("facilityId"),startAt:date(data.get("startAt")),endAt:null,status:"IN_PROGRESS",admissionNumber:String(data.get("admissionNumber")??"").trim()||null}).then(result=>{if(result)formRef.current?.reset();});
 if(cleared===null)return null;
 const invalid=error?{"aria-invalid":true,"aria-describedby":`${id}-error`}:{};
 return <section aria-labelledby={`${id}-title`} className="card p-4 sm:p-5">
  <h3 id={`${id}-title`} className="text-[1.0625rem] font-bold text-brand-900">{t.title}</h3>
  {!cleared?<p className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.waiting}</p>:<>
  <p className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.hint}</p>
  <form ref={formRef} noValidate className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={ask}>
   <label className="block text-[0.875rem] font-bold text-ink-800">{t.facility}<select className={`field mt-1 ${error?"field-error":""}`} name="facilityId" aria-required="true" {...invalid} aria-describedby={[error?`${id}-error`:"",facilities.length===0?`${id}-none`:""].filter(Boolean).join(" ")||undefined} onChange={()=>setError(false)}><option value="">{t.choose}</option>{facilities.map(f=><option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}</select></label>
   <label className="block text-[0.875rem] font-bold text-ink-800">{t.startsAt}<input className={`field mt-1 ${error?"field-error":""}`} name="startAt" type="datetime-local" aria-required="true" {...invalid} onChange={()=>setError(false)}/></label>
   {error&&<p id={`${id}-error`} role="alert" className="error-text sm:col-span-2">{t.required}</p>}
   {facilities.length===0&&<p id={`${id}-none`} className="text-[0.875rem] text-ink-600 sm:col-span-2">{t.none}</p>}
   <label className="block text-[0.875rem] font-bold text-ink-800 sm:col-span-2">{number.numberField}<input className="field mt-1 max-w-sm" name="admissionNumber" maxLength={80} autoComplete="off" spellCheck={false} dir="ltr" aria-describedby={`${id}-number-hint`}/><span id={`${id}-number-hint`} className="mt-1 block text-[0.8125rem] font-normal text-ink-500">{number.numberHint}</span></label>
   <div className="sm:col-span-2"><button type="submit" className="btn-secondary" disabled={busy} aria-haspopup="dialog">{t.save}</button></div>
  </form></>}
  {pending&&<ConfirmDialog title={fillTemplate(t.confirmTitle,{facility:facilityName(pending)})} body={t.confirmBody} confirm={t.save} cancel={t.keep}
   onCancel={()=>setPending(null)} onConfirm={()=>{const data=pending;setPending(null);start(data);}}/>}
 </section>;
}

function submit(event:FormEvent<HTMLFormElement>,action:(data:FormData)=>Promise<unknown>){event.preventDefault();const form=event.currentTarget;void action(new FormData(form)).then(result=>{if(result)form.reset();});}
function date(value:FormDataEntryValue|null){return value?new Date(String(value)).toISOString():null;}

