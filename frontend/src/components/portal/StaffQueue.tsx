"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { RoleDashboardSummary } from "@/components/portal/RoleDashboardSummary";
import { CaseQueue, type QueueState } from "@/components/portal/CaseQueue";
import { StaffViewLinks, type StaffViewId, type StaffViewItem } from "@/components/portal/StaffNav";
import { MyWork, type WorkItem } from "@/components/portal/MyWork";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { careAreaLabel } from "@/lib/portal-labels";
import type { Locale } from "@/lib/i18n";
import type { PortalView as RoleKey } from "@/lib/access";
import { type CaseView, type StaffMember, type Task, type Mutate, statusLabel } from "@/components/portal/portal-model";
import { CaseDrawer } from "@/components/portal/portal-ui";

const TransferOwnership=dynamic(()=>import("@/components/portal/TransferOwnership").then(m=>m.TransferOwnership));

/**
 * The operational dashboard: work first, then the cases I own, then what the team has available.
 * Ownership ("Take ownership") belongs to the team queue; My Cases is accountability, not a task list.
 */
export function Queue({views,view:current,onSelectView,viewHref,clinic,loading,locale,role,cases,tasks,busy,mySubject,coordinatorLead,staff=[],openCase,openCaseById,mutate,queueState,changeQueue}:{views:StaffViewItem[];view:StaffViewId;onSelectView:(id:StaffViewId)=>void;viewHref?:(id:StaffViewId)=>string;clinic:{href:string;label:string}|null;loading:boolean;locale:Locale;role?:RoleKey;cases:CaseView[];tasks:Task[];busy:boolean;mySubject?:string;coordinatorLead:boolean;staff?:StaffMember[];openCase:(item:CaseView)=>void;openCaseById:(caseId:string)=>void;mutate:Mutate;queueState:QueueState;changeQueue:(value:QueueState)=>void}){
 const work=useWorkCopy();
  const ar=locale==="ar";
  const staffView=role!=="patient";
  const[transferCase,setTransferCase]=useState<CaseView|null>(null);
  const view=staffView?current:"cases";
  const teamWaiting=views.find(item=>item.id==="team")?.count??0;
  const title=views.find(item=>item.id===view)?.label;
  return <>{staffView&&<StaffViewLinks locale={locale} label={work.nav.label} items={views} current={view as StaffViewId} clinic={clinic} onSelect={onSelectView} hrefFor={viewHref} variant="inline"/>}
    {staffView&&<RoleDashboardSummary locale={locale} role={role??""} cases={cases} tasks={tasks} loading={loading} selected={queueState.kpi} onSelect={value=>changeQueue({...queueState,kpi:value,...(value?{view:value==="unowned"?(role==="coordinator"?"team":"work"):view==="work"?"mine":view,viewChosen:true,tab:value==="unowned"&&role==="coordinator"?"unowned":queueState.tab}:{}),page:1})}/>}
    <div id="work-panel">
      {!staffView&&tasks.length>0&&<MyWork locale={locale} role={role} items={tasks as unknown as WorkItem[]} busy={busy} onOpen={openCaseById}/>}
      {view==="work"
        ? <MyWork locale={locale} role={role} items={tasks as unknown as WorkItem[]} busy={busy} onOpen={openCaseById} teamWaiting={teamWaiting} onTeamQueue={()=>onSelectView("team")}/>
        : <CaseQueue locale={locale} role={role??""} cases={cases} subject={mySubject} lead={coordinatorLead} busy={busy} state={queueState} scope={staffView?(view==="team"?"team":"mine"):"all"} title={staffView?title:undefined} onChange={changeQueue} onOpen={openCase} onMutate={mutate} onTransfer={role==="coordinator"&&coordinatorLead?item=>setTransferCase(item):undefined} statusLabel={value=>statusLabel(value,locale)} categoryLabel={value=>careAreaLabel(value,work.careAreas)}/>}
    </div>
    {transferCase&&<CaseDrawer locale={locale} title={ar?"نقل ملكية الحالة":"Transfer case ownership"} onClose={()=>setTransferCase(null)}><TransferOwnership locale={locale} caseId={transferCase.id} caseNumber={transferCase.caseNumber} currentOwner={transferCase.coordinatorSubject} currentOwnerName={transferCase.coordinatorName} mySubject={mySubject} staff={staff} busy={busy} mutate={mutate} onClose={()=>setTransferCase(null)}/></CaseDrawer>}
  </>;
}
