"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { businessLabel, roleLabel } from "./access-copy";

type Version={version:{id:string;number:number;status:string};grants:{scope:string}[]};
type Role={id:string;key:string;name:string;systemTemplate:boolean};
type Source={assignment:{id:string;status:string;revision:number};roleName:string;version:{number:number}};
type Props={locale:Locale;subject:string;organization:string;roles:Role[];sources:Source[];
  api:<T>(path:string,method?:string,body?:unknown)=>Promise<T>;reload:()=>Promise<void>};

export function AccessAssignments({locale,subject,organization,roles,sources,api,reload}:Props) {
  const ar=locale==="ar";
  const [role,setRole]=useState("");const [versions,setVersions]=useState<Version[]>([]);const [version,setVersion]=useState("");
  const [scope,setScope]=useState("");const [reason,setReason]=useState("");const [from,setFrom]=useState("");const [to,setTo]=useState("");
  const [targetType,setTargetType]=useState("");const [targetId,setTargetId]=useState("");
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const current=versions.find(v=>v.version.id===version);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError("");setNotice("");try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  return <section aria-label={ar?"إدارة التعيينات":"Manage assignments"}>
    <h3>{ar?"تعيين دور محدد الإصدار":"Assign a role version"}</h3>
    <p>{ar?"تعيينات الجهات غير المتحقق منها تبقى معلّقة. لا تمنح وصولًا إلى بيانات المرضى.":"Assignments for unverified organizations remain pending. They do not grant patient data access."}</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      const result=await api<{status:string}>("/assignments","POST",{subject,organizationId:organization,versionId:version,scope,
        targetType:scope==="SPECIFIC_RESOURCE"?targetType:null,targetId:scope==="SPECIFIC_RESOURCE"?targetId:null,
        effectiveFrom:from?new Date(from).toISOString():new Date().toISOString(),effectiveTo:to?new Date(to).toISOString():null,reason});
      await reload();setNotice((ar?"تم حفظ التعيين: ":"Assignment saved: ")+businessLabel(result.status,locale));
    });}}>
      <label>{ar?"الدور":"Role"}<select required disabled={busy} value={role} onChange={e=>{const id=e.target.value;setRole(id);setVersion("");setVersions([]);setScope("");if(id)void run(async()=>{
        const result=await api<{versions:Version[]}>("/roles/"+id);setVersions(result.versions.filter(v=>v.version.status==="PUBLISHED"));
      });}}><option value="">{ar?"اختر دورًا":"Choose a role"}</option>{roles.map(r=><option key={r.id} value={r.id}>{roleLabel(r,locale)}</option>)}</select></label>
      <label>{ar?"الإصدار المنشور":"Published version"}<select required disabled={busy} value={version} onChange={e=>{setVersion(e.target.value);setScope("");}}><option value="">{ar?"اختر إصدارًا":"Choose a version"}</option>{versions.map(v=><option key={v.version.id} value={v.version.id}>{v.version.number}</option>)}</select></label>
      <label>{ar?"النطاق":"Assignment scope"}<select required disabled={busy} value={scope} onChange={e=>setScope(e.target.value)}><option value="">{ar?"اختر نطاقًا":"Choose a scope"}</option>{[...new Set(current?.grants.map(g=>g.scope))].map(s=><option key={s} value={s}>{businessLabel(s,locale)}</option>)}</select></label>
      {scope==="SPECIFIC_RESOURCE"&&<><label>{ar?"نوع المورد":"Resource type"}<input required maxLength={60} value={targetType} onChange={e=>setTargetType(e.target.value)}/></label><label>{ar?"معرّف المورد":"Resource identifier"}<input required maxLength={255} value={targetId} onChange={e=>setTargetId(e.target.value)}/></label></>}
      <label>{ar?"يبدأ في (الآن إن تُرك فارغًا)":"Starts at (blank for now)"}<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>{ar?"ينتهي في (اختياري)":"Expires at (optional)"}<input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>{ar?"سبب التعيين أو الإلغاء":"Assignment or revocation reason"}<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button disabled={busy||!subject||!organization||!version||!scope||!reason.trim()}>{ar?"تعيين الدور":"Assign role"}</button>
    </form>
    <ul className="ag-capabilities">{sources.filter(s=>s.assignment.status!=="REVOKED").map(s=><li key={s.assignment.id}><span>{s.roleName} · {s.version.number}</span><button className="ag-secondary" disabled={busy||!reason.trim()} onClick={()=>void run(async()=>{
      await api("/assignments/"+s.assignment.id+"/revoke?organization="+encodeURIComponent(organization),"POST",{revision:s.assignment.revision,reason});await reload();setNotice(ar?"أُلغي التعيين":"Assignment revoked");
    })}>{ar?"إلغاء التعيين":"Revoke assignment"}</button></li>)}</ul>
  </section>;
}
