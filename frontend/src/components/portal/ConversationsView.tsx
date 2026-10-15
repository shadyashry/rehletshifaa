"use client";
import { use, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { fillTemplate, tabKeyTarget } from "@/lib/portal-labels";
import type { Mutate, StaffMember } from "@/components/portal/portal-model";
import { attachmentNote, messageTime } from "@/components/portal/CaseMessages";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { FeedbackContext } from "@/components/portal/portal-ui";
import { useRovingList } from "@/components/portal/StaffShortcuts";

/** `awaitingReply`: the person wrote last and no one on the team has answered since (the backend's rule). */
export type ConversationSummary={id:string;name?:string|null;phoneHint:string;language:string;ownerSubject?:string|null;ownerName?:string|null;lastInboundAt?:string|null;windowExpiresAt?:string|null;windowOpen:boolean;awaitingReply?:boolean};
export type ConversationMessage={id:string;direction:"IN"|"OUT";senderName?:string|null;kind:string;body:string;language:string;attachmentStatus?:string|null;mediaId?:string|null;fileName?:string|null;createdAt:string};
export type ConversationDetail={summary:ConversationSummary;status:string;messages:ConversationMessage[];coverName?:string|null;canReply:boolean;canClaim:boolean;canReassign:boolean;canClose:boolean};
type Scope="mine"|"queue"|"team";
type Fetch=<T,>(path:string)=>Promise<T>;

const isolate=(text:string)=>`⁨${text}⁩`;
const textAction="inline-flex min-h-11 items-center text-[0.8125rem] font-bold text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline";

/** Intake conversations: the list on one side, the selected thread with its one-voice composer on the other. */
/** `labelledBy`: the page's heading that names this view (UX 2-4: the view's name is the page's place, said once). */
export function ConversationsView({locale,lead,staff,busy,mutate,fetchJson,labelledBy}:{locale:Locale;lead:boolean;staff:StaffMember[];busy:boolean;mutate:Mutate;fetchJson:Fetch;labelledBy?:string}){
  const work=useWorkCopy();const t=work.conversations;const notes=work.caseMessages.attachments;const ar=locale==="ar";
  const {clearNotice}=use(FeedbackContext);
  const base=useId();
  const [scope,setScope]=useState<Scope>("mine");
  const [list,setList]=useState<ConversationSummary[]|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [detail,setDetail]=useState<ConversationDetail|null>(null);
  const [draft,setDraft]=useState("");
  const [sent,setSent]=useState("");
  const [handOver,setHandOver]=useState({to:"",reason:""});
  const [closeReason,setCloseReason]=useState("RESOLVED");
  const heading=useRef<HTMLHeadingElement>(null);
  const panel=useRef<HTMLDivElement>(null);
  const composer=useRef<HTMLTextAreaElement>(null);
  // Where the focus goes once the next render lands: a picked conversation's thread, or the list after one was closed.
  const focusNext=useRef<string|null>(null);
  // Only the latest request of each kind may land: a slow earlier answer never replaces what was asked for since.
  const listRequest=useRef(0),detailRequest=useRef(0);
  const roving=useRovingList((list??[]).map(c=>c.id));
  // One date form across the view: the window, the last message, the thread and the composer hint.
  const when=useMemo(()=>{const format=messageTime(locale);return (iso:string)=>format.format(new Date(iso));},[locale]);

  // Reads happen on what the coordinator does (open the view, pick a scope or a conversation, act), not in reaction to state.
  const loadList=useCallback((which:Scope)=>{const request=++listRequest.current;
    return fetchJson<ConversationSummary[]>(`/coordinator/conversations?scope=${which}`).then(value=>{if(request===listRequest.current)setList(value);},()=>{if(request===listRequest.current)setList([]);});},[fetchJson]);
  const loadDetail=useCallback((id:string)=>{const request=++detailRequest.current;
    return fetchJson<ConversationDetail>(`/coordinator/conversations/${id}`).then(value=>{if(request===detailRequest.current)setDetail(value);},()=>{if(request===detailRequest.current)setDetail(null);});},[fetchJson]);
  useEffect(()=>{void loadList("mine");},[loadList]);
  useEffect(()=>{
    const target=focusNext.current;
    if(!target)return;
    if(target==="list"){
      if(detail)return;
      focusNext.current=null;
      (panel.current?.querySelector<HTMLElement>('[data-roving-primary][tabindex="0"]')??panel.current)?.focus({preventScroll:true});
      return;
    }
    if(detail?.summary.id!==target)return;
    focusNext.current=null;
    heading.current?.focus({preventScroll:true});
    // Stacked on phones: the thread sits under the list. The page scrolls smoothly; this must land at once.
    heading.current?.scrollIntoView({block:"nearest",behavior:"instant"});
  },[detail,list]);
  function chooseScope(next:Scope){setScope(next);setSelected(null);setDetail(null);setSent("");detailRequest.current++;void loadList(next);}
  function choose(id:string){
    // The open conversation again: back to its thread, keeping the draft.
    if(id===selected&&detail?.summary.id===id){heading.current?.focus();return;}
    focusNext.current=id;setSelected(id);setSent("");setDraft("");void loadDetail(id);
  }

  async function act(path:string,body?:unknown){const result=await mutate(path,body);if(result){await loadList(scope);if(selected)await loadDetail(selected);}return result;}
  // A send is confirmed beside the composer, where the eyes are, instead of the page's generic "Saved" at its top; the focus
  // stays in the composer (the send button it was on is disabled until there is a new draft).
  async function send(path:string,body:unknown,confirmation:string){const result=await act(path,body);if(result){setSent(confirmation);clearNotice();(composer.current??heading.current)?.focus();}return result;}
  async function openFile(fileId:string){if(!selected)return;try{const link=await fetchJson<{url:string}>(`/coordinator/conversations/${selected}/files/${fileId}`);window.open(link.url,"_blank","noopener,noreferrer");}catch{/* the portal shows request errors */}}

  const scopes:Scope[]=lead?["mine","queue","team"]:["mine","queue"];
  // Only the conversation asked for is shown: never one that answered late for an earlier pick.
  const thread=detail&&detail.summary.id===selected?detail:null;
  const caseFormLink=`${typeof window==="undefined"?"":window.location.origin}/${thread?.summary.language==="ar"?"ar":"en"}/send-my-case`;
  const tabId=(id:Scope)=>`${base}-tab-${id}`,panelId=`${base}-panel`,windowHint=`${base}-window`;
  return <section className="card p-5" aria-labelledby={labelledBy} aria-label={labelledBy?undefined:t.title}>
    <p className="max-w-[65ch] text-sm text-ink-500">{t.intro}</p>
    {/* One tab style across the staff side: the case page's underline tabs. Selection follows the arrow keys. */}
    <div role="tablist" aria-label={t.title} className="mt-4 flex flex-wrap gap-x-1 border-b border-line-strong">{scopes.map((id,index)=><button key={id} type="button" role="tab" id={tabId(id)} aria-controls={panelId} aria-selected={scope===id} tabIndex={scope===id?0:-1}
      className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 py-2 text-[0.875rem] font-bold transition-colors ${scope===id?"border-brand-600 text-brand-800":"border-transparent text-ink-500 hover:text-ink-800"}`}
      onKeyDown={event=>{const target=tabKeyTarget(event.key,index,scopes.length,ar);if(target<0)return;event.preventDefault();chooseScope(scopes[target]);document.getElementById(tabId(scopes[target]))?.focus();}}
      onClick={()=>chooseScope(id)}>{t.scopes[id]}</button>)}</div>
    <div ref={panel} role="tabpanel" id={panelId} aria-labelledby={tabId(scope)} tabIndex={list?.length?-1:0} className="mt-4 grid gap-4 outline-none lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      {/* A roving list (UX 2-2): one tab stop, arrows and j/k move between conversations, Enter opens one. */}
      <div className="min-w-0">{roving.hint}<ul {...roving.listProps} aria-label={t.scopes[scope]} aria-busy={list===null||undefined} className="divide-y divide-line border-y border-line">
        {list===null&&<li className="py-3 text-sm text-ink-500">{t.loading}</li>}
        {list?.length===0&&<li className="py-3 text-sm text-ink-500">{t.empty[scope]}</li>}
        {list?.map(c=><li key={c.id} data-row={c.id}><button type="button" {...roving.primary(c.id)} aria-current={selected===c.id||undefined} onClick={()=>choose(c.id)}
          className={`flex min-h-11 w-full flex-col items-start gap-1 border-s-2 py-3 pe-2 ps-1.5 text-start transition-colors hover:bg-brand-50 focus-visible:bg-brand-50 ${selected===c.id?"border-brand-600":"border-transparent"}`}>
          {/* Each run isolated: an Arabic name, a Latin phone hint and a date never reorder one another. */}
          <span className="flex w-full flex-wrap items-baseline justify-between gap-x-2 text-sm font-semibold text-ink-900"><bdi>{c.name||t.unknown}</bdi><span className="text-[0.8125rem] font-normal text-ink-500" dir="ltr">{c.phoneHint}</span></span>
          {(c.awaitingReply||c.windowExpiresAt)&&<span className="flex flex-col items-start gap-y-0.5 text-[0.8125rem]">
            {c.awaitingReply&&<span className="inline-flex items-center gap-1.5 font-bold text-brand-800"><span aria-hidden className="size-1.5 rounded-full bg-brand-600"/>{scope==="mine"?t.awaitingYou:t.awaiting}</span>}
            {c.windowExpiresAt&&<span className="text-ink-600">{c.windowOpen?fillTemplate(t.windowCloses,{time:isolate(when(c.windowExpiresAt))}):t.windowClosedShort}</span>}
          </span>}
          {/* Two short lines: in an 18rem column a dot-joined line wraps and strands its separator. */}
          <span className="flex flex-col text-[0.8125rem] text-ink-500">
            <span>{c.ownerName?<>{t.owner}: <bdi>{c.ownerName}</bdi></>:t.unowned}</span>
            {c.lastInboundAt&&<span>{fillTemplate(t.lastMessage,{time:isolate(when(c.lastInboundAt))})}</span>}
          </span>
        </button></li>)}
      </ul></div>
      <div className="min-w-0">
        {!thread?<p className="text-sm text-ink-500">{t.pick}</p>:<>
          <h2 ref={heading} id="conversation-thread-title" tabIndex={-1} className="rounded-sm text-base font-semibold text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"><bdi>{thread.summary.name||t.unknown}</bdi> <span className="font-normal text-ink-500" dir="ltr">{thread.summary.phoneHint}</span></h2>
          <p className="mt-1 text-[0.8125rem] text-ink-500">{thread.summary.ownerName?<>{t.owner}: <bdi>{thread.summary.ownerName}</bdi></>:t.unowned}</p>
          {thread.coverName&&<p role="note" className="mt-3 border-y border-line py-2.5 text-[0.875rem] leading-6 text-ink-700">{fillTemplate(t.covered,{name:isolate(thread.coverName)})}</p>}
          <div className="mt-4 space-y-3">{thread.messages.map(m=>{const note=m.attachmentStatus!=="CLEAN"?attachmentNote(m.attachmentStatus,notes):null;
            // Ours on paper, theirs on white: two surfaces and a hairline, no tinted bubbles.
            return <article key={m.id} className={`rounded-lg border border-line p-3 ${m.direction==="OUT"?"ms-6 bg-mist":"me-6 bg-white"}`}>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><p className="text-sm font-bold text-ink-900"><bdi>{m.direction==="IN"?(thread.summary.name||t.them):(m.senderName??t.you)}</bdi>{m.kind==="TEMPLATE"&&<span className="ms-2 text-[0.8125rem] font-normal text-ink-500">{t.template}</span>}</p><time className="text-[0.8125rem] text-ink-500" dateTime={m.createdAt}><bdi>{when(m.createdAt)}</bdi></time></div>
            {m.body&&<p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-700" dir="auto">{m.body}</p>}
            {m.mediaId&&<button type="button" className={`mt-1 ${textAction}`} onClick={()=>void openFile(m.mediaId!)}>{t.openFile}{m.fileName?<span className="ms-1 font-normal"><bdi>{m.fileName}</bdi></span>:null}<ExternalLink size={13} aria-hidden className="ms-1.5 rtl:-scale-x-100"/><span className="sr-only"> {t.opensNewTab}</span></button>}
            {note&&<p className="mt-1 text-[0.8125rem] text-ink-500">{note}</p>}
          </article>;})}</div>
          {thread.canClaim&&<button type="button" className="btn-primary mt-4" disabled={busy} onClick={async()=>{if(await act(`/coordinator/conversations/${thread.summary.id}/claim`))heading.current?.focus();}}>{t.take}</button>}
          {thread.canReply&&(thread.summary.windowOpen
            ?<form className="mt-4" onSubmit={async event=>{event.preventDefault();const body=draft.trim();if(!body)return;if(await send(`/coordinator/conversations/${thread.summary.id}/messages`,{body},t.sent))setDraft("");}}>
              <label className="block text-sm font-semibold">{t.reply}<textarea ref={composer} name="reply" autoComplete="off" className="field mt-2" dir="auto" rows={3} maxLength={4096} required value={draft} aria-describedby={thread.summary.windowExpiresAt?windowHint:undefined} onChange={e=>{setDraft(e.target.value);setSent("");}}/></label>
              {thread.summary.windowExpiresAt&&<p id={windowHint} className="mt-2 text-[0.8125rem] text-ink-500">{fillTemplate(t.windowOpen,{time:isolate(when(thread.summary.windowExpiresAt))})}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2"><button className="btn-primary" disabled={busy||!draft.trim()}>{t.send}</button>
                <button type="button" className={textAction} onClick={()=>setDraft(d=>(d?d+"\n":"")+caseFormLink)}>{t.caseLink}</button></div>
            </form>
            :<div className="mt-4"><p className="text-sm text-ink-700">{t.windowClosed}</p><button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>void send(`/coordinator/conversations/${thread.summary.id}/follow-up`,undefined,t.followUpSent)}>{t.followUp}</button></div>)}
          {/* Mounted with the thread, so a screen reader hears the confirmation when it arrives. */}
          <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-brand-800">{sent&&<><Check size={15} aria-hidden/>{sent}</>}</p>
          {!thread.canReply&&!thread.canClaim&&thread.status==="OPEN"&&<p className="mt-4 text-[0.8125rem] text-ink-500">{t.readOnly}</p>}
          {thread.canReassign&&<details className="group mt-4"><summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700 hover:text-brand-800"><ChevronDown size={14} aria-hidden className="me-1.5 transition-transform group-open:rotate-180"/>{t.handOver}</summary>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={async event=>{event.preventDefault();if(await act(`/coordinator/conversations/${thread.summary.id}/reassign`,{target:handOver.to,reason:handOver.reason}))setHandOver({to:"",reason:""});}}>
              <label className="block text-sm font-semibold">{t.to}<select className="field mt-2" required value={handOver.to} onChange={e=>setHandOver(h=>({...h,to:e.target.value}))}><option value="">{t.chooseCoordinator}</option>{staff.filter(s=>s.role==="COORDINATOR"&&s.subject!==thread.summary.ownerSubject).map(s=><option key={s.subject} value={s.subject}>{isolate(s.name)}</option>)}</select></label>
              <label className="block text-sm font-semibold">{t.reason}<input className="field mt-2" required maxLength={500} value={handOver.reason} onChange={e=>setHandOver(h=>({...h,reason:e.target.value}))}/></label>
              <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy||!handOver.to||!handOver.reason.trim()}>{t.confirmHandOver}</button></div>
            </form></details>}
          {thread.canClose&&<details className="group mt-2"><summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700 hover:text-brand-800"><ChevronDown size={14} aria-hidden className="me-1.5 transition-transform group-open:rotate-180"/>{t.close}</summary>
            <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={async event=>{event.preventDefault();if(await act(`/coordinator/conversations/${thread.summary.id}/close`,{reason:closeReason})){focusNext.current="list";setSelected(null);setDetail(null);}}}>
              <label className="block text-sm font-semibold">{t.closeAs}<select className="field mt-2" value={closeReason} onChange={e=>setCloseReason(e.target.value)}>{Object.entries(t.reasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              <button className="btn-secondary" disabled={busy}>{t.confirmClose}</button>
            </form></details>}
        </>}
      </div>
    </div>
  </section>;
}
