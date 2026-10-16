"use client";
import { use, useEffect, useId, useRef, useState } from "react";
import { Check, Lock } from "lucide-react";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate, tabKeyTarget } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { FeedbackContext } from "@/components/portal/portal-ui";
import { plural } from "@/lib/portal-labels";
import type { PatientReply } from "@/components/portal/portal-model";

type Message={id:string;threadType?:string;senderRole:string;senderName?:string;direction:string;body:string;createdAt:string;read:boolean;channel?:string;attachmentStatus?:string|null};
export type ThreadType="PATIENT_COORDINATOR"|"COORDINATOR_DOCTOR"|"COORDINATOR_OPERATIONS"|"COORDINATOR_FINANCE";
/** The coordinator's threads on a case: the patient's first, then the internal ones with the Consultant, operations and finance. */
const THREADS:ThreadType[]=["PATIENT_COORDINATOR","COORDINATOR_DOCTOR","COORDINATOR_OPERATIONS","COORDINATOR_FINANCE"];
type Mutate=(path:string,body?:unknown,method?:string)=>Promise<unknown>;
type MessagesProps={locale:Locale;role:string;caseId:string;messages:Message[];canSend:boolean;busy:boolean;mutate:Mutate;patientReply?:PatientReply|null;
  /** Open on this thread with its composer focused (the strip's "Reply to the patient"). */
  replyTo?:ThreadType};

/**
 * What happened to a file sent on WhatsApp, from `portalWork.caseMessages.attachments`. Read by the patient and the care
 * team alike, so it is worded for both. Null when the status has no note.
 */
export function attachmentNote(status:string|null|undefined,notes:Record<string,string>){
  return status&&Object.hasOwn(notes,status)?notes[status]:null;
}

/** The date and time a staff message view shows, in one form everywhere ("14 Oct, 2:00 PM"; never the ambiguous 10/14/26). */
export const messageTime=(locale:Locale)=>new Intl.DateTimeFormat(intlLocale(locale),{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});

/**
 * A staff count of unread messages: a bold number in petrol ink beside its label, like the view counts in the header — not
 * a filled disc, which would be a second filled petrol mark beside the view's one action. Screen readers hear it in words.
 */
export function UnreadTally({count}:{count:number}){
  const work=useWorkCopy();
  return <><span aria-hidden className="ms-1.5 font-bold tabular-nums text-brand-800">{new Intl.NumberFormat(intlLocale(work.locale)).format(count)}</span><span className="sr-only"> ({plural(work.locale,count,work.plural.unreadMessages)})</span></>;
}

/** The one thread a role other than the coordinator writes in. */
const fixedThread=(role:string):ThreadType=>role==="doctor"?"COORDINATOR_DOCTOR":role==="operations"?"COORDINATOR_OPERATIONS":role==="finance"?"COORDINATOR_FINANCE":"PATIENT_COORDINATOR";
/** Nothing to read and nothing this viewer may write: no panel at all. */
const silent=({messages,canSend,role,patientReply}:MessagesProps)=>!messages.length&&!canSend&&!(role==="coordinator"&&patientReply?.canReply);

/** The secure messages as a panel of their own, under a card and title (the patient's case page). */
export function CaseMessages(props:MessagesProps){
  const t=useWorkCopy().caseMessages;
  if(silent(props))return null;
  return <section className="card mt-6 p-5"><h2 className="title">{t.title}</h2><div className="mt-4"><MessageThreads {...props}/></div></section>;
}

/**
 * The case's messages without a frame of their own (the staff drawer names them already). A coordinator reads every thread
 * through tabs that carry their unread counts, so who is owed a reply shows before any thread is opened; other roles read
 * and write their one thread. Read state stays a backend call per message (there is no bulk endpoint).
 */
