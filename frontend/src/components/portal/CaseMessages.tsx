"use client";
import { useState } from "react";
import type { Locale } from "@/lib/i18n";

type Message={id:string;threadType?:string;senderRole:string;senderName?:string;direction:string;body:string;createdAt:string;read:boolean};
type Mutate=(path:string,body?:unknown,method?:string)=>Promise<unknown>;
export function CaseMessages({locale,role,caseId,messages,canSend,busy,mutate}:{locale:Locale;role:string;caseId:string;messages:Message[];canSend:boolean;busy:boolean;mutate:Mutate}){
  const ar=locale==="ar";
  const fixed=role==="doctor"?"COORDINATOR_DOCTOR":role==="operations"?"COORDINATOR_OPERATIONS":role==="finance"?"COORDINATOR_FINANCE":"PATIENT_COORDINATOR";
  const [selected,setSelected]=useState(fixed);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const threads=ar?{PATIENT_COORDINATOR:"المريض",COORDINATOR_DOCTOR:"الطبيب · داخلي",COORDINATOR_OPERATIONS:"العمليات · داخلي",COORDINATOR_FINANCE:"المالية · داخلي"}:{PATIENT_COORDINATOR:"Patient",COORDINATOR_DOCTOR:"Doctor · internal",COORDINATOR_OPERATIONS:"Operations · internal",COORDINATOR_FINANCE:"Finance · internal"};
  const thread=role==="coordinator"?selected:fixed;
  const visible=messages.filter(m=>!m.threadType||m.threadType===thread);
  if(!messages.length&&!canSend)return null;
  return <section className="card mt-6 p-5"><h3 className="title">{ar?"الرسائل الآمنة":"Secure messages"}</h3>
    {role==="coordinator"&&<label className="mt-4 block text-sm font-semibold">{ar?"المحادثة":"Conversation"}<select className="field mt-2" value={thread} onChange={e=>setSelected(e.target.value)}>{Object.entries(threads).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
    <div className="mt-4 space-y-3">{visible.map(m=><article key={m.id} className={`rounded-xl p-3 ${m.direction==="OUTBOUND"?"ms-6 bg-brand-100":"me-6 bg-brand-50"}`}><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-bold">{m.senderName??(ar?"فريق الرعاية":"Care team")}</p><time className="text-xs text-ink-500" dateTime={m.createdAt}>{new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"short"}).format(new Date(m.createdAt))}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm" dir="auto">{m.body}</p>{!m.read&&m.direction==="INBOUND"&&<button disabled={busy} className="mt-2 min-h-8 text-xs font-bold text-brand-700" onClick={()=>void mutate(`/${role}/cases/${caseId}/messages/${m.id}/read`)}>{ar?"تحديد كمقروءة":"Mark read"}</button>}</article>)}</div>
    {canSend&&<form className="mt-4" onSubmit={async event=>{event.preventDefault();const body=drafts[thread]?.trim();if(!body)return;const result=await mutate(`/${role}/cases/${caseId}/messages`,{threadType:thread,body,language:locale,internalOnly:thread!=="PATIENT_COORDINATOR"});if(result)setDrafts(current=>({...current,[thread]:""}));}}>
      <label className="block text-sm font-semibold">{ar?"رسالتك":"Your message"}<textarea className="field mt-2" dir="auto" value={drafts[thread]??""} onChange={e=>setDrafts(current=>({...current,[thread]:e.target.value}))} rows={3} required maxLength={10000}/></label>
      {role==="coordinator"&&<p className="mt-2 text-xs text-ink-500">{thread==="PATIENT_COORDINATOR"?(ar?"هذه الرسالة مرئية للمريض.":"This message is visible to the patient."):(ar?"محادثة داخلية مع الفريق المحدد فقط.":"Internal conversation with the selected team only.")}</p>}
      <button className="btn-primary mt-3" disabled={busy||!drafts[thread]?.trim()}>{ar?"إرسال الرسالة":"Send message"}</button>
    </form>}
  </section>;
}

export function TaskActions({locale,caseId,task,mutate}:{locale:Locale;caseId:string;task:{id:string;status:string;version:number};mutate:Mutate}){
  const [evidence,setEvidence]=useState("");const ar=locale==="ar";
  if(!["OPEN","IN_PROGRESS"].includes(task.status))return null;
  return <div className="mt-3 space-y-2">{task.status==="OPEN"&&<button className="btn-secondary" onClick={()=>void mutate(`/tasks/${task.id}/cases/${caseId}/start`,{expectedVersion:task.version})}>{ar?"بدء المهمة":"Start task"}</button>}<details><summary className="cursor-pointer py-2 text-sm font-semibold text-brand-700">{ar?"إكمال المهمة":"Complete task"}</summary><form className="mt-2 space-y-2" onSubmit={async e=>{e.preventDefault();const result=await mutate(`/tasks/${task.id}/cases/${caseId}/complete`,{expectedVersion:task.version,evidence:evidence.trim()});if(result)setEvidence("");}}><label className="block text-sm">{ar?"ما الذي تم إنجازه؟":"What was completed?"}<textarea className="field mt-2" required maxLength={10000} value={evidence} onChange={e=>setEvidence(e.target.value)}/></label><button className="btn-primary" disabled={!evidence.trim()}>{ar?"تسجيل الإكمال":"Record completion"}</button></form></details></div>;
}

export function PatientProposalDecision({locale,caseId,proposal,mutate}:{locale:Locale;caseId:string;proposal:{versionId:string;documentType?:string};mutate:Mutate}){
  const [acknowledged,setAcknowledged]=useState(false),[comment,setComment]=useState("");const ar=locale==="ar",final=proposal.documentType==="FINAL_TREATMENT_QUOTE";
  const decide=(decision:string)=>void mutate(`/patient/cases/${caseId}/proposals/${proposal.versionId}/decision`,{decision,selectedOptionalItemIds:[],comment:comment.trim()||undefined});
  return <div className="mt-5 space-y-4 border-t border-line pt-5"><p className="text-sm text-ink-600">{final?(ar?"راجع العرض النهائي قبل اتخاذ قرارك. قبول العرض لا يحل محل الموافقة الطبية على الإجراء.":"Review the final quote before deciding. Accepting the quote does not replace procedure-specific medical consent."):(ar?"هذا تقدير مبدئي. المتابعة لا تعني قبول خطة العلاج النهائية أو تأكيد حجز.":"This is a preliminary estimate. Continuing does not accept a final treatment plan or confirm a booking.")}</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>{ar?"راجعت العرض وأفهم الخطوة التالية.":"I have reviewed this document and understand the next step."}</label><label className="block text-sm font-semibold">{ar?"ملاحظة أو تغييرات مطلوبة (اختياري)":"Note or requested changes (optional)"}<textarea className="field mt-2" value={comment} onChange={e=>setComment(e.target.value)} maxLength={10000}/></label><div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={!acknowledged} onClick={()=>decide(final?"ACCEPTED":"ACKNOWLEDGED")}>{final?(ar?"قبول العرض النهائي":"Accept final quote"):(ar?"الإقرار بالتقدير والمتابعة":"Acknowledge estimate & continue")}</button><button className="btn-secondary" onClick={()=>decide("REVISION_REQUESTED")}>{ar?"طلب تعديل":"Request changes"}</button><button className="btn-secondary" onClick={()=>{if(window.confirm(ar?"هل تريد رفض هذا العرض؟":"Decline this proposal?"))decide("DECLINED");}}>{ar?"رفض":"Decline"}</button></div></div>;
}
