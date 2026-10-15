"use client";

import { ConsultantReferrals } from "@/components/portal/ConsultantRouting";
import { createContext, use, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Gauge, MessageSquare, MoreHorizontal, Plus, X } from "lucide-react";
import { CaseWorkflowActions } from "@/components/portal/CaseWorkflowActions";
import { FacilityPackagePicker, facilityPackageLines, facilityPackages, packageEstimate } from "@/components/portal/FacilityPackagePicker";
import { CaseBlockers } from "@/components/portal/CaseBlockers";
import { CancelCaseDialog, CoordinatorActionForm, MoreActions, UrgencyDialog, type Urgency } from "@/components/portal/CoordinatorActions";
import { RecordProposalDecision } from "@/components/portal/RecordProposalDecision";
import { MessageThreads, UnreadTally } from "@/components/portal/CaseMessages";
import { IntakeHistory } from "@/components/portal/IntakeHistory";
import type { ConversationDetail } from "@/components/portal/ConversationsView";
import type { ProposalCopy } from "@/components/portal/PatientProposal";
import { JourneyPulse, FullJourneyDialog } from "@/components/portal/JourneySnapshot";
import { CurrentActionPanel, actionTitle, focusCurrentAction, isOwnStep, stepLabel, type CaseActions, type CurrentActionView } from "@/components/portal/CurrentAction";
import type { WorkItem } from "@/components/portal/MyWork";
import { patientStepText } from "@/components/portal/patient-step";
import { FinanceApproval } from "@/components/portal/FinanceApproval";
import type { CareView, PatientProposalState } from "@/components/portal/MyCare";
import { RequestInformationDialog } from "@/components/portal/RequestInformationDialog";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { careAreaLabel, coordinatorLabel, fillTemplate, plural, tabKeyTarget, waitingLabel, waitingReasonText, workItemText } from "@/lib/portal-labels";
import { AssignmentHistory, type AssignmentHistoryEntry } from "@/components/portal/AssignmentHistory";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { PortalView as RoleKey } from "@/lib/access";
import { scrollIntoView } from "@/lib/scroll";
import { countryName } from "@/lib/countries";
import { PROPOSAL_PAYMENT_TERMS_RECORD } from "@/lib/commercial-terms";
import { type CaseView, type CatalogService, type DirectoryFacility, type FxRate, REFERRAL_ASSIGNMENTS, REFERRAL_CONFIRM_WORK, type CaseDocument, type VerifiedDoctor, type CareCategory, type StaffMember, type Review, type Proposal, type Task, type ProposalGates, type DeliveryStatus, type DepositView, type Workspace, type Mutate, CURRENCY_LABELS, money, formatBytes, statusLabel } from "@/components/portal/portal-model";
import { useShortcutsEnabled, useStaffShortcut } from "@/components/portal/StaffShortcuts";
import { copy, HeaderFact, CaseDrawer, ConfirmDialog, Panel, Empty, Status, LockedSection } from "@/components/portal/portal-ui";

const ClinicalReviewPanel=dynamic(()=>import("@/components/portal/ClinicalReview").then(m=>m.ClinicalReviewPanel));
const DeclineAssignmentDialog=dynamic(()=>import("@/components/portal/DeclineAssignmentDialog").then(m=>m.DeclineAssignmentDialog));
const TransferOwnership=dynamic(()=>import("@/components/portal/TransferOwnership").then(m=>m.TransferOwnership));
const RecordPatientResponse=dynamic(()=>import("@/components/portal/RecordPatientResponse").then(m=>m.RecordPatientResponse));

export type CaseViewProps={locale:Locale;t:typeof copy.en;proposalCopy:ProposalCopy;role:RoleKey;value:Workspace;documents:CaseDocument[];doctors:VerifiedDoctor[];categories:CareCategory[];/** `null`: the team list could not be loaded (not the same as a team with nobody in it). */staff:StaffMember[]|null;catalog:CatalogService[];fxRates:FxRate[];/** P0-5: active facilities with their approved packages, for the travel/treatment pickers and the consultant's package lines. */facilities?:DirectoryFacility[];canRebalance:boolean;loadAssignmentHistory?:(caseId:string)=>Promise<AssignmentHistoryEntry[]>;loadIntakeHistory?:(caseId:string)=>Promise<ConversationDetail>;load:<T>(path:string)=>Promise<T>;downloadDoc:(id:string)=>void;viewDoc:(id:string)=>void;mySubject?:string;sendProposal:(caseId:string,body:unknown)=>void;busy:boolean;back:()=>void;mutate:Mutate;careView?:CareView;onCareView?:(view:CareView)=>void;otherCases?:CaseView[];openCaseById?:(id:string)=>void;consultantsHref?:string|null;
 /** UX area 2: the viewer's open My work items in My work's own order (the backend's), for "Next in My work" and "Also open on this case". */
 workItems?:WorkItem[];
 /** The back control's name: the view this case was opened from ("Back to My work"). */
 backLabel?:string};

/**
 * What every part of the staff case page shares — the viewer, the case and the one way to change it — provided once by
 * `StaffCaseView` so the proposal, deposit, delivery and assessment pieces stop taking the same props one by one.
 */
type CaseWorkspace={locale:Locale;t:typeof copy.en;role:RoleKey;c:CaseView;busy:boolean;mutate:Mutate;fxRates:FxRate[];catalog:CatalogService[];/** P0-5: active facilities with Finance-approved packages, for the final assessment's package lines. */facilities:DirectoryFacility[];mySubject?:string};
const CaseWorkspaceContext=createContext<CaseWorkspace|null>(null);

export function CaseWorkspaceProvider({value,children}:{value:CaseWorkspace;children:ReactNode}){
 return <CaseWorkspaceContext value={value}>{children}</CaseWorkspaceContext>;
}

function useCaseWorkspace():CaseWorkspace{
 const workspace=use(CaseWorkspaceContext);
 if(!workspace)throw new Error("useCaseWorkspace must be used inside CaseWorkspaceProvider");
 return workspace;
}

/**
 * The case page's drawers and dialogs. They are all modal (`showModal`), so nothing behind an open one can open another,
 * and every "More actions" entry closes that drawer before opening its own; one value says which, if any, is open.
 */
/** A proposal or final quote's validity end, read when it is sent (never while rendering). */
const validUntilInDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString();

type CaseOverlay="journey"|"messages"|"reply"|"more"|"transfer"|"requestInfo"|"proposal"|"decline"|"recordResponse"|"recordDecision"|"cancel"|"urgency";

/**
 * A staff member's case page: the current action first, the case's work and evidence below, utilities in drawers.
 * Patients never load this module (`PatientCaseView` renders My Care instead).
 */
