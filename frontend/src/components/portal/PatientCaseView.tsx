"use client";

import { useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CaseMessages } from "@/components/portal/CaseMessages";
import type { CaseActions } from "@/components/portal/CurrentAction";
import { FeedbackContext, CaseDrawer } from "@/components/portal/portal-ui";
import type { CaseViewProps } from "@/components/portal/StaffCaseView";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import type { Mutate } from "@/components/portal/portal-model";

/** The portal with its staff work copy (from the server page) available to every queue, work list and case view. */
// Role-specific panels, loaded on demand: a coordinator never downloads My Care, a patient never the clinical review.
const MyCare=dynamic(()=>import("@/components/portal/MyCare").then(m=>m.MyCare));
const PatientIdentityStep=dynamic(()=>import("@/components/portal/PatientIdentityStep").then(m=>m.PatientIdentityStep));
const PatientDepositPayment=dynamic(()=>import("@/components/portal/PatientDepositPayment").then(m=>m.PatientDepositPayment));
const PatientProposal=dynamic(()=>import("@/components/portal/PatientProposal").then(m=>m.PatientProposal));
const PatientProposalDecision=dynamic(()=>import("@/components/portal/PatientProposal").then(m=>m.PatientProposalDecision));

/**
 * The patient's case page: My Care renders the backend's current step, the proposal and deposit facts and the coordinator;
 * the proposal itself opens on demand in a drawer, where the decision (when one is owed) is the only control. Patients
 * enter their care journey, not a console, so this module never loads the staff workspace.
 */
export function PatientCaseView({locale,proposalCopy,role,value,documents,busy,mutate,load,careView="care",onCareView,otherCases=[],openCaseById}:CaseViewProps){
  const feedback=useContext(FeedbackContext);
  const [proposalOpen,setProposalOpen]=useState(false);
  const c=value.caseSummary;const approved=value.clinicalReviews.find(r=>r.status==="APPROVED");
  const actions:CaseActions=value.actions??{journeyStage:c.status,waitingOn:c.waitingOn,currentAction:{code:"NONE",kind:"NONE"},blockers:[],availableActions:[]};
   const proposalReady=value.patientProposal?.action==="REVIEW_PROPOSAL";
   const unread=value.messages.filter(m=>m.senderRole!=="PATIENT"&&!m.read).length;
   // The switcher lists every case the account can open; this one comes from the workspace when the list has not caught up.
   // The workspace is fresher than the list for the open case; the list keeps its per-case relation (viewer).
   const allCases=otherCases.some(other=>other.id===c.id)?otherCases.map(other=>other.id===c.id?{...other,...c,viewer:other.viewer}:other):[c,...otherCases];
   // "Send a new case" is the account holder's own: offered once the account has a case of its own (sending for someone else is not built yet).
   const sendsOwnCase=allCases.length>1?allCases.some(other=>(other.id===c.id?actions.viewer:other.viewer)!=="REPRESENTATIVE"):actions.viewer!=="REPRESENTATIVE";
   return <div>
    <MyCare locale={locale} caseSummary={c} actions={actions} milestones={value.milestones} patientAction={value.patientAction} patientProposal={value.patientProposal} proposal={value.proposal??null} deposit={value.deposit??null}
     documents={documents} unreadMessages={unread} cases={allCases} newCaseHref={sendsOwnCase?localeHref(locale,"send-my-case"):null} view={careView} onView={view=>onCareView?.(view)}
     onOpenCase={id=>openCaseById?.(id)} onOpenProposal={()=>setProposalOpen(true)} onWithdraw={()=>mutate(`/patient/cases/${c.id}/withdraw`,{})}
     identityStep={actions.currentAction.code==="VERIFY_IDENTITY"?<IdentityStep key={c.id} locale={locale} caseId={c.id} busy={busy} mutate={mutate} load={load}/>:undefined}
     paymentStep={actions.currentAction.code==="PAY_DEPOSIT"&&value.deposit?.bankTransfer?<PatientDepositPayment key={`${c.id}:${value.deposit.transfer?.id??"new"}`} locale={locale} caseId={c.id} currency={value.deposit.currency}
      amountDue={value.deposit.balanceDisplay??value.deposit.totalDisplay??null} totalDue={value.deposit.totalDisplay??null} received={value.deposit.paidDisplay??null}
      bank={value.deposit.bankTransfer} transfer={value.deposit.transfer} busy={busy} mutate={mutate}/>:undefined}
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

type SubmittedIdentity={status:string;rejectionReason?:string|null}|null;

/**
 * The identity step as it stands: the latest submission (under review, or rejected with the reason) from the patient's
 * onboarding, not an empty form after every submit. Read again by the submit itself; the submission's own answer stands in
 * if that read fails.
 */
function IdentityStep({locale,caseId,busy,mutate,load}:{locale:Locale;caseId:string;busy:boolean;mutate:Mutate;load:<T>(path:string)=>Promise<T>}){
  const [identity,setIdentity]=useState<SubmittedIdentity|undefined>(undefined);
  useEffect(()=>{
    let live=true;
    // A failed read falls back to the form, as before.
    load<{identity?:SubmittedIdentity}>(`/patient/cases/${caseId}/onboarding`).then(view=>{if(live)setIdentity(view?.identity??null);},()=>{if(live)setIdentity(null);});
    return()=>{live=false;};
  },[load,caseId]);
  if(identity===undefined)return null;
  return <PatientIdentityStep locale={locale} caseId={caseId} identity={identity} busy={busy}
    mutate={async(path,body,method)=>{const result=await mutate(path,body,method);
      if(result){const view=await load<{identity?:SubmittedIdentity}>(`/patient/cases/${caseId}/onboarding`).catch(()=>null);setIdentity(view?view.identity??null:{status:result.status??"PENDING"});}
      return result;}}/>;
}
