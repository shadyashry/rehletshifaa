"use client";
import { useState } from "react";
import { intlLocale, type Locale } from "@/lib/i18n";
import { useWorkCopy } from "@/components/portal/portal-copy";

type Message={id:string;threadType?:string;senderRole:string;senderName?:string;direction:string;body:string;createdAt:string;read:boolean;channel?:string;attachmentStatus?:string|null};
// What happened to a file sent on WhatsApp. Read by the patient and the care team alike, so it is worded for both.
const ATTACHMENT:Record<string,{en:string;ar:string}>={
  CLEAN:{en:"Attachment saved to the case documents.",ar:"حُفظ المرفق في مستندات الحالة."},
  UNSUPPORTED_TYPE:{en:"This attachment type is not kept. Please send files as PDF, JPG or PNG.",ar:"لا يُحفظ هذا النوع من المرفقات. يُرجى إرسال الملفات بصيغة PDF أو JPG أو PNG."},
  UNSUPPORTED_CONTENT:{en:"This message type cannot be shown here.",ar:"لا يمكن عرض هذا النوع من الرسائل هنا."},
  TOO_LARGE:{en:"This file was too large to keep. Please send a smaller file.",ar:"الملف أكبر من الحجم المسموح به ولم يُحفظ. يُرجى إرسال ملف أصغر."},
  EXPIRED:{en:"This attachment could not be retrieved. Please send it again.",ar:"تعذّر استلام هذا المرفق. يُرجى إرساله مرة أخرى."},
  UNAVAILABLE:{en:"This attachment could not be retrieved. Please send it again.",ar:"تعذّر استلام هذا المرفق. يُرجى إرساله مرة أخرى."},
  REJECTED:{en:"This attachment did not pass the security check and was not kept.",ar:"لم يجتز هذا المرفق الفحص الأمني ولم يُحفظ."},
  CASE_FILE_LIMIT:{en:"This file was not kept because the case has reached its file limit.",ar:"لم يُحفظ هذا الملف لأن الحالة بلغت الحد الأقصى للملفات."},
};
type Mutate=(path:string,body?:unknown,method?:string)=>Promise<unknown>;
export function CaseMessages({locale,role,caseId,messages,canSend,busy,mutate}:{locale:Locale;role:string;caseId:string;messages:Message[];canSend:boolean;busy:boolean;mutate:Mutate}){
  const ar=locale==="ar";
  const fixed=role==="doctor"?"COORDINATOR_DOCTOR":role==="operations"?"COORDINATOR_OPERATIONS":role==="finance"?"COORDINATOR_FINANCE":"PATIENT_COORDINATOR";
  const [selected,setSelected]=useState(fixed);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const threads=ar?{PATIENT_COORDINATOR:"المريض",COORDINATOR_DOCTOR:"الطبيب · داخلي",COORDINATOR_OPERATIONS:"العمليات · داخلي",COORDINATOR_FINANCE:"المالية · داخلي"}:{PATIENT_COORDINATOR:"Patient",COORDINATOR_DOCTOR:"Doctor · internal",COORDINATOR_OPERATIONS:"Operations · internal",COORDINATOR_FINANCE:"Finance · internal"};
  const thread=role==="coordinator"?selected:fixed;const empty=useWorkCopy().empty;
  const visible=messages.filter(m=>!m.threadType||m.threadType===thread);
  if(!messages.length&&!canSend)return null;
  return <section className="card mt-6 p-5"><h2 className="title">{ar?"الرسائل الآمنة":"Secure messages"}</h2>
    {role==="coordinator"&&<label className="mt-4 block text-sm font-semibold">{ar?"المحادثة":"Conversation"}<select className="field mt-2" value={thread} onChange={e=>setSelected(e.target.value)}>{Object.entries(threads).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
    {visible.length===0&&<p className="mt-4 text-sm text-ink-500">{empty.thread}</p>}
    <div className="mt-4 space-y-3">{visible.map(m=>{const sender=m.senderName??(ar?"فريق الرعاية":"Care team");const sent=new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"short",timeStyle:"short"}).format(new Date(m.createdAt));return <article key={m.id} className={`rounded-lg p-3 ${m.direction==="OUTBOUND"?"ms-6 bg-brand-100":"me-6 bg-brand-50"}`}><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-bold"><bdi>{sender}</bdi>{m.channel==="WHATSAPP"&&<span className="ms-2 text-[0.8125rem] font-normal text-ink-500">{ar?"عبر واتساب":"via WhatsApp"}</span>}</p><time className="text-[0.8125rem] text-ink-500" dateTime={m.createdAt}>{sent}</time></div>{m.body&&<p className="mt-1 whitespace-pre-wrap break-words text-sm" dir="auto">{m.body}</p>}{m.attachmentStatus&&ATTACHMENT[m.attachmentStatus]&&<p className="mt-1 text-[0.8125rem] text-ink-500">{ATTACHMENT[m.attachmentStatus][ar?"ar":"en"]}</p>}{!m.read&&m.direction==="INBOUND"&&<button disabled={busy} className="mt-1 inline-flex min-h-11 items-center text-[0.8125rem] font-bold text-brand-700" onClick={()=>void mutate(`/${role}/cases/${caseId}/messages/${m.id}/read`)}>{ar?"تحديد كمقروءة":"Mark read"}<span className="sr-only">{ar?"، ":": "}{sender}{ar?"، ":", "}{sent}</span></button>}</article>;})}</div>
    {canSend&&<form className="mt-4" onSubmit={async event=>{event.preventDefault();const body=drafts[thread]?.trim();if(!body)return;const result=await mutate(`/${role}/cases/${caseId}/messages`,{threadType:thread,body,language:locale,internalOnly:thread!=="PATIENT_COORDINATOR"});if(result)setDrafts(current=>({...current,[thread]:""}));}}>
      <label className="block text-sm font-semibold">{ar?"رسالتك":"Your message"}<textarea className="field mt-2" dir="auto" value={drafts[thread]??""} onChange={e=>setDrafts(current=>({...current,[thread]:e.target.value}))} rows={3} required maxLength={10000}/></label>
      {role==="coordinator"&&<p className="mt-2 text-[0.8125rem] text-ink-500">{thread==="PATIENT_COORDINATOR"?(ar?"هذه الرسالة مرئية للمريض.":"This message is visible to the patient."):(ar?"محادثة داخلية مع الفريق المحدد فقط.":"Internal conversation with the selected team only.")}</p>}
      <button className="btn-primary mt-3" disabled={busy||!drafts[thread]?.trim()}>{ar?"إرسال الرسالة":"Send message"}</button>
    </form>}
  </section>;
}

