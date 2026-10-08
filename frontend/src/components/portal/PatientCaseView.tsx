"use client";

import { useContext, useState } from "react";
import dynamic from "next/dynamic";
import { CaseMessages } from "@/components/portal/CaseMessages";
import type { CaseActions } from "@/components/portal/CurrentAction";
import { FeedbackContext, CaseDrawer } from "@/components/portal/portal-ui";
import type { CaseViewProps } from "@/components/portal/StaffCaseView";

/** The portal with its staff work copy (from the server page) available to every queue, work list and case view. */
// Role-specific panels, loaded on demand: a coordinator never downloads My Care, a patient never the clinical review.
const MyCare=dynamic(()=>import("@/components/portal/MyCare").then(m=>m.MyCare));
const PatientIdentityStep=dynamic(()=>import("@/components/portal/PatientIdentityStep").then(m=>m.PatientIdentityStep));
const PatientProposal=dynamic(()=>import("@/components/portal/PatientProposal").then(m=>m.PatientProposal));
const PatientProposalDecision=dynamic(()=>import("@/components/portal/PatientProposal").then(m=>m.PatientProposalDecision));

/**
 * The patient's case page: My Care renders the backend's current step, the proposal and deposit facts and the coordinator;
 * the proposal itself opens on demand in a drawer, where the decision (when one is owed) is the only control. Patients
 * enter their care journey, not a console, so this module never loads the staff workspace.
 */
export function PatientCaseView({locale,proposalCopy,role,value,documents,busy,mutate,careView="care",onCareView,otherCases=[],openCaseById}:CaseViewProps){
  const feedback=useContext(FeedbackContext);
  const [proposalOpen,setProposalOpen]=useState(false);
  const c=value.caseSummary;const approved=value.clinicalReviews.find(r=>r.status==="APPROVED");
  const actions:CaseActions=value.actions??{journeyStage:c.status,waitingOn:c.waitingOn,currentAction:{code:"NONE",kind:"NONE"},blockers:[],availableActions:[]};
   const proposalReady=value.patientProposal?.action==="REVIEW_PROPOSAL";
   const unread=value.messages.filter(m=>m.senderRole!=="PATIENT"&&!m.read).length;
   return <div>
    <MyCare locale={locale} representative={actions.viewer==="REPRESENTATIVE"} caseSummary={c} actions={actions} patientAction={value.patientAction} patientProposal={value.patientProposal} proposal={value.proposal??null} deposit={value.deposit??null}
     documents={documents} unreadMessages={unread} timeline={value.timeline} otherCases={otherCases.filter(other=>other.id!==c.id)} view={careView} onView={view=>onCareView?.(view)}
     onOpenCase={id=>openCaseById?.(id)} onOpenProposal={()=>setProposalOpen(true)}
     identityStep={actions.currentAction.code==="VERIFY_IDENTITY"?<PatientIdentityStep locale={locale} caseId={c.id} identity={null} busy={busy} mutate={mutate}/>:undefined}
     messagesPanel={<div aria-busy={busy||undefined} className="min-w-0"><CaseMessages key={c.id} locale={locale} role={role} caseId={c.id} messages={value.messages} canSend={true} busy={busy} mutate={mutate}/></div>}/>
    {proposalOpen&&value.proposal&&<CaseDrawer locale={locale} title={proposalCopy.title} onClose={()=>setProposalOpen(false)}>
     <div aria-busy={busy||undefined} className="min-w-0"><PatientProposal locale={locale} copy={proposalCopy} proposal={value.proposal}
      recommendation={approved?{treatment:approved.recommendedTreatment,risks:approved.risksAndLimitations}:null}
      decision={proposalReady?<PatientProposalDecision key={value.proposal.versionId} locale={locale} copy={proposalCopy} caseId={c.id} proposal={value.proposal}
       coordinatorName={c.coordinatorName} englishHref={locale==="ar"?`/en/portal?case=${c.id}`:undefined} onRequestAssistance={async path=>{const result=await mutate(path);if(result)feedback.clear();return result;}}
       onMessage={onCareView?()=>{setProposalOpen(false);onCareView("messages");}:undefined} mutate={async(path,body,method)=>{const result=await mutate(path,body,method);if(result)setProposalOpen(false);return result;}}/>:null}/></div>
    </CaseDrawer>}
   </div>;
}
