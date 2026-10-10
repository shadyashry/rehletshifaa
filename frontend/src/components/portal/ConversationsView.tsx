"use client";
import { useCallback, useEffect, useState } from "react";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { Mutate, StaffMember } from "@/components/portal/portal-model";
import { ATTACHMENT } from "@/components/portal/CaseMessages";

export type ConversationSummary={id:string;name?:string|null;phoneHint:string;language:string;ownerSubject?:string|null;ownerName?:string|null;lastInboundAt?:string|null;windowExpiresAt?:string|null;windowOpen:boolean};
export type ConversationMessage={id:string;direction:"IN"|"OUT";senderName?:string|null;kind:string;body:string;language:string;attachmentStatus?:string|null;mediaId?:string|null;fileName?:string|null;createdAt:string};
export type ConversationDetail={summary:ConversationSummary;status:string;messages:ConversationMessage[];coverName?:string|null;canReply:boolean;canClaim:boolean;canReassign:boolean;canClose:boolean};
type Scope="mine"|"queue"|"team";
type Fetch=<T,>(path:string)=>Promise<T>;

const copy={
  en:{title:"Conversations",intro:"WhatsApp conversations with people who have not sent a case yet. Each has one coordinator; only they, or their cover, reply.",
    scopes:{mine:"Mine",queue:"Queue",team:"My team"} as Record<Scope,string>,empty:{mine:"No conversations are waiting for you.",queue:"Nobody is waiting in the queue.",team:"Your team has no open conversations."} as Record<Scope,string>,
    pick:"Choose a conversation to read it.",unknown:"WhatsApp contact",unowned:"In the queue",owner:(n:string)=>`Owner: ${n}`,covered:(c:string)=>`${c} is covering and replies meanwhile.`,
    windowOpen:(t:string)=>`You can reply until ${t}.`,windowClosed:"WhatsApp’s 24-hour reply window has closed. You can send one follow-up asking them to reply.",
    reply:"Your reply",send:"Send reply",followUp:"Send follow-up",take:"Take this conversation",them:"Them",you:"You",openFile:"Open file",template:"Follow-up template",
    caseLink:"Insert case form link",handOver:"Hand over",to:"To",chooseCoordinator:"Choose a coordinator",reason:"Reason",confirmHandOver:"Hand over conversation",
    close:"Close conversation",closeAs:"Why",confirmClose:"Close",reasons:{RESOLVED:"Answered",NOT_A_PATIENT:"Not a patient enquiry",NO_RESPONSE:"No response",SPAM:"Spam"} as Record<string,string>,
    readOnly:"You can read this conversation; its coordinator replies."},
  ar:{title:"المحادثات",intro:"محادثات واتساب مع أشخاص لم يرسلوا حالتهم بعد. لكل محادثة منسّق واحد، وهو أو من يغطيه فقط من يردّ.",
    scopes:{mine:"محادثاتي",queue:"قائمة الانتظار",team:"فريقي"} as Record<Scope,string>,empty:{mine:"لا توجد محادثات بانتظارك.",queue:"لا أحد في قائمة الانتظار.",team:"لا توجد محادثات مفتوحة لفريقك."} as Record<Scope,string>,
    pick:"اختر محادثة لقراءتها.",unknown:"جهة اتصال واتساب",unowned:"في قائمة الانتظار",owner:(n:string)=>`المنسّق: ${n}`,covered:(c:string)=>`${c} يغطي ويردّ خلال ذلك.`,
    windowOpen:(t:string)=>`يمكنك الرد حتى ${t}.`,windowClosed:"انتهت مهلة الرد في واتساب (24 ساعة). يمكنك إرسال رسالة متابعة واحدة تطلب منهم الرد.",
    reply:"ردّك",send:"إرسال الرد",followUp:"إرسال رسالة متابعة",take:"تولَّ هذه المحادثة",them:"هم",you:"أنت",openFile:"فتح الملف",template:"قالب المتابعة",
    caseLink:"إدراج رابط نموذج الحالة",handOver:"تسليم المحادثة",to:"إلى",chooseCoordinator:"اختر منسّقاً",reason:"السبب",confirmHandOver:"تسليم المحادثة",
    close:"إغلاق المحادثة",closeAs:"السبب",confirmClose:"إغلاق",reasons:{RESOLVED:"تمت الإجابة",NOT_A_PATIENT:"ليس استفساراً من مريض",NO_RESPONSE:"لا يوجد رد",SPAM:"رسائل مزعجة"} as Record<string,string>,
    readOnly:"يمكنك قراءة هذه المحادثة؛ ومنسّقها هو من يردّ."},
};

