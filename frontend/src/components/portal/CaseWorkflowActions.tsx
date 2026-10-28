"use client";

import type { FormEvent } from "react";
import type { Locale } from "@/lib/i18n";
import type { DirectoryFacility } from "@/components/portal/portal-model";

type CaseSummary={id:string;status:string;version:number;careCategory?:string};
type CaseDocument={documentId:string;fileName:string;status:string};
type Mutate=(path:string,body?:unknown,method?:string)=>Promise<unknown>;
const words={en:{travel:"Update travel plan",arrival:"Planned arrival",facility:"Facility",chooseFacility:"Choose a facility",noFacilities:"No active facility is set up yet. Ask Consultant Operations to add one in the Control Center.",save:"Save"},ar:{travel:"تحديث خطة السفر",arrival:"موعد الوصول المخطط",facility:"المنشأة الطبية",chooseFacility:"اختر منشأة",noFacilities:"لا توجد منشأة نشطة بعد. اطلب من عمليات الاستشاريين إضافتها في مركز التحكم.",save:"حفظ"}};

/**
 * Stage forms outside the action contract's panels: Operations' travel plan.
 *
 * <p>UX 3-1 retired the Consultant's legacy treatment-episode and follow-up forms, which duplicated the admission, treatment,
 * discharge and follow-up panels (P1-15..P1-18). B-3-1b retired the last one, the start of treatment: treatment now starts on
 * the admission, when the hospital's admission number is recorded on a cleared case (the Admission panel).
 */
export function CaseWorkflowActions({locale,role,caseSummary,availableActions=[],mutate,facilities=[],travelPlan=null}:{locale:Locale;role:string;caseSummary:CaseSummary;availableActions?:string[];patientAction?:unknown;mutate:Mutate;busy?:boolean;doctors?:unknown[];categories?:unknown[];staff?:unknown[];documents?:CaseDocument[];/** P0-5: the facility directory; the picker replaces the free-text field. */facilities?:DirectoryFacility[];/** The stored plan, so the form reopens on the chosen facility and status. */travelPlan?:{facilityId?:string|null;status?:string}|null;travelPackage?:boolean;financeRequired?:boolean}){const t=words[locale];const operationsSupported=role==="operations"&&availableActions.includes("UPDATE_TRAVEL_PLAN")&&["ACCEPTED","TRAVEL_COORDINATION"].includes(caseSummary.status);
 if(!operationsSupported)return null;return <section className="card p-5"><div className="grid gap-6 lg:grid-cols-2">
 {operationsSupported&&<form className="space-y-3" onSubmit={event=>submit(event,data=>mutate(`/operations/cases/${caseSummary.id}/travel`,{plannedArrival:date(data.get("arrival")),confirmedArrival:data.get("confirmedArrival")?date(data.get("confirmedArrival")):null,visaStatus:data.get("visaStatus"),flightDetails:data.get("flightDetails"),facilityId:data.get("facilityId")||null,status:data.get("status")},"PUT"))}><h4 className="font-bold">{t.travel}</h4><label className="block text-sm font-semibold">{t.arrival}<input className="field" name="arrival" type="datetime-local"/></label><label className="block text-sm font-semibold">{locale==="ar"?"الوصول المؤكد":"Confirmed arrival"}<input className="field" name="confirmedArrival" type="datetime-local"/></label><label className="block text-sm font-semibold">{locale==="ar"?"حالة التأشيرة":"Visa status"}<input className="field" name="visaStatus" placeholder={locale==="ar"?"مثال: صادرة":"For example: issued"}/></label><label className="block text-sm font-semibold">{locale==="ar"?"تفاصيل الرحلة":"Flight details"}<input className="field" name="flightDetails" placeholder={locale==="ar"?"رقم الرحلة وموعدها":"Flight number and time"}/></label><label className="block text-sm font-semibold">{t.facility}<select className="field" name="facilityId" defaultValue={travelPlan?.facilityId??""}><option value="">{t.chooseFacility}</option>{facilities.map(f=><option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}</select></label>{facilities.length===0&&<p className="text-sm text-ink-500">{t.noFacilities}</p>}<label className="block text-sm font-semibold">{locale==="ar"?"الحالة":"Status"}<select className="field" name="status" defaultValue={travelPlan?.status??"PLANNING"}><option value="PLANNING">{locale==="ar"?"قيد التخطيط":"Planning"}</option><option value="CONFIRMED">{locale==="ar"?"حجز مؤكد":"Confirmed booking"}</option><option value="ARRIVED">{locale==="ar"?"تم الوصول":"Arrived"}</option></select></label><button className="btn-primary">{t.save}</button></form>}
 </div></section>}

function submit(event:FormEvent<HTMLFormElement>,action:(data:FormData)=>Promise<unknown>){event.preventDefault();const form=event.currentTarget;void action(new FormData(form)).then(result=>{if(result)form.reset();});}
function date(value:FormDataEntryValue|null){return value?new Date(String(value)).toISOString():null;}