export function MessageThreads(props:MessagesProps){
  const {locale,role,caseId,messages,canSend,busy,mutate,patientReply,replyTo}=props;
  const work=useWorkCopy();const t=work.caseMessages;const ar=locale==="ar";
  const {clearNotice}=use(FeedbackContext);
  const base=useId();
  const tabbed=role==="coordinator";
  const fixed=fixedThread(role);
  // What this viewer can still mark read: the same rule as the Mark read button below and the header's count.
  const unread=(thread:ThreadType)=>messages.filter(m=>m.threadType===thread&&m.direction==="INBOUND"&&!m.read).length;
  // Open where a reply is owed: the thread asked for, else the first with unread messages (the patient's first), else the patient's.
  const [selected,setSelected]=useState<ThreadType>(()=>replyTo??(tabbed?THREADS.find(id=>unread(id)>0):undefined)??fixed);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [sent,setSent]=useState<ThreadType|null>(null);
  const composer=useRef<HTMLTextAreaElement>(null);
  const tablist=useRef<HTMLDivElement>(null);
  const panelRef=useRef<HTMLDivElement>(null);
  // A message marked read loses its button once the case reloads: the focus goes to the next one, else to the thread.
  const afterMarkRead=useRef(false);
  useEffect(()=>{
    if(!afterMarkRead.current)return;
    afterMarkRead.current=false;
    (panelRef.current?.querySelector<HTMLElement>("[data-mark-read]")??panelRef.current)?.focus();
  },[messages]);
  // The drawer opens as a modal (its effect runs after this one) and focuses its first control; the reply then takes the focus.
  useEffect(()=>{if(!replyTo)return;const frame=requestAnimationFrame(()=>composer.current?.focus());return()=>cancelAnimationFrame(frame);},[replyTo]);
  // The tabs keep one row and scroll sideways on a phone: the selected one is always in view (opened on a later thread too).
  useEffect(()=>{tablist.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});},[selected]);
  if(silent(props))return null;

  const thread=tabbed?selected:fixed;
  const visible=messages.filter(m=>!m.threadType||m.threadType===thread);
  // The patient thread has one staff voice: the case coordinator, or their active cover instead of them.
  const patientThread=tabbed&&thread==="PATIENT_COORDINATOR"&&patientReply;
  const sendable=patientThread?patientReply.canReply:canSend;
  const formatTime=messageTime(locale);
  const isolate=(name?:string|null)=>`⁨${name??""}⁩`;
  const until=patientReply?.coverEndsAt?new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium",timeStyle:"short"}).format(new Date(patientReply.coverEndsAt)):"";
  const coverNote=!patientThread||!patientReply.coverName?null:patientReply.viewerIsCover
    ?fillTemplate(t.coverYou,{owner:isolate(patientReply.ownerName),until})
    :fillTemplate(t.coverOther,{cover:isolate(patientReply.coverName),owner:isolate(patientReply.ownerName),until});
  const choose=(next:ThreadType)=>{setSelected(next);setSent(null);};
  const tabId=(id:ThreadType)=>`${base}-tab-${id}`,hintId=`${base}-hint`;

  const panel=<>
    {coverNote&&<p role="note" className="mb-4 border-y border-line py-2.5 text-[0.875rem] leading-6 text-ink-700">{coverNote}</p>}
    {visible.length===0?<p className="text-sm text-ink-500">{work.empty.thread}</p>
      :<div className="space-y-3">{visible.map(m=>{const sender=m.senderName??t.careTeam;const time=formatTime.format(new Date(m.createdAt));const note=attachmentNote(m.attachmentStatus,t.attachments);const owed=!m.read&&m.direction==="INBOUND";
        // Ours on paper, theirs on white: two surfaces and a hairline, no tinted bubbles.
        return <article key={m.id} className={`rounded-lg border border-line p-3 ${m.direction==="OUTBOUND"?"ms-6 bg-mist":"me-6 bg-white"}`}>
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><p className="text-sm font-bold text-ink-900">{owed&&<span aria-hidden className="me-1.5 inline-block size-1.5 rounded-full bg-brand-600 align-middle"/>}<bdi>{sender}</bdi>{m.channel==="WHATSAPP"&&<span className="ms-2 text-[0.8125rem] font-normal text-ink-500">{t.viaWhatsApp}</span>}</p><time className="text-[0.8125rem] text-ink-500" dateTime={m.createdAt}><bdi>{time}</bdi></time></div>
          {m.body&&<p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-700" dir="auto">{m.body}</p>}
          {note&&<p className="mt-1 text-[0.8125rem] text-ink-500">{note}</p>}
          {owed&&<button type="button" data-mark-read="" disabled={busy} className="-mb-2.5 mt-0.5 inline-flex min-h-11 items-center text-[0.8125rem] font-bold text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline" onClick={async()=>{if(await mutate(`/${role}/cases/${caseId}/messages/${m.id}/read`))afterMarkRead.current=true;}}>{t.markRead}<span className="sr-only">{fillTemplate(t.markReadContext,{sender:isolate(sender),time:isolate(time)})}</span></button>}
        </article>;})}</div>}
    {sendable&&<form className="mt-4" onSubmit={async event=>{event.preventDefault();const body=drafts[thread]?.trim();if(!body)return;
      const result=await mutate(`/${role}/cases/${caseId}/messages`,{threadType:thread,body,language:locale,internalOnly:thread!=="PATIENT_COORDINATOR"});
      // Said beside the composer, where the eyes are, instead of the drawer's generic "Saved" at its top.
      // The focus stays in the composer: the send button it was on is disabled until there is a new draft.
      if(result){setDrafts(current=>({...current,[thread]:""}));setSent(thread);clearNotice();composer.current?.focus();}}}>
      <label className="block text-sm font-semibold">{t.yourMessage}<textarea ref={composer} name="message" autoComplete="off" aria-describedby={tabbed?hintId:undefined} className="field mt-2" dir="auto" value={drafts[thread]??""} onChange={e=>{const value=e.target.value;setDrafts(current=>({...current,[thread]:value}));setSent(null);}} rows={3} required maxLength={10000}/></label>
      {tabbed&&<p id={hintId} className="mt-2 text-[0.8125rem] text-ink-500">{thread==="PATIENT_COORDINATOR"?t.visibleToPatient:t.internalOnly}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button className="btn-primary" disabled={busy||!drafts[thread]?.trim()}>{t.send}</button>
        <p role="status" className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-brand-800">{sent===thread&&<><Check size={15} aria-hidden/>{t.sent}</>}</p>
      </div>
    </form>}
  </>;

  if(!tabbed)return <div ref={panelRef} tabIndex={-1} className="outline-none">{panel}</div>;
  return <>
    {/* One tab style across the staff side: the case page's underline tabs. Selection follows the arrow keys. */}
    {/* One row: the baseline is an inset hairline (a border would clip the selected tab's underline in a scrolling row). */}
    <div ref={tablist} role="tablist" aria-label={t.threadsLabel} className="flex gap-x-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line-strong)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {THREADS.map((id,index)=>{const count=unread(id);const internal=id!=="PATIENT_COORDINATOR";
        return <button key={id} type="button" role="tab" id={tabId(id)} aria-controls={`${base}-panel`} aria-selected={thread===id} tabIndex={thread===id?0:-1}
          className={`inline-flex min-h-11 flex-none items-center whitespace-nowrap border-b-2 px-3 py-2 text-[0.875rem] font-bold transition-colors ${thread===id?"border-brand-600 text-brand-800":"border-transparent text-ink-500 hover:text-ink-800"}`}
          onKeyDown={event=>{const target=tabKeyTarget(event.key,index,THREADS.length,ar);if(target<0)return;event.preventDefault();choose(THREADS[target]);document.getElementById(tabId(THREADS[target]))?.focus();}}
          onClick={()=>choose(id)}>
          {internal&&<Lock size={12} aria-hidden className="me-1.5 text-ink-400"/>}{t.threads[id]}{internal&&<span className="sr-only"> ({t.internal})</span>}{count>0&&<UnreadTally count={count}/>}
        </button>;})}
    </div>
    {/* Reachable by Tab when nothing inside it is (an empty thread this viewer cannot write in). */}
    <div ref={panelRef} role="tabpanel" id={`${base}-panel`} aria-labelledby={tabId(thread)} tabIndex={visible.length||sendable?-1:0} className="pt-4 outline-none">{panel}</div>
  </>;
}
