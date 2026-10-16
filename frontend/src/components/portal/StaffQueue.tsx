"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { RoleDashboardSummary, type KpiFilter } from "@/components/portal/RoleDashboardSummary";
import { CaseQueue, type QueueState } from "@/components/portal/CaseQueue";
import type { StaffViewId, StaffViewItem } from "@/components/portal/StaffNav";
import { MyWork, type WorkItem } from "@/components/portal/MyWork";
import { ReplyCoverPanel, type ReplyCover } from "@/components/portal/ReplyCoverPanel";
import { ConversationsView } from "@/components/portal/ConversationsView";
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
export function Queue({views,view:current,onSelectView,loading,locale,role,cases,tasks,busy,mySubject,coordinatorLead,staff=[],replyCovers=[],fetchJson,openCase,openCaseById,mutate,queueState,changeQueue}:{views:StaffViewItem[];view:StaffViewId;onSelectView:(id:StaffViewId)=>void;loading:boolean;locale:Locale;role?:RoleKey;cases:CaseView[];tasks:Task[];busy:boolean;mySubject?:string;coordinatorLead:boolean;staff?:StaffMember[];replyCovers?:ReplyCover[];fetchJson?:<T,>(path:string)=>Promise<T>;openCase:(item:CaseView)=>void;openCaseById:(caseId:string)=>void;mutate:Mutate;queueState:QueueState;changeQueue:(value:QueueState)=>void}){
 const work=useWorkCopy();
  const staffView=role!=="patient";
  const[transferCase,setTransferCase]=useState<CaseView|null>(null);
  const view=staffView?current:"cases";
  // A count on My work opens the list it counts (its filter goes with it, as a chip there). The pressed count goes with the
  // line, so the focus moves to the page's heading, which now names the list (WCAG 2.4.3).
  const selectKpi=(value:KpiFilter)=>{
    const next=value?(value==="unowned"?(role==="coordinator"?"team":"work"):view==="work"?"mine":view):view;
    changeQueue({...queueState,kpi:value,...(value?{view:next,viewChosen:true,tab:value==="unowned"&&role==="coordinator"?"unowned":queueState.tab}:{}),page:1});
    if(next!==view)requestAnimationFrame(()=>document.getElementById("portal-title")?.focus());
  };
  const teamWaiting=views.find(item=>item.id==="team")?.count??0;
  return <>
    {/* The count line belongs to My work alone (UX 2-4): the other views are places, not a to-do. */}
    {staffView&&view==="work"&&<RoleDashboardSummary role={role??""} cases={cases} tasks={tasks} loading={loading} selected={queueState.kpi} onSelect={selectKpi}/>}
    <div id="work-panel">
      {!staffView&&tasks.length>0&&<MyWork locale={locale} role={role} subject={mySubject} items={tasks as unknown as WorkItem[]} busy={busy} onOpen={openCaseById}/>}
      {view==="conversations"&&fetchJson
        ? <ConversationsView labelledBy="portal-title" locale={locale} lead={!!coordinatorLead} staff={staff} busy={busy} mutate={mutate} fetchJson={fetchJson}/>
        : view==="work"
        ? <><MyWork labelledBy="portal-title" locale={locale} role={role} subject={mySubject} items={tasks as unknown as WorkItem[]} busy={busy} onOpen={openCaseById} teamWaiting={teamWaiting} onTeamQueue={()=>onSelectView("team")}/>{role==="coordinator"&&<ReplyCoverPanel locale={locale} mySubject={mySubject} covers={replyCovers} staff={staff} busy={busy} mutate={mutate}/>}</>
        : <CaseQueue locale={locale} role={role??""} cases={cases} subject={mySubject} lead={coordinatorLead} busy={busy} state={queueState} scope={staffView?(view==="team"?"team":"mine"):"all"} labelledBy={staffView?"portal-title":undefined} onChange={changeQueue} onOpen={openCase} onMutate={mutate} onTransfer={role==="coordinator"&&coordinatorLead?item=>setTransferCase(item):undefined} statusLabel={value=>statusLabel(value,locale)} categoryLabel={value=>careAreaLabel(value,work.careAreas)}/>}
    </div>
    {transferCase&&<CaseDrawer locale={locale} title={work.caseView.transferTitle} onClose={()=>setTransferCase(null)}><TransferOwnership locale={locale} caseId={transferCase.id} caseNumber={transferCase.caseNumber} currentOwner={transferCase.coordinatorSubject} currentOwnerName={transferCase.coordinatorName} mySubject={mySubject} staff={staff} busy={busy} mutate={mutate} onClose={()=>setTransferCase(null)}/></CaseDrawer>}
  </>;
}
