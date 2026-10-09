"use client";

import { ConsultantReferrals } from "@/components/portal/ConsultantRouting";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, MessageSquare, MoreHorizontal } from "lucide-react";
import { CaseWorkflowActions } from "@/components/portal/CaseWorkflowActions";
import { CaseBlockers } from "@/components/portal/CaseBlockers";
import { CoordinatorActionForm, MoreActions } from "@/components/portal/CoordinatorActions";
import { RecordProposalDecision } from "@/components/portal/RecordProposalDecision";
import { CaseMessages } from "@/components/portal/CaseMessages";
import type { ProposalCopy } from "@/components/portal/PatientProposal";
import { JourneyPulse, FullJourneyDialog } from "@/components/portal/JourneySnapshot";
import { CurrentActionPanel, type CaseActions } from "@/components/portal/CurrentAction";
import type { CareView } from "@/components/portal/MyCare";
import { RequestInformationDialog } from "@/components/portal/RequestInformationDialog";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { careAreaLabel, coordinatorLabel, fillTemplate, plural, tabKeyTarget, waitingLabel, waitingReasonText } from "@/lib/portal-labels";
import { AssignmentHistory, type AssignmentHistoryEntry } from "@/components/portal/AssignmentHistory";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { PortalView as RoleKey } from "@/lib/access";
import { SITE_URL } from "@/lib/api";
import { scrollIntoView } from "@/lib/scroll";
import { PROPOSAL_PAYMENT_TERMS_RECORD } from "@/lib/commercial-terms";
import { type CaseView, type CatalogService, type FxRate, REFERRAL_ASSIGNMENTS, REFERRAL_CONFIRM_WORK, type CaseDocument, type VerifiedDoctor, type CareCategory, type StaffMember, type Review, type Proposal, type Task, type ProposalGates, type DeliveryStatus, type DepositView, type Workspace, type Mutate, CURRENCY_LABELS, money, formatBytes, statusLabel } from "@/components/portal/portal-model";
import { copy, HeaderFact, CaseDrawer, ConfirmDialog, Panel, Empty, Status } from "@/components/portal/portal-ui";

const ClinicalReviewPanel=dynamic(()=>import("@/components/portal/ClinicalReview").then(m=>m.ClinicalReviewPanel));
const DeclineAssignmentDialog=dynamic(()=>import("@/components/portal/DeclineAssignmentDialog").then(m=>m.DeclineAssignmentDialog));
const TransferOwnership=dynamic(()=>import("@/components/portal/TransferOwnership").then(m=>m.TransferOwnership));
const RecordPatientResponse=dynamic(()=>import("@/components/portal/RecordPatientResponse").then(m=>m.RecordPatientResponse));

export type CaseViewProps={locale:Locale;t:typeof copy.en;proposalCopy:ProposalCopy;role:RoleKey;value:Workspace;documents:CaseDocument[];doctors:VerifiedDoctor[];categories:CareCategory[];staff:StaffMember[];catalog:CatalogService[];fxRates:FxRate[];canRebalance:boolean;loadAssignmentHistory?:(caseId:string)=>Promise<AssignmentHistoryEntry[]>;load:<T>(path:string)=>Promise<T>;downloadDoc:(id:string)=>void;viewDoc:(id:string)=>void;mySubject?:string;share:{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string}|null;sendProposal:(caseId:string,body:unknown)=>void;busy:boolean;back:()=>void;mutate:Mutate;careView?:CareView;onCareView?:(view:CareView)=>void;otherCases?:CaseView[];openCaseById?:(id:string)=>void;consultantsHref?:string|null};

/**
 * What every part of the staff case page shares — the viewer, the case and the one way to change it — provided once by
 * `StaffCaseView` so the proposal, deposit, delivery and assessment pieces stop taking the same props one by one.
 */
type CaseWorkspace={locale:Locale;t:typeof copy.en;role:RoleKey;c:CaseView;busy:boolean;mutate:Mutate;fxRates:FxRate[];catalog:CatalogService[];mySubject?:string};
const CaseWorkspaceContext=createContext<CaseWorkspace|null>(null);

function CaseWorkspaceProvider({value,children}:{value:CaseWorkspace;children:ReactNode}){
 return <CaseWorkspaceContext.Provider value={value}>{children}</CaseWorkspaceContext.Provider>;
}

function useCaseWorkspace():CaseWorkspace{
 const workspace=useContext(CaseWorkspaceContext);
 if(!workspace)throw new Error("useCaseWorkspace must be used inside CaseWorkspaceProvider");
 return workspace;
}

/**
 * The case page's drawers and dialogs. They are all modal (`showModal`), so nothing behind an open one can open another,
 * and every "More actions" entry closes that drawer before opening its own; one value says which, if any, is open.
 */
/** A proposal or final quote's validity end, read when it is sent (never while rendering). */
const validUntilInDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString();

type CaseOverlay="journey"|"messages"|"more"|"transfer"|"requestInfo"|"proposal"|"decline"|"recordResponse"|"recordDecision";

/**
 * A staff member's case page: the current action first, the case's work and evidence below, utilities in drawers.
 * Patients never load this module (`PatientCaseView` renders My Care instead).
 */
