"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, Check, Minus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { accessCopy, businessLabel, familyLabel, permissionLabel, roleLabel } from "./access-copy";
import "./access-governance.css";
import { AccessAssignments } from "./AccessAssignments";

type Permission={key:string;name:string;description:string;family:string;risk:string;scopes:string[];actors:string[];channels:string[];dependencies:string[];conflicts:string[];executable:boolean;workflowGated:boolean;recentAuthentication:boolean};
type Role={id:string;key:string;name:string;description:string;purpose:string;family:string;systemTemplate:boolean};
type Grant={permission:string;scope:string;relationship:string|null};
type Version={id:string;number:number;status:string;revision:number;actorType:string;channel:string;effectiveFrom:string|null;createdBy:string;publishedBy:string|null};
type VersionDetail={version:Version;grants:Grant[]};
type Detail={role:Role;versions:VersionDetail[]};
type Decision={allowed:boolean;reason:string;permission:string;roleVersionId:string|null;scope:string|null;relationship:string|null};
type Assignment={id:string;subject:string;organizationId:string;status:string;scope:string;source:string;revision:number;effectiveFrom:string;effectiveTo:string|null};
type Effective={subject:string;organizationId:string;membership?:{status:string;accountActive:boolean}|null;sources:{assignment:Assignment;roleName:string;version:Version;grants:Grant[]}[];decisions:Decision[];relationships:{id:string;type:string;targetId:string;status:string}[]};
type Audit={actor:string;entity:string;action:string;outcome:string;reason:string;occurredAt:string};
const platform="00000000-0000-0000-0000-000000000001";
const actors=["GOVERNANCE","PRACTICE_OPERATIONS","CONSULTANT","ASSOCIATE_DOCTOR","CLINICAL_SUPPORT","COORDINATOR","OPERATIONS","FINANCE","SERVICE"];
const channels=["ADMIN_WEB","STAFF_WEB","CONSULTANT_WEB","CONSULTANT_MOBILE","PRACTICE_MOBILE","API"];
const relationships=["MANAGES","ASSISTS","SUPERVISES","COORDINATES","ASSIGNED_TO","VERIFIES"];
const identity=(g:Grant)=>JSON.stringify(g);