/** Intake conversations: the list on one side, the selected thread with its one-voice composer on the other. */
export function ConversationsView({locale,lead,staff,busy,mutate,fetchJson}:{locale:Locale;lead:boolean;staff:StaffMember[];busy:boolean;mutate:Mutate;fetchJson:Fetch}){
  const ar=locale==="ar";const t=copy[ar?"ar":"en"];
  const [scope,setScope]=useState<Scope>("mine");
  const [list,setList]=useState<ConversationSummary[]|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [detail,setDetail]=useState<ConversationDetail|null>(null);
  const [draft,setDraft]=useState("");
  const [handOver,setHandOver]=useState({to:"",reason:""});
  const [closeReason,setCloseReason]=useState("RESOLVED");
  const when=(iso:string)=>new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"short",timeStyle:"short"}).format(new Date(iso));

  // Reads happen on what the coordinator does (open the view, pick a scope or a conversation, act), not in reaction to state.
  const loadList=useCallback((which:Scope)=>fetchJson<ConversationSummary[]>(`/coordinator/conversations?scope=${which}`).then(setList,()=>setList([])),[fetchJson]);
  const loadDetail=useCallback((id:string)=>fetchJson<ConversationDetail>(`/coordinator/conversations/${id}`).then(setDetail,()=>setDetail(null)),[fetchJson]);
  useEffect(()=>{void loadList("mine");},[loadList]);
  function chooseScope(next:Scope){setScope(next);setSelected(null);setDetail(null);void loadList(next);}
  function choose(id:string){setSelected(id);void loadDetail(id);}
  function done(){setSelected(null);setDetail(null);}

  async function act(path:string,body?:unknown){const result=await mutate(path,body);if(result){await loadList(scope);if(selected)await loadDetail(selected);}return result;}
  async function openFile(fileId:string){if(!selected)return;try{const link=await fetchJson<{url:string}>(`/coordinator/conversations/${selected}/files/${fileId}`);window.open(link.url,"_blank","noopener,noreferrer");}catch{/* the portal shows request errors */}}

  const scopes:Scope[]=lead?["mine","queue","team"]:["mine","queue"];
  const caseFormLink=`${typeof window==="undefined"?"":window.location.origin}/${detail?.summary.language==="ar"?"ar":"en"}/send-my-case`;
  return <section className="card mt-6 p-5" aria-labelledby="conversations-title">
    <h2 id="conversations-title" className="title">{t.title}</h2>
    <p className="mt-2 text-sm text-ink-500">{t.intro}</p>
    <div role="group" aria-label={t.title} className="mt-4 flex flex-wrap gap-2">{scopes.map(id=><button key={id} type="button" aria-pressed={scope===id}
      className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${scope===id?"border-brand-700 bg-brand-50 text-brand-800":"border-line-strong text-ink-700"}`}
      onClick={()=>chooseScope(id)}>{t.scopes[id]}</button>)}</div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <ul aria-label={t.scopes[scope]} className="divide-y divide-brand-100">
        {list?.length===0&&<li className="py-3 text-sm text-ink-500">{t.empty[scope]}</li>}
        {list?.map(c=><li key={c.id}><button type="button" aria-current={selected===c.id||undefined} onClick={()=>choose(c.id)}
          className={`flex min-h-11 w-full flex-col items-start gap-1 rounded-lg p-2 text-start ${selected===c.id?"bg-brand-50":""}`}>
          <span className="text-sm font-semibold"><bdi>{c.name||t.unknown}</bdi> <span className="font-normal text-ink-500" dir="ltr">{c.phoneHint}</span></span>
          <span className="text-[0.8125rem] text-ink-500">{c.ownerName?t.owner(c.ownerName):t.unowned}{c.lastInboundAt?` · ${when(c.lastInboundAt)}`:""}</span>
        </button></li>)}
      </ul>
      <div className="min-w-0">
        {!detail?<p className="text-sm text-ink-500">{t.pick}</p>:<>
          <p className="text-sm font-semibold"><bdi>{detail.summary.name||t.unknown}</bdi> <span className="font-normal text-ink-500" dir="ltr">{detail.summary.phoneHint}</span></p>
          <p className="mt-1 text-[0.8125rem] text-ink-500">{detail.summary.ownerName?t.owner(detail.summary.ownerName):t.unowned}</p>
          {detail.coverName&&<p role="note" className="mt-2 rounded-lg bg-brand-50 p-3 text-sm">{t.covered(detail.coverName)}</p>}
          <div className="mt-4 space-y-3">{detail.messages.map(m=><article key={m.id} className={`rounded-lg p-3 ${m.direction==="OUT"?"ms-6 bg-brand-100":"me-6 bg-brand-50"}`}>
            <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-bold"><bdi>{m.direction==="IN"?(detail.summary.name||t.them):(m.senderName??t.you)}</bdi>{m.kind==="TEMPLATE"&&<span className="ms-2 text-[0.8125rem] font-normal text-ink-500">{t.template}</span>}</p><time className="text-[0.8125rem] text-ink-500" dateTime={m.createdAt}>{when(m.createdAt)}</time></div>
            {m.body&&<p className="mt-1 whitespace-pre-wrap break-words text-sm" dir="auto">{m.body}</p>}
            {m.mediaId&&<button type="button" className="mt-1 inline-flex min-h-11 items-center text-[0.8125rem] font-bold text-brand-700" onClick={()=>void openFile(m.mediaId!)}>{t.openFile}{m.fileName?<span className="ms-1 font-normal"><bdi>{m.fileName}</bdi></span>:null}</button>}
            {m.attachmentStatus&&m.attachmentStatus!=="CLEAN"&&ATTACHMENT[m.attachmentStatus]&&<p className="mt-1 text-[0.8125rem] text-ink-500">{ATTACHMENT[m.attachmentStatus][ar?"ar":"en"]}</p>}
          </article>)}</div>
          {detail.canClaim&&<button type="button" className="btn-primary mt-4" disabled={busy} onClick={()=>void act(`/coordinator/conversations/${detail.summary.id}/claim`)}>{t.take}</button>}
          {detail.canReply&&(detail.summary.windowOpen
            ?<form className="mt-4" onSubmit={async event=>{event.preventDefault();const body=draft.trim();if(!body)return;if(await act(`/coordinator/conversations/${detail.summary.id}/messages`,{body}))setDraft("");}}>
              <label className="block text-sm font-semibold">{t.reply}<textarea className="field mt-2" dir="auto" rows={3} maxLength={4096} required value={draft} onChange={e=>setDraft(e.target.value)}/></label>
              <p className="mt-2 text-[0.8125rem] text-ink-500">{detail.summary.windowExpiresAt?t.windowOpen(when(detail.summary.windowExpiresAt)):""}</p>
              <div className="mt-3 flex flex-wrap items-center gap-4"><button className="btn-primary" disabled={busy||!draft.trim()}>{t.send}</button>
                <button type="button" className="inline-flex min-h-11 items-center text-[0.8125rem] font-bold text-brand-700" onClick={()=>setDraft(d=>(d?d+"\n":"")+caseFormLink)}>{t.caseLink}</button></div>
            </form>
            :<div className="mt-4"><p className="text-sm">{t.windowClosed}</p><button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>void act(`/coordinator/conversations/${detail.summary.id}/follow-up`)}>{t.followUp}</button></div>)}
          {!detail.canReply&&!detail.canClaim&&detail.status==="OPEN"&&<p className="mt-4 text-[0.8125rem] text-ink-500">{t.readOnly}</p>}
          {detail.canReassign&&<details className="mt-4"><summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700">{t.handOver}</summary>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={async event=>{event.preventDefault();if(await act(`/coordinator/conversations/${detail.summary.id}/reassign`,{target:handOver.to,reason:handOver.reason}))setHandOver({to:"",reason:""});}}>
              <label className="block text-sm font-semibold">{t.to}<select className="field mt-2" required value={handOver.to} onChange={e=>setHandOver(h=>({...h,to:e.target.value}))}><option value="">{t.chooseCoordinator}</option>{staff.filter(s=>s.role==="COORDINATOR"&&s.subject!==detail.summary.ownerSubject).map(s=><option key={s.subject} value={s.subject}>{s.name}</option>)}</select></label>
              <label className="block text-sm font-semibold">{t.reason}<input className="field mt-2" required maxLength={500} value={handOver.reason} onChange={e=>setHandOver(h=>({...h,reason:e.target.value}))}/></label>
              <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy||!handOver.to||!handOver.reason.trim()}>{t.confirmHandOver}</button></div>
            </form></details>}
          {detail.canClose&&<details className="mt-2"><summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700">{t.close}</summary>
            <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={async event=>{event.preventDefault();if(await act(`/coordinator/conversations/${detail.summary.id}/close`,{reason:closeReason}))done();}}>
              <label className="block text-sm font-semibold">{t.closeAs}<select className="field mt-2" value={closeReason} onChange={e=>setCloseReason(e.target.value)}>{Object.entries(t.reasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              <button className="btn-secondary" disabled={busy}>{t.confirmClose}</button>
            </form></details>}
        </>}
      </div>
    </div>
  </section>;
}