export function StaffCaseView({locale,t,role,value,documents,doctors,categories,staff,catalog,fxRates,canRebalance,loadAssignmentHistory,load,downloadDoc,viewDoc,mySubject,share,sendProposal,busy,back,mutate,consultantsHref}:CaseViewProps){
 const work=useWorkCopy();
 const c=value.caseSummary;
 const workspace=useMemo<CaseWorkspace>(()=>({locale,t,role,c,busy,mutate,fxRates,catalog,mySubject}),[locale,t,role,c,busy,mutate,fxRates,catalog,mySubject]);
 const approved=value.clinicalReviews.find(r=>r.status==="APPROVED");
 const isCoordinator=role==="coordinator";const owned=!!mySubject&&c.coordinatorSubject===mySubject;
 const doctorPhase=["CONSULTANT_ASSIGNMENT_PENDING","CONSULTANT_REVIEW"].includes(c.status);
 const doctorAssignment=value.assignments.find(a=>a.assigneeRole==="DOCTOR"&&!REFERRAL_ASSIGNMENTS.includes(a.assignmentType)&&(a.status==="PENDING"||a.status==="ACTIVE"));
 // Never fall back to an identity subject: the backend resolves the name, and an honest generic label
  // is better than a UUID when it cannot.
  const assignedDoctorName=doctorAssignment?(doctorAssignment.assigneeName??doctors.find(d=>d.subject===doctorAssignment.assigneeSubject)?.displayName??(locale==="ar"?"الاستشاري المعيَّن":"the assigned consultant")):"";
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
 const intakePanel=value.intakeSummary?.trim()?<Panel title={locale==="ar"?"ملخص الحالة عند الاستقبال":"Intake summary"}><p className="whitespace-pre-wrap break-words text-ink-700">{value.intakeSummary}</p></Panel>:null;
 const documentsPanel=documents.length>0?<Panel title={t.documents}>{documents.map(doc=><div key={doc.documentId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"><div><strong className="break-all">{doc.fileName}</strong><p className="text-sm text-ink-500">{formatBytes(doc.sizeBytes,locale)} · {new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium"}).format(new Date(doc.createdAt))}</p></div>{doc.status==="CLEAN"?<div className="flex gap-2"><button className="btn-secondary" onClick={()=>viewDoc(doc.documentId)}>{locale==="ar"?"عرض":"View"}</button><button className="btn-secondary" onClick={()=>downloadDoc(doc.documentId)}>{t.download}</button></div>:<span className="rounded-full bg-mist px-3 py-1 text-sm font-bold text-ink-600">{(doc.status==="PENDING"||doc.status==="UPLOADED")?t.docScanning:t.docUnavailable}</span>}</div>)}</Panel>:null;
  // Only a real consultant assignment earns a second identity row. Falling back to the coordinator
  // here printed the same person twice under two labels, one of them the internal word "assignee".
  const consultantOnCase=doctorAssignment&&doctorPhase?assignedDoctorName:null;
 // Operations and consultants keep their stage forms; the coordinator's work is driven by the current action.
 const workflowBlock=!isCoordinator&&showActions&&!(isDoctor&&doctorPhase)?<div id="case-actions"><CaseWorkflowActions locale={locale} role={role} caseSummary={c} availableActions={available} patientAction={value.patientAction} mutate={mutate} doctors={doctors} categories={categories} staff={staff} documents={documents} travelPackage={!!c.travelPackageRequested} financeRequired={!!value.gates?.financeRequired}/></div>:null;
 const recommendationBlock=approved&&(approved.recommendedTreatment||approved.risksAndLimitations)?<div className="rounded-lg border border-line p-4"><p className="mb-2 text-[0.8125rem] font-bold uppercase tracking-wide text-brand-700">{locale==="ar"?"التوصية السريرية للاستشاري":"Consultant's clinical recommendation"}</p>{approved.recommendedTreatment&&<div className="mb-3"><p className="text-sm font-bold text-ink-800">{t.reviewTreatment}</p><p className="mt-0.5 whitespace-pre-wrap text-ink-700">{approved.recommendedTreatment}</p></div>}{approved.risksAndLimitations&&<div><p className="text-sm font-bold text-ink-800">{t.reviewRisks}</p><p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-600">{approved.risksAndLimitations}</p></div>}</div>:null;
 // The proposal is the coordinator's work while it is being prepared or released (or, at arrival, finalised);
 // once decided it becomes reference history.
 // An assignment step has its own inline form; every other focus step lives in the proposal panel.
 const formCode=current.workType==="TRAVEL"?"ASSIGN_OPERATIONS":current.workType==="PROPOSAL_TERMS_CALL"?"RECORD_PROPOSAL_DECISION":REFERRAL_CONFIRM_WORK.includes(current.workType??"")?"CONFIRM_REFERRAL":current.code;
 const formAction=isCoordinator&&owned&&current.kind==="FOCUS"&&["ASSIGN_CONSULTANT","CONFIRM_REFERRAL","ASSIGN_OPERATIONS","ASSIGN_FINANCE"].includes(formCode)||(formCode==="RECORD_PROPOSAL_DECISION"&&isCoordinator&&owned&&!!value.proposal&&available.includes("RECORD_PROPOSAL_DECISION"));
 const proposalIsWork=isCoordinator&&owned&&(["PREPARE_PROPOSAL","RELEASE_PROPOSAL","WAIT_INTERNAL_APPROVAL","ASSIGN_FINANCE"].includes(current.code)||["PREPARE_PROPOSAL","PROPOSAL_REVISION"].includes(current.workType??"")||(!!approved&&!value.proposal)||c.status==="ARRIVAL_CONFIRMED");
 const proposalPanel=<Panel title={t.proposal} wide>{recommendationBlock}{value.proposal?<ProposalCard proposal={value.proposal}/>:null}{isCoordinator&&owned&&approved&&(!value.proposal||["REVISION_REQUESTED","EXPIRED"].includes(value.proposal.status))&&<ProposalSendForm estimate={approved} onSend={sendProposal}/>}{isCoordinator&&share&&<ProposalShareLinks share={share}/>}{isCoordinator&&value.delivery&&value.proposal&&<DeliveryCard delivery={value.delivery} versionId={value.proposal.versionId} canResend={available.includes("RESEND_PROPOSAL_LINK")}/>}{isCoordinator&&owned&&c.status==="ARRIVAL_CONFIRMED"&&<FinalQuoteActions reviewId={approved?.id} proposal={value.proposal} gates={value.gates}/>}{value.deposit&&<DepositCard deposit={value.deposit}/>}{showActions&&<div className={dim?"pointer-events-none opacity-50":""}><RoleActions role={role} t={t} c={c} proposal={value.proposal} gates={value.gates} availableActions={available} locale={locale} mutate={mutate}/></div>}</Panel>;
 const clinicalPanel=(value.clinicalReviews.length>0||["CONSULTANT_REVIEW","ARRIVAL_CONFIRMED"].includes(c.status))?<Panel title={t.reviews}>{value.clinicalReviews.length?value.clinicalReviews.map(r=><div key={r.id} className="rounded-lg border border-line p-4"><strong>v{r.versionNumber} · {statusLabel(r.status,locale)}</strong>{r.recommendedTreatment&&<p className="mt-1">{r.recommendedTreatment}</p>}{r.risksAndLimitations&&<p className="mt-1 text-sm text-ink-600">{r.risksAndLimitations}</p>}{r.costEstimates&&r.costEstimates.length>0&&<div className="mt-3 rounded-lg bg-brand-50 p-3"><p className="mb-2 text-[0.8125rem] font-bold uppercase tracking-wide text-brand-700">{t.estimatedByConsultant}</p>{r.proposalCurrency&&<p className="mb-2 text-[0.8125rem] text-ink-600">{locale==="ar"?"عملة العرض":"Proposal currency"}: <strong>{CURRENCY_LABELS[r.proposalCurrency]?.[locale]??r.proposalCurrency}</strong></p>}<ul className="space-y-1 text-sm">{r.costEstimates.map((e,i)=><li key={i} className="flex items-baseline justify-between gap-3"><span>{e.serviceDescription}</span><span className="text-end"><strong className="block whitespace-nowrap">{e.quotedCost!=null&&e.quotedCurrency?money(e.quotedCost,e.quotedCurrency,locale):money(e.estimatedCost,e.currency,locale)}</strong>{e.quotedCost!=null&&e.quotedCurrency&&<span className="block whitespace-nowrap text-[0.8125rem] text-ink-500">{locale==="ar"?"الأساس":"Base"} {money(e.estimatedCost,e.currency,locale)}</span>}</span></li>)}</ul></div>}</div>):<Empty/>}{isDoctor&&c.status==="ARRIVAL_CONFIRMED"&&<FinalAssessment/>}</Panel>:null;
 // The consultant's clinical review is the page's primary work, not an appendix to the review history.
 const reviewDraft=isDoctor&&c.status==="CONSULTANT_REVIEW"?(value.clinicalReviews.find(r=>r.status==="DRAFT")??null):null;
 // A second-opinion consultant reads the case and gives an opinion; the clinical decision stays with the primary consultant.
 const secondOpinionOnly=isDoctor&&current.workType==="SECOND_OPINION";
 const clinicalReviewPanel=isDoctor&&c.status==="CONSULTANT_REVIEW"&&!secondOpinionOnly
  ?<ClinicalReviewPanel locale={locale} caseId={c.id} busy={busy} catalog={catalog} fxRates={fxRates} documents={documents}
     draft={reviewDraft&&{id:reviewDraft.id,recommendedTreatment:reviewDraft.recommendedTreatment,risksAndLimitations:reviewDraft.risksAndLimitations,costEstimates:reviewDraft.costEstimates,proposalCurrency:reviewDraft.proposalCurrency}}
     viewDoc={viewDoc} downloadDoc={downloadDoc} mutate={mutate}/>
  :null;
  // Everything needed to act sits above the fold; the rest of the case is one tab away.
  const [tab,setTab]=useState<"overview"|"clinical"|"documents"|"activity">("overview");
  const [overlay,setOverlay]=useState<CaseOverlay|null>(null);
  // A close only clears the overlay that asked for it, as the separate open flags did: a late close event from a drawer
  // that was just replaced must not shut the one that replaced it.
  const closeOverlay=(which:CaseOverlay)=>setOverlay(open=>open===which?null:open);
  const unreadMessages=value.messages.filter(m=>m.senderRole==="PATIENT"&&!m.read).length;
  const latestPatientMessage=[...value.messages].reverse().find(m=>m.senderRole==="PATIENT");
  const newestDocument=documents.length?documents[documents.length-1]:undefined;
  // The clinical review form lives in the Clinical tab, so send a consultant there rather than to an
  // overview panel that does not exist for them.
  const focusAction=()=>{setTab(isDoctor&&!workflowBlock?"clinical":"overview");requestAnimationFrame(()=>{const target=document.getElementById("case-actions")??document.getElementById("case-tab-panel");scrollIntoView(target,{behavior:"smooth",block:"center"});(target?.querySelector("button,select,input,textarea") as HTMLElement|null)?.focus();});};
  const completeWork=(evidence:string)=>{if(current.workItemId!=null)void mutate(`/tasks/${current.workItemId}/cases/${c.id}/complete`,{evidence,expectedVersion:current.workItemVersion??0});};
  const openMessages=()=>setOverlay("messages");
  const caseTabs=[{id:"overview" as const,label:locale==="ar"?"نظرة عامة":"Overview",count:0},{id:"clinical" as const,label:locale==="ar"?"الملف السريري":"Clinical",count:0},{id:"documents" as const,label:locale==="ar"?"المستندات":"Documents",count:documents.length},{id:"activity" as const,label:locale==="ar"?"السجل":"Activity",count:0}];
  // Utilities live in one place each: the secure-link row owns "resend", the header owns messages, and the
  // "More" drawer owns everything else the backend listed for this state.
  const moreAvailable=available.filter(code=>!code.startsWith("RESEND_")&&!(code==="RECORD_PROPOSAL_DECISION"&&formCode==="RECORD_PROPOSAL_DECISION"));
  const showMore=isCoordinator&&owned&&!value.preview&&(moreAvailable.length>0||canRebalance);

  const banners=<>
   {dim&&<div className="card border border-brand-400 bg-brand-50 p-4"><p className="font-bold text-brand-800">{fillTemplate(t.handoff,{name:`\u2068${assignedDoctorName}\u2069`})}</p></div>}

   {value.preview&&<p className="text-sm text-ink-500">{locale==="ar"?"هذه معاينة للاستقبال. تتاح المستندات والرسائل بعد تولّي مسؤولية الحالة.":"This intake preview supports your ownership decision. Documents and messages become available after you take responsibility for the case."}</p>}
  </>;

  // Who is on the case: the owner first, then the clinical and operational people actually assigned.
  const team=[
   {label:t.coordinatorLabel,name:coordinatorLabel(c,mySubject,work.queue),pending:false},
   ...value.assignments.filter(a=>a.assigneeRole!=="COORDINATOR").map(a=>({label:a.assigneeRole==="DOCTOR"?(locale==="ar"?"الاستشاري":"Consultant"):a.assigneeRole==="OPERATIONS"?(locale==="ar"?"العمليات":"Operations"):a.assigneeRole==="FINANCE"?(locale==="ar"?"المالية":"Finance"):a.assigneeRole,name:a.assigneeName??(locale==="ar"?"عضو الفريق":"Team member"),pending:a.status==="PENDING"})),
  ];

  return <CaseWorkspaceProvider value={workspace}><div>
  <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label={t.caseWorkspaceLabel}>
   <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink-350 bg-white px-3 text-[0.85rem] font-semibold text-brand-800 transition hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700" onClick={back}><ArrowLeft size={16} aria-hidden className="rtl:-scale-x-100"/>{t.myDashboard}</button>
   <span className="text-ink-300" aria-hidden>/</span>
   <span className="font-semibold text-ink-700" dir="ltr">{c.caseNumber}</span>
  </nav>

  <header className="card p-4 sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
     <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="text-[0.8125rem] font-bold text-brand-700" dir="ltr">{c.caseNumber}</span>
      {c.careCategory&&<span className="text-[0.8125rem] text-ink-500">{careAreaLabel(c.careCategory,work.careAreas)}</span>}
      <span className="text-[0.8125rem] text-ink-500">{c.country}</span>
      <span className="text-[0.8125rem] text-ink-500">{c.preferredLanguage==="ar"?(locale==="ar"?"العربية":"Arabic"):(locale==="ar"?"الإنجليزية":"English")}</span>
     </div>
     <h2 id="case-heading" tabIndex={-1} className="mt-0.5 text-[1.35rem] font-bold leading-7 text-brand-900 outline-none">{c.patientName||(locale==="ar"?"مراجعة طلب الرعاية":"Review care request")}</h2>
     <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8rem]">
      <Status value={c.status} locale={locale}/>
      {actions.waitingOn&&actions.waitingOn!=="NONE"&&<HeaderFact label={work.waiting.label} value={waitingLabel(actions.waitingOn,work.waiting,{role,ownsCase:!!mySubject&&c.coordinatorSubject===mySubject})}/>}
      <HeaderFact label={t.coordinatorLabel} value={coordinatorLabel(c,mySubject,work.queue)}/>
      {consultantOnCase&&<HeaderFact label={locale==="ar"?"الاستشاري":"Consultant"} value={consultantOnCase}/>}
     </div>
    </div>
    <div className="flex flex-none items-center gap-2">
     {!value.preview&&<button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-white px-3 text-[0.85rem] font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-800" onClick={openMessages}>
      <MessageSquare size={16} aria-hidden/>{locale==="ar"?"الرسائل":"Messages"}{value.messages.length>0&&<span className={`rounded-full px-1.5 text-[0.8125rem] font-bold ${unreadMessages?"bg-brand-600 text-white":"bg-mist text-ink-600"}`}>{value.messages.length}</span>}
     </button>}
     {showMore&&<button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-[0.85rem] font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-800" aria-haspopup="dialog" onClick={()=>setOverlay("more")}><MoreHorizontal size={16} aria-hidden/>{locale==="ar"?"المزيد":"More"}</button>}
     {isCoordinator&&!owned&&canRebalance&&!value.preview&&<button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-[0.85rem] font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-800" aria-haspopup="dialog" onClick={()=>setOverlay("transfer")}>{locale==="ar"?"نقل الملكية":"Transfer ownership"}</button>}
    </div>
   </div>
  </header>

  <CurrentActionPanel locale={locale} role={role} action={current}
   response={current.workType==="REVIEW_PATIENT_RESPONSE"?{message:latestPatientMessage?.body,documentName:newestDocument?.fileName}:null}
   busy={busy} onComplete={completeWork} onFocusAction={focusAction} onClaim={()=>void mutate(`/coordinator/cases/${c.id}/claim`)}
   onAcceptAssignment={()=>{if(!myPending)return;void mutate(`/${role}/cases/${c.id}/assignments/${myPending.id}`,{accept:true}).then(result=>{if(result&&isDoctor)setTab("clinical");});}}
   onDeclineAssignment={()=>setOverlay("decline")}
   form={formAction?<CoordinatorActionForm locale={locale} code={formCode} caseId={c.id} version={c.version} careCategory={c.careCategory} categories={categories} staff={staff} busy={busy} mutate={mutate} load={load} consultantsHref={consultantsHref} proposal={value.proposal} representatives={value.representatives}/>:undefined}/>

  {isCoordinator&&<CaseBlockers locale={locale} blockers={actions.blockers} deposit={value.deposit}/>}

  <div aria-busy={busy||undefined} className="min-w-0">
   <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
    <div className="min-w-0">
     {<div role="tablist" aria-label={t.caseWorkspaceLabel} className="mb-4 flex flex-wrap gap-1 border-b border-line-strong">
      {caseTabs.map(item=><button key={item.id} type="button" role="tab" id={`case-tab-${item.id}`} aria-controls="case-tab-panel" aria-selected={tab===item.id}
        className={`-mb-px min-h-11 border-b-2 px-3 py-2 text-[0.85rem] font-bold transition ${tab===item.id?"border-brand-600 text-brand-800":"border-transparent text-ink-500 hover:text-ink-800"}`}
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
        <h3 id="assignment-preview" className="text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-ink-500">{locale==="ar"?"ملف التعيين":"Assignment brief"}</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.85rem] sm:grid-cols-2 lg:grid-cols-4">
         <div><dt className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.patientLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{c.patientName||"—"}</dd></div>
         {c.careCategory&&<div><dt className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.careArea}</dt><dd className="mt-0.5 font-semibold text-ink-800">{careAreaLabel(c.careCategory,work.careAreas)}</dd></div>}
         <div><dt className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.coordinatorLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{c.coordinatorName??"—"}</dd></div>
         <div><dt className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.countryLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{c.country}</dd></div>
        </dl>
        {value.intakeSummary?.trim()&&<div className="mt-4 rounded-lg border border-line bg-mist p-3"><p className="whitespace-pre-wrap break-words text-[0.9rem] leading-6 text-ink-700">{value.intakeSummary}</p></div>}
        <div className="mt-4">
         <p className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.documents} {documents.length>0&&<span className="text-ink-400">({documents.length})</span>}</p>
         {documents.length===0?<p className="mt-1.5 text-[0.88rem] text-ink-500">{locale==="ar"?"لم تُرفع مستندات.":"No documents were uploaded."}</p>
          :<ul className="mt-1.5">{documents.map(doc=><li key={doc.documentId} className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-0"><span className="min-w-0 flex-1 truncate font-semibold text-ink-800">{doc.fileName}</span>{doc.status==="CLEAN"?<span className="flex gap-2"><button type="button" className="link-cta text-[0.85rem]" onClick={()=>viewDoc(doc.documentId)}>{locale==="ar"?"عرض":"View"}</button><button type="button" className="link-cta text-[0.85rem]" onClick={()=>downloadDoc(doc.documentId)}>{t.download}</button></span>:<span className="text-[0.8rem] text-ink-500">{doc.status==="PENDING"?t.docScanning:t.docUnavailable}</span>}</li>)}</ul>}
        </div>
       </section>}
       {banners}
       {workflowBlock}
       {/* The proposal is the work while it is being prepared or released; afterwards it is reference. */}
       {isCoordinator&&(proposalIsWork?<div id={current.kind==="FOCUS"&&!formAction?"case-actions":undefined}>{proposalPanel}</div>
         :(value.proposal||value.deposit)?<ProposalSummary proposal={value.proposal} deposit={value.deposit} delivery={value.delivery} available={available} onView={()=>setOverlay("proposal")}/>:null)}
       {!isCoordinator&&!isDoctor&&(value.proposal||value.deposit)&&proposalPanel}
       {/* The case brief: the facts a coordinator decides ownership on, and the operational context once they own it. */}
       {isCoordinator&&<CoordinatorBrief actions={actions} documents={documents} preview={!!value.preview} intakeSummary={value.intakeSummary} consultantName={consultantOnCase} onClinical={()=>setTab("clinical")} onDocuments={()=>setTab("documents")}/>}
      </div>

      {/* Kept mounted for the same reason: the clinical review and final assessment drafts. */}
      <div hidden={tab!=="clinical"} className="space-y-4">
       {doctorReviewComplete&&<div className="card flex items-center gap-3 border border-brand-500 bg-brand-50 p-4"><span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-600 font-bold text-white">✓</span><p className="font-bold text-brand-800">{c.status==="CLINICAL_RECOMMENDATION_READY"?t.doctorAccepted:c.status==="INFORMATION_REQUIRED"?t.doctorInfoSent:c.status==="CLINICALLY_NOT_SUITABLE"?t.doctorNotSuitable:t.doctorReturned}</p></div>}
       {clinicalReviewPanel}
       {isDoctor&&<ConsultantReferrals key={c.id} locale={locale} caseId={c.id} careCategory={c.careCategory} categories={categories} canRefer={c.status==="CONSULTANT_REVIEW"&&!myPending&&!secondOpinionOnly} busy={busy} load={load} mutate={mutate}/>}
       {intakePanel}
       {/* While the consultant is composing, the review history would only repeat their own draft back at them. */}
       {!clinicalReviewPanel&&clinicalPanel}
       {!intakePanel&&!clinicalPanel&&!clinicalReviewPanel&&!doctorReviewComplete&&<p className="text-sm text-ink-500">{locale==="ar"?"لا توجد معلومات سريرية بعد.":"No clinical information yet."}</p>}
      </div>

      {tab==="documents"&&(documentsPanel??<p className="text-sm text-ink-500">{locale==="ar"?"لم يتم رفع مستندات بعد.":"No documents uploaded yet."}</p>)}

      {tab==="activity"&&<><CaseActivity tasks={value.tasks} timeline={value.timeline} onViewJourney={()=>setOverlay("journey")}/>{isCoordinator&&loadAssignmentHistory&&<div className="mt-5"><AssignmentHistory key={c.id} locale={locale} caseId={c.id} load={loadAssignmentHistory}/></div>}</>}
     </div>
    </div>

    <aside className="min-w-0 space-y-4 lg:sticky lg:top-20">
     <JourneyPulse locale={locale} stage={c.status} waitingOn={actions.waitingOn} viewerRole={role} ownsCase={!!mySubject&&c.coordinatorSubject===mySubject} onViewJourney={()=>setOverlay("journey")}/>
     {!value.preview&&<section aria-labelledby="case-team-title" className="card p-4">
      <h2 id="case-team-title" className="text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-ink-500">{locale==="ar"?"فريق الحالة":"Case team"}</h2>
      <dl className="mt-2 space-y-1.5 text-[0.82rem]">{team.map((member,i)=><div key={`${member.label}-${i}`} className="flex items-baseline justify-between gap-3"><dt className="text-ink-500">{member.label}</dt><dd className="text-end font-semibold text-ink-800">{member.name}{member.pending&&<span className="ms-1 text-[0.8125rem] font-semibold text-amber-800">{locale==="ar"?"· بانتظار القبول":"· pending"}</span>}</dd></div>)}</dl>
     </section>}
    </aside>
   </div>
   {/* Explains why the workspace is read-only. The Take ownership button lives once, in the current-
       action panel above; repeating it here put the same claim on screen twice under one label. */}
   {isCoordinator&&!owned&&<p className="card mt-5 border border-brand-400 p-4 text-ink-600">{c.coordinatorSubject?t.ownedByOther:t.ownershipHint}</p>}
  </div>

  {overlay==="journey"&&<FullJourneyDialog locale={locale} timeline={value.timeline} caseNumber={c.caseNumber} onClose={()=>closeOverlay("journey")}/>}
  {overlay==="messages"&&<CaseDrawer locale={locale} title={locale==="ar"?"الرسائل الآمنة":"Secure messages"} onClose={()=>closeOverlay("messages")}><CaseMessages key={c.id} locale={locale} role={role} caseId={c.id} messages={value.messages} canSend={showActions} busy={busy} mutate={mutate}/></CaseDrawer>}
  {overlay==="more"&&<CaseDrawer locale={locale} title={locale==="ar"?"إجراءات إضافية":"More actions"} onClose={()=>closeOverlay("more")}>
   <MoreActions locale={locale} caseId={c.id} available={moreAvailable} travelPackage={!!c.travelPackageRequested} version={c.version} busy={busy} mutate={mutate}
    onRequestInformation={()=>setOverlay("requestInfo")} onRecordResponse={()=>setOverlay("recordResponse")}
    onRecordDecision={value.proposal?()=>setOverlay("recordDecision"):undefined}
    onAdministration={canRebalance?()=>setOverlay("transfer"):undefined}/>
  </CaseDrawer>}
  {/* Recording a WhatsApp/phone answer opens its own dialog; the trigger is hidden and driven from More actions so the page carries one control per business action. */}
  {isCoordinator&&owned&&available.includes("RECORD_PATIENT_RESPONSE")&&<RecordPatientResponse locale={locale} caseId={c.id} action={value.patientAction} mutate={mutate} open={overlay==="recordResponse"} onOpenChange={open=>{if(open)setOverlay("recordResponse");else closeOverlay("recordResponse");}} hideTrigger/>}
  {overlay==="recordDecision"&&value.proposal&&<CaseDrawer locale={locale} title={work.recordDecision.title} onClose={()=>closeOverlay("recordDecision")}>
   <RecordProposalDecision key={value.proposal.versionId} locale={locale} caseId={c.id} proposal={value.proposal} representatives={value.representatives} busy={busy} mutate={async(path,body,method)=>{const result=await mutate(path,body,method);if(result)closeOverlay("recordDecision");return result;}}/>
  </CaseDrawer>}
  {overlay==="proposal"&&<CaseDrawer locale={locale} title={t.proposal} onClose={()=>closeOverlay("proposal")}>
   <div className="space-y-4">{recommendationBlock}{value.proposal&&<ProposalCard proposal={value.proposal}/>}{value.delivery&&value.proposal&&<DeliveryCard delivery={value.delivery} versionId={value.proposal.versionId} canResend={false}/>}{value.deposit&&<DepositCard deposit={value.deposit}/>}</div>
  </CaseDrawer>}
  {overlay==="transfer"&&<CaseDrawer locale={locale} title={locale==="ar"?"نقل ملكية الحالة":"Transfer case ownership"} onClose={()=>closeOverlay("transfer")}><TransferOwnership locale={locale} caseId={c.id} caseNumber={c.caseNumber} currentOwner={c.coordinatorSubject} currentOwnerName={c.coordinatorName} mySubject={mySubject} staff={staff} busy={busy} mutate={mutate} onClose={()=>closeOverlay("transfer")}/></CaseDrawer>}
  {overlay==="requestInfo"&&<RequestInformationDialog locale={locale} caseIds={[c.id]} busy={busy} mutate={mutate} onClose={()=>closeOverlay("requestInfo")}/>}
  {overlay==="decline"&&myPending&&<DeclineAssignmentDialog locale={locale} caseNumber={c.caseNumber} busy={busy} onClose={()=>closeOverlay("decline")}
   onConfirm={reason=>void mutate(`/${role}/cases/${c.id}/assignments/${myPending.id}`,{accept:false,reason})}/>}
 </div></CaseWorkspaceProvider>;
}

/**
 * The proposal once it is history rather than work: version, decision, total, service count and validity
 * in one line, with the full breakdown, delivery and deposit one click away. The secure link the patient
 * currently holds is shown compactly with its one utility — resend — only while resending is valid.
 */
function ProposalSummary({proposal,deposit,delivery,available,onView}:{proposal?:Proposal;deposit?:DepositView|null;delivery?:DeliveryStatus|null;available:string[];onView:()=>void}){const work=useWorkCopy();const {locale,c:{id:caseId},busy,mutate}=useCaseWorkspace();
 // A resend revokes the link the patient holds, so it is confirmed first.
 const [resendPath,setResendPath]=useState<string|null>(null);
 const ar=locale==="ar";
 const total=proposal?proposal.items.filter(i=>!i.optional).reduce((sum,i)=>sum+i.quantity*i.unitPrice,0):null;
 const services=proposal?.items.length??0;
 const depositLabel=deposit?({REQUESTED:ar?"مطلوبة":"Requested",PARTIALLY_PAID:ar?"مدفوعة جزئيًا":"Partially paid",PAID:ar?"مدفوعة":"Paid",CANCELLED:ar?"ملغاة":"Cancelled",REFUNDED:ar?"مستردة":"Refunded",WAIVED:ar?"معفاة":"Waived"} as Record<string,string>)[deposit.status]??deposit.status:null;
 const fmt=(n:number,currency:string)=>new Intl.NumberFormat(intlLocale(locale),{style:"currency",currency,maximumFractionDigits:0}).format(n);
 const resendProposal=available.includes("RESEND_PROPOSAL_LINK")&&proposal;
 const resendProfile=available.includes("RESEND_ONBOARDING_LINK");
 const linkLabel=resendProfile?(ar?"رابط تفعيل الملف":"Profile link"):(ar?"رابط العرض":"Proposal link");
 const deliveryLabel=delivery?({QUEUED:ar?"في قائمة الإرسال":"Queued",DELIVERED:ar?"تم التسليم":"Delivered",RETRY:ar?"إعادة المحاولة":"Retrying",FAILED:ar?"فشل الإرسال":"Failed"} as Record<string,string>)[delivery.status]??delivery.status:null;
 return <section className="card p-4 sm:p-5" aria-labelledby="proposal-summary-title">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0">
    <h3 id="proposal-summary-title" className="text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-ink-500">{ar?"آخر عرض":"Latest proposal"}</h3>
    {proposal?<>
     <p className="mt-1 text-[1rem] font-bold text-brand-900">{proposal.documentType==="FINAL_TREATMENT_QUOTE"?(ar?"عرض العلاج النهائي":"Final treatment quote"):(ar?"تقدير مبدئي":"Preliminary estimate")} · {fillTemplate(work.proposalVersion,{number:new Intl.NumberFormat(intlLocale(locale)).format(proposal.versionNumber)})} · {statusLabel(proposal.status,locale)}</p>
     <p className="mt-0.5 text-[0.85rem] text-ink-600">{total!=null&&<strong className="text-ink-900">{fmt(total,proposal.currency)}</strong>}{services>0&&<> · {plural(locale,services,work.plural.services)}</>}{proposal.validUntil&&<> · {ar?"صالح حتى":"Valid until"} {new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium"}).format(new Date(proposal.validUntil))}</>}</p>
    </>:<p className="mt-1 text-[0.9rem] text-ink-600">{ar?"لا يوجد عرض بعد.":"No proposal yet."}</p>}
   </div>
   <button type="button" className="btn-secondary !px-3 !text-[0.82rem]" onClick={onView}>{ar?"عرض التفاصيل":"View proposal"}</button>
  </div>
  <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-line pt-3 text-[0.85rem] sm:grid-cols-2">
   {deposit&&<div className="flex flex-wrap items-baseline justify-between gap-x-3"><dt className="text-ink-500">{ar?"وديعة التنسيق":"Coordination deposit"}</dt><dd className="font-semibold text-ink-800">{depositLabel}{deposit.totalDisplay!=null&&<> · {fmt(deposit.totalDisplay,deposit.currency||"EGP")}</>}{deposit.paidDisplay?<span className="text-ink-500"> · {ar?"المدفوع":"paid"} {fmt(deposit.paidDisplay,deposit.currency||"EGP")}</span>:null}</dd></div>}
   {(delivery||resendProfile)&&<div className="flex flex-wrap items-baseline justify-between gap-x-3"><dt className="text-ink-500">{ar?"الرابط الآمن":"Secure link"}</dt><dd className="flex flex-wrap items-center gap-x-2 font-semibold text-ink-800">
    {delivery&&!resendProfile&&<span>{deliveryLabel} · {delivery.channel==="WHATSAPP"?(ar?"واتساب":"WhatsApp"):(ar?"البريد":"Email")} · <span dir="ltr">{delivery.destinationMasked}</span></span>}
    {resendProfile&&<span>{linkLabel}{delivery?<> · {delivery.channel==="WHATSAPP"?(ar?"واتساب":"WhatsApp"):(ar?"البريد":"Email")} · <span dir="ltr">{delivery.destinationMasked}</span></>:null}</span>}
    {resendProposal&&<button type="button" className="link-cta text-[0.82rem]" disabled={busy} onClick={()=>setResendPath(`/coordinator/cases/${caseId}/proposals/${proposal.versionId}/resend`)}>{ar?"إعادة الإرسال":"Resend link"}</button>}
    {resendProfile&&<button type="button" className="link-cta text-[0.82rem]" disabled={busy} onClick={()=>setResendPath(`/coordinator/cases/${caseId}/onboarding-link/resend`)}>{ar?"إعادة الإرسال":"Resend link"}</button>}
   </dd></div>}
  </dl>
  {resendPath&&<ConfirmDialog title={work.confirm.resendTitle} body={work.confirm.resendBody} confirm={work.confirm.resend} cancel={work.confirm.cancel}
   onCancel={()=>setResendPath(null)} onConfirm={()=>{const path=resendPath;setResendPath(null);void mutate(path);}}/>}
 </section>;
}

/**
 * What the coordinator needs to know about the case on the Overview, sized to the moment: before ownership
 * it is the routing brief that supports the take-ownership decision (facts, document count, intake summary —
 * never the files or messages themselves); after ownership it is the compact operational summary the current
 * action sits above. It renders only real data: a fact with nothing behind it is left out, not filled in.
 */
function CoordinatorBrief({actions,documents,preview,intakeSummary,consultantName,onClinical,onDocuments}:{actions:CaseActions;documents:CaseDocument[];preview:boolean;intakeSummary?:string;consultantName?:string|null;onClinical:()=>void;onDocuments:()=>void}){
 const work=useWorkCopy();const {locale,t,mySubject,c}=useCaseWorkspace();
 const ar=locale==="ar";
 const when=(iso:string)=>new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
 const facts:{label:string;value:string}[]=[
  {label:ar?"تاريخ الاستلام":"Received",value:when(c.createdAt)},
  ...(c.careCategory?[{label:t.careArea,value:careAreaLabel(c.careCategory,work.careAreas)}]:[{label:t.careArea,value:ar?"لم يُحدَّد بعد":"Not classified yet"}]),
  {label:t.countryLabel,value:c.country},
  {label:t.languageLabel,value:c.preferredLanguage==="ar"?(ar?"العربية":"Arabic"):(ar?"الإنجليزية":"English")},
  {label:t.documents,value:documents.length===0?(ar?"لا توجد":"None"):String(documents.length)},
  // Stage and "waiting on" are stated once, in the case header above — not repeated here.
  {label:t.coordinatorLabel,value:c.coordinatorSubject?coordinatorLabel(c,mySubject,work.queue):work.queue.unownedInQueue},
  ...(consultantName?[{label:t.consultantLabel,value:consultantName}]:[]),
  ...(c.travelPackageRequested?[{label:ar?"باقة السفر":"Travel package",value:ar?"مطلوبة":"Requested"}]:[]),
  {label:t.updatedLabel,value:when(c.updatedAt)},
 ];
 const summary=intakeSummary?.trim();
 return <section className="card p-4" aria-labelledby="case-brief-title">
  <h3 id="case-brief-title" className="text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-ink-500">{preview?(ar?"ملخص الاستقبال":"Intake brief"):(ar?"ملخص الحالة":"Case brief")}</h3>
  <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.85rem] sm:grid-cols-2 lg:grid-cols-3">
   {facts.map(fact=><div key={fact.label} className="min-w-0"><dt className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-ink-500">{fact.label}</dt><dd className="mt-0.5 truncate font-semibold text-ink-800">{fact.value}</dd></div>)}
  </dl>
  {waitingReasonText(actions,work,locale)&&<p className="mt-3 text-[0.82rem] text-ink-600">{waitingReasonText(actions,work,locale)}</p>}
  <div className="mt-4 border-t border-line pt-3">
   <p className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-ink-500">{ar?"ملخص الحالة عند الاستقبال":"Intake summary"}</p>
   {summary?<p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-[0.88rem] leading-6 text-ink-700">{summary}</p>:<p className="mt-1 text-[0.85rem] text-ink-500">{ar?"لم يكتب المريض وصفًا للحالة.":"The patient did not describe their condition."}</p>}
   <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
    {summary&&<button type="button" className="link-cta text-[0.85rem]" onClick={onClinical}>{ar?"الملف السريري الكامل":"Full clinical file"}</button>}
    {documents.length>0&&<button type="button" className="link-cta text-[0.85rem]" onClick={onDocuments}>{ar?`المستندات (${documents.length})`:`Documents (${documents.length})`}</button>}
   </div>
  </div>
 </section>;
}

/** History, not current work: every task and the recorded stage changes, out of the operational view. */
function CaseActivity({tasks,timeline,onViewJourney}:{tasks:Task[];timeline:{status:string;occurredAt:string}[];onViewJourney:()=>void}){
 const {locale}=useCaseWorkspace();
 const ar=locale==="ar";
 const open=tasks.filter(task=>["OPEN","IN_PROGRESS"].includes(task.status));
 const done=tasks.filter(task=>!["OPEN","IN_PROGRESS"].includes(task.status));
 const row=(task:Task)=><li key={task.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2.5 last:border-0">
  <span className="font-semibold text-ink-800">{task.title}</span>
  <span className={`text-[0.8125rem] ${task.overdue&&["OPEN","IN_PROGRESS"].includes(task.status)?"font-bold text-alert-700":"text-ink-500"}`}>{statusLabel(task.status,locale)}</span>
 </li>;
 return <div className="space-y-5">
  <section className="card p-4">
   <h3 className="text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-ink-500">{ar?"المهام":"Work items"}</h3>
   {tasks.length===0?<p className="mt-2 text-sm text-ink-500">{ar?"لا توجد مهام على هذه الحالة.":"No work items on this case."}</p>
    :<ul className="mt-2">{open.map(row)}{done.map(row)}</ul>}
  </section>
  <section className="card p-4">
   <h3 className="text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-ink-500">{ar?"مراحل الحالة":"Case history"}</h3>
   <p className="mt-2 text-sm text-ink-600">{ar?`${timeline.length} تغييرات مسجلة.`:`${timeline.length} recorded stage changes.`}</p>
   <button type="button" className="link-cta mt-3 text-[0.88rem]" onClick={onViewJourney}>{ar?"عرض الرحلة كاملة":"View full journey"}</button>
  </section>
 </div>;
}

function ProposalSendForm({estimate,onSend}:{estimate:Review;onSend:(caseId:string,body:unknown)=>void}){
 const {locale,t,c:{id:caseId,preferredLanguage:language},busy}=useCaseWorkspace();
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
 const labels=locale==="ar"?{source:"اعتمدها الاستشاري",locked:"الخدمات والتكاليف الطبية أدخلها الاستشاري واعتمدها. لا يستطيع المنسق تعديلها.",missing:"لا يمكن إنشاء العرض حتى يضيف الاستشاري خدمة واحدة على الأقل وتكلفتها ضمن المراجعة المعتمدة.",coordination:"ملاحظة تنسيقية اختيارية",coordinationHint:"أضف فقط معلومات غير سريرية يحتاجها المريض، مثل نقطة التواصل أو خطوات التنسيق. لا تضف علاجًا أو تكلفة طبية هنا.",currency:"عملة عرض المريض",rateNote:"حدّدها الاستشاري عند تسجيل التقدير؛ يرى المريض العرض بهذه العملة."}:{source:"Consultant approved",locked:"Medical services and costs were entered and approved by the consultant. Coordinators cannot edit them.",missing:"A proposal cannot be created until the consultant adds at least one service and cost to the approved review.",coordination:"Optional coordination note",coordinationHint:"Add only non-clinical information the patient needs, such as the contact point or coordination steps. Do not add treatment or medical pricing here.",currency:"Patient's quote currency",rateNote:"Set by the consultant when recording the estimate; the patient sees the quote in this currency."};
 const items=estimates.map((item,index)=>({category:"MEDICAL",description:item.serviceDescription,quantity:1,unitPrice:item.estimatedCost,optional:false,sortOrder:index,quotedPrice:item.quotedCost??null}));
 const total=items.reduce((a,i)=>a+i.unitPrice,0);
 const quotedTotal=quoted?items.reduce((a,i)=>a+(i.quotedPrice??0),0):null;
 const rateNote=quoted&&estimate?.quoteRate?(locale==="ar"?`سعر الصرف اليوم: 1 جنيه = ${estimate.quoteRate} ${proposalCurrency}${estimate.quoteRateDate?` (${estimate.quoteRateDate})`:""}. يُثبَّت السعر النهائي عند إرسال العرض.`:`Today's rate: 1 EGP = ${estimate.quoteRate} ${proposalCurrency}${estimate.quoteRateDate?` (${estimate.quoteRateDate})`:""}. The rate is frozen when the proposal is released.`):null;
 const send=()=>{if(!items.length)return;onSend(caseId,{clinicalReviewId:reviewId,language,includedServices:items.map(i=>i.description).join("; "),paymentTerms:PROPOSAL_PAYMENT_TERMS_RECORD,coordinatorNotes:notes.trim()||undefined,validUntil:validUntilInDays(14),items});};
 return <div className="mt-4 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-bold text-ink-700">{labels.currency}<span className="rounded-full bg-brand-50 px-3 py-1 text-brand-800">{CURRENCY_LABELS[proposalCurrency]?.[locale]??proposalCurrency}</span></span><span className="text-[0.8125rem] text-ink-500">{labels.rateNote}</span></div>
  <div className="overflow-hidden rounded-lg border border-brand-200"><div className="flex flex-wrap items-center justify-between gap-2 bg-brand-50 px-4 py-3"><h4 className="font-bold text-brand-900">{t.servicesFromConsultant}</h4><span className="rounded-full bg-white px-3 py-1 text-[0.8125rem] font-bold text-brand-700">✓ {labels.source}</span></div><p className="border-b border-brand-100 px-4 py-3 text-sm text-ink-600">{labels.locked}</p>{items.length?<ul className="divide-y divide-line">{items.map(item=><li key={item.sortOrder} className="flex items-baseline justify-between gap-4 px-4 py-3"><span className="font-semibold">{item.description}</span><span className="text-end"><strong className="block whitespace-nowrap">{quoted&&item.quotedPrice!=null?money(item.quotedPrice,proposalCurrency,locale):money(item.unitPrice,baseCurrency,locale)}</strong>{quoted&&<span className="block whitespace-nowrap text-[0.8125rem] text-ink-500">{locale==="ar"?"الأساس":"Base"} {money(item.unitPrice,baseCurrency,locale)}</span>}</span></li>)}<li className="flex items-baseline justify-between gap-4 bg-brand-50 px-4 py-3"><span className="font-bold">{locale==="ar"?"الإجمالي":"Total"}</span><span className="text-end"><strong className="block whitespace-nowrap">{quotedTotal!=null?money(quotedTotal,proposalCurrency,locale):money(total,baseCurrency,locale)}</strong>{quotedTotal!=null&&<span className="block whitespace-nowrap text-[0.8125rem] text-ink-500">{locale==="ar"?"الأساس":"Base"} {money(total,baseCurrency,locale)}</span>}</span></li></ul>:<p className="bg-alert-50 p-4 text-sm font-semibold text-alert-800">{labels.missing}</p>}{rateNote&&<p className="border-t border-brand-100 px-4 py-2 text-[0.8125rem] text-ink-500">{rateNote}</p>}{rateUnavailable&&<p role="alert" className="border-t border-alert-200 bg-alert-50 px-4 py-3 text-sm font-semibold text-alert-800">{locale==="ar"?`لا يتوفر سعر صرف لعملة ${proposalCurrency} حاليًا، لذلك لا يمكن عرض المبالغ بها ولا إنشاء العرض حتى يتوفر السعر.`:`No exchange rate is available for ${proposalCurrency} right now, so the amounts cannot be quoted in it and the proposal cannot be created until a rate is available.`}</p>}</div>
  <div><label className="block"><span className="title text-base">{labels.coordination}</span><span className="mt-1 block text-sm text-ink-500">{labels.coordinationHint}</span><textarea className="field mt-2 min-h-24" maxLength={20000} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
  <button type="button" disabled={busy||!items.length||rateUnavailable} className="btn-primary w-full justify-center py-3 text-base sm:w-auto" onClick={send}>{t.createProposal}</button>
 </div>;
}

function ProposalShareLinks({share}:{share:{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string}}){
 const {locale,t}=useCaseWorkspace();
 const[copied,setCopied]=useState(false);
 const base=typeof window!=="undefined"?window.location.origin:SITE_URL;
 const link=`${base}/${locale}/proposal/${share.token}`;
 const msg=`RehletShifaa — your treatment proposal${share.caseNumber?` (${share.caseNumber})`:""}: ${link}`;
 const wa=share.whatsapp?`https://wa.me/${share.whatsapp.replace(/[^0-9]/g,"")}?text=${encodeURIComponent(msg)}`:undefined;
 const mail=`mailto:${share.email??""}?subject=${encodeURIComponent("Your RehletShifaa proposal")}&body=${encodeURIComponent(msg)}`;
 const doCopy=()=>{void navigator.clipboard?.writeText(link).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);});};
 return <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4"><p className="mb-3 text-sm font-bold text-brand-800">{t.linkReady}</p><p className="mb-3 break-all rounded-lg bg-white p-2 text-sm">{link}</p><div className="flex flex-wrap gap-2">{wa&&<a className="btn-primary" href={wa} target="_blank" rel="noopener noreferrer">{t.sendWhatsapp}</a>}<a className={`btn-secondary ${share.email?"":"pointer-events-none opacity-50"}`} href={mail}>{share.email?t.sendEmail:t.noPatientEmail}</a><button type="button" className="btn-secondary" onClick={doCopy}>{copied?t.copied:t.copyLink}</button></div></div>;
}

function FinalAssessment(){
 const {locale,c:{id:caseId},busy,mutate,catalog,fxRates}=useCaseWorkspace();
 const[treatment,setTreatment]=useState("");const[risks,setRisks]=useState("");const[currency,setCurrency]=useState("EGP");const[costs,setCosts]=useState([{description:"",amount:""}]);const[selected,setSelected]=useState<Set<string>>(new Set());
 const g=locale==="ar"?{title:"الفحص السريري النهائي",intro:"سجّل تقييمك بعد فحص المريض. سيبني المنسق العرض النهائي من الخدمات المؤكدة.",treatment:"العلاج النهائي الموصى به",risks:"المخاطر والقيود",services:"خدماتك المعتمدة",manual:"خدمة غير مدرجة (تتطلب موافقة مالية)",currency:"عملة العرض",add:"إضافة خدمة",save:"حفظ التقييم النهائي",service:"الخدمة",amount:"المبلغ"}:{title:"Final in-person assessment",intro:"Record your assessment after examining the patient. The coordinator builds the final quote from the confirmed services.",treatment:"Final recommended treatment",risks:"Risks & limitations",services:"Your approved services",manual:"Service not on your list (needs finance approval)",currency:"Display currency",add:"Add a service",save:"Save final assessment",service:"Service",amount:"Amount"};
 const currencyOptions=["EGP",...fxRates.filter(f=>f.currency!=="EGP").map(f=>f.currency)];const rate=currency==="EGP"?1:(fxRates.find(f=>f.currency===currency)?.rate??1);
 const toggle=(id:string)=>setSelected(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n;});
 const updateCost=(i:number,f:"description"|"amount",val:string)=>setCosts(rows=>rows.map((row,idx)=>idx===i?{...row,[f]:val}:row));
 // Catalogue picks travel at their approved EGP price; the selector above only changes what is displayed.
 const save=()=>{const picks=catalog.filter(s=>selected.has(s.id)).map(s=>({serviceDescription:s.serviceName,estimatedCost:s.priceEgp,currency:"EGP",catalogServiceId:s.id}));const manual=costs.filter(row=>row.description.trim()&&row.amount!=="").map(row=>({serviceDescription:row.description.trim(),estimatedCost:Math.round((Number(row.amount)||0)*100)/100,currency}));if(!picks.length&&!manual.length)return;void mutate(`/doctor/cases/${caseId}/final-assessment`,{recommendedTreatment:treatment,risksAndLimitations:risks,costEstimates:[...picks,...manual]}).then(r=>{if(r){setTreatment("");setRisks("");setCosts([{description:"",amount:""}]);setSelected(new Set());}});};
 return <div className="mt-4 space-y-4 border-t border-line pt-4">
  <div><h4 className="title text-base">{g.title}</h4><p className="mt-1 text-sm text-ink-500">{g.intro}</p></div>
  <label className="block text-sm font-bold">{g.treatment}<textarea className="field mt-1" value={treatment} onChange={e=>setTreatment(e.target.value)}/></label>
  <label className="block text-sm font-bold">{g.risks}<textarea className="field mt-1" value={risks} onChange={e=>setRisks(e.target.value)}/></label>
  <div className="rounded-lg border border-brand-200 bg-brand-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-brand-800">{g.services}</span><select aria-label={g.currency} className="field !mt-0 w-auto py-1" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(code=><option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale]??code}</option>)}</select></div>
   {catalog.length>0&&<div className="mt-2 space-y-1.5">{catalog.map(s=>{const on=selected.has(s.id);return <button type="button" key={s.id} onClick={()=>toggle(s.id)} aria-pressed={on} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-start transition ${on?"border-brand-500 bg-white":"border-line bg-white/60"}`}><span className="flex items-center gap-2.5"><span className={`flex h-5 w-5 flex-none items-center justify-center rounded border text-[0.8125rem] ${on?"border-brand-500 bg-brand-500 text-white":"border-line"}`} aria-hidden>{on?"✓":""}</span><span className="text-sm font-semibold text-ink-800">{s.serviceName}</span></span><span className="text-sm font-bold">{money(s.priceEgp*rate,currency,locale)}</span></button>;})}</div>}
   <p className="mt-3 text-sm font-bold text-ink-700">{g.manual}</p>
   <div className="mt-1 space-y-2">{costs.map((row,i)=><div key={i} className="flex gap-2"><input aria-label={g.service} className="field flex-1" value={row.description} onChange={e=>updateCost(i,"description",e.target.value)} placeholder={g.service}/><input aria-label={g.amount} className="field w-32" type="number" min="0" step="0.01" value={row.amount} onChange={e=>updateCost(i,"amount",e.target.value)} placeholder={`${g.amount} (${currency})`}/>{costs.length>1&&<button type="button" className="btn-secondary" onClick={()=>setCosts(rows=>rows.filter((_,idx)=>idx!==i))} aria-label={locale==="ar"?"إزالة الخدمة":"Remove service"}>×</button>}</div>)}</div>
   <button type="button" className="btn-secondary mt-2" onClick={()=>setCosts(rows=>[...rows,{description:"",amount:""}])}>+ {g.add}</button>
  </div>
  <button className="btn-primary w-full sm:w-auto" disabled={busy} onClick={save}>{g.save}</button>
 </div>;
}

function FinalQuoteActions({reviewId,proposal,gates}:{reviewId?:string;proposal?:Proposal;gates?:ProposalGates|null}){
 const {locale,c:{id:caseId},busy,mutate,fxRates}=useCaseWorkspace();
 const[currency,setCurrency]=useState("EGP");const[scope,setScope]=useState("");
 const g=locale==="ar"?{title:"العرض النهائي",createIntro:"أنشئ العرض النهائي من التقييم النهائي المعتمد. لا يتغيّر وضع الحالة.",currency:"عملة عرض المريض",scope:"سبب تغيّر النطاق مقارنةً بالتقدير المبدئي",create:"إنشاء العرض النهائي",release:"إرسال العرض النهائي للمريض",releaseHint:"يُرسل رابطًا آمنًا. تبقى الحالة عند «تأكيد الوصول».",needReview:"يجب أن يسجّل الطبيب تقييمًا نهائيًا معتمدًا أولًا.",financeWait:"بانتظار الموافقة المالية على الخدمات المُدخلة يدويًا."}:{title:"Final treatment quote",createIntro:"Create the final quote from the approved final assessment. The case status does not change.",currency:"Patient's quote currency",scope:"Why the scope changed vs the preliminary estimate",create:"Create final quote",release:"Send final quote to patient",releaseHint:"Sends a secure link. The case stays at arrival confirmed.",needReview:"The doctor must record an approved final assessment first.",financeWait:"Waiting for finance approval of the manually-priced services."};
 const currencyOptions=["EGP",...fxRates.filter(f=>f.currency!=="EGP").map(f=>f.currency)];
 const isFinalDraft=proposal?.documentType==="FINAL_TREATMENT_QUOTE"&&["CLINICALLY_APPROVED","FINANCE_APPROVED"].includes(proposal.status);
 if(isFinalDraft&&proposal)return <div className="mt-4 rounded-lg border border-brand-200 p-4"><h4 className="font-bold text-brand-800">{g.title}</h4>{gates?.financeRequired&&!gates.financeCompleted?<p className="mt-2 text-sm text-alert-700">{g.financeWait}</p>:null}<button className="btn-primary mt-3" disabled={busy||!gates?.readyForRelease} onClick={()=>void mutate(`/coordinator/cases/${caseId}/final-quotes/${proposal.versionId}/release`)}>{g.release}</button><p className="mt-2 text-[0.8125rem] text-ink-500">{g.releaseHint}</p></div>;
 if(proposal?.documentType==="FINAL_TREATMENT_QUOTE")return null;
 return <div className="mt-4 rounded-lg border border-brand-200 p-4"><h4 className="font-bold text-brand-800">{g.title}</h4><p className="mt-1 text-sm text-ink-500">{g.createIntro}</p>{!reviewId?<p className="mt-2 text-sm text-ink-500">{g.needReview}</p>:<><label className="mt-3 block text-sm font-bold">{g.currency}<select className="field mt-1 w-auto" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(code=><option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale]??code}</option>)}</select></label><label className="mt-3 block text-sm font-bold">{g.scope}<textarea className="field mt-1" rows={2} value={scope} onChange={e=>setScope(e.target.value)}/></label><button className="btn-primary mt-3" disabled={busy} onClick={()=>{const validUntil=validUntilInDays(14);void mutate(`/coordinator/cases/${caseId}/final-quotes`,{clinicalReviewId:reviewId,currency,scopeChangeReason:scope||undefined,validUntil});}}>{g.create}</button></>}</div>;
}

function DepositCard({deposit}:{deposit:DepositView}){
 const {locale,role,c:{id:caseId},busy,mutate}=useCaseWorkspace();
 const confirmCopy=useWorkCopy().confirm;
 // A refund is money leaving: the amount is read back before it is recorded.
 const [refund,setRefund]=useState<{form:HTMLFormElement;amountEgp:number;reason:string}|null>(null);
 const isFinance=role==="finance";
 const g=locale==="ar"?{title:"وديعة التنسيق والدفعات",total:"الإجمالي",paid:"المدفوع",balance:"المتبقي",record:"تسجيل دفعة",refund:"تسجيل استرداد",amount:"المبلغ (ج.م)",method:"الطريقة",reference:"مرجع المزوّد",reason:"سبب الاسترداد",note:"تسجيل دون اتصال فقط — يسجّل الدفعات المستلمة فعليًا؛ لا تُدخل بيانات بطاقة.",credited:"تُخصم من الرصيد النهائي",REQUESTED:"مطلوبة",PARTIALLY_PAID:"مدفوعة جزئيًا",PAID:"مدفوعة",CANCELLED:"ملغاة",REFUNDED:"مستردة"}:{title:"Coordination deposit & payments",total:"Total",paid:"Paid",balance:"Balance",record:"Record a payment",refund:"Record a refund",amount:"Amount (EGP)",method:"Method",reference:"Provider reference",reason:"Refund reason",note:"Offline record-only — records payments actually received; no card data is entered.",credited:"credited to final",REQUESTED:"Requested",PARTIALLY_PAID:"Partially paid",PAID:"Paid",CANCELLED:"Cancelled",REFUNDED:"Refunded"};
 const money=(n?:number)=>n==null?"—":new Intl.NumberFormat(intlLocale(locale),{style:"currency",currency:deposit.currency||"EGP"}).format(n);
 const label=(g as Record<string,string>)[deposit.status]??deposit.status;
 const cls=deposit.status==="PAID"?"bg-brand-50 text-brand-700":(deposit.status==="REFUNDED"||deposit.status==="CANCELLED")?"bg-mist text-ink-600":"bg-alert-50 text-alert-700";
 return <div className="mt-4 rounded-lg border border-line p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-ink-800">{g.title}</h4><span className={`rounded px-2 py-0.5 text-[0.8125rem] font-bold ${cls}`}>{label}</span></div>
  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3"><div><span className="text-ink-500">{g.total}</span><br/><strong>{money(deposit.totalDisplay)}</strong></div><div><span className="text-ink-500">{g.paid}</span><br/><strong>{money(deposit.paidDisplay)}</strong></div><div><span className="text-ink-500">{g.balance}</span><br/><strong>{money(deposit.balanceDisplay)}</strong></div></div>
  {deposit.components.length>0&&<ul className="mt-3 space-y-1 text-sm">{deposit.components.map((cp,i)=><li key={i} className="flex justify-between gap-3"><span>{cp.purpose} <span className="text-[0.8125rem] text-ink-400">({cp.beneficiary}{cp.creditedToFinal?` · ${g.credited}`:""})</span></span><strong className="whitespace-nowrap">{money(cp.amountDisplay)}</strong></li>)}</ul>}
  {isFinance&&<>
   <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);void mutate(`/finance/cases/${caseId}/deposits/${deposit.id}/payments`,{amountEgp:Number(d.get("amount"))||0,method:String(d.get("method")||"")||undefined,providerReference:String(d.get("reference")||"")||undefined,idempotencyKey:crypto.randomUUID()}).then(result=>{if(result)f.reset();});}}>
    <label className="text-[0.8125rem] font-bold">{g.amount}<input className="field w-28" name="amount" type="number" min="0.01" step="0.01" required/></label>
    <label className="text-[0.8125rem] font-bold">{g.method}<input className="field w-28" name="method" placeholder="Bank"/></label>
    <label className="text-[0.8125rem] font-bold">{g.reference}<input className="field w-32" name="reference"/></label>
    <button className="btn-primary" disabled={busy}>{g.record}</button>
   </form>
   <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);setRefund({form:f,amountEgp:Number(d.get("amount"))||0,reason:String(d.get("reason")||"").trim()});}}>
    <label className="text-[0.8125rem] font-bold">{g.amount}<input className="field w-28" name="amount" type="number" min="0.01" step="0.01" required/></label>
    <label className="flex-1 text-[0.8125rem] font-bold">{g.reason}<input className="field" name="reason" required/></label>
    <button className="btn-secondary" disabled={busy}>{g.refund}</button>
   </form>
   <p className="mt-2 text-[0.8125rem] text-ink-500">{g.note}</p>
  </>}
  {refund&&<ConfirmDialog title={fillTemplate(confirmCopy.refundTitle,{amount:new Intl.NumberFormat(intlLocale(locale),{style:"currency",currency:"EGP"}).format(refund.amountEgp)})} body={confirmCopy.refundBody} confirm={confirmCopy.refund} cancel={confirmCopy.cancel}
   onCancel={()=>setRefund(null)} onConfirm={()=>{const r=refund;setRefund(null);void mutate(`/finance/cases/${caseId}/deposits/${deposit.id}/refunds`,{amountEgp:r.amountEgp,reason:r.reason,idempotencyKey:crypto.randomUUID()}).then(result=>{if(result)r.form.reset();});}}/>}
 </div>;
}

function DeliveryCard({delivery,versionId,canResend=true}:{delivery:DeliveryStatus;versionId:string;canResend?:boolean}){
 const {locale,c:{id:caseId},busy,mutate}=useCaseWorkspace();
 const confirmCopy=useWorkCopy().confirm;const [resending,setResending]=useState(false);
 const g=locale==="ar"?{title:"حالة إرسال الرابط الآمن",channel:"القناة",to:"إلى",attempts:"المحاولات",resend:"إعادة إرسال الرابط",QUEUED:"في قائمة الإرسال",DELIVERED:"تم التسليم",RETRY:"إعادة المحاولة",FAILED:"فشل الإرسال",resendHint:"يُلغي الرابط ورمز التحقق السابقين ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرضًا جديدًا ولا يغيّر حالة الطلب."}:{title:"Secure link delivery",channel:"Channel",to:"To",attempts:"Attempts",resend:"Resend link",QUEUED:"Queued",DELIVERED:"Delivered",RETRY:"Retrying",FAILED:"Failed",resendHint:"Revokes the previous link and code and sends a fresh secure link to the patient's verified contact. It does not create a new proposal or change the case."};
 const label=(g as Record<string,string>)[delivery.status]??delivery.status;
 const cls=delivery.status==="DELIVERED"?"bg-brand-50 text-brand-700":delivery.status==="FAILED"?"bg-alert-50 text-alert-700":"bg-mist text-ink-600";
 return <div className="mt-4 rounded-lg border border-line p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-ink-800">{g.title}</p><span className={`rounded px-2 py-0.5 text-[0.8125rem] font-bold ${cls}`}>{label}</span></div>
  <p className="mt-2 text-sm text-ink-600">{g.channel}: <strong>{delivery.channel}</strong> · {g.to} <span dir="ltr">{delivery.destinationMasked}</span>{delivery.attempts>0?` · ${g.attempts}: ${delivery.attempts}`:""}</p>
  {canResend&&<button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>setResending(true)}>{g.resend}</button>}
  {canResend&&<p className="mt-2 text-[0.8125rem] text-ink-500">{g.resendHint}</p>}
  {resending&&<ConfirmDialog title={confirmCopy.resendTitle} body={confirmCopy.resendBody} confirm={confirmCopy.resend} cancel={confirmCopy.cancel}
   onCancel={()=>setResending(false)} onConfirm={()=>{setResending(false);void mutate(`/coordinator/cases/${caseId}/proposals/${versionId}/resend`);}}/>}</div>;
}

/** Also rendered on its own (`AuthoritativeActions.test.tsx`), so it keeps explicit props rather than reading the case workspace. */
export function RoleActions({role,t,c,proposal,gates,availableActions,locale,mutate}:{role:RoleKey;t:typeof copy.en;c:CaseView;proposal?:Proposal;gates?:ProposalGates|null;availableActions:string[];locale:Locale;mutate:Mutate}){
 const[operationsPlan,setOperationsPlan]=useState(proposal?.operationalPlan??"");
 const gl=locale==="ar"?{checklist:"متطلبات الإرسال",operations:"العمليات (باقة السفر)",finance:"الموافقة المالية",notReq:"غير مطلوب",waiting:"بانتظار",done:"مكتمل",releaseHint:"يُفعَّل الإرسال بعد اكتمال جميع المتطلبات."}:{checklist:"Release requirements",operations:"Operations (travel package)",finance:"Finance approval",notReq:"Not required",waiting:"Waiting",done:"Complete",releaseHint:"Release unlocks once every required step is complete."};
 const badge=(required:boolean,done:boolean)=>{const s=!required?gl.notReq:done?gl.done:gl.waiting;const cls=!required?"bg-mist text-ink-500":done?"bg-brand-50 text-brand-700":"bg-alert-50 text-alert-700";return <span className={`rounded px-2 py-0.5 text-[0.8125rem] font-bold ${cls}`}>{s}</span>;};
 const checklist=gates&&["coordinator","operations","finance"].includes(role)?<div className="mt-4 rounded-lg border border-line p-3"><p className="mb-2 text-sm font-bold text-ink-800">{gl.checklist}</p><div className="space-y-1.5 text-sm"><div className="flex items-center justify-between gap-2"><span>{gl.operations}</span>{badge(gates.operationsRequired,gates.operationsCompleted)}</div><div className="flex items-center justify-between gap-2"><span>{gl.finance}</span>{badge(gates.financeRequired,gates.financeCompleted)}</div></div>{gates.financeRequired&&gates.financeReasons.length>0&&<p className="mt-2 text-[0.8125rem] text-ink-500">{gates.financeReasons.join(" ")}</p>}</div>:null;
 if(role==="operations")return <>{checklist}{availableActions.includes("UPDATE_TRAVEL_PLAN")&&proposal?.status==="CLINICALLY_APPROVED"?<div className="mt-4 space-y-3"><textarea className="field min-h-28" aria-label={t.operationsComplete} maxLength={30000} required value={operationsPlan} onChange={event=>setOperationsPlan(event.target.value)}/><button className="btn-primary" disabled={!operationsPlan.trim()} onClick={()=>void mutate(`/operations/cases/${c.id}/proposals/${proposal.versionId}/complete`,{plan:operationsPlan.trim()})}>{t.operationsComplete}</button></div>:null}</>;
 if(role==="finance")return <>{checklist}{availableActions.includes("APPROVE_COMMERCIAL_TERMS")&&proposal?<button className="btn-primary mt-4" onClick={()=>void mutate(`/finance/cases/${c.id}/proposals/${proposal.versionId}/approve`)}>{t.financeApprove}</button>:null}</>;
 if(role==="coordinator")return <>{checklist}{gates?.readyForRelease&&proposal?<div className="mt-4"><button className="btn-primary" onClick={()=>void mutate(`/coordinator/cases/${c.id}/proposals/${proposal.versionId}/release`)}>{t.release}</button><p className="mt-2 text-[0.8125rem] text-ink-500">{gl.releaseHint}</p></div>:(gates&&!gates.readyForRelease?<p className="mt-3 text-[0.8125rem] text-ink-500">{gl.releaseHint}</p>:null)}</>;
 return null;
}

function ProposalCard({proposal}:{proposal:Proposal}){const work=useWorkCopy();const {locale,t}=useCaseWorkspace();const total=proposal.items.filter(i=>!i.optional).reduce((sum,i)=>sum+i.quantity*i.unitPrice,0);return <div className="rounded-lg bg-brand-50 p-5"><div className="flex justify-between gap-3"><strong>{fillTemplate(work.proposalVersion,{number:new Intl.NumberFormat(intlLocale(locale)).format(proposal.versionNumber)})} · {statusLabel(proposal.status,locale)}</strong><strong>{new Intl.NumberFormat(intlLocale(locale),{style:"currency",currency:proposal.currency}).format(total)}</strong></div><ul className="mt-3 space-y-1">{proposal.items.map(item=><li key={item.id} className="flex justify-between gap-3"><span>{item.description}{item.quantity>1?` × ${item.quantity}`:""}{item.optional?(locale==="ar"?" (اختياري)":" (optional)"):""}</span><strong className="whitespace-nowrap">{money(item.quantity*item.unitPrice,proposal.currency,locale)}</strong></li>)}</ul>{proposal.coordinatorNotes&&<div className="mt-3 rounded-lg bg-white/70 p-3 text-sm"><p className="font-bold text-brand-700">{t.proposalNotesLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{proposal.coordinatorNotes}</p></div>}{proposal.validUntil&&<p className="mt-3 text-sm">{locale==="ar"?"صالح حتى":"Valid until"} {new Intl.DateTimeFormat(intlLocale(locale)).format(new Date(proposal.validUntil))}</p>}</div>}