export function AccessGovernance({locale,initialTab}:{locale:Locale;initialTab?:"roles"|"permissions"|"effective"|"audit"}) {
  const t=accessCopy[locale];const {user,loading:authLoading,signIn}=useAuth();
  const [tab,setTab]=useState<"roles"|"permissions"|"effective"|"audit">(initialTab??"roles");
  const [roles,setRoles]=useState<Role[]>([]);const [permissions,setPermissions]=useState<Permission[]>([]);const [mine,setMine]=useState<Decision[]>([]);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const [detail,setDetail]=useState<Detail|null>(null);const [selectedVersion,setSelectedVersion]=useState("");const [query,setQuery]=useState("");
  const [wizard,setWizard]=useState(false);const [step,setStep]=useState(0);const [grants,setGrants]=useState<Grant[]>([]);
  const [name,setName]=useState("");const [description,setDescription]=useState("");const [purpose,setPurpose]=useState("");
  const [actorType,setActorType]=useState("GOVERNANCE");const [channel,setChannel]=useState("ADMIN_WEB");const [base,setBase]=useState("");
  const [reason,setReason]=useState("");const [effectiveDate,setEffectiveDate]=useState("");const [validation,setValidation]=useState<string[]>([]);
  const [subject,setSubject]=useState("");const [organization,setOrganization]=useState(platform);const [effective,setEffective]=useState<Effective|null>(null);
  const [simulation,setSimulation]=useState<Decision|null>(null);const [simulationPermission,setSimulationPermission]=useState("access.role.view");
  const [audits,setAudits]=useState<Audit[]>([]);const [page,setPage]=useState(0);
  const can=(key:string)=>mine.some(d=>d.permission===key && d.allowed);
  const api=useCallback(async <T,>(path:string,method="GET",body?:unknown):Promise<T>=>{
    if(!user) throw new Error(t.denied);
    const response=await apiFetchAs(user.access_token,"/admin/access"+path,{method,...(body!==undefined?{body:JSON.stringify(body)}:{})});
    if(!response.ok) {
      const data=await response.json().catch(()=>({}));
      if(data.code==="REAUTHENTICATION_REQUIRED") { await signIn(true);throw new Error(t.recent); }
      throw new Error(response.status===403?t.denied:response.status===409?(locale==="ar"?"تغيّر الإعداد. أعد تحميله قبل الحفظ.":"The configuration changed. Reload before saving."):t.error);
    }
    const text=await response.text();return text?JSON.parse(text):undefined as T;
  },[user,t,signIn,locale]);
  const run=async(work:()=>Promise<void>)=>{setBusy(true);setError("");setNotice("");try{await work();}catch(e){setError(e instanceof Error?e.message:t.error);}finally{setBusy(false);}};
  // oidc-client's automaticSilentRenew (auth-client.ts) issues a fresh `user` object with every renewed
  // access token, on the same subject, every few minutes. apiRef always calls through to the latest `api`
  // (so every request still carries the current token) without making that renewal itself a reason to
  // re-run the full refresh below and discard whatever the admin is mid-way through (open wizard, in-progress
  // assignment form, selected tab) — see docs/platform-control-plane/implementation-status.md Phase 5B.
  const apiRef=useRef(api);
  useEffect(()=>{apiRef.current=api;},[api]);
  const hasUser=!!user;
  const refresh=useCallback(async()=>{
    if(!hasUser){setLoading(false);return;}
    setLoading(true);setError("");setMine([]);setRoles([]);setPermissions([]);setEffective(null);setDetail(null);setWizard(false);
    try {
      const decisions=await apiRef.current<Decision[]>("/me");setMine(decisions);
      if(decisions.some(d=>d.permission==="access.role.view"&&d.allowed)) {
        const [r,p]=await Promise.all([apiRef.current<Role[]>("/roles?offset="+page*100),apiRef.current<Permission[]>("/permissions")]);setRoles(r);setPermissions(p);
      }
    }catch(e){setError(e instanceof Error?e.message:t.error);}finally{setLoading(false);}
  },[hasUser,user?.profile.sub,page,t.error]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    if(initialTab==="audit"&&mine.some(d=>d.permission==="access.audit.view"&&d.allowed))
      void run(async()=>setAudits(await apiRef.current<Audit[]>("/audit")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once, when the deep-linked audit tab's own permission first becomes known
  },[initialTab,mine]);
  const loadRole=async(id:string,versionId?:string)=>{
    const d=await api<Detail>("/roles/"+id);setDetail(d);setSelectedVersion(versionId??d.versions[0]?.version.id??"");return d;
  };
  const current=detail?.versions.find(v=>v.version.id===selectedVersion)??detail?.versions[0];
  const label=(key:string)=>{const p=permissions.find(p=>p.key===key);return p?permissionLabel(p,locale):t.technical;};
  const begin=(d:Detail|null,v?:VersionDetail)=>{
    setWizard(true);setStep(0);setBase("");setValidation([]);setSimulation(null);setReason("");setEffectiveDate("");
    setName(d?.role.name??"");setDescription(d?.role.description??"");setPurpose(d?.role.purpose??"");
    setGrants(v?.grants??[]);setActorType(v?.version.actorType??"GOVERNANCE");setChannel(v?.version.channel??"ADMIN_WEB");
  };
  const toggle=(p:Permission,enabled:boolean)=>{
    if(!enabled){setGrants(grants.filter(g=>g.permission!==p.key));return;}
    const next=[...grants];const scope=p.scopes[0];const relationship=scope==="MANAGED_CLINICIANS"?"MANAGES":null;
    const include=(key:string)=>{if(next.some(g=>g.permission===key&&g.scope===scope))return;next.push({permission:key,scope,relationship});permissions.find(p=>p.key===key)?.dependencies.forEach(include);};
    include(p.key);setGrants(next);if(p.dependencies.length)setNotice(t.dependency);
  };
  const updateScope=(index:number,scope:string)=>{
    setGrants(grants.map((g,i)=>i===index?{...g,scope,relationship:scope==="MANAGED_CLINICIANS"?"MANAGES":null}:g));
  };
  const saveDraft=async()=>{
    let d=detail;let v=current;
    if(!d) {
      d=await api<Detail>("/roles","POST",{name,description,purpose,actorType,channel});
      setDetail(d);v=d.versions[0];setSelectedVersion(v.version.id);
    }
    if(!v) return;
    const saved=await api<VersionDetail>("/roles/"+d.role.id+"/versions/"+v.version.id,"PUT",{revision:v.version.revision,grants,reason});
    await loadRole(d.role.id,saved.version.id);setNotice(t.saved);setValidation([]);
  };
  const validate=async()=>{
    if(!detail||!current)return;
    const result=await api<{valid:boolean;errors:string[];warnings:string[]}>("/roles/"+detail.role.id+"/versions/"+current.version.id+"/validate","POST",{revision:current.version.revision,reason});
    setValidation(result.errors.map(e=>{const [code,key]=e.split(":");return (locale==="ar"?"تحقق من المتطلبات والنطاق والتوافق":"Check dependencies, scope and compatibility")+(key?" — "+label(key):"")+(code==="MAKER_CHECKER_SEPARATION_REQUIRED"?" — "+t.independent:"");}));
    setNotice(result.valid?t.valid:t.invalid);await loadRole(detail.role.id,current.version.id);
  };
  const dirty=!!current&&JSON.stringify(current.grants)!==JSON.stringify(grants);
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const when=(iso:string)=>new Date(iso).toLocaleString(locale==="ar"?"ar-AE":"en-GB")+" ("+zone+")";
  const decisionList=(decisions:Decision[])=><ul className="ag-decisions">{decisions.map(d=><li key={d.permission}><span className={d.allowed?"ag-allow":"ag-deny"}>{d.allowed?<Check size={16}/>:<Minus size={16}/>} {d.allowed?t.allowed:t.deniedAction}</span><div><strong>{label(d.permission)}</strong><p>{businessLabel(d.reason,locale)}{d.scope?" · "+businessLabel(d.scope,locale):""}</p></div></li>)}</ul>;
  const preview=<section className="ag-preview" aria-label={t.preview}><h3>{t.preview}</h3><p><Check size={16} aria-hidden/> {t.can}</p><ul>{grants.map((g,i)=><li key={i}>{label(g.permission)} · {businessLabel(g.scope,locale)}{g.relationship?" · "+businessLabel(g.relationship,locale):""}</li>)}</ul>{!grants.length&&<p>{t.noGrants}</p>}<p><Minus size={16} aria-hidden/> {t.cannot}</p><p>{t.futureHint}</p></section>;
  if(authLoading||loading)return <main className="ag" dir={locale==="ar"?"rtl":"ltr"}><p role="status">{t.loading}</p></main>;
  if(!user)return <main className="ag" dir={locale==="ar"?"rtl":"ltr"}><h1>{t.title}</h1><button onClick={()=>void signIn()}>{t.signin}</button></main>;
  return <main className="ag" dir={locale==="ar"?"rtl":"ltr"}>
    <Link className="ag-back" href={"/"+locale+"/portal"}><ArrowLeft size={16} aria-hidden/>{t.back}</Link>
    <header className="ag-header"><div><div className="ag-eyebrow"><ShieldCheck size={18} aria-hidden/> RehletShifaa</div><h1>{t.title}</h1><p>{t.intro}</p></div><button className="ag-secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden/>{t.retry}</button></header>
    {error&&<p role="alert" className="ag-message">{error}</p>}{notice&&<p role="status" className="ag-message">{notice}</p>}
    {mine.some(d=>d.reason==="RECENT_AUTHENTICATION_REQUIRED")&&<p className="ag-message">{t.recent} <button onClick={()=>void signIn(true)}>{t.signin}</button></p>}
    {!can("access.role.view")?<p>{t.denied}</p>:<>
      <nav className="ag-tabs" aria-label={t.title}>{(["roles","permissions","effective","audit"] as const).map(key=><button key={key} aria-current={tab===key?"page":undefined} onClick={()=>{setTab(key);setWizard(false);setDetail(null);if(key==="audit")void run(async()=>setAudits(await api<Audit[]>("/audit")));}} disabled={busy||(key==="effective"&&!can("access.effective_access.view"))||(key==="audit"&&!can("access.audit.view"))}>{t[key]}</button>)}</nav>
      {tab==="roles"&&!detail&&!wizard&&<section>
        <div className="ag-toolbar"><label>{t.search}<input value={query} onChange={e=>setQuery(e.target.value)} type="search"/></label><button disabled={!can("access.role.create")||busy} onClick={()=>begin(null)}>{t.newRole}</button></div>
        <ul className="ag-role-list">{roles.filter(r=>(roleLabel(r,locale)+" "+r.name).toLowerCase().includes(query.toLowerCase())).map(r=><li key={r.id}><button className="ag-role-link" onClick={()=>void run(async()=>{await loadRole(r.id);})}><span><strong>{roleLabel(r,locale)}</strong><small>{locale==="en"?r.purpose:(r.systemTemplate?"قالب مسؤوليات قابل للتهيئة ضمن نطاق وصول محدد":r.purpose)}</small></span><span>{t.review} ←</span></button></li>)}</ul>
        {!roles.length&&<p>{t.empty}</p>}<div className="ag-toolbar"><button className="ag-secondary" disabled={page===0} onClick={()=>setPage(page-1)}>{t.previous}</button><button className="ag-secondary" disabled={roles.length<100} onClick={()=>setPage(page+1)}>{t.next}</button></div>
      </section>}
      {tab==="roles"&&detail&&!wizard&&current&&<section>
        <button className="ag-secondary" onClick={()=>setDetail(null)}>{t.close}</button><h2>{roleLabel(detail.role,locale)}</h2>
        <p>{locale==="en"||!detail.role.systemTemplate?detail.role.purpose:t.independent}</p>
        <label>{t.history}<select value={selectedVersion} onChange={e=>setSelectedVersion(e.target.value)}>{detail.versions.map(v=><option key={v.version.id} value={v.version.id}>{t.version} {v.version.number} · {businessLabel(v.version.status,locale)}</option>)}</select></label>
        <div className="ag-toolbar"><span className="ag-badge">{businessLabel(current.version.status,locale)}</span><span>{businessLabel(current.version.actorType,locale)} · {businessLabel(current.version.channel,locale)}</span>
        {["DRAFT","VALIDATED"].includes(current.version.status)?<button disabled={!can("access.role.edit_draft")||busy} onClick={()=>begin(detail,current)}>{t.resume}</button>:
          <button disabled={!can("access.role.edit_draft")||busy} onClick={()=>{setReason("");begin(detail,current);setWizard(false);void run(async()=>{
            const d=await api<Detail>("/roles/"+detail.role.id+"/drafts","POST",{baseVersionId:current.version.id,reason:locale==="ar"?"مراجعة إعداد الدور":"Review role configuration"});
            setDetail(d);setSelectedVersion(d.versions[0].version.id);begin(d,d.versions[0]);
          });}}>{t.edit}</button>}</div>
        <ul className="ag-capabilities">{current.grants.map((g,i)=><li key={i}><strong>{label(g.permission)}</strong><span>{businessLabel(g.scope,locale)}{g.relationship?" · "+businessLabel(g.relationship,locale):""}</span></li>)}</ul>
        {!current.grants.length&&<p>{t.noGrants}</p>}
        {current.version.status==="PUBLISHED"&&can("access.role.retire")&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{await api("/roles/"+detail.role.id+"/versions/"+current.version.id+"/retire","POST",{revision:current.version.revision,reason});await loadRole(detail.role.id,current.version.id);});}}><label>{t.reason}<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="ag-secondary" disabled={busy}>{t.retire}</button></form>}
      </section>}
      {tab==="roles"&&wizard&&<section>
        <button className="ag-secondary" disabled={busy} onClick={()=>setWizard(false)}>{t.close}</button>
        <ol className="ag-steps" aria-label={t.newRole}>{t.steps.map((s,i)=><li key={s}><button aria-current={step===i?"step":undefined} onClick={()=>setStep(i)}>{i+1}. {s}</button></li>)}</ol>
        <div className="ag-editor"><form onSubmit={e=>{e.preventDefault();void run(saveDraft);}}><h2>{step+1}. {t.steps[step]}</h2>
          {step===0&&<><label>{t.name}<input required maxLength={160} disabled={!!detail} value={name} onChange={e=>setName(e.target.value)}/></label><label>{t.description}<textarea required maxLength={500} disabled={!!detail} value={description} onChange={e=>setDescription(e.target.value)}/></label><label>{t.purpose}<textarea required maxLength={500} disabled={!!detail} value={purpose} onChange={e=>setPurpose(e.target.value)}/></label></>}
          {step===1&&<><label>{t.base}<select disabled={!!detail} value={base} onChange={e=>{setBase(e.target.value);if(e.target.value)void run(async()=>{const d=await api<Detail>("/roles/"+e.target.value);const v=d.versions.find(v=>v.version.status==="PUBLISHED");if(v){setGrants(v.grants);setActorType(v.version.actorType);setChannel(v.version.channel);}});}}><option value="">{t.choose}</option>{roles.map(r=><option value={r.id} key={r.id}>{roleLabel(r,locale)}</option>)}</select></label><p>{t.independent}</p></>}
          {step===2&&Object.entries(Object.groupBy(permissions,p=>p.family)).map(([family,items])=><fieldset key={family}><legend>{familyLabel(family,locale)}</legend>{items?.map(p=><label className="ag-check" key={p.key}><input type="checkbox" checked={grants.some(g=>g.permission===p.key)} onChange={e=>toggle(p,e.target.checked)}/><span>{permissionLabel(p,locale)}<small>{businessLabel(p.risk,locale)}{!p.executable?" · "+t.future:""}</small></span></label>)}</fieldset>)}
          {step===3&&grants.map((g,i)=><label key={i}>{label(g.permission)}<select value={g.scope} onChange={e=>updateScope(i,e.target.value)}>{permissions.find(p=>p.key===g.permission)?.scopes.map(s=><option key={s} value={s}>{businessLabel(s,locale)}</option>)}</select></label>)}
          {step===4&&grants.map((g,i)=><label key={i}>{label(g.permission)}<select value={g.relationship??""} onChange={e=>setGrants(grants.map((v,n)=>n===i?{...v,relationship:e.target.value||null}:v))}><option value="">{t.none}</option>{relationships.map(r=><option key={r} value={r}>{businessLabel(r,locale)}</option>)}</select></label>)}
          {step===5&&<><p>{t.recent}</p><ul className="ag-capabilities">{grants.map((g,i)=><li key={i}>{label(g.permission)} · {businessLabel(permissions.find(p=>p.key===g.permission)?.risk??"LOW",locale)}</li>)}</ul></>}
          {step===6&&<label>{t.actor}<select disabled={!!detail} value={actorType} onChange={e=>setActorType(e.target.value)}>{actors.map(a=><option key={a} value={a}>{businessLabel(a,locale)}</option>)}</select></label>}
          {step===7&&<label>{t.channel}<select disabled={!!detail} value={channel} onChange={e=>setChannel(e.target.value)}>{channels.map(a=><option key={a} value={a}>{businessLabel(a,locale)}</option>)}</select></label>}
          {step===8&&<><p>{t.conflicts}</p><p>{t.independent}</p><p>{t.pending}</p></>}
          {step===9&&<><p>{t.accessRead}</p><p>{t.recent}</p><label>{t.subject}<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={255}/></label><label>{t.capabilities}<select value={simulationPermission} onChange={e=>setSimulationPermission(e.target.value)}>{permissions.map(p=><option key={p.key} value={p.key}>{permissionLabel(p,locale)}</option>)}</select></label><button type="button" disabled={busy||dirty||!current||!subject||!can("access.role.simulate")} onClick={()=>void run(async()=>setSimulation(await api<Decision>("/simulate","POST",{subject,permission:simulationPermission,resourceType:"PLATFORM",resourceId:platform,draftVersionId:current?.version.id})))}>{t.simulate}</button>{simulation&&decisionList([simulation])}<p>{locale==="ar"?"احفظ المسودة أولًا. تعرض المحاكاة تعيين هذا الإصدار افتراضيًا دون تغيير الوصول الفعلي.":"Save the draft first. Simulation previews this version as a proposed assignment; it does not change live access."}</p></>}
          {step===10&&<><p>{t.independent}</p><h3>{t.changes}</h3><ul>{grants.filter(g=>!detail?.versions.find(v=>v.version.status==="PUBLISHED")?.grants.some(old=>identity(old)===identity(g))).map((g,i)=><li key={i}>{t.added}: {label(g.permission)} · {businessLabel(g.scope,locale)}</li>)}{detail?.versions.find(v=>v.version.status==="PUBLISHED")?.grants.filter(g=>!grants.some(next=>identity(next)===identity(g))).map((g,i)=><li key={i}>{t.removed}: {label(g.permission)}</li>)}</ul><label>{t.effectiveDate}<input type="datetime-local" value={effectiveDate} onChange={e=>setEffectiveDate(e.target.value)}/></label></>}
          <label>{t.reason}<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
          {validation.length>0&&<ul role="alert">{validation.map((v,i)=><li key={i}>{v}</li>)}</ul>}
          <div className="ag-toolbar"><button type="button" className="ag-secondary" disabled={step===0||busy} onClick={()=>setStep(step-1)}>{t.previous}</button><button type="button" className="ag-secondary" disabled={step===10||busy} onClick={()=>setStep(step+1)}>{t.next}</button><button disabled={busy||!reason||!name||!purpose||!description||!can(detail?"access.role.edit_draft":"access.role.create")}>{t.save}</button></div>
          {current&&<div className="ag-toolbar"><button type="button" disabled={busy||dirty||!reason||!can("access.role.edit_draft")} onClick={()=>void run(validate)}>{t.validate}</button><button type="button" disabled={busy||dirty||current.version.status!=="VALIDATED"||!reason||!effectiveDate||!can("access.role.publish")||current.version.createdBy===user.profile.sub} onClick={()=>void run(async()=>{if(!detail)return;await api("/roles/"+detail.role.id+"/versions/"+current.version.id+"/publish","POST",{revision:current.version.revision,reason,effectiveFrom:new Date(effectiveDate).toISOString()});await loadRole(detail.role.id,current.version.id);setWizard(false);})}>{t.publish}</button></div>}
        </form>{preview}</div>
      </section>}
      {tab==="permissions"&&<section><p>{t.futureHint}</p>{Object.entries(Object.groupBy(permissions,p=>p.family)).map(([family,items])=><section key={family}><h2>{familyLabel(family,locale)}</h2><ul className="ag-capabilities">{items?.map(p=><li key={p.key}><div><strong>{permissionLabel(p,locale)}</strong><p>{p.scopes.map(s=>businessLabel(s,locale)).join(" · ")}</p><details><summary>{t.advanced}</summary><p>{t.technical}: <code dir="ltr">{p.key}</code></p><p>{p.dependencies.map(label).join(" · ")}</p></details></div><span className="ag-badge">{businessLabel(p.risk,locale)}{!p.executable&&<small>{t.future}</small>}</span></li>)}</ul></section>)}</section>}
      {tab==="effective"&&<section><h2>{t.effective}</h2><p>{t.accessRead}</p><p>{t.recent}</p><form className="ag-effective-form" onSubmit={e=>{e.preventDefault();void run(async()=>{setEffective(null);setEffective(await api<Effective>("/effective-access?subject="+encodeURIComponent(subject)+"&organization="+encodeURIComponent(organization)));});}}><label>{t.subject}<input required maxLength={255} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>{t.organization}<input required dir="ltr" value={organization} onChange={e=>setOrganization(e.target.value)}/></label><button disabled={busy}>{t.inspect}</button></form>
        {effective&&<>{effective.membership&&<p>{businessLabel(effective.membership.status,locale)} · {effective.membership.accountActive?(locale==="ar"?"الحساب نشط":"Account active"):(locale==="ar"?"الحساب غير نشط":"Account inactive")}</p>}<h3>{t.source}</h3>{!effective.sources.length&&<p>{t.noAccess}</p>}<ul className="ag-capabilities">{effective.sources.map(s=><li key={s.assignment.id}><div><strong>{s.roleName} · {t.version} {s.version.number}</strong><p>{businessLabel(s.assignment.status,locale)} · {businessLabel(s.assignment.scope,locale)} · {businessLabel(s.assignment.source,locale)}</p><p>{(locale==="ar"?"يبدأ في ":"Starts at ")+when(s.assignment.effectiveFrom)}</p><p>{s.assignment.effectiveTo?(locale==="ar"?"ينتهي في ":"Expires at ")+when(s.assignment.effectiveTo):(locale==="ar"?"بلا تاريخ انتهاء":"No expiry")}</p></div></li>)}</ul><h3>{t.relationship}</h3><ul>{effective.relationships.map(r=><li key={r.id}>{businessLabel(r.type,locale)} · <bdi>{r.targetId}</bdi> · {businessLabel(r.status,locale)}</li>)}</ul>{decisionList(effective.decisions)}{can("access.assignment.manage")&&<AccessAssignments key={effective.subject+effective.organizationId} locale={locale} subject={effective.subject} organization={effective.organizationId} roles={roles} sources={effective.sources} api={api} reload={async()=>setEffective(await api<Effective>("/effective-access?subject="+encodeURIComponent(effective.subject)+"&organization="+encodeURIComponent(effective.organizationId)))}/>}</>}
      </section>}
      {tab==="audit"&&<section><h2>{t.audit}</h2>{!audits.length&&<p>{t.empty}</p>}<ol className="ag-audit">{audits.map((a,i)=><li key={i}><time>{new Date(a.occurredAt).toLocaleString(locale==="ar"?"ar-AE":"en-GB")}</time><strong>{locale==="ar"?"حدث حوكمة الوصول":a.action.toLowerCase().replaceAll("_"," ")}</strong><span>{a.outcome==="DENY"?t.deniedAction:t.allowed}</span><details><summary>{t.advanced}</summary><p><bdi>{a.actor}</bdi> · <bdi>{a.entity}</bdi></p><p>{a.reason}</p></details></li>)}</ol>{audits.length>=100&&<button disabled={busy} onClick={()=>void run(async()=>setAudits([...audits,...await api<Audit[]>("/audit?offset="+audits.length)]))}>{t.next}</button>}</section>}
    </>}
  </main>;
}
