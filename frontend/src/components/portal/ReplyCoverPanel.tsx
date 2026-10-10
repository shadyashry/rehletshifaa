"use client";
import { useState } from "react";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { Mutate, StaffMember } from "@/components/portal/portal-model";

export type ReplyCover={id:string;ownerSubject:string;ownerName?:string|null;coverSubject:string;coverName?:string|null;startsAt:string;endsAt:string;reason?:string|null;active:boolean;canRevoke:boolean};

const copy={
  en:{title:"Out of office",intro:"While you are away, one colleague answers your patients and you can still read every conversation.",none:"No cover is set.",
    coversYou:(n:string)=>`${n} answers your patients`,youCover:(n:string)=>`You answer ${n}’s patients`,coversOther:(c:string,o:string)=>`${c} answers ${o}’s patients`,
    active:"Now",starts:(d:string)=>`From ${d}`,until:(d:string)=>`until ${d}`,end:"End cover",set:"Set out of office",cover:"Who answers your patients",choose:"Choose a coordinator",
    from:"From",to:"Until",reason:"Note for your colleague",optional:"optional",save:"Save cover",hint:"Up to 30 days. For a longer absence, ask your lead to reassign your cases."},
  ar:{title:"خارج المكتب",intro:"أثناء غيابك يردّ زميل واحد على مرضاك، وتبقى قادراً على قراءة كل المحادثات.",none:"لا توجد تغطية محددة.",
    coversYou:(n:string)=>`${n} يردّ على مرضاك`,youCover:(n:string)=>`أنت تردّ على مرضى ${n}`,coversOther:(c:string,o:string)=>`${c} يردّ على مرضى ${o}`,
    active:"الآن",starts:(d:string)=>`من ${d}`,until:(d:string)=>`حتى ${d}`,end:"إنهاء التغطية",set:"تحديد فترة الغياب",cover:"من يردّ على مرضاك",choose:"اختر منسّقاً",
    from:"من",to:"حتى",reason:"ملاحظة لزميلك",optional:"اختياري",save:"حفظ التغطية",hint:"حتى 30 يوماً. للغياب الأطول اطلب من قائد فريقك إعادة إسناد حالاتك."},
};

/** A coordinator's reply covers: who answers their patients while they are away, and whose patients they answer. */
export function ReplyCoverPanel({locale,mySubject,covers,staff,busy,mutate}:{locale:Locale;mySubject?:string;covers:ReplyCover[];staff:StaffMember[];busy:boolean;mutate:Mutate}){
  const t=copy[locale==="ar"?"ar":"en"];
  const [form,setForm]=useState({cover:"",from:"",to:"",reason:""});
  const when=(iso:string)=>new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
  const colleagues=staff.filter(s=>s.role==="COORDINATOR"&&s.subject!==mySubject);
  const describe=(c:ReplyCover)=>c.coverSubject===mySubject?t.youCover(c.ownerName??"—"):c.ownerSubject===mySubject?t.coversYou(c.coverName??"—"):t.coversOther(c.coverName??"—",c.ownerName??"—");
  return <section className="card mt-6 p-5" aria-labelledby="reply-cover-title">
    <h2 id="reply-cover-title" className="title">{t.title}</h2>
    <p className="mt-2 text-sm text-ink-500">{t.intro}</p>
    {covers.length===0?<p className="mt-4 text-sm">{t.none}</p>:<ul className="mt-4 divide-y divide-brand-100">{covers.map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <p className="text-sm"><span className="font-semibold"><bdi>{describe(c)}</bdi></span>{" "}<span className="text-ink-500">{c.active?t.active:t.starts(when(c.startsAt))}, {t.until(when(c.endsAt))}</span></p>
      {c.canRevoke&&<button type="button" className="inline-flex min-h-11 items-center text-[0.8125rem] font-bold text-brand-700" disabled={busy} onClick={()=>void mutate(`/coordinator/reply-covers/${c.id}/revoke`)}>{t.end}</button>}
    </li>)}</ul>}
    <details className="mt-4">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700">{t.set}</summary>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={async event=>{event.preventDefault();if(!form.cover||!form.from||!form.to)return;
        const result=await mutate("/coordinator/reply-covers",{coverSubject:form.cover,startsAt:new Date(form.from).toISOString(),endsAt:new Date(form.to).toISOString(),reason:form.reason||null});
        if(result)setForm({cover:"",from:"",to:"",reason:""});}}>
        <label className="block text-sm font-semibold sm:col-span-2">{t.cover}<select className="field mt-2" required value={form.cover} onChange={e=>setForm(f=>({...f,cover:e.target.value}))}><option value="">{t.choose}</option>{colleagues.map(s=><option key={s.subject} value={s.subject}>{s.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">{t.from}<input className="field mt-2" type="datetime-local" required value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))}/></label>
        <label className="block text-sm font-semibold">{t.to}<input className="field mt-2" type="datetime-local" required min={form.from||undefined} value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))}/></label>
        <label className="block text-sm font-semibold sm:col-span-2">{t.reason} <span className="font-normal text-ink-500">({t.optional})</span><textarea className="field mt-2" dir="auto" rows={2} maxLength={500} value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/></label>
        <p className="text-[0.8125rem] text-ink-500 sm:col-span-2">{t.hint}</p>
        <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy||!form.cover||!form.from||!form.to}>{t.save}</button></div>
      </form>
    </details>
  </section>;
}
