"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate, plural } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Mutate, StaffMember } from "@/components/portal/portal-model";

export type ReplyCover={id:string;ownerSubject:string;ownerName?:string|null;coverSubject:string;coverName?:string|null;startsAt:string;endsAt:string;reason?:string|null;active:boolean;canRevoke:boolean};

/** Names inside a sentence are isolated, so an Arabic name in English copy (or the reverse) keeps its own direction. */
const isolate=(name?:string|null)=>`⁨${name??"—"}⁩`;

/**
 * A coordinator's reply covers — who answers their patients while they are away, and whose patients they answer — as one
 * line under My work (UX 2-4): the line says where things stand, and opening it shows the covers and the form to set one.
 */
export function ReplyCoverPanel({locale,mySubject,covers,staff,busy,mutate}:{locale:Locale;mySubject?:string;covers:ReplyCover[];staff:StaffMember[];busy:boolean;mutate:Mutate}){
  const work=useWorkCopy();const t=work.replyCover;
  const [form,setForm]=useState({cover:"",from:"",to:"",reason:""});
  const when=(iso:string)=>new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
  const colleagues=staff.filter(s=>s.role==="COORDINATOR"&&s.subject!==mySubject);
  const describe=(c:ReplyCover)=>c.coverSubject===mySubject?fillTemplate(t.youCover,{name:isolate(c.ownerName)}):c.ownerSubject===mySubject?fillTemplate(t.coversYou,{name:isolate(c.coverName)}):fillTemplate(t.coversOther,{cover:isolate(c.coverName),owner:isolate(c.ownerName)});
  const period=(c:ReplyCover)=>fillTemplate(t.period,{start:c.active?t.active:fillTemplate(t.starts,{date:when(c.startsAt)}),until:fillTemplate(t.until,{date:when(c.endsAt)})});
  const first=covers[0];
  const line=!first?t.none:covers.length>1?fillTemplate(t.more,{line:describe(first),more:plural(locale,covers.length-1,work.plural.moreCovers)}):`${describe(first)} · ${period(first)}`;
  // The summary's contents are flattened into one control name, so the section is named by its own (visually hidden) heading.
  return <section className="border-t border-line" aria-labelledby="reply-cover-title">
    <h2 id="reply-cover-title" className="sr-only">{t.title}</h2>
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-[0.9375rem] [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-ink-900">{t.title}</span>
        <span className="min-w-0 flex-1 text-ink-600">{line}</span>
        <ChevronDown size={16} aria-hidden className="flex-none text-ink-500 transition-transform group-open:rotate-180"/>
      </summary>
      <div className="pb-6">
        <p className="max-w-[65ch] text-[0.875rem] leading-6 text-ink-500">{t.intro}</p>
        {covers.length>0&&<ul className="mt-3 divide-y divide-line border-y border-line">{covers.map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <p className="text-[0.875rem]"><span className="font-semibold text-ink-900">{describe(c)}</span>{" "}<span className="text-ink-500">{period(c)}</span></p>
          {c.canRevoke&&<button type="button" className="inline-flex min-h-11 items-center text-[0.875rem] font-semibold text-brand-700 hover:text-brand-800" disabled={busy} onClick={()=>void mutate(`/coordinator/reply-covers/${c.id}/revoke`)}>{t.end}</button>}
        </li>)}</ul>}
        <h3 className="mt-5 text-[0.9375rem] font-semibold text-ink-900">{t.set}</h3>
        <form className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2" onSubmit={async event=>{event.preventDefault();if(!form.cover||!form.from||!form.to)return;
          const result=await mutate("/coordinator/reply-covers",{coverSubject:form.cover,startsAt:new Date(form.from).toISOString(),endsAt:new Date(form.to).toISOString(),reason:form.reason||null});
          if(result)setForm({cover:"",from:"",to:"",reason:""});}}>
          <label className="block text-[0.875rem] font-semibold sm:col-span-2">{t.cover}<select className="field mt-2" required value={form.cover} onChange={e=>setForm(f=>({...f,cover:e.target.value}))}><option value="">{t.choose}</option>{colleagues.map(s=><option key={s.subject} value={s.subject}>{s.name}</option>)}</select></label>
          <label className="block text-[0.875rem] font-semibold">{t.from}<input className="field mt-2" type="datetime-local" required value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))}/></label>
          <label className="block text-[0.875rem] font-semibold">{t.to}<input className="field mt-2" type="datetime-local" required min={form.from||undefined} value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))}/></label>
          <label className="block text-[0.875rem] font-semibold sm:col-span-2">{t.reason} <span className="font-normal text-ink-500">({t.optional})</span><textarea className="field mt-2" dir="auto" rows={2} maxLength={500} value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/></label>
          <p className="text-[0.8125rem] text-ink-500 sm:col-span-2">{t.hint}</p>
          <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy||!form.cover||!form.from||!form.to}>{t.save}</button></div>
        </form>
      </div>
    </details>
  </section>;
}