export function StaffCaseView({locale,t,role,value,documents,doctors,categories,staff,catalog,fxRates,facilities=[],canRebalance,loadAssignmentHistory,loadIntakeHistory,load,downloadDoc,viewDoc,mySubject,sendProposal,busy,back,mutate,consultantsHref,workItems=[],backLabel,openCaseById}:CaseViewProps){
 const work=useWorkCopy();const cover=work.caseCover;const cv=work.caseView;
 const c=value.caseSummary;
 const workspace=useMemo<CaseWorkspace>(()=>({locale,t,role,c,busy,mutate,fxRates,catalog,facilities,mySubject}),[locale,t,role,c,busy,mutate,fxRates,catalog,facilities,mySubject]);
 const approved=value.clinicalReviews.find(r=>r.status==="APPROVED");
 const isCoordinator=role==="coordinator";const owned=!!mySubject&&c.coordinatorSubject===mySubject;
 const doctorPhase=["CONSULTANT_ASSIGNMENT_PENDING","CONSULTANT_REVIEW"].includes(c.status);
 const doctorAssignment=value.assignments.find(a=>a.assigneeRole==="DOCTOR"&&!REFERRAL_ASSIGNMENTS.includes(a.assignmentType)&&(a.status==="PENDING"||a.status==="ACTIVE"));
 // Never fall back to an identity subject: the backend resolves the name, and an honest generic label
  // is better than a UUID when it cannot.
  const assignedDoctorName=doctorAssignment?(doctorAssignment.assigneeName??doctors.find(d=>d.subject===doctorAssignment.assigneeSubject)?.displayName??cv.assignedConsultant):"";
  const isDoctor=role==="doctor";
  const assignmentRole=role.toUpperCase();
  const myPending=["doctor","operations","finance"].includes(role)?value.assignments.find(a=>a.assigneeRole===assignmentRole&&a.status==="PENDING"&&(!mySubject||a.assigneeSubject===mySubject)):undefined;
  const showActions=(!isCoordinator||owned)&&!myPending;const dim=isCoordinator&&owned&&doctorPhase;
 const doctorReviewComplete=isDoctor&&["CLINICAL_RECOMMENDATION_READY","INFORMATION_REQUIRED","CLINICALLY_NOT_SUITABLE","READY_FOR_CONSULTANT","INTAKE_REVIEW"].includes(c.status);
  // The backend resolves what is true now and what this person can validly do now. The page renders it;
  // it never re-derives a workflow answer from the stage. A preview (unowned intake) carries the same contract.
  const actions:CaseActions=value.actions??{journeyStage:c.status,waitingOn:c.waitingOn,currentAction:{code:"NONE",kind:"NONE"},blockers:[],availableActions:[]};
  const current=actions.currentAction;
  const available=actions.availableActions;
 // Evidence panels are reused so the consultant reads them before deciding, while the coordinator keeps
 // them below the action panels. Rendered once (the guards below are mutually exclusive by role).
 const intakePanel=value.intakeSummary?.trim()?<Panel title={cv.intakeSummary}><p className="whitespace-pre-wrap break-words text-ink-700">{value.intakeSummary}</p></Panel>:null;
 const documentsPanel=documents.length>0?<Panel title={t.documents}><ul className="divide-y divide-line border-y border-line">{documents.map(doc=><li key={doc.documentId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong className="break-all">{doc.fileName}</strong><p className="text-sm text-ink-500">{formatBytes(doc.sizeBytes,locale)} · {new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium"}).format(new Date(doc.createdAt))}</p></div>{doc.status==="CLEAN"?<div className="flex gap-2"><button type="button" className="btn-secondary" onClick={()=>viewDoc(doc.documentId)}>{cv.view}<span className="sr-only"> {doc.fileName}</span></button><button type="button" className="btn-secondary" onClick={()=>downloadDoc(doc.documentId)}>{t.download}<span className="sr-only"> {doc.fileName}</span></button></div>:<span className="text-sm font-semibold text-ink-600">{(doc.status==="PENDING"||doc.status==="UPLOADED")?t.docScanning:t.docUnavailable}</span>}</li>)}</ul></Panel>:null;
  // Only a real consultant assignment earns a second identity row. Falling back to the coordinator
  // here printed the same person twice under two labels, one of them the internal word "assignee".
  const consultantOnCase=doctorAssignment&&doctorPhase?assignedDoctorName:null;
 // Operations and consultants keep their stage forms; the coordinator's work is driven by the current action.
 const workflowBlock=!isCoordinator&&showActions&&!(isDoctor&&doctorPhase)?<div id="case-actions"><CaseWorkflowActions locale={locale} role={role} caseSummary={c} availableActions={available} patientAction={value.patientAction} mutate={mutate} doctors={doctors} categories={categories} staff={staff??[]} documents={documents} facilities={facilities} travelPackage={!!c.travelPackageRequested} financeRequired={!!value.gates?.financeRequired} travelPlan={value.travelPlan??null}/></div>:null;
 // P0-5: the destination and the treatment episodes read back with their facility named, for every staff role on the case.
 const when=(v?:string|null)=>v?new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(v)):"—";
 const episodes=value.treatmentEpisodes??[];
 const logistics=value.travelPlan||episodes.length>0?<section className="card p-5" aria-labelledby="logistics-title"><h3 id="logistics-title" className="title text-base">{cv.logistics.title}</h3>
  {value.travelPlan&&<dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-2 lg:grid-cols-4">
   <div><dt className="text-ink-500">{cv.logistics.facility}</dt><dd className="font-semibold text-ink-900">{value.travelPlan.facilityName??cv.logistics.notChosen}</dd></div>
   <div><dt className="text-ink-500">{cv.logistics.travelStatus}</dt><dd className="font-semibold text-ink-900">{label(cv.logistics.travel,value.travelPlan.status)}</dd></div>
   <div><dt className="text-ink-500">{cv.logistics.plannedArrival}</dt><dd className="font-semibold text-ink-900">{when(value.travelPlan.plannedArrival)}</dd></div>
   <div><dt className="text-ink-500">{cv.logistics.confirmedArrival}</dt><dd className="font-semibold text-ink-900">{when(value.travelPlan.confirmedArrival)}</dd></div>
  </dl>}
  {episodes.length>0&&<ul className="mt-3 space-y-1.5 text-[0.875rem]" aria-label={cv.logistics.episodes}>{episodes.map(ep=><li key={ep.id} className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-1.5"><span className="font-semibold text-ink-900">{ep.facilityName??cv.logistics.unnamedFacility}</span><span className="text-ink-600">{label(cv.logistics.episode,ep.status)} · {when(ep.startAt)}{ep.endAt?` – ${when(ep.endAt)}`:""}</span></li>)}</ul>}
 </section>:null;
 const recommendationBlock=approved&&(approved.recommendedTreatment||approved.risksAndLimitations)?<div className="border-b border-line pb-4"><p className="mb-2 label-micro text-brand-700">{cv.recommendation}</p>{approved.recommendedTreatment&&<div className="mb-3"><p className="text-sm font-bold text-ink-800">{t.reviewTreatment}</p><p className="mt-0.5 whitespace-pre-wrap text-ink-700">{approved.recommendedTreatment}</p></div>}{approved.risksAndLimitations&&<div><p className="text-sm font-bold text-ink-800">{t.reviewRisks}</p><p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-600">{approved.risksAndLimitations}</p></div>}</div>:null;
 // The proposal is the coordinator's work while it is being prepared or released (or, at arrival, finalised);
 // once decided it becomes reference history.
 // An assignment step has its own inline form; every other focus step lives in the proposal panel.
 const formCode=current.workType==="TRAVEL"||current.code==="ASSIGN_OPERATIONS_PLAN"?"ASSIGN_OPERATIONS":current.workType==="PROPOSAL_TERMS_CALL"?"RECORD_PROPOSAL_DECISION":REFERRAL_CONFIRM_WORK.includes(current.workType??"")?"CONFIRM_REFERRAL":current.code;
 // QA #19/#20: Finance approves in the action card, beside the prices it approves — the one "Approve commercial terms".
 const financeApproval=role==="finance"&&current.code==="APPROVE_COMMERCIAL_TERMS"&&available.includes("APPROVE_COMMERCIAL_TERMS")&&!!value.proposal&&!!value.commercial;
 const formAction=isCoordinator&&owned&&current.kind==="FOCUS"&&["ASSIGN_CONSULTANT","CONFIRM_REFERRAL","ASSIGN_OPERATIONS","ASSIGN_FINANCE"].includes(formCode)||(formCode==="RECORD_PROPOSAL_DECISION"&&isCoordinator&&owned&&!!value.proposal&&available.includes("RECORD_PROPOSAL_DECISION"));
 const proposalIsWork=isCoordinator&&owned&&(["PREPARE_PROPOSAL","RELEASE_PROPOSAL","WAIT_INTERNAL_APPROVAL","ASSIGN_FINANCE"].includes(current.code)||["PREPARE_PROPOSAL","PROPOSAL_REVISION"].includes(current.workType??"")||(!!approved&&!value.proposal)||c.status==="ARRIVAL_CONFIRMED");
 const proposalPanel=<Panel title={t.proposal} wide>{recommendationBlock}{value.proposal?<ProposalCard proposal={value.proposal}/>:null}{isCoordinator&&owned&&approved&&(!value.proposal||["REVISION_REQUESTED","EXPIRED"].includes(value.proposal.status))&&<ProposalSendForm estimate={approved} onSend={sendProposal}/>}{isCoordinator&&value.delivery&&value.proposal&&<DeliveryCard delivery={value.delivery} versionId={value.proposal.versionId} canResend={available.includes("RESEND_PROPOSAL_LINK")}/>}{isCoordinator&&owned&&c.status==="ARRIVAL_CONFIRMED"&&<FinalQuoteActions reviewId={approved?.id} proposal={value.proposal} gates={value.gates}/>}{value.deposit&&<DepositCard deposit={value.deposit}/>}{showActions&&dim&&<p className="mt-4 text-[0.875rem] text-ink-600">{cv.handoffLocked}</p>}{showActions&&<LockedSection locked={dim}><RoleActions role={role} t={t} c={c} proposal={value.proposal} gates={value.gates} availableActions={available} mutate={mutate} approvalInCard={financeApproval}/></LockedSection>}</Panel>;
 const clinicalPanel=(value.clinicalReviews.length>0||["CONSULTANT_REVIEW","ARRIVAL_CONFIRMED"].includes(c.status))?<Panel title={t.reviews}>{value.clinicalReviews.length?value.clinicalReviews.map(r=><div key={r.id} className="border-b border-line pb-4 last:border-0 last:pb-0"><strong>v{r.versionNumber} · {statusLabel(r.status,locale)}</strong>{r.recommendedTreatment&&<p className="mt-1">{r.recommendedTreatment}</p>}{r.risksAndLimitations&&<p className="mt-1 text-sm text-ink-600">{r.risksAndLimitations}</p>}{r.costEstimates&&r.costEstimates.length>0&&<div className="mt-3 border-t border-line pt-3"><p className="mb-2 label-micro text-brand-700">{t.estimatedByConsultant}</p>{r.proposalCurrency&&<p className="mb-2 text-[0.8125rem] text-ink-600">{cv.proposalCurrency}: <strong>{CURRENCY_LABELS[r.proposalCurrency]?.[locale]??r.proposalCurrency}</strong></p>}<ul className="space-y-1 text-sm">{r.costEstimates.map((e,i)=><li key={i} className="flex items-baseline justify-between gap-3"><span>{e.serviceDescription}</span><span className="text-end"><strong className="block whitespace-nowrap">{e.quotedCost!=null&&e.quotedCurrency?money(e.quotedCost,e.quotedCurrency,locale):money(e.estimatedCost,e.currency,locale)}</strong>{e.quotedCost!=null&&e.quotedCurrency&&<span className="block whitespace-nowrap text-[0.8125rem] text-ink-500">{cv.base} <bdi dir="ltr">{money(e.estimatedCost,e.currency,locale)}</bdi></span>}</span></li>)}</ul></div>}</div>):<Empty/>}{isDoctor&&c.status==="ARRIVAL_CONFIRMED"&&<FinalAssessment/>}</Panel>:null;
 // The consultant's clinical review is the page's primary work, not an appendix to the review history.
 const reviewDraft=isDoctor&&c.status==="CONSULTANT_REVIEW"?(value.clinicalReviews.find(r=>r.status==="DRAFT")??null):null;
 // A second-opinion consultant reads the case and gives an opinion; the clinical decision stays with the primary consultant.
 const secondOpinionOnly=isDoctor&&current.workType==="SECOND_OPINION";
 const clinicalReviewPanel=isDoctor&&c.status==="CONSULTANT_REVIEW"&&!secondOpinionOnly
  ?<ClinicalReviewPanel locale={locale} caseId={c.id} busy={busy} catalog={catalog} fxRates={fxRates} facilities={facilities} documents={documents}
     draft={reviewDraft&&{id:reviewDraft.id,recommendedTreatment:reviewDraft.recommendedTreatment,risksAndLimitations:reviewDraft.risksAndLimitations,costEstimates:reviewDraft.costEstimates,proposalCurrency:reviewDraft.proposalCurrency}}
     viewDoc={viewDoc} downloadDoc={downloadDoc} mutate={mutate}/>
  :null;
  // Everything needed to act sits above the fold; the rest of the case is one tab away.
  const [tab,setTab]=useState<"overview"|"clinical"|"documents"|"activity">("overview");
  const [overlay,setOverlay]=useState<CaseOverlay|null>(null);
  // A close only clears the overlay that asked for it, as the separate open flags did: a late close event from a drawer
  // that was just replaced must not shut the one that replaced it.
  const closeOverlay=(which:CaseOverlay)=>setOverlay(open=>open===which?null:open);
  // What this viewer can still mark read: the same rule as the Mark read button in the thread.
  const unreadMessages=value.messages.filter(m=>m.direction==="INBOUND"&&!m.read).length;
  const latestPatientMessage=[...value.messages].reverse().find(m=>m.senderRole==="PATIENT");
  const newestDocument=documents.length?documents[documents.length-1]:undefined;
  // The clinical review form lives in the Clinical tab, so send a consultant there rather than to an
  // overview panel that does not exist for them.
  const focusAction=()=>{setTab(isDoctor&&!workflowBlock?"clinical":"overview");requestAnimationFrame(()=>{const target=(current.workType==="DEPOSIT_RECORD"?document.getElementById("deposit-payment"):null)??document.getElementById("case-actions")??document.getElementById("case-tab-panel");scrollIntoView(target,{behavior:"smooth",block:"center"});(target?.querySelector("button,select,input,textarea") as HTMLElement|null)?.focus();});};
  const completeWork=(evidence:string)=>{if(current.workItemId!=null)void mutate(`/tasks/${current.workItemId}/cases/${c.id}/complete`,{evidence,expectedVersion:current.workItemVersion??0});};
  const openMessages=()=>setOverlay("messages");
  // When the step is the patient's reply (the backend's action, never the stage) and this viewer is the one who answers the
  // patient, the reply is one quiet step from the strip: the drawer opens on the patient's thread with the composer focused.
  const replyFromStrip=isCoordinator&&current.workType==="REVIEW_PATIENT_RESPONSE"&&!!value.patientReply?.canReply
    ?[{label:work.caseMessages.replyToPatient,onClick:()=>setOverlay("reply"),opensDialog:true}]:[];
  const caseTabs=[{id:"overview" as const,label:cv.tabs.overview,count:0},{id:"clinical" as const,label:cv.tabs.clinical,count:0},{id:"documents" as const,label:cv.tabs.documents,count:documents.length},{id:"activity" as const,label:cv.tabs.activity,count:0}].filter(item=>!value.paymentOnly||item.id==="overview"); // the payment view has no record behind the other tabs
  // Utilities live in one place each: the secure-link row owns "resend", the header owns messages, and the
  // "More" drawer owns everything else the backend listed for this state.
  const moreAvailable=available.filter(code=>!code.startsWith("RESEND_")&&!(code==="RECORD_PROPOSAL_DECISION"&&formCode==="RECORD_PROPOSAL_DECISION"));
  const showMore=isCoordinator&&owned&&!value.preview&&(moreAvailable.length>0||canRebalance);

  // The Consultant handoff is said once: the cover names the Consultant and the strip says the case waits on them (UX 2-4: the
  // dim banner that repeated both is gone); why the proposal's actions are locked is said beside them, where the lock is.
  const banners=value.preview?<p className="text-sm text-ink-500">{cv.previewNote}</p>:null;

  // The cover's strip (UX area 2): who the case waits on, said once on the page, and — for the coordinator — what the
  // patient's own page says now (the backend's patient step; never inferred here). No field, no line.
  const waitingText=actions.waitingOn&&actions.waitingOn!=="NONE"?waitingLabel(actions.waitingOn,work.waiting,{role,ownsCase:owned,action:value.actions?current:null}):null;
  const patientStep=!value.preview?actions.patientStep??null:null;
  const facts=waitingText||patientStep?<CoverFacts waiting={waitingText} actions={actions} step={patientStep} proposal={value.patientProposal}/>:undefined;
  // My work's order is the backend's; the next item is the first one after this case's items that belongs to another case,
  // wrapping round to the top of the list.
  const at=workItems.findIndex(item=>item.caseId===c.id);
  const nextItem=(at<0?workItems:[...workItems.slice(at+1),...workItems.slice(0,at)]).find(item=>item.caseId!==c.id)??null;
  const openNext=nextItem&&openCaseById?()=>openCaseById(nextItem.caseId):null;
  // `n` (UX 2-2) is the same Next in My work, through the same leave guard.
  useStaffShortcut("KeyN",openNext);
  const alsoOpen=workItems.filter(item=>item.caseId===c.id&&item.id!==current.workItemId);
  const coverRef=useRef<HTMLElement>(null);
  const line=useCoverGone(coverRef);

  // Who else is on the case: the people the cover does not already name (UX 2-4). The coordinator and, during the Consultant's
  // review, the Consultant are on the cover — with a pending offer's deadline there too — so the rail adds Operations, Finance
  // and any other Consultant (a second opinion, a referral).
  const offerTime=(iso:string)=>new Intl.DateTimeFormat(intlLocale(locale),{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
  const consultantFact=consultantOnCase?(doctorAssignment?.status==="PENDING"&&doctorAssignment.offerExpiresAt?fillTemplate(cv.pendingUntil,{name:`\u2068${consultantOnCase}\u2069`,date:offerTime(doctorAssignment.offerExpiresAt)}):consultantOnCase):null;
  const team=value.assignments.filter(a=>a.assigneeRole!=="COORDINATOR"&&!(consultantOnCase&&a===doctorAssignment)).map(a=>({id:a.id,label:label(cv.team.roles,a.assigneeRole),name:a.assigneeName??cv.team.member,pending:a.status==="PENDING",until:a.status==="PENDING"?a.offerExpiresAt??null:null}));

  return <CaseWorkspaceProvider value={workspace}><div>
  <nav className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" aria-label={t.caseWorkspaceLabel}>
   <button type="button" className="btn-secondary" onClick={back}><ArrowLeft size={16} aria-hidden className="rtl:-scale-x-100"/>{backLabel??fillTemplate(cover.backTo,{view:work.nav.work})}</button>
   {nextItem&&openNext&&<NextInMyWork item={nextItem} onOpen={openNext}/>}
  </nav>

  {/* The cover of the file: the petrol tab edge, who this is, then the strip — your step, who it waits on, the patient's page. */}
  <section ref={coverRef} aria-labelledby="case-heading" className="card file-tab p-4 sm:p-6">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
     {/* Spaced by the gap; a screen reader hears a separator between the facts. */}
     <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-ink-500">
      <bdi dir="ltr" className="font-bold text-brand-700">{c.caseNumber}</bdi>
      {[c.careCategory?careAreaLabel(c.careCategory,work.careAreas):null,countryName(c.country,locale),c.preferredLanguage==="ar"?cover.languages.ar:cover.languages.en].filter(Boolean).map(fact=><span key={fact}><span className="sr-only">{cover.separator}</span>{fact}</span>)}
     </p>
     <h2 id="case-heading" tabIndex={-1} className="mt-1 scroll-mt-28 rounded-sm text-[1.125rem] font-bold leading-7 text-brand-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">{c.patientName?<bdi>{c.patientName}</bdi>:cover.untitled}</h2>
     <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem]">
      <Status value={c.status} locale={locale}/>
      {/* P0-3: the coordinator's urgency, for staff only; routine says nothing. */}
      {c.urgency&&c.urgency!=="ROUTINE"&&<span className={`inline-flex items-center gap-1 font-semibold ${c.urgency==="URGENT"?"text-alert-700":"text-ink-800"}`}><Gauge size={13} aria-hidden/><span className="font-normal text-ink-500">{work.urgency.label}:</span>{work.urgency.levels[c.urgency as Urgency]?.label??c.urgency}</span>}
      <HeaderFact label={t.coordinatorLabel} value={coordinatorLabel(c,mySubject,work.queue)}/>
      {consultantFact&&<HeaderFact label={cover.consultant} value={consultantFact}/>}
     </div>
    </div>
    <div className="flex flex-none flex-wrap items-center gap-2">
     {!value.preview&&<button type="button" className="btn-secondary" onClick={openMessages}>
      <MessageSquare size={16} aria-hidden/>{cover.messages}{unreadMessages>0&&<UnreadTally count={unreadMessages}/>}
     </button>}
     {showMore&&<button type="button" className="btn-secondary" aria-haspopup="dialog" onClick={()=>setOverlay("more")}><MoreHorizontal size={16} aria-hidden/>{cover.more}</button>}
     {isCoordinator&&!owned&&canRebalance&&!value.preview&&<button type="button" className="btn-secondary" aria-haspopup="dialog" onClick={()=>setOverlay("transfer")}>{cover.transfer}</button>}
    </div>
   </div>

   <div className="mt-5 border-t border-line pt-5">
  <CurrentActionPanel locale={locale} role={role} action={current} facts={facts}
   response={current.workType==="REVIEW_PATIENT_RESPONSE"?{message:latestPatientMessage?.body,documentName:newestDocument?.fileName}:null}
   busy={busy} secondary={replyFromStrip} onComplete={completeWork} onFocusAction={focusAction} onClaim={()=>void mutate(`/coordinator/cases/${c.id}/claim`)}
   respondBy={myPending?.offerExpiresAt??null}
   onAcceptAssignment={()=>{if(!myPending)return;void mutate(`/${role}/cases/${c.id}/assignments/${myPending.id}`,{accept:true}).then(result=>{if(result&&isDoctor)setTab("clinical");});}}
   onDeclineAssignment={()=>setOverlay("decline")}
   form={financeApproval&&value.proposal&&value.commercial?<FinanceApproval locale={locale} commercial={value.commercial} busy={busy} approveLabel={t.financeApprove}
     onApprove={()=>void mutate(`/finance/cases/${c.id}/proposals/${value.proposal!.versionId}/approve`)}/>
    :formAction?<CoordinatorActionForm locale={locale} code={formCode} caseId={c.id} version={c.version} careCategory={c.careCategory} categories={categories} staff={staff} busy={busy} mutate={mutate} load={load} consultantsHref={consultantsHref} proposal={value.proposal} representatives={value.representatives}/>:undefined}/>
   </div>
   {alsoOpen.length>0&&<AlsoOpen items={alsoOpen}/>}
  </section>
  {/* Once the cover has scrolled away, the case and its step stay in one slim line under the site header. */}
  {line.gone&&<CaseLine top={line.top} action={current} title={actionTitle(current,role,work)} next={nextItem&&openNext?{item:nextItem,onOpen:openNext}:null}/>}

  {isCoordinator&&<CaseBlockers locale={locale} blockers={actions.blockers} deposit={value.deposit}/>}

  <div aria-busy={busy||undefined} className="min-w-0">
   <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
    <div className="min-w-0">
     {<div role="tablist" aria-label={t.caseWorkspaceLabel} className="mb-4 flex flex-wrap gap-1 border-b border-line-strong">
      {caseTabs.map(item=><button key={item.id} type="button" role="tab" id={`case-tab-${item.id}`} aria-controls="case-tab-panel" aria-selected={tab===item.id}
        className={`-mb-px min-h-11 border-b-2 px-3 py-2 text-[0.875rem] font-bold transition-colors ${tab===item.id?"border-brand-600 text-brand-800":"border-transparent text-ink-500 hover:text-ink-800"}`}
        onKeyDown={event=>{const target=tabKeyTarget(event.key,caseTabs.findIndex(x=>x.id===tab),caseTabs.length,locale==="ar");if(target<0)return;event.preventDefault();const next=caseTabs[target];setTab(next.id);requestAnimationFrame(()=>document.getElementById(`case-tab-${next.id}`)?.focus());}}
        tabIndex={tab===item.id?0:-1}
        onClick={()=>setTab(item.id)}>{item.label}{item.count?<span className="ms-1.5 text-[0.8125rem] font-semibold text-ink-400">{item.count}</span>:null}</button>)}
     </div>}

     <div id="case-tab-panel" role="tabpanel" aria-labelledby={`case-tab-${tab}`} tabIndex={0} className="space-y-4">
      {/* Kept mounted while hidden so typed drafts (proposal notes, operations plan) survive a tab switch. */}
      <div hidden={tab!=="overview"} className="space-y-4">
       {/* Before accepting, a consultant needs the case in front of them — summary and documents, not
           a decision taken blind. Acceptance itself stays in the single Current action panel above. */}
       {myPending&&isDoctor&&<section className="card p-4" aria-labelledby="assignment-preview">
        <h3 id="assignment-preview" className="label-micro text-ink-500">{cv.assignment.title}</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-2 lg:grid-cols-4">
         <div><dt className="label-micro text-ink-500">{t.patientLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{c.patientName||"—"}</dd></div>
         {c.careCategory&&<div><dt className="label-micro text-ink-500">{t.careArea}</dt><dd className="mt-0.5 font-semibold text-ink-800">{careAreaLabel(c.careCategory,work.careAreas)}</dd></div>}
         <div><dt className="label-micro text-ink-500">{t.coordinatorLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{c.coordinatorName??"—"}</dd></div>
         <div><dt className="label-micro text-ink-500">{t.countryLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{countryName(c.country,locale)}</dd></div>
        </dl>
        {value.intakeSummary?.trim()&&<p className="mt-4 whitespace-pre-wrap break-words border-t border-line pt-3 text-[0.9375rem] leading-6 text-ink-700">{value.intakeSummary}</p>}
        <div className="mt-4">
         <p className="label-micro text-ink-500">{t.documents} {documents.length>0&&<span className="text-ink-400">({documents.length})</span>}</p>
         {documents.length===0?<p className="mt-1.5 text-[0.875rem] text-ink-500">{cv.assignment.noDocuments}</p>
          :<ul className="mt-1.5">{documents.map(doc=><li key={doc.documentId} className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-0"><span className="min-w-0 flex-1 truncate font-semibold text-ink-800">{doc.fileName}</span>{doc.status==="CLEAN"?<span className="flex gap-2"><button type="button" className="link-cta text-[0.875rem]" onClick={()=>viewDoc(doc.documentId)}>{cv.view}<span className="sr-only"> {doc.fileName}</span></button><button type="button" className="link-cta text-[0.875rem]" onClick={()=>downloadDoc(doc.documentId)}>{t.download}<span className="sr-only"> {doc.fileName}</span></button></span>:<span className="text-[0.8125rem] text-ink-500">{doc.status==="PENDING"?t.docScanning:t.docUnavailable}</span>}</li>)}</ul>}
        </div>
       </section>}
       {banners}
       {logistics}
       {workflowBlock}
       {/* The proposal is the work while it is being prepared or released; afterwards it is reference. */}
       {isCoordinator&&(proposalIsWork?<div id={current.kind==="FOCUS"&&!formAction?"case-actions":undefined}>{proposalPanel}</div>
         :(value.proposal||value.deposit)?<ProposalSummary proposal={value.proposal} deposit={value.deposit} delivery={value.delivery} available={available} onView={()=>setOverlay("proposal")}/>:null)}
       {!isCoordinator&&!isDoctor&&(value.proposal||value.deposit)&&proposalPanel}
       {/* The case brief: the facts a coordinator decides ownership on, and the operational context once they own it. */}
       {isCoordinator&&<CoordinatorBrief documents={documents} preview={!!value.preview} intakeSummary={value.intakeSummary} onClinical={()=>setTab("clinical")} onDocuments={()=>setTab("documents")}/>}
      </div>

      {/* Kept mounted for the same reason: the clinical review and final assessment drafts. */}
      <div hidden={tab!=="clinical"} className="space-y-4">
       {doctorReviewComplete&&<div className="flex items-start gap-2 border-y border-line py-3"><Check size={18} aria-hidden className="mt-0.5 flex-none text-brand-600"/><p className="font-semibold text-brand-800">{c.status==="CLINICAL_RECOMMENDATION_READY"?t.doctorAccepted:c.status==="INFORMATION_REQUIRED"?t.doctorInfoSent:c.status==="CLINICALLY_NOT_SUITABLE"?t.doctorNotSuitable:t.doctorReturned}</p></div>}
       {clinicalReviewPanel}
       {isDoctor&&<ConsultantReferrals key={c.id} locale={locale} caseId={c.id} careCategory={c.careCategory} categories={categories} canRefer={c.status==="CONSULTANT_REVIEW"&&!myPending&&!secondOpinionOnly} busy={busy} load={load} mutate={mutate}/>}
       {intakePanel}
       {/* While the consultant is composing, the review history would only repeat their own draft back at them. */}
       {!clinicalReviewPanel&&clinicalPanel}
       {!intakePanel&&!clinicalPanel&&!clinicalReviewPanel&&!doctorReviewComplete&&<p className="text-sm text-ink-500">{cv.noClinical}</p>}
      </div>

      {tab==="documents"&&(documentsPanel??<p className="text-sm text-ink-500">{cv.noDocuments}</p>)}

      {tab==="activity"&&<><CaseActivity tasks={value.tasks} timeline={value.timeline} onViewJourney={()=>setOverlay("journey")}/>{isCoordinator&&loadAssignmentHistory&&<div className="mt-5"><AssignmentHistory key={c.id} locale={locale} caseId={c.id} load={loadAssignmentHistory}/></div>}</>}
     </div>
    </div>

    {/* Sticks below the site header (--case-header-bottom), and below the case line once that shows (--case-line-bottom). */}
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--case-line-bottom,var(--case-header-bottom,4rem))+1rem)]">
     <JourneyPulse stage={c.status} onViewJourney={()=>setOverlay("journey")}/>
     {!value.preview&&team.length>0&&<section aria-labelledby="case-team-title" className="card p-4">
      <h2 id="case-team-title" className="label-micro text-ink-500">{cv.team.title}</h2>
      <dl className="mt-2 space-y-1.5 text-[0.875rem]">{team.map(member=><div key={member.id} className="flex items-baseline justify-between gap-3"><dt className="text-ink-500">{member.label}</dt><dd className="text-end font-semibold text-ink-800"><bdi>{member.name}</bdi>{member.pending&&<span className="ms-1 text-[0.8125rem] font-semibold text-status-warning-fg">· {cv.team.pending}</span>}{member.until&&<span className="block text-[0.8125rem] font-normal text-ink-500"><time dateTime={member.until}>{fillTemplate(cv.team.offerUntil,{date:offerTime(member.until)})}</time></span>}</dd></div>)}</dl>
     </section>}
    </aside>
   </div>
   {/* Explains why the workspace is read-only. The Take ownership button lives once, in the current-
       action panel above; repeating it here put the same claim on screen twice under one label. */}
   {isCoordinator&&!owned&&<p className="mt-5 border-y border-line py-3 text-[0.9375rem] text-ink-600">{c.coordinatorSubject?t.ownedByOther:t.ownershipHint}</p>}
  </div>

  {overlay==="journey"&&<FullJourneyDialog locale={locale} timeline={value.timeline} caseNumber={c.caseNumber} onClose={()=>closeOverlay("journey")}/>}
  {(overlay==="messages"||overlay==="reply")&&<CaseDrawer locale={locale} title={work.caseMessages.title} onClose={()=>closeOverlay(overlay)}><MessageThreads key={c.id} locale={locale} role={role} caseId={c.id} messages={value.messages} canSend={showActions} patientReply={value.patientReply} busy={busy} mutate={mutate} replyTo={overlay==="reply"?"PATIENT_COORDINATOR":undefined}/>{isCoordinator&&loadIntakeHistory&&<IntakeHistory locale={locale} caseId={c.id} load={loadIntakeHistory}/>}</CaseDrawer>}
  {overlay==="more"&&<CaseDrawer locale={locale} title={cv.moreTitle} onClose={()=>closeOverlay("more")}>
   <MoreActions locale={locale} caseId={c.id} available={moreAvailable} travelPackage={!!c.travelPackageRequested} version={c.version} busy={busy} mutate={mutate}
    onRequestInformation={()=>setOverlay("requestInfo")} onRecordResponse={()=>setOverlay("recordResponse")}
    onRecordDecision={value.proposal?()=>setOverlay("recordDecision"):undefined}
    onAdministration={canRebalance?()=>setOverlay("transfer"):undefined} onCancelCase={()=>setOverlay("cancel")} onSetUrgency={()=>setOverlay("urgency")}/>
  </CaseDrawer>}
  {overlay==="urgency"&&<UrgencyDialog caseId={c.id} urgency={(c.urgency??"ROUTINE") as Urgency} busy={busy} mutate={mutate} onClose={()=>closeOverlay("urgency")}/>}
  {overlay==="cancel"&&<CancelCaseDialog caseId={c.id} version={c.version} status={c.status} busy={busy} mutate={mutate} onClose={()=>closeOverlay("cancel")}/>}
  {/* Recording a WhatsApp/phone answer opens its own dialog; the trigger is hidden and driven from More actions so the page carries one control per business action. */}
  {isCoordinator&&owned&&available.includes("RECORD_PATIENT_RESPONSE")&&<RecordPatientResponse locale={locale} caseId={c.id} action={value.patientAction} mutate={mutate} open={overlay==="recordResponse"} onOpenChange={open=>{if(open)setOverlay("recordResponse");else closeOverlay("recordResponse");}} hideTrigger/>}
  {overlay==="recordDecision"&&value.proposal&&<CaseDrawer locale={locale} title={work.recordDecision.title} onClose={()=>closeOverlay("recordDecision")}>
   <RecordProposalDecision key={value.proposal.versionId} locale={locale} caseId={c.id} proposal={value.proposal} representatives={value.representatives} busy={busy} mutate={async(path,body,method)=>{const result=await mutate(path,body,method);if(result)closeOverlay("recordDecision");return result;}}/>
  </CaseDrawer>}
  {overlay==="proposal"&&<CaseDrawer locale={locale} title={t.proposal} onClose={()=>closeOverlay("proposal")}>
   <div className="space-y-4">{recommendationBlock}{value.proposal&&<ProposalCard proposal={value.proposal}/>}{value.delivery&&value.proposal&&<DeliveryCard delivery={value.delivery} versionId={value.proposal.versionId} canResend={false}/>}{value.deposit&&<DepositCard deposit={value.deposit}/>}</div>
  </CaseDrawer>}
  {overlay==="transfer"&&<CaseDrawer locale={locale} title={cv.transferTitle} onClose={()=>closeOverlay("transfer")}><TransferOwnership locale={locale} caseId={c.id} caseNumber={c.caseNumber} currentOwner={c.coordinatorSubject} currentOwnerName={c.coordinatorName} mySubject={mySubject} staff={staff??[]} busy={busy} mutate={mutate} onClose={()=>closeOverlay("transfer")}/></CaseDrawer>}
  {overlay==="requestInfo"&&<RequestInformationDialog locale={locale} caseIds={[c.id]} busy={busy} mutate={mutate} onClose={()=>closeOverlay("requestInfo")}/>}
  {overlay==="decline"&&myPending&&<DeclineAssignmentDialog locale={locale} caseNumber={c.caseNumber} busy={busy} onClose={()=>closeOverlay("decline")}
   onConfirm={reason=>void mutate(`/${role}/cases/${c.id}/assignments/${myPending.id}`,{accept:false,reason})}/>}
 </div></CaseWorkspaceProvider>;
}

/** A due date in words: "Due 14 Oct", or "Overdue since 14 Oct" in the alert ink (the word carries it, not the colour). */
function DueLine({dueAt,overdue}:{dueAt:string;overdue?:boolean}){
 const work=useWorkCopy();const cover=work.caseCover;
 const date=new Intl.DateTimeFormat(intlLocale(work.locale),{day:"numeric",month:"short"}).format(new Date(dueAt));
 return <span className={`text-[0.8125rem] ${overdue?"font-bold text-alert-700":"text-ink-500"}`}>{fillTemplate(overdue?cover.overdueSince:cover.dueOn,{date})}</span>;
}

/** Reasons that only restate who the case waits on (or the patient's page beside it); every other reason adds why. */
const RESTATING_REASONS=new Set(["DEFAULT_PATIENT","DEFAULT_CONSULTANT","DEFAULT_STAFF","PATIENT_JOURNEY_ACTION"]);

/**
 * The strip's other two lines, beside the step: who the case waits on (with why, when the backend's reason adds anything),
 * and the patient's own page now — the patient's step in My Care's words, worded from the same proposal answer My Care
 * reads (`patientProposal`), with its usual window while the team has it or its due date while the patient does.
 * Rendered from the backend's fields only.
 */
function CoverFacts({waiting,actions,step,proposal}:{waiting:string|null;actions:CaseActions;step:CurrentActionView|null;proposal?:PatientProposalState|null}){
 const work=useWorkCopy();const {locale,c}=useCaseWorkspace();
 const words=step?patientStepText(step.code,work.myCare.steps,{proposalState:proposal?.state??null,status:c.status,exit:step.exit??null,documentType:proposal?.documentType}):null;
 const waits=step?.kind==="WAIT"||step?.kind==="NONE";
 const reason=actions.waitingReasonCode&&RESTATING_REASONS.has(actions.waitingReasonCode)?null:waitingReasonText(actions,work,locale);
 return <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-1 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
  {waiting&&<div>
   <dt className="label-micro text-ink-500">{work.waiting.label}</dt>
   <dd className="mt-0.5 text-[0.9375rem] leading-6 text-ink-800">{waiting}</dd>
   {reason&&<dd dir="auto" className="text-[0.8125rem] leading-5 text-ink-500">{reason}</dd>}
  </div>}
  {step&&words&&<div>
   <dt className="label-micro text-ink-500">{work.caseCover.patientPage}</dt>
   <dd dir="auto" className="mt-0.5 text-[0.9375rem] leading-6 text-ink-800">{words.title}</dd>
   {waits&&step.expectedWorkingDays?<dd className="text-[0.8125rem] text-ink-500">{fillTemplate(work.currentAction.usuallyWithin,{duration:plural(locale,step.expectedWorkingDays,work.plural.workingDays)})}</dd>
    :!waits&&step.dueAt?<dd><DueLine dueAt={step.dueAt} overdue={step.overdue}/></dd>:null}
  </div>}
 </dl>;
}

/** The case's other open My work items (the step above is one of them): a quiet hairline list, words and dates only. */
function AlsoOpen({items}:{items:WorkItem[]}){
 const work=useWorkCopy();const {locale}=useCaseWorkspace();
 return <section aria-labelledby="also-open-title" className="mt-5 border-t border-line pt-4">
  <h3 id="also-open-title" className="label-micro text-ink-500">{work.caseCover.alsoOpen}</h3>
  <ul className="mt-1 divide-y divide-line">{items.map(item=><li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
   <span dir="auto" className="min-w-0 text-[0.9375rem] font-semibold text-ink-800">{workItemText(item,locale,work).title}</span>
   {item.dueAt&&<DueLine dueAt={item.dueAt} overdue={item.overdue}/>}
  </li>)}</ul>
 </section>;
}

/** A quiet link to the next item in My work's order: never a second filled action. The case it opens is named for everyone. */
function NextInMyWork({item,onOpen}:{item:WorkItem;onOpen:()=>void}){
 const work=useWorkCopy();const sep=work.caseCover.separator;
 // `n` opens it from anywhere on the case while one-key shortcuts are on (UX 2-2); the button says so to assistive technology.
 const shortcuts=useShortcutsEnabled();
 return <button type="button" className="link-cta text-[0.875rem]" aria-keyshortcuts={shortcuts?"n":undefined} onClick={onOpen}>
  {work.caseCover.nextInMyWork}
  <span className="inline-flex min-w-0 items-baseline max-sm:sr-only"><span className="sr-only">{sep}</span><span aria-hidden className="text-ink-300">·&nbsp;</span><bdi dir="ltr" className="font-semibold">{item.caseNumber}</bdi>
   {item.patientName&&<><span className="sr-only">{sep}</span><span aria-hidden className="text-ink-300">&nbsp;·&nbsp;</span><bdi className="max-w-[16ch] truncate font-semibold">{item.patientName}</bdi></>}</span>
  <ArrowRight size={16} aria-hidden className="flex-none rtl:rotate-180"/>
 </button>;
}

/**
 * The slim line that keeps the case and its step on screen once the cover has scrolled away: case number, name, the step,
 * a quiet control that takes the focus to the step itself (only when the step is the viewer's to take), and — from 640px,
 * since phones have it at the top of the page — the next item in My work. While it shows, the page's scroll padding
 * follows its measured height, so a focused control is never hidden under it (WCAG 2.4.11); if it goes while holding the
 * focus, the focus moves to the case's heading rather than to nowhere.
 */
function CaseLine({top,action,title,next}:{top:number;action:CurrentActionView;title:string;next:{item:WorkItem;onOpen:()=>void}|null}){
 const work=useWorkCopy();const {c}=useCaseWorkspace();
 const cover=work.caseCover;
 const bar=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const element=bar.current;if(!element)return;
  const root=document.documentElement;const before=root.style.scrollPaddingTop;
  const publish=()=>{const bottom=top+element.offsetHeight;root.style.scrollPaddingTop=`${bottom+16}px`;root.style.setProperty("--case-line-bottom",`${bottom}px`);};
  publish();
  const resize=typeof ResizeObserver==="undefined"?null:new ResizeObserver(publish);resize?.observe(element);
  return()=>{
   resize?.disconnect();root.style.scrollPaddingTop=before;root.style.removeProperty("--case-line-bottom");
   if(element.contains(document.activeElement))document.getElementById("case-heading")?.focus({preventScroll:true});
  };
 },[top]);
 return <div ref={bar} role="region" aria-label={fillTemplate(cover.lineLabel,{caseNumber:c.caseNumber})} style={{top}} className="fixed start-0 end-0 z-40 border-b border-line bg-white">
  <div className="container-site flex items-center gap-x-5">
   <p className="min-w-0 flex-1 py-1.5 text-[0.875rem] leading-5">
    <span className="block truncate"><bdi dir="ltr" className="font-bold text-brand-700">{c.caseNumber}</bdi><span className="sr-only">{cover.separator}</span><span aria-hidden className="text-ink-300"> · </span><bdi className="font-semibold text-ink-900">{c.patientName||cover.untitled}</bdi></span>
    <span dir="auto" className="block truncate text-ink-600">{fillTemplate(cover.stepLine,{label:stepLabel(action,work),title})}</span>
   </p>
   {isOwnStep(action)&&<button type="button" className="link-cta flex-none text-[0.875rem]" onClick={focusCurrentAction}>{cover.goToStep}</button>}
   {next&&<span className="flex-none max-sm:hidden"><NextInMyWork item={next.item} onOpen={next.onOpen}/></span>}
  </div>
 </div>;
}

/**
 * Whether the whole cover has scrolled up under the site header, and where that header ends (the line's top, published
 * as --case-header-bottom for the sticky rail). Measured again whenever the header's size changes.
 */
function useCoverGone(cover:RefObject<HTMLElement|null>){
 const [state,setState]=useState({gone:false,top:0});
 useEffect(()=>{
  const element=cover.current;if(!element||typeof IntersectionObserver==="undefined")return;
  const header=document.querySelector<HTMLElement>(".site-header");const root=document.documentElement;
  let observer:IntersectionObserver|null=null;let measured=-1;
  const watch=()=>{
   const top=Math.max(0,Math.round(header?.getBoundingClientRect().bottom??0));
   if(top===measured)return;measured=top;
   root.style.setProperty("--case-header-bottom",`${top}px`);
   observer?.disconnect();
   observer=new IntersectionObserver(([entry])=>{const gone=!entry.isIntersecting&&entry.boundingClientRect.top<top;setState(prev=>prev.gone===gone&&prev.top===top?prev:{gone,top});},{rootMargin:`${-top}px 0px 0px 0px`});
   observer.observe(element);
  };
  watch();
  const resize=header&&typeof ResizeObserver!=="undefined"?new ResizeObserver(watch):null;
  if(header)resize?.observe(header);
  return()=>{observer?.disconnect();resize?.disconnect();root.style.removeProperty("--case-header-bottom");};
 },[cover]);
 return state;
}

/**
 * The proposal once it is history rather than work: version, decision, total, service count and validity
 * in one line, with the full breakdown, delivery and deposit one click away. The secure link the patient
 * currently holds is shown compactly with its one utility — resend — only while resending is valid.
 */
function ProposalSummary({proposal,deposit,delivery,available,onView}:{proposal?:Proposal;deposit?:DepositView|null;delivery?:DeliveryStatus|null;available:string[];onView:()=>void}){const work=useWorkCopy();const cv=work.caseView;const s=cv.summary;const {locale,c:{id:caseId},busy,mutate}=useCaseWorkspace();
 // A resend revokes the link the patient holds, so it is confirmed first.
 const [resendPath,setResendPath]=useState<string|null>(null);
 const total=proposal?proposal.items.filter(i=>!i.optional).reduce((sum,i)=>sum+i.quantity*i.unitPrice,0):null;
 const services=proposal?.items.length??0;
 const depositLabel=deposit?label(cv.depositStatus,deposit.status):null;
 const fmt=(n:number,currency:string)=>money(n,currency,locale);
 const resendProposal=available.includes("RESEND_PROPOSAL_LINK")&&proposal;
 const resendProfile=available.includes("RESEND_ONBOARDING_LINK");
 const deliveryLabel=delivery?label(cv.deliveryStatus,delivery.status):null;
 const channel=delivery?.channel==="WHATSAPP"?cv.channels.WHATSAPP:cv.channels.EMAIL;
 return <section className="card p-4 sm:p-5" aria-labelledby="proposal-summary-title">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0">
    <h3 id="proposal-summary-title" className="label-micro text-ink-500">{s.title}</h3>
    {proposal?<>
     <p className="mt-1 text-[1rem] font-bold text-brand-900">{proposal.documentType==="FINAL_TREATMENT_QUOTE"?s.final:s.preliminary} · {fillTemplate(work.proposalVersion,{number:new Intl.NumberFormat(intlLocale(locale)).format(proposal.versionNumber)})} · {statusLabel(proposal.status,locale)}</p>
     <p className="mt-0.5 text-[0.875rem] text-ink-600">{total!=null&&<strong className="text-ink-900"><bdi dir="ltr">{fmt(total,proposal.currency)}</bdi></strong>}{services>0&&<> · {plural(work.locale,services,work.plural.services)}</>}{proposal.validUntil&&<> · {fillTemplate(cv.validUntil,{date:new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium"}).format(new Date(proposal.validUntil))})}</>}</p>
    </>:<p className="mt-1 text-[0.875rem] text-ink-600">{s.none}</p>}
   </div>
   <button type="button" className="btn-secondary" aria-haspopup="dialog" onClick={onView}>{s.view}</button>
  </div>
  <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-line pt-3 text-[0.875rem] sm:grid-cols-2">
   {deposit&&<div className="flex flex-wrap items-baseline justify-between gap-x-3"><dt className="text-ink-500">{s.deposit}</dt><dd className="font-semibold text-ink-800">{depositLabel}{deposit.totalDisplay!=null&&<> · <bdi dir="ltr">{fmt(deposit.totalDisplay,deposit.currency||"EGP")}</bdi></>}{deposit.paidDisplay?<span className="text-ink-500"> · {s.paid} <bdi dir="ltr">{fmt(deposit.paidDisplay,deposit.currency||"EGP")}</bdi></span>:null}</dd></div>}
   {(delivery||resendProfile)&&<div className="flex flex-wrap items-baseline justify-between gap-x-3"><dt className="text-ink-500">{s.secureLink}</dt><dd className="flex flex-wrap items-center gap-x-2 font-semibold text-ink-800">
    {delivery&&!resendProfile&&<span>{deliveryLabel} · {channel} · <bdi dir="ltr">{delivery.destinationMasked}</bdi></span>}
    {resendProfile&&<span>{s.profileLink}{delivery?<> · {channel} · <bdi dir="ltr">{delivery.destinationMasked}</bdi></>:null}</span>}
    {resendProposal&&<button type="button" className="link-cta text-[0.875rem]" disabled={busy} aria-haspopup="dialog" onClick={()=>setResendPath(`/coordinator/cases/${caseId}/proposals/${proposal.versionId}/resend`)}>{s.resend}</button>}
    {resendProfile&&<button type="button" className="link-cta text-[0.875rem]" disabled={busy} aria-haspopup="dialog" onClick={()=>setResendPath(`/coordinator/cases/${caseId}/onboarding-link/resend`)}>{s.resend}</button>}
   </dd></div>}
  </dl>
  {resendPath&&<ConfirmDialog title={work.confirm.resendTitle} body={delivery?fillTemplate(work.confirm.resendBodyTo,{destination:`\u2068${delivery.destinationMasked}\u2069`}):work.confirm.resendBody} confirm={work.confirm.resend} cancel={work.confirm.cancel}
   onCancel={()=>setResendPath(null)} onConfirm={()=>{const path=resendPath;setResendPath(null);void mutate(path);}}/>}
 </section>;
}

/**
 * What the coordinator needs to know about the case on the Overview, sized to the moment: before ownership
 * it is the routing brief that supports the take-ownership decision (facts, document count, intake summary —
 * never the files or messages themselves); after ownership it is the compact operational summary the current
 * action sits above. It renders only real data: a fact with nothing behind it is left out, not filled in.
 */
function CoordinatorBrief({documents,preview,intakeSummary,onClinical,onDocuments}:{documents:CaseDocument[];preview:boolean;intakeSummary?:string;onClinical:()=>void;onDocuments:()=>void}){
 const {locale,t,c}=useCaseWorkspace();const b=useWorkCopy().caseView.brief;
 const when=(iso:string)=>new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
 const facts:{label:string;value:string}[]=[
  {label:b.received,value:when(c.createdAt)},
  // Care area, country, language, coordinator, Consultant, stage and "waiting on" are on the case cover above, said once.
  // An unclassified care area is the one gap the cover cannot show (it leaves the area out), so the brief names it.
  ...(c.careCategory?[]:[{label:t.careArea,value:b.notClassified}]),
  {label:t.documents,value:documents.length===0?b.none:new Intl.NumberFormat(intlLocale(locale)).format(documents.length)},
  ...(c.travelPackageRequested?[{label:b.travelPackage,value:b.requested}]:[]),
  {label:t.updatedLabel,value:when(c.updatedAt)},
 ];
 const summary=intakeSummary?.trim();
 return <section className="card p-4" aria-labelledby="case-brief-title">
  <h3 id="case-brief-title" className="label-micro text-ink-500">{preview?b.intake:b.case}</h3>
  <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-2 lg:grid-cols-3">
   {facts.map(fact=><div key={fact.label} className="min-w-0"><dt className="label-micro text-ink-500">{fact.label}</dt><dd className="mt-0.5 truncate font-semibold text-ink-800">{fact.value}</dd></div>)}
  </dl>
  <div className="mt-4 border-t border-line pt-3">
   <p className="label-micro text-ink-500">{b.intakeSummary}</p>
   {summary?<p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-[0.875rem] leading-6 text-ink-700">{summary}</p>:<p className="mt-1 text-[0.875rem] text-ink-500">{b.noDescription}</p>}
   <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
    {summary&&<button type="button" className="link-cta text-[0.875rem]" onClick={onClinical}>{b.fullClinical}</button>}
    {documents.length>0&&<button type="button" className="link-cta text-[0.875rem]" onClick={onDocuments}>{fillTemplate(b.documents,{count:new Intl.NumberFormat(intlLocale(locale)).format(documents.length)})}</button>}
   </div>
  </div>
 </section>;
}

/** History, not current work: every task and the recorded stage changes, out of the operational view. */
function CaseActivity({tasks,timeline,onViewJourney}:{tasks:Task[];timeline:{status:string;occurredAt:string}[];onViewJourney:()=>void}){
 const {locale}=useCaseWorkspace();const work=useWorkCopy();const a=work.caseView.activity;
 const open=tasks.filter(task=>["OPEN","IN_PROGRESS"].includes(task.status));
 const done=tasks.filter(task=>!["OPEN","IN_PROGRESS"].includes(task.status));
 const row=(task:Task)=><li key={task.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2.5 last:border-0">
  <span className="font-semibold text-ink-800">{task.title}</span>
  {task.overdue&&["OPEN","IN_PROGRESS"].includes(task.status)?<StatusBadge tone="danger">{statusLabel(task.status,locale)} · {work.myWork.overdue}</StatusBadge>:<span className="text-[0.8125rem] text-ink-500">{statusLabel(task.status,locale)}</span>}
 </li>;
 return <div className="space-y-5">
  <section className="card p-4">
   <h3 className="label-micro text-ink-500">{a.workItems}</h3>
   {tasks.length===0?<p className="mt-2 text-sm text-ink-500">{a.none}</p>
    :<ul className="mt-2">{open.map(row)}{done.map(row)}</ul>}
  </section>
  <section className="card p-4">
   <h3 className="label-micro text-ink-500">{a.history}</h3>
   <p className="mt-2 text-sm text-ink-600">{plural(locale,timeline.length,work.plural.stageChanges)}</p>
   <button type="button" className="link-cta mt-3 text-[0.875rem]" aria-haspopup="dialog" onClick={onViewJourney}>{a.viewJourney}</button>
  </section>
 </div>;
}

function ProposalSendForm({estimate,onSend}:{estimate:Review;onSend:(caseId:string,body:unknown)=>void}){
 const {locale,t,c:{id:caseId,preferredLanguage:language},busy}=useCaseWorkspace();const cv=useWorkCopy().caseView;
 const reviewId=estimate.id;
 const estimates=estimate?.costEstimates??[];const[notes,setNotes]=useState("");
 // The consultant fixes the proposal currency when submitting the recommendation. The lines below are the
 // approved catalogue base in EGP; the server converts them and snapshots the rate at proposal creation,
 // so no currency is sent from here and the clinical choice cannot be reset by this form.
 const baseCurrency=estimates[0]?.currency??"EGP";
 const proposalCurrency=estimate?.proposalCurrency??baseCurrency;
 // The lines are shown as the patient will be quoted: in the proposal currency, converted by the backend at
 // today's effective rate (the rate proposal creation uses). The EGP base stays visible as the secondary
 // figure. If the backend could not quote (no rate), say so — never present EGP figures under a USD label.
 const foreign=proposalCurrency!==baseCurrency;
 const quoted=foreign&&estimates.length>0&&estimates.every(item=>item.quotedCost!=null&&item.quotedCurrency===proposalCurrency);
 const rateUnavailable=foreign&&estimates.length>0&&!quoted;
 const labels=cv.send;
 const items=estimates.map((item,index)=>({category:"MEDICAL",description:item.serviceDescription,quantity:1,unitPrice:item.estimatedCost,optional:false,sortOrder:index,quotedPrice:item.quotedCost??null}));
 const total=items.reduce((a,i)=>a+i.unitPrice,0);
 const quotedTotal=quoted?items.reduce((a,i)=>a+(i.quotedPrice??0),0):null;
 const rateNote=quoted&&estimate?.quoteRate?fillTemplate(estimate.quoteRateDate?labels.rateTodayDated:labels.rateToday,{rate:new Intl.NumberFormat(intlLocale(locale),{maximumFractionDigits:6}).format(estimate.quoteRate),currency:proposalCurrency,date:estimate.quoteRateDate?new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium"}).format(new Date(estimate.quoteRateDate)):""}):null;
 const send=()=>{if(!items.length)return;onSend(caseId,{clinicalReviewId:reviewId,language,includedServices:items.map(i=>i.description).join("; "),paymentTerms:PROPOSAL_PAYMENT_TERMS_RECORD,coordinatorNotes:notes.trim()||undefined,validUntil:validUntilInDays(14),items});};
 return <div className="mt-4 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-baseline gap-2 text-sm font-bold text-ink-700">{labels.currency}<span className="text-[0.9375rem] text-ink-900">{CURRENCY_LABELS[proposalCurrency]?.[locale]??proposalCurrency}</span></span><span className="text-[0.8125rem] text-ink-500">{labels.rateNote}</span></div>
  {/* Inside the proposal panel: a hairline list, not a second boxed surface (no nested cards). */}<div><div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-bold text-brand-900">{t.servicesFromConsultant}</h4><span className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-700"><Check size={14} strokeWidth={2.5} aria-hidden/>{labels.source}</span></div><p className="mt-1 text-sm text-ink-600">{labels.locked}</p>{items.length?<ul className="mt-3 divide-y divide-line border-y border-line">{items.map(item=><li key={item.sortOrder} className="flex items-baseline justify-between gap-4 py-3"><span className="font-semibold">{item.description}</span><span className="text-end"><strong className="block whitespace-nowrap"><bdi dir="ltr">{quoted&&item.quotedPrice!=null?money(item.quotedPrice,proposalCurrency,locale):money(item.unitPrice,baseCurrency,locale)}</bdi></strong>{quoted&&<span className="block whitespace-nowrap text-[0.8125rem] text-ink-500">{cv.base} <bdi dir="ltr">{money(item.unitPrice,baseCurrency,locale)}</bdi></span>}</span></li>)}<li className="flex items-baseline justify-between gap-4 border-t-2 border-line-strong py-3"><span className="font-bold">{labels.total}</span><span className="text-end"><strong className="block whitespace-nowrap"><bdi dir="ltr">{quotedTotal!=null?money(quotedTotal,proposalCurrency,locale):money(total,baseCurrency,locale)}</bdi></strong>{quotedTotal!=null&&<span className="block whitespace-nowrap text-[0.8125rem] text-ink-500">{cv.base} <bdi dir="ltr">{money(total,baseCurrency,locale)}</bdi></span>}</span></li></ul>:<p className="mt-3 flex items-start gap-2 border-y border-alert-200 py-3 text-sm font-semibold text-alert-800"><CircleAlert size={16} aria-hidden className="mt-0.5 flex-none"/>{labels.missing}</p>}{rateNote&&<p className="mt-2 text-[0.8125rem] text-ink-500">{rateNote}</p>}{rateUnavailable&&<p role="alert" className="mt-3 flex items-start gap-2 border-y border-alert-200 py-3 text-sm font-semibold text-alert-800"><CircleAlert size={16} aria-hidden className="mt-0.5 flex-none"/>{fillTemplate(labels.noRate,{currency:proposalCurrency})}</p>}</div>
  <div><label className="block"><span className="title text-base">{labels.coordination}</span><span className="mt-1 block text-sm text-ink-500">{labels.coordinationHint}</span><textarea className="field mt-2 min-h-24" maxLength={20000} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
  <button type="button" disabled={busy||!items.length||rateUnavailable} className="btn-primary w-full justify-center py-3 text-base sm:w-auto" onClick={send}>{t.createProposal}</button>
 </div>;
}

export function FinalAssessment(){
 const {locale,c:{id:caseId},busy,mutate,catalog,fxRates,facilities}=useCaseWorkspace();const g=useWorkCopy().caseView.finalAssessment;
 const[treatment,setTreatment]=useState("");const[risks,setRisks]=useState("");const[currency,setCurrency]=useState("EGP");const[costs,setCosts]=useState([{description:"",amount:""}]);const[selected,setSelected]=useState<Set<string>>(new Set());const[packagePicks,setPackagePicks]=useState<Map<string,number>>(new Map());
 const currencyOptions=["EGP",...fxRates.filter(f=>f.currency!=="EGP").map(f=>f.currency)];const rate=currency==="EGP"?1:(fxRates.find(f=>f.currency===currency)?.rate??1);
 // P0-5: Finance-approved facility packages are approved lines here too; the expected figure must sit inside the range.
 const pk=g.packages;
 const packages=facilityPackages(facilities);const {lines:packageLines,inRange:packagesInRange}=facilityPackageLines(packages,packagePicks);
 const togglePackage=(id:string,min:number)=>setPackagePicks(m=>{const n=new Map(m);if(n.has(id))n.delete(id);else n.set(id,min);return n;});const setPackageAmount=(id:string,amount:number)=>setPackagePicks(m=>new Map(m).set(id,amount));
 const toggle=(id:string)=>setSelected(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n;});
 const updateCost=(i:number,f:"description"|"amount",val:string)=>setCosts(rows=>rows.map((row,idx)=>idx===i?{...row,[f]:val}:row));
 // Catalogue picks travel at their approved EGP price; the selector above only changes what is displayed.
 const save=()=>{const picks=catalog.filter(s=>selected.has(s.id)).map(s=>({serviceDescription:s.serviceName,estimatedCost:s.priceEgp,currency:"EGP",catalogServiceId:s.id}));const manual=costs.filter(row=>row.description.trim()&&row.amount!=="").map(row=>({serviceDescription:row.description.trim(),estimatedCost:Math.round((Number(row.amount)||0)*100)/100,currency}));const packageEstimates=packageLines.map(packageEstimate);if(!picks.length&&!manual.length&&!packageEstimates.length)return;if(!packagesInRange)return;void mutate(`/doctor/cases/${caseId}/final-assessment`,{recommendedTreatment:treatment,risksAndLimitations:risks,costEstimates:[...picks,...packageEstimates,...manual]}).then(r=>{if(r){setTreatment("");setRisks("");setCosts([{description:"",amount:""}]);setSelected(new Set());setPackagePicks(new Map());}});};
 return <div className="mt-4 space-y-4 border-t border-line pt-4">
  <div><h4 className="title text-base">{g.title}</h4><p className="mt-1 text-sm text-ink-500">{g.intro}</p></div>
  <label className="block text-sm font-bold">{g.treatment}<textarea className="field mt-1" value={treatment} onChange={e=>setTreatment(e.target.value)}/></label>
  <label className="block text-sm font-bold">{g.risks}<textarea className="field mt-1" value={risks} onChange={e=>setRisks(e.target.value)}/></label>
  <div className="border-y border-line py-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-brand-800">{g.services}</span><select aria-label={g.currency} className="field !mt-0 w-auto py-1" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(code=><option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale]??code}</option>)}</select></div>
   {catalog.length>0&&<div className="mt-2 space-y-1.5">{catalog.map(s=>{const on=selected.has(s.id);return <button type="button" key={s.id} onClick={()=>toggle(s.id)} aria-pressed={on} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-start transition ${on?"border-brand-600 bg-white":"border-ink-350 bg-white"}`}><span className="flex items-center gap-2.5"><span className={`flex h-5 w-5 flex-none items-center justify-center rounded border ${on?"border-brand-600 bg-brand-600 text-white":"border-ink-350"}`} aria-hidden>{on?<Check size={14} strokeWidth={2.5}/>:null}</span><span className="text-sm font-semibold text-ink-800">{s.serviceName}</span></span><span className="text-sm font-bold"><bdi dir="ltr">{money(s.priceEgp*rate,currency,locale)}</bdi></span></button>;})}</div>}
   <FacilityPackagePicker locale={locale} packages={packages} picks={packagePicks} onToggle={togglePackage} onAmount={setPackageAmount} labels={pk}/>
   <p className="mt-3 text-sm font-bold text-ink-700">{g.manual}</p>
   <div className="mt-1 space-y-2">{costs.map((row,i)=><div key={i} className="flex gap-2"><input aria-label={g.service} className="field flex-1" value={row.description} onChange={e=>updateCost(i,"description",e.target.value)} placeholder={g.service}/><input aria-label={g.amount} className="field w-32" type="number" min="0" step="0.01" value={row.amount} onChange={e=>updateCost(i,"amount",e.target.value)} placeholder={fillTemplate(g.amountIn,{currency})}/>{costs.length>1&&<button type="button" className="btn-secondary" onClick={()=>setCosts(rows=>rows.filter((_,idx)=>idx!==i))} aria-label={g.remove}><X size={16} aria-hidden/></button>}</div>)}</div>
   <button type="button" className="btn-secondary mt-2" onClick={()=>setCosts(rows=>[...rows,{description:"",amount:""}])}><Plus size={16} aria-hidden/>{g.add}</button>
  </div>
  <button className="btn-primary w-full sm:w-auto" disabled={busy||!packagesInRange} onClick={save}>{g.save}</button>
 </div>;
}

function FinalQuoteActions({reviewId,proposal,gates}:{reviewId?:string;proposal?:Proposal;gates?:ProposalGates|null}){
 const {locale,c:{id:caseId},busy,mutate,fxRates}=useCaseWorkspace();
 const[currency,setCurrency]=useState("EGP");const[scope,setScope]=useState("");
 const g=useWorkCopy().caseView.finalQuote;
 const currencyOptions=["EGP",...fxRates.filter(f=>f.currency!=="EGP").map(f=>f.currency)];
 const isFinalDraft=proposal?.documentType==="FINAL_TREATMENT_QUOTE"&&["CLINICALLY_APPROVED","FINANCE_APPROVED"].includes(proposal.status);
 if(isFinalDraft&&proposal)return <div className="mt-4 border-t border-line pt-4"><h4 className="font-bold text-brand-800">{g.title}</h4>{gates?.financeRequired&&!gates.financeCompleted?<p className="mt-2 text-sm text-alert-700">{g.financeWait}</p>:null}<button className="btn-primary mt-3" disabled={busy||!gates?.readyForRelease} onClick={()=>void mutate(`/coordinator/cases/${caseId}/final-quotes/${proposal.versionId}/release`)}>{g.release}</button><p className="mt-2 text-[0.8125rem] text-ink-500">{g.releaseHint}</p></div>;
 if(proposal?.documentType==="FINAL_TREATMENT_QUOTE")return null;
 return <div className="mt-4 border-t border-line pt-4"><h4 className="font-bold text-brand-800">{g.title}</h4><p className="mt-1 text-sm text-ink-500">{g.createIntro}</p>{!reviewId?<p className="mt-2 text-sm text-ink-500">{g.needReview}</p>:<><label className="mt-3 block text-sm font-bold">{g.currency}<select className="field mt-1 w-auto" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(code=><option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale]??code}</option>)}</select></label><label className="mt-3 block text-sm font-bold">{g.scope}<textarea className="field mt-1" rows={2} value={scope} onChange={e=>setScope(e.target.value)}/></label><button className="btn-primary mt-3" disabled={busy} onClick={()=>{const validUntil=validUntilInDays(14);void mutate(`/coordinator/cases/${caseId}/final-quotes`,{clinicalReviewId:reviewId,currency,scopeChangeReason:scope||undefined,validUntil});}}>{g.create}</button></>}</div>;
}

/**
 * The patient's bank transfer (DEP-3): the reference they entered and where it stands. Finance confirms the amount received
 * against it, or returns it to the patient with a reason; there is nothing to confirm until the patient has sent one.
 */
function TransferPanel({locale,deposit,caseId,isFinance,busy,mutate,tx,amountLabel}:{locale:Locale;deposit:DepositView;caseId:string;isFinance:boolean;busy:boolean;mutate:Mutate;tx:ReturnType<typeof useWorkCopy>["depositTransfer"];amountLabel:string}){
 const transfer=deposit.transfer;const pending=transfer?.status==="SUBMITTED";
 return <section aria-label={tx.title} className="mt-4 border-t border-line pt-3">
  <h5 className="text-[0.875rem] font-bold text-ink-800">{tx.title}</h5>
  {pending&&transfer?<p className="mt-1 text-sm text-ink-700">{transfer.method&&<span className="me-2 font-semibold text-ink-800">{tx.method[transfer.method as keyof typeof tx.method]??transfer.method} ·</span>}{transfer.agentName&&<>{tx.agent}: <bdi dir="auto" className="font-semibold text-ink-900">{transfer.agentName}</bdi> · </>}{tx.reference}: <bdi dir="ltr" translate="no" className="select-all break-all font-semibold text-ink-900">{transfer.reference}</bdi> <span className="text-ink-500">· {tx.sent} <bdi dir="ltr">{new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium",timeStyle:"short"}).format(new Date(transfer.submittedAt))}</bdi></span></p>
   :<p className="mt-1 text-sm text-ink-600">{tx.waiting}</p>}
  {!pending&&transfer?.status==="REJECTED"&&<p className="mt-1 text-sm text-alert-700">{tx.rejectedLast.replace("{reason}",transfer.reason??"")}</p>}
  {isFinance&&pending&&transfer&&<>
   <form id="deposit-payment" className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);void mutate(`/finance/cases/${caseId}/deposits/${deposit.id}/payments`,{amountEgp:Number(d.get("amount"))||0,idempotencyKey:crypto.randomUUID()}).then(result=>{if(result)f.reset();});}}>
    <label className="text-[0.8125rem] font-bold">{amountLabel}<input className="field w-32" name="amount" type="number" min="0.01" step="0.01" max={deposit.balanceEgp??undefined} defaultValue={deposit.balanceEgp??undefined} required dir="ltr" inputMode="decimal" autoComplete="off"/></label>
    <button className="btn-primary" disabled={busy}>{tx.confirm}</button>
   </form>
   <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);void mutate(`/finance/cases/${caseId}/deposits/${deposit.id}/transfers/${transfer.id}/reject`,{reason:String(d.get("reason")||"").trim()}).then(result=>{if(result)f.reset();});}}>
    <label className="flex-1 text-[0.8125rem] font-bold">{tx.rejectReason}<input className="field" name="reason" required maxLength={500}/></label>
    <button className="btn-secondary" disabled={busy}>{tx.reject}</button>
   </form>
  </>}
 </section>;
}

function DepositCard({deposit}:{deposit:DepositView}){
 const {locale,role,c:{id:caseId},busy,mutate}=useCaseWorkspace();
 const workCopy=useWorkCopy();const confirmCopy=workCopy.confirm;const tx=workCopy.depositTransfer;const g=workCopy.caseView.deposit;
 // A refund is money leaving: the amount is read back before it is recorded.
 const [refund,setRefund]=useState<{form:HTMLFormElement;amountEgp:number;reason:string}|null>(null);
 const isFinance=role==="finance";
 const amount=(n?:number)=>n==null?"—":money(n,deposit.currency||"EGP",locale);
 // QA W-26: Finance records in EGP, so each figure in the patient's currency carries its EGP amount.
 const foreign=(deposit.currency||"EGP")!=="EGP";
 const inEgp=(n?:number)=>foreign&&n!=null?<span className="block text-[0.8125rem] font-normal text-ink-500"><bdi dir="ltr">{money(n,"EGP",locale)}</bdi></span>:null;
 const open=deposit.status==="REQUESTED"||deposit.status==="PARTIALLY_PAID";
 const tone=deposit.status==="PAID"?"success":(deposit.status==="REFUNDED"||deposit.status==="CANCELLED"||deposit.status==="WAIVED")?"neutral":"warning";
 return <div className="mt-4 border-t border-line pt-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-ink-800">{g.title}</h4><StatusBadge tone={tone}>{label(workCopy.caseView.depositStatus,deposit.status)}</StatusBadge></div>
  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3"><div><span className="text-ink-500">{g.total}</span><br/><strong><bdi dir="ltr">{amount(deposit.totalDisplay)}</bdi>{inEgp(deposit.totalEgp)}</strong></div><div><span className="text-ink-500">{g.paid}</span><br/><strong><bdi dir="ltr">{amount(deposit.paidDisplay)}</bdi>{inEgp(deposit.paidEgp)}</strong></div><div><span className="text-ink-500">{g.balance}</span><br/><strong><bdi dir="ltr">{amount(deposit.balanceDisplay)}</bdi>{inEgp(deposit.balanceEgp)}</strong></div></div>
  {deposit.components.length>0&&<ul className="mt-3 space-y-1 text-sm">{deposit.components.map((cp,i)=><li key={i} className="flex justify-between gap-3"><span>{cp.purpose} <span className="text-[0.8125rem] text-ink-400">({cp.beneficiary}{cp.creditedToFinal?` · ${g.credited}`:""})</span></span><strong className="whitespace-nowrap"><bdi dir="ltr">{amount(cp.amountDisplay)}</bdi></strong></li>)}</ul>}
  {open&&<TransferPanel locale={locale} deposit={deposit} caseId={caseId} isFinance={isFinance} busy={busy} mutate={mutate} tx={tx} amountLabel={g.amount}/>}
  {isFinance&&<>
   <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);setRefund({form:f,amountEgp:Number(d.get("amount"))||0,reason:String(d.get("reason")||"").trim()});}}>
    <label className="text-[0.8125rem] font-bold">{g.amount}<input className="field w-28" name="amount" type="number" min="0.01" step="0.01" required/></label>
    <label className="flex-1 text-[0.8125rem] font-bold">{g.reason}<input className="field" name="reason" required/></label>
    <button className="btn-secondary" disabled={busy}>{g.refund}</button>
   </form>
   <p className="mt-2 text-[0.8125rem] text-ink-500">{g.note}</p>
  </>}
  {refund&&<ConfirmDialog title={fillTemplate(confirmCopy.refundTitle,{amount:money(refund.amountEgp,"EGP",locale)})} body={confirmCopy.refundBody} confirm={confirmCopy.refund} cancel={confirmCopy.cancel}
   onCancel={()=>setRefund(null)} onConfirm={()=>{const r=refund;setRefund(null);void mutate(`/finance/cases/${caseId}/deposits/${deposit.id}/refunds`,{amountEgp:r.amountEgp,reason:r.reason,idempotencyKey:crypto.randomUUID()}).then(result=>{if(result)r.form.reset();});}}/>}
 </div>;
}

function DeliveryCard({delivery,versionId,canResend=true}:{delivery:DeliveryStatus;versionId:string;canResend?:boolean}){
 const {locale,c:{id:caseId},busy,mutate}=useCaseWorkspace();
 const workCopy=useWorkCopy();const confirmCopy=workCopy.confirm;const cv=workCopy.caseView;const g=cv.delivery;const [resending,setResending]=useState(false);
 const tone=delivery.status==="DELIVERED"?"success":delivery.status==="FAILED"?"danger":"neutral";
 return <div className="mt-4 border-t border-line pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-ink-800">{g.title}</p><StatusBadge tone={tone}>{label(cv.deliveryStatus,delivery.status)}</StatusBadge></div>
  <p className="mt-2 text-sm text-ink-600">{g.channel}: <strong>{delivery.channel==="WHATSAPP"?cv.channels.WHATSAPP:cv.channels.EMAIL}</strong> · {g.to} <bdi dir="ltr">{delivery.destinationMasked}</bdi>{delivery.attempts>0?` · ${g.attempts}: ${new Intl.NumberFormat(intlLocale(locale)).format(delivery.attempts)}`:""}</p>
  {canResend&&<button type="button" className="btn-secondary mt-3" disabled={busy} aria-haspopup="dialog" onClick={()=>setResending(true)}>{g.resend}</button>}
  {canResend&&<p className="mt-2 text-[0.8125rem] text-ink-500">{g.resendHint}</p>}
  {resending&&<ConfirmDialog title={confirmCopy.resendTitle} body={fillTemplate(confirmCopy.resendBodyTo,{destination:`\u2068${delivery.destinationMasked}\u2069`})} confirm={confirmCopy.resend} cancel={confirmCopy.cancel}
   onCancel={()=>setResending(false)} onConfirm={()=>{setResending(false);void mutate(`/coordinator/cases/${caseId}/proposals/${versionId}/resend`);}}/>}</div>;
}

/** Also rendered on its own (`AuthoritativeActions.test.tsx`), so it keeps explicit props rather than reading the case workspace. */
export function RoleActions({role,t,c,proposal,gates,availableActions,mutate,approvalInCard=false}:{role:RoleKey;t:typeof copy.en;c:CaseView;proposal?:Proposal;gates?:ProposalGates|null;availableActions:string[];mutate:Mutate;/** The action card already carries Finance's approval (QA #20): no second button. */approvalInCard?:boolean}){
 const[operationsPlan,setOperationsPlan]=useState(proposal?.operationalPlan??"");
 const gl=useWorkCopy().caseView.release;
 const badge=(required:boolean,done:boolean)=><StatusBadge tone={!required?"neutral":done?"success":"warning"}>{!required?gl.notRequired:done?gl.done:gl.waiting}</StatusBadge>;
 const checklist=gates&&["coordinator","operations","finance"].includes(role)?<div className="mt-4 border-t border-line pt-3"><p className="mb-2 text-sm font-bold text-ink-800">{gl.checklist}</p><div className="space-y-1.5 text-sm"><div className="flex items-center justify-between gap-2"><span>{gl.operations}</span>{badge(gates.operationsRequired,gates.operationsCompleted)}</div><div className="flex items-center justify-between gap-2"><span>{gl.finance}</span>{badge(gates.financeRequired,gates.financeCompleted)}</div></div>{gates.financeRequired&&gates.financeReasons.length>0&&<p className="mt-2 text-[0.8125rem] text-ink-500">{gates.financeReasons.join(" ")}</p>}</div>:null;
 if(role==="operations")return <>{checklist}{(availableActions.includes("PREPARE_TRAVEL_PACKAGE")||availableActions.includes("UPDATE_TRAVEL_PLAN"))&&proposal?.status==="CLINICALLY_APPROVED"?<div className="mt-4 space-y-3"><textarea className="field min-h-28" aria-label={t.operationsComplete} maxLength={30000} required value={operationsPlan} onChange={event=>setOperationsPlan(event.target.value)}/><button className="btn-primary" disabled={!operationsPlan.trim()} onClick={()=>void mutate(`/operations/cases/${c.id}/proposals/${proposal.versionId}/complete`,{plan:operationsPlan.trim()})}>{t.operationsComplete}</button></div>:null}</>;
 if(role==="finance")return <>{checklist}{availableActions.includes("APPROVE_COMMERCIAL_TERMS")&&proposal&&!approvalInCard?<button className="btn-primary mt-4" onClick={()=>void mutate(`/finance/cases/${c.id}/proposals/${proposal.versionId}/approve`)}>{t.financeApprove}</button>:null}</>;
 if(role==="coordinator")return <>{checklist}{gates?.readyForRelease&&proposal?<div className="mt-4"><button className="btn-primary" onClick={()=>void mutate(`/coordinator/cases/${c.id}/proposals/${proposal.versionId}/release`)}>{t.release}</button><p className="mt-2 text-[0.8125rem] text-ink-500">{gl.hint}</p></div>:(gates&&!gates.readyForRelease?<p className="mt-3 text-[0.8125rem] text-ink-500">{gl.hint}</p>:null)}</>;
 return null;
}

function ProposalCard({proposal}:{proposal:Proposal}){const work=useWorkCopy();const cv=work.caseView;const {locale,t}=useCaseWorkspace();const total=proposal.items.filter(i=>!i.optional).reduce((sum,i)=>sum+i.quantity*i.unitPrice,0);return <div className="border-y border-line py-4"><div className="flex justify-between gap-3"><strong>{fillTemplate(work.proposalVersion,{number:new Intl.NumberFormat(intlLocale(locale)).format(proposal.versionNumber)})} · {statusLabel(proposal.status,locale)}</strong><strong><bdi dir="ltr">{money(total,proposal.currency,locale)}</bdi></strong></div><ul className="mt-3 space-y-1">{proposal.items.map(item=><li key={item.id} className="flex justify-between gap-3"><span>{item.description}{item.quantity>1?` × ${new Intl.NumberFormat(intlLocale(locale)).format(item.quantity)}`:""}{item.optional?` ${cv.optional}`:""}</span><strong className="whitespace-nowrap"><bdi dir="ltr">{money(item.quantity*item.unitPrice,proposal.currency,locale)}</bdi></strong></li>)}</ul>{proposal.coordinatorNotes&&<div className="mt-3 border-t border-line pt-3 text-sm"><p className="font-bold text-brand-700">{t.proposalNotesLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{proposal.coordinatorNotes}</p></div>}{proposal.validUntil&&<p className="mt-3 text-sm">{fillTemplate(cv.validUntil,{date:new Intl.DateTimeFormat(intlLocale(locale)).format(new Date(proposal.validUntil))})}</p>}</div>}

/** A business label from the messages files (`portalWork.caseView`), with the code itself as the fallback for a new one. */
const label=(table:Record<string,string>,key:string)=>Object.hasOwn(table,key)?table[key]:key;
