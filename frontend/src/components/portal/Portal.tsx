"use client";

import { NoPortalWorkspace } from "./NoPortalWorkspace";
import { useVirtualClinics, virtualClinicHref } from "@/components/virtual-clinic/virtual-clinic-model";
import { ConsultantReferrals } from "@/components/portal/ConsultantRouting";
import { ReauthenticationReturnNotice } from "@/components/ReauthenticationNotices";
import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageSquare, MoreHorizontal, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { CaseWorkflowActions } from "@/components/portal/CaseWorkflowActions";
import { CaseBlockers } from "@/components/portal/CaseBlockers";
import { CoordinatorActionForm, MoreActions } from "@/components/portal/CoordinatorActions";
import { RecordPatientResponse } from "@/components/portal/RecordPatientResponse";
import { RecordProposalDecision } from "@/components/portal/RecordProposalDecision";
import { CaseMessages } from "@/components/portal/CaseMessages";
import { PatientProposal, PatientProposalDecision, type ProposalCopy } from "@/components/portal/PatientProposal";
import { PortalAccount, type Preferences } from "@/components/portal/PortalAccount";
import { RoleDashboardSummary, matchesKpi } from "@/components/portal/RoleDashboardSummary";
import { CaseQueue, initialQueue, ownershipTab, type QueueState } from "@/components/portal/CaseQueue";
import { StaffNav, StaffViewLinks, type StaffViewId, type StaffViewItem } from "@/components/portal/StaffNav";
import { JourneyPulse, FullJourneyDialog } from "@/components/portal/JourneySnapshot";
import { CurrentActionPanel, type CaseActions } from "@/components/portal/CurrentAction";
import { ClinicalReviewPanel } from "@/components/portal/ClinicalReview";
import { DeclineAssignmentDialog } from "@/components/portal/DeclineAssignmentDialog";
import { MyCare, type CareView, type PatientProposalState } from "@/components/portal/MyCare";
import { PatientIdentityStep } from "@/components/portal/PatientIdentityStep";
import { PatientNav } from "@/components/portal/PatientNav";
import { RequestInformationDialog } from "@/components/portal/RequestInformationDialog";
import { MyWork, type WorkItem } from "@/components/portal/MyWork";
import { WorkCopyProvider, useWorkCopy } from "@/components/portal/portal-copy";
import { careAreaLabel, coordinatorLabel, tabKeyTarget, waitingLabel, type WorkCopy } from "@/lib/portal-labels";
import { TransferOwnership } from "@/components/portal/TransferOwnership";
import { AssignmentHistory, type AssignmentHistoryEntry } from "@/components/portal/AssignmentHistory";
import { NotificationBell } from "@/components/portal/NotificationBell";
import { AccountLinkRequest } from "@/components/portal/AccountLinkRequest";
import { ccHref } from "@/components/platform-control-center/control-center-nav";
import { useControlCenterEntry } from "@/components/platform-control-center/ControlCenterNavigation";
import type { Locale } from "@/lib/i18n";
import { holds, leadsTeam, opensControlCenter, portalViews, type PortalView as RoleKey } from "@/lib/access";
import { useRouter } from "next/navigation";
import { apiFetchAs, SITE_URL } from "@/lib/api";
import { scrollIntoView } from "@/lib/scroll";
import { PROPOSAL_PAYMENT_TERMS_RECORD } from "@/lib/commercial-terms";

type CaseView={id:string;caseNumber:string;waitingOn?:string|null;waitingReason?:string|null;status:string;patientName:string;country:string;preferredLanguage:string;careCategory?:string;createdAt:string;updatedAt:string;version:number;coordinatorSubject?:string;doctorSubject?:string;coordinatorName?:string;doctorName?:string;travelPackageRequested?:boolean;assignmentId?:string;assignmentStatus?:string;openTaskCount?:number;overdueTaskCount?:number;documentCount?:number};
type StaffCaseResponse={caseSummary:CaseView;assignmentId?:string;assignmentStatus?:string;openTaskCount:number;overdueTaskCount:number;documentCount:number};
type CatalogService={id:string;serviceCode:string;serviceName:string;category?:string;priceEgp:number;active:boolean};
type FxRate={currency:string;rate:number;rateDate:string;source:string};
const REFERRAL_ASSIGNMENTS=["TRANSFER","SECOND_OPINION"];const REFERRAL_CONFIRM_WORK=["CONFIRM_TRANSFER","CONFIRM_SECOND_OPINION"];
type Assignment={id:string;assigneeSubject:string;assigneeName?:string|null;assigneeRole:string;assignmentType:string;status:string;assignedAt:string;version:number};
type CaseDocument={documentId:string;fileName:string;contentType:string;sizeBytes:number;status:string;createdAt:string;confirmedAt?:string};
type VerifiedDoctor={subject:string;displayName:string;specialty?:string;subspecialty?:string;availabilityStatus?:string;careCategory?:string};
type DoctorProfile={displayName?:string;specialty?:string;subspecialty?:string;careCategory?:string;availabilityStatus?:string;credentialingStatus?:string};
type StaffProfile={displayName?:string;role?:string};
type CareCategory={slug:string;nameEn:string;nameAr:string};
type StaffMember={subject:string;name:string;role:string};
type CostEstimate={serviceDescription:string;estimatedCost:number;currency:string;catalogServiceId?:string|null;quotedCost?:number|null;quotedCurrency?:string|null};
type Review={id:string;versionNumber:number;status:string;suitability?:string;recommendedTreatment?:string;risksAndLimitations?:string;createdAt:string;costEstimates?:CostEstimate[];proposalCurrency?:string|null;quoteRate?:number|null;quoteRateDate?:string|null;quoteRateSource?:string|null};
type ProposalItem={id:string;category:string;description:string;quantity:number;unitPrice:number;optional:boolean};
type Proposal={proposalId:string;versionId:string;versionNumber:number;status:string;language:string;currency:string;validUntil?:string;operationalPlan?:string;items:ProposalItem[];coordinatorNotes?:string;documentType?:string;scopeChangeReason?:string};
type Task={id:string;caseId:string;careCategory?:string|null;coordinatorName?:string|null;documentCount?:number;title:string;description?:string;ownerSubject?:string;status:string;priority:string;blocking:boolean;overdue:boolean;version:number;caseNumber?:string;patientName?:string|null;caseStatus?:string;waitingOn?:string|null;type?:string;context?:string|null;dueAt?:string|null;createdAt?:string};
type ProposalGates={operationsRequired:boolean;operationsReason:string;operationsCompleted:boolean;financeRequired:boolean;financeReasons:string[];financeCompleted:boolean;readyForRelease:boolean};
type DeliveryStatus={status:string;channel:string;destinationMasked:string;attempts:number;deliveredAt?:string;nextAttemptAt?:string};
type DepositComponentT={beneficiary:string;purpose:string;amountEgp:number;amountDisplay?:number;refundability:string;cancellationTerms?:string;creditedToFinal:boolean};
type PaymentEvent={eventType:string;amountDisplay?:number;currency?:string;method?:string;provider?:string;providerReference?:string;status:string;reason?:string;occurredAt?:string};
type DepositView={id:string;status:string;currency:string;totalEgp:number;totalDisplay?:number;paidDisplay?:number;balanceDisplay?:number;components:DepositComponentT[];events:PaymentEvent[]};
type Workspace={preview?:boolean;intakeSummary?:string;patientAction?:{taskId:string;title:string;message?:string;blocking:boolean;dueAt?:string;items:{id:string;kind:string;code:string;label:string;required:boolean;completed:boolean;response?:string}[]}|null;caseSummary:CaseView;timeline:{type:string;label:string;occurredAt:string;status:string}[];tasks:Task[];messages:{id:string;senderRole:string;senderName?:string;direction:string;body:string;createdAt:string;internalOnly:boolean;read:boolean}[];assignments:Assignment[];clinicalReviews:Review[];proposal?:Proposal;gates?:ProposalGates|null;delivery?:DeliveryStatus|null;deposit?:DepositView|null;actions?:CaseActions|null;patientProposal?:PatientProposalState|null};
type MutationResult={id?:string;status?:string};
type Mutate=(path:string,body?:unknown,method?:string)=>Promise<MutationResult|undefined>;

/** A rejected command means the rendered action contract may be stale; refresh it before showing the error. */
export async function refreshAfterRejectedAction(path:string,workspace:Workspace|null,refresh:()=>Promise<void>,reopen:(item:CaseView)=>Promise<void>){
 if(path.endsWith("/claim")){await refresh();return;}
 await refresh();if(workspace)await reopen(workspace.caseSummary);
}

function normalizeCases(rows:(CaseView|StaffCaseResponse)[]):CaseView[]{return rows.map(row=>"caseSummary" in row?{...row.caseSummary,assignmentId:row.assignmentId,assignmentStatus:row.assignmentStatus,openTaskCount:row.openTaskCount,overdueTaskCount:row.overdueTaskCount,documentCount:row.documentCount}:row);}
// Display labels for currencies the doctor can view/quote in (EGP is the base).
const CURRENCY_LABELS:Record<string,{en:string;ar:string}>={USD:{en:"USD — US Dollar",ar:"USD — دولار أمريكي"},EUR:{en:"EUR — Euro",ar:"EUR — يورو"},EGP:{en:"EGP — Egyptian Pound",ar:"EGP — جنيه مصري"},AED:{en:"AED — UAE Dirham",ar:"AED — درهم إماراتي"},SAR:{en:"SAR — Saudi Riyal",ar:"SAR — ريال سعودي"},GBP:{en:"GBP — British Pound",ar:"GBP — جنيه إسترليني"},KWD:{en:"KWD — Kuwaiti Dinar",ar:"KWD — دينار كويتي"},QAR:{en:"QAR — Qatari Riyal",ar:"QAR — ريال قطري"},JOD:{en:"JOD — Jordanian Dinar",ar:"JOD — دينار أردني"}};
function money(amount:number,currency:string,locale:Locale){try{return new Intl.NumberFormat(locale,{style:"currency",currency}).format(amount);}catch{return `${amount.toLocaleString(locale)} ${currency}`;}}
const copy={
  en:{title:"Secure care portal",subtitle:"One accountable workspace from intake through treatment and follow-up.",signIn:"Sign in securely",signOut:"Sign out",loading:"Loading your workspace…",noCases:"No cases are available in this queue.",grpAction:"Action required",grpTracking:"Tracking — latest status",grpMoreInfo:"More information requested",grpNotSuitable:"Not clinically suitable",claimTitle:"Link an existing request",caseId:"Case ID",code:"6-digit verification code",claim:"Link case",open:"Open workspace",back:"Back to queue",timeline:"Case journey",tasks:"Tasks",messages:"Secure messages",send:"Send message",message:"Write a message",assignments:"Care team",documents:"Patient documents",download:"Download",docScanning:"Security scan in progress",docUnavailable:"Unavailable",noDocuments:"No documents uploaded yet.",reviews:"Doctor reviews",coordinatorLabel:"Coordinator",consultantLabel:"Consultant",you:"You",signedInAs:"Signed in as",myDashboard:"My dashboard",caseWorkspaceLabel:"Case workspace",patientLabel:"Patient",careArea:"Care area",languageLabel:"Language",updatedLabel:"Last updated",countryLabel:"Country",estimatedByConsultant:"Cost estimate by the consultant",prefilledFromReview:"Pre-filled from the consultant's cost estimate — adjust before sending.",servicesFromConsultant:"Services & costs",additionalCostTitle:"Additional cost (optional)",additionalCostHint:"An extra optional item, shown separately and not added to the base total.",additionalCostDesc:"What is it for?",commentsTitle:"Comments for the patient (optional)",commentsHint:"Shown on the proposal alongside the recommendation and services.",proposalNotesLabel:"Coordinator note",assignedToYou:"You've been assigned to this case — accept to start your review.",doctorAccepted:"Case accepted and assigned back to the coordinator.",doctorInfoSent:"More information requested — assigned back to the coordinator.",doctorNotSuitable:"Marked not clinically suitable and returned to the coordinator.",doctorReturned:"This case has been returned to the coordinator.",proposal:"Patient proposal",genSend:"Generate & send proposal",addService:"Add service",sendWhatsapp:"Send on WhatsApp",sendEmail:"Send by email",copyLink:"Copy link",copied:"Copied!",linkReady:"Proposal link ready — send it to the patient:",noPatientEmail:"No email on file",coordinatorClaim:"Take ownership",ownershipHint:"You have view-only access. Take ownership to assign a consultant, change status, or create a proposal.",ownedByOther:"Another coordinator owns this case — you have view-only access.",handoff:"This case is with {name} for consultant review. Actions are locked until the clinical recommendation is ready.",status:"Status",transition:"Move case",reason:"Reason for change",doctorSubject:"Doctor account subject",reviewTreatment:"Recommended treatment",reviewRisks:"Risks and limitations",saveReview:"Save clinical review",approveReview:"Approve review",createProposal:"Create proposal",item:"Service description",price:"Unit price",release:"Release to patient",operationsComplete:"Complete operational plan",financeApprove:"Approve commercial terms",accept:"Accept",decline:"Decline",revise:"Request revision",adminTitle:"Onboard a practitioner",coordinatorTitle:"Onboard a coordinator",coordinatorRole:"Coordinator role",name:"Legal name",subject:"Identity account subject",specialty:"Specialty",create:"Create profile",profileId:"Practitioner profile ID",credentialTitle:"Register verified credential",credentialType:"Credential type",reference:"Registration / license number",source:"Issuing authority",expires:"Expiry date",addCredential:"Add credential",decisionTitle:"Credentialing decision",approvePractitioner:"Approve practitioner",rejectPractitioner:"Reject practitioner",rejectionReason:"Rejection reason",success:"Saved successfully.",activated:"Your account is now linked to your case — welcome to your journey.",error:"The request could not be completed."},
  ar:{title:"بوابة رحلة الشفاء الآمنة",subtitle:"مساحة عمل مسؤولة واحدة من استقبال الحالة حتى العلاج والمتابعة.",signIn:"تسجيل الدخول الآمن",signOut:"تسجيل الخروج",loading:"جارٍ تحميل مساحة العمل…",noCases:"لا توجد حالات في قائمة العمل.",grpAction:"إجراء مطلوب",grpTracking:"المتابعة — آخر حالة",grpMoreInfo:"طلب معلومات إضافية",grpNotSuitable:"غير مناسبة سريريًا",claimTitle:"ربط طلب سابق",caseId:"معرّف الحالة",code:"رمز التحقق المكوّن من 6 أرقام",claim:"ربط الحالة",open:"فتح مساحة العمل",back:"العودة إلى القائمة",timeline:"رحلة الحالة",tasks:"المهام",messages:"الرسائل الآمنة",send:"إرسال الرسالة",message:"اكتب رسالة",assignments:"فريق الرعاية",documents:"مستندات المريض",download:"تنزيل",docScanning:"جارٍ الفحص الأمني",docUnavailable:"غير متاح",noDocuments:"لم يتم رفع أي مستندات بعد.",reviews:"مراجعات الطبيب",coordinatorLabel:"المنسق",consultantLabel:"الاستشاري",you:"أنت",signedInAs:"مسجّل الدخول باسم",myDashboard:"لوحة التحكم",caseWorkspaceLabel:"مساحة عمل الحالة",patientLabel:"المريض",careArea:"مجال الرعاية",languageLabel:"اللغة",updatedLabel:"آخر تحديث",countryLabel:"الدولة",estimatedByConsultant:"تقدير التكلفة من الاستشاري",prefilledFromReview:"معبأ مسبقًا من تقدير الاستشاري — عدّل قبل الإرسال.",servicesFromConsultant:"الخدمات والتكاليف",additionalCostTitle:"تكلفة إضافية (اختياري)",additionalCostHint:"بند اختياري إضافي، يُعرض بشكل منفصل ولا يُضاف إلى الإجمالي الأساسي.",additionalCostDesc:"ما الغرض منه؟",commentsTitle:"ملاحظات للمريض (اختياري)",commentsHint:"تظهر في العرض بجانب التوصية والخدمات.",proposalNotesLabel:"ملاحظة المنسق",assignedToYou:"تم تعيينك لهذه الحالة — اقبل لبدء مراجعتك.",doctorAccepted:"تم قبول الحالة وإعادتها إلى المنسق.",doctorInfoSent:"تم طلب معلومات إضافية — أُعيدت الحالة إلى المنسق.",doctorNotSuitable:"تم اعتبارها غير مناسبة سريريًا وأُعيدت إلى المنسق.",doctorReturned:"تمت إعادة هذه الحالة إلى المنسق.",proposal:"المقترح المقدم للمريض",genSend:"إنشاء وإرسال العرض",addService:"إضافة خدمة",sendWhatsapp:"إرسال عبر واتساب",sendEmail:"إرسال بالبريد",copyLink:"نسخ الرابط",copied:"تم النسخ!",linkReady:"رابط العرض جاهز — أرسله إلى المريض:",noPatientEmail:"لا يوجد بريد مسجّل",coordinatorClaim:"استلام مسؤولية الحالة",ownershipHint:"لديك صلاحية العرض فقط. استلم الحالة لتعيين استشاري أو تغيير الحالة أو إنشاء مقترح.",ownedByOther:"تملك هذه الحالة منسقة أخرى — لديك صلاحية العرض فقط.",handoff:"هذه الحالة قيد مراجعة الاستشاري {name}. الإجراءات مقفلة حتى تجهيز التوصية الطبية.",status:"الحالة",transition:"نقل الحالة",reason:"سبب التغيير",doctorSubject:"معرّف حساب الطبيب",reviewTreatment:"العلاج الموصى به",reviewRisks:"المخاطر والقيود",saveReview:"حفظ المراجعة الطبية",approveReview:"اعتماد المراجعة",createProposal:"إنشاء المقترح",item:"وصف الخدمة",price:"سعر الوحدة",release:"إرسال المقترح للمريض",operationsComplete:"استكمال الخطة التشغيلية",financeApprove:"اعتماد الشروط المالية",accept:"موافقة",decline:"رفض",revise:"طلب تعديل",adminTitle:"إضافة طبيب للنظام",coordinatorTitle:"إضافة منسق",coordinatorRole:"دور المنسق",name:"الاسم القانوني",subject:"معرّف حساب الهوية",specialty:"التخصص",create:"إنشاء الملف",profileId:"معرّف ملف الطبيب",credentialTitle:"تسجيل مستند اعتماد",credentialType:"نوع الاعتماد",reference:"رقم التسجيل أو الترخيص",source:"جهة الإصدار",expires:"تاريخ الانتهاء",addCredential:"إضافة الاعتماد",decisionTitle:"قرار اعتماد الطبيب",approvePractitioner:"اعتماد الطبيب",rejectPractitioner:"رفض الطبيب",rejectionReason:"سبب الرفض",success:"تم الحفظ بنجاح.",activated:"تم ربط حسابك بحالتك الآن — مرحبًا بك في رحلتك.",error:"تعذر إكمال الطلب."}
};

/** The portal with its staff work copy (from the server page) available to every queue, work list and case view. */
/**
 * The page's success and error messages, also shown inside an open drawer: a modal dialog makes the page banner inert and
 * unseen, so a drawer action would otherwise end with no visible result. A drawer clears them when it opens, so it only
 * shows what happened while it was open.
 */
type Feedback={notice:string;error:string;clear:()=>void};
const FeedbackContext=createContext<Feedback>({notice:"",error:"",clear:()=>{}});
export function Portal({workCopy,...props}:{locale:Locale;proposalCopy:ProposalCopy;workCopy:WorkCopy}){
  return <WorkCopyProvider copy={workCopy}><PortalView {...props}/></WorkCopyProvider>;
}

function PortalView({locale,proposalCopy}:{locale:Locale;proposalCopy:ProposalCopy}){
  const t=copy[locale];const work=useWorkCopy();const{user,me,loading,signIn,signOut,refreshMe}=useAuth();
  // Case workspaces come from /api/v1/me. Control Center work lives in the Control Center: an account with only that
  // lands there directly; everyone else reaches it from the account menu. A signed-in account with no workforce
  // workspace is a patient-side account: it opens My Care, where the account is bound to its patient record.
  const views=useMemo(()=>portalViews(me),[me]);
  const workforce=views.some(view=>view!=="patient");
  const controlCenterOnly=!!user&&!workforce&&opensControlCenter(me);
  // An invited workforce person whose activation was refused (STF-02) is not a patient-side account: they finish setup first.
  const awaitingActivation=!!me?.pendingActions.includes("ACTIVATE_ACCOUNT");
  const available=useMemo<RoleKey[]>(()=>workforce?views:me&&!controlCenterOnly&&!awaitingActivation?["patient"]:[],[views,workforce,me,controlCenterOnly,awaitingActivation]);
  const patientView=available.includes("patient");
  const controlCenter=useControlCenterEntry(locale);const router=useRouter();
  useEffect(()=>{if(controlCenterOnly)router.replace(ccHref(locale));},[controlCenterOnly,router,locale]);
  // Virtual clinic: a consultant opens their own; an account that only manages a consultant's clinic lands there.
  const clinicAccess=useVirtualClinics(!!user&&!controlCenterOnly);const hasClinic=clinicAccess.clinics.length>0;
  const[careEntry]=useState(()=>{if(typeof window==="undefined")return false;const q=new URLSearchParams(window.location.search);return q.get("workspace")==="care"||["link","case","continue"].some(k=>q.has(k));});
  const managedClinicLanding=!!user&&!workforce&&!careEntry&&clinicAccess.clinics.some(c=>c.relation==="PRACTICE_MANAGER");
  const deferPatient=!workforce&&!careEntry&&(clinicAccess.loading||managedClinicLanding);
  useEffect(()=>{if(managedClinicLanding)router.replace(virtualClinicHref(locale));},[managedClinicLanding,router,locale]);
  const[active,setActive]=useState<RoleKey|undefined>();const[cases,setCases]=useState<CaseView[]>([]);const[myTasks,setMyTasks]=useState<Task[]>([]);const[workspace,setWorkspace]=useState<Workspace|null>(null);const[documents,setDocuments]=useState<CaseDocument[]>([]);const[doctors,setDoctors]=useState<VerifiedDoctor[]>([]);const[categories,setCategories]=useState<CareCategory[]>([]);const[staff,setStaff]=useState<StaffMember[]>([]);const[share,setShare]=useState<{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string}|null>(null);const[doctorProfile,setDoctorProfile]=useState<DoctorProfile|null>(null);const[coordinatorProfile,setCoordinatorProfile]=useState<StaffProfile|null>(null);const[catalog,setCatalog]=useState<CatalogService[]>([]);const[fxRates,setFxRates]=useState<FxRate[]>([]);const[busy,setBusy]=useState(false);const[notice,setNotice]=useState("");const[error,setError]=useState("");
  const [preferences,setPreferences]=useState<Preferences>({displayName:null,locale:null});
  const [queueState,setQueueState]=useState<QueueState>(initialQueue);
  const queuePosition=useRef(0);const opening=useRef(0);const mutationPending=useRef(false);
  const [documentError,setDocumentError]=useState(false);const [queueLoading,setQueueLoading]=useState(true);const [queueFor,setQueueFor]=useState<string|null>(null);const [landedRole,setLandedRole]=useState<string|null>(null);
  const currentRole=active&&available.includes(active)?active:available[0];
  useEffect(()=>{const selected=new URLSearchParams(window.location.search).get("role") as RoleKey;if(available.includes(selected))setActive(selected);},[available]);
  const api=useCallback(async<T,>(path:string,init?:RequestInit):Promise<T>=>{if(!user)throw new Error("AUTHENTICATION_REQUIRED");const response=await apiFetchAs(user.access_token,path,init);if(!response.ok){const body=await response.json().catch(()=>({message:t.error}));if(body.code===REAUTHENTICATION_REQUIRED){await requestReauthentication(signIn);throw new Error(reauthenticationCopy[locale].required);}throw new Error(body.message??t.error);}return response.status===204?undefined as T:response.json();},[user,t.error,signIn]);
  const refresh=useCallback(async()=>{if(!currentRole||["admin","identity"].includes(currentRole))return;setBusy(true);setError("");try{const includeTasks=["coordinator","doctor","operations","finance","patient"].includes(currentRole);const[nextCases,nextTasks]=await Promise.all([api<(CaseView|StaffCaseResponse)[]>(`/${currentRole}/cases`),includeTasks?api<Task[]>("/work/mine"):Promise.resolve([])]);setCases(normalizeCases(nextCases));setMyTasks(nextTasks);}catch(e){setError(e instanceof Error?e.message:t.error);}finally{setBusy(false);}},[currentRole,api,t.error]);
  const loadAssignmentHistory=useCallback((caseId:string)=>api<AssignmentHistoryEntry[]>(`/coordinator/cases/${caseId}/assignment-history`),[api]);
  useEffect(()=>{if(!user)return;void api<Preferences>("/account/preferences").then(setPreferences).catch(()=>{});},[user,api]);
  useEffect(()=>{
    if(!currentRole||["admin","identity"].includes(currentRole)||deferPatient){setQueueLoading(false);return;}
    let cancelled=false;setQueueLoading(true);setCases([]);setMyTasks([]);setError("");
    void Promise.all([api<(CaseView|StaffCaseResponse)[]>(`/${currentRole}/cases`),["coordinator","doctor","operations","finance","patient"].includes(currentRole)?api<Task[]>("/work/mine"):Promise.resolve([])])
      .then(([nextCases,nextTasks])=>{if(!cancelled){setCases(normalizeCases(nextCases));setMyTasks(nextTasks);}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:t.error);}).finally(()=>{if(!cancelled){setQueueLoading(false);setQueueFor(currentRole);}});
    return()=>{cancelled=true;};
  },[currentRole,api,t.error,deferPatient]);
  // One-shot entry flags. ?signin=1 (header "Sign in", "use your saved details") and ?continue=1 (returning
  // from identity-provider account setup, where a Keycloak session already exists) start sign-in at once so
  // the patient never has to find a button. The flag is stripped from the return path first: a cancelled or
  // failed sign-in lands back here without re-triggering, so there is no redirect loop.
  const autoSignIn=useRef(false);
  useEffect(()=>{if(loading||user||autoSignIn.current)return;const params=new URLSearchParams(window.location.search);if(!params.has("signin")&&!params.has("continue"))return;autoSignIn.current=true;const returnTo=params.get("returnTo");params.delete("signin");params.delete("continue");params.delete("returnTo");const cleaned=`${window.location.pathname}${params.toString()?`?${params}`:""}`;window.history.replaceState({},"",cleaned);void signIn(false,returnTo&&returnTo.startsWith("/")?returnTo:cleaned);},[loading,user,signIn]);
  // Every authenticated patient entry registers the session: the first one after identity-provider setup
  // activates the account, and the answer says which case is current and whether an "is this you?" question waits.
  const [linkToken,setLinkToken]=useState<string|null>(()=>typeof window==="undefined"?null:new URLSearchParams(window.location.search).get("link"));
  const [landed,setLanded]=useState(false);
  // Once per signed-in subject, not per render of its inputs: a linked session refreshes /me, which briefly clears
  // patientView, and re-registering on its return would refresh /me again, forever.
  const sessionRegisteredFor=useRef<string|null>(null);
  useEffect(()=>{if(!user||deferPatient||!patientView)return;const subject=user.profile.sub;if(sessionRegisteredFor.current===subject)return;sessionRegisteredFor.current=subject;const params=new URLSearchParams(window.location.search);const link=params.get("link");if(link){params.delete("link");window.history.replaceState({},"",`${window.location.pathname}${params.toString()?`?${params}`:""}`);}void api<{linked:boolean;currentCaseId:string|null;accountStatus:string}>("/patient/account/session",{method:"POST"}).then(session=>{if(session.linked)refreshMe();if(!params.get("case")&&session.currentCaseId&&!link){const url=new URL(window.location.href);url.searchParams.set("case",session.currentCaseId);window.history.replaceState({},"",url);}}).catch(()=>{}).finally(()=>setLanded(true));},[user,patientView,api,deferPatient,refreshMe]);
  useEffect(()=>{if(currentRole!=="doctor")return;void api<DoctorProfile>("/doctor/me").then(setDoctorProfile).catch(()=>setDoctorProfile(null));void api<CatalogService[]>("/doctor/catalog").then(setCatalog).catch(()=>setCatalog([]));void api<FxRate[]>("/doctor/fx-rates").then(setFxRates).catch(()=>setFxRates([]));},[currentRole,api]);
  useEffect(()=>{if(currentRole!=="coordinator")return;void api<StaffProfile>("/coordinator/me").then(setCoordinatorProfile).catch(()=>setCoordinatorProfile(null));},[currentRole,api]);
  useEffect(()=>{if(currentRole!=="coordinator")return;void api<VerifiedDoctor[]>("/coordinator/doctors").then(setDoctors).catch(()=>setDoctors([]));void api<CareCategory[]>("/coordinator/care-categories").then(setCategories).catch(()=>setCategories([]));void api<FxRate[]>("/coordinator/fx-rates").then(setFxRates).catch(()=>setFxRates([]));void Promise.all([api<StaffMember[]>("/coordinator/staff?role=COORDINATOR"),api<StaffMember[]>("/coordinator/staff?role=OPERATIONS"),api<StaffMember[]>("/coordinator/staff?role=FINANCE")]).then(rows=>setStaff(rows.flat())).catch(()=>setStaff([]));},[currentRole,api]);
  async function openCase(item:CaseView){
    // While /me reloads there is no role yet; a role-scoped URL would read /undefined/cases/….
    if(!currentRole)return;
    const request=++opening.current;setBusy(true);setError("");setDocumentError(false);
    if(!workspace)queuePosition.current=window.scrollY;
    try{
      if(currentRole==="coordinator"&&!item.coordinatorSubject){
        const preview=await api<{caseSummary:CaseView;intakeSummary?:string}>(`/coordinator/cases/${item.id}/intake-preview`);
        if(request===opening.current){setWorkspace({...preview,preview:true,timeline:[],tasks:[],messages:[],assignments:[],clinicalReviews:[]});setDocuments([]);try{const docs=await api<CaseDocument[]>(`/cases/${item.id}/documents`);if(request===opening.current)setDocuments(docs);}catch{if(request===opening.current)setDocumentError(true);}}
      }else{
        const ws=await api<Workspace>(`/${currentRole}/cases/${item.id}`);
        if(request!==opening.current)return;setWorkspace(ws);setDocuments([]);
        try{const docs=await api<CaseDocument[]>(`/cases/${item.id}/documents`);if(request===opening.current)setDocuments(docs);}catch{if(request===opening.current)setDocumentError(true);}
      }
      if(request===opening.current){const url=new URL(window.location.href);url.searchParams.set("case",item.id);window.history.replaceState({},"",url);if(!workspace)requestAnimationFrame(()=>document.getElementById("case-heading")?.focus());}
    }catch(e){if(request===opening.current){setWorkspace(null);setError(e instanceof Error?e.message:t.error);void refresh();}}
    finally{if(request===opening.current)setBusy(false);}
  }
  /** Open a case by id (from My Work or a notification), even before the queue has loaded it. */
  async function openCaseById(caseId:string){
    const known=cases.find(item=>item.id===caseId);if(known){await openCase(known);return;}
    // Not in the queue yet — a pending assignment (work, not yet one of my cases) or a case reached from a
    // notification. Resolve the summary first so the coordinator's preview rule can apply, then open it
    // exactly like a queued case: workspace and documents together. A consultant must never be asked to
    // accept or review an assignment without the patient's file in front of them.
    if(!currentRole)return;
    try{const ws=await api<Workspace>(`/${currentRole}/cases/${caseId}`);await openCase(ws.caseSummary);}
    catch(e){setError(e instanceof Error?e.message:t.error);}
  }
  function backToQueue(){opening.current++;setWorkspace(null);setError("");setNotice("");const url=new URL(window.location.href);url.searchParams.delete("case");window.history.replaceState({},"",url);requestAnimationFrame(()=>window.scrollTo({top:queuePosition.current,behavior:"instant"}));}
  // Keep only navigation preferences in this browser session, scoped to the signed-in account.
  // Keyed by the subject, not the User object: a silent token renew hands over a new User and must not reset the view.
  const userSubject=user?.profile.sub;
  useEffect(()=>{if(!userSubject||!currentRole)return;try{const saved=sessionStorage.getItem(`portal-queue:${userSubject}:${currentRole}`);setQueueState(saved?{...initialQueue,...JSON.parse(saved)}:initialQueue);}catch{setQueueState(initialQueue);}},[userSubject,currentRole]);
  function changeQueue(next:QueueState){setQueueState(next);if(user&&currentRole)try{sessionStorage.setItem(`portal-queue:${user.profile.sub}:${currentRole}`,JSON.stringify(next));}catch{}}
  const restored=useRef(false);
  // For patients, wait for the session answer: it may have just pointed ?case= at their current case.
  // Wait for a role too: while /me reloads, the previous answer's cases are still listed but no case can be opened yet.
  useEffect(()=>{if(queueLoading||restored.current||!cases.length||!currentRole)return;if(patientView&&!landed)return;restored.current=true;const id=new URLSearchParams(window.location.search).get("case");
    // A patient never lands on a list: the session named their current case; failing that, the most recent one.
    const item=cases.find(c=>c.id===id)??(patientView?cases[0]:undefined);if(item)void openCase(item);});
  // The patient's three destinations are one page with a view switch, kept in the URL so a reload or a shared link lands in the same place.
  const [careView,setCareView]=useState<CareView>(()=>{if(typeof window==="undefined")return "care";const v=new URLSearchParams(window.location.search).get("view");return v==="documents"||v==="messages"?v:"care";});
  const changeCareView=(view:CareView)=>{setCareView(view);const url=new URL(window.location.href);if(view==="care")url.searchParams.delete("view");else url.searchParams.set("view",view);window.history.replaceState({},"",url);requestAnimationFrame(()=>document.getElementById("case-heading")?.focus());};
  async function downloadDoc(id:string){setError("");try{const res=await api<{downloadUrl:string}>(`/documents/${id}/download`);if(res?.downloadUrl)window.open(res.downloadUrl,"_blank","noopener,noreferrer");}catch(e){setError(e instanceof Error?e.message:t.error);}}
  async function viewDoc(id:string){setError("");try{const res=await api<{downloadUrl:string}>(`/documents/${id}/view`);if(res?.downloadUrl)window.open(res.downloadUrl,"_blank","noopener,noreferrer");}catch(e){setError(e instanceof Error?e.message:t.error);}}
  async function sendProposal(caseId:string,body:unknown){setBusy(true);setError("");setNotice("");try{await api(`/coordinator/cases/${caseId}/proposals`,{method:"POST",body:JSON.stringify(body)});setShare(null);setNotice(t.success);if(workspace)await openCase(workspace.caseSummary);}catch(e){setError(e instanceof Error?e.message:t.error);}finally{setBusy(false);}}
  async function mutate(path:string,body?:unknown,method="POST"):Promise<MutationResult|undefined>{
    if(mutationPending.current)return;mutationPending.current=true;setBusy(true);setError("");setNotice("");
    try{const result=await api<MutationResult>(path,{method,body:body===undefined?undefined:JSON.stringify(body)});setNotice(t.success);
      await refresh();
      if(workspace)await openCase(path.endsWith("/claim")?{...workspace.caseSummary,coordinatorSubject:user?.profile.sub}:workspace.caseSummary);
      return result??{status:"SAVED"};
    }catch(e){const message=e instanceof Error?e.message:t.error;if(path.endsWith("/claim"))setWorkspace(null);await refreshAfterRejectedAction(path,workspace,refresh,openCase);setError(message);return undefined;}
    finally{mutationPending.current=false;setBusy(false);}
  }
  // Staff views (My work, My cases, Team queue) in one place: the header navigation, the inline phone navigation and
  // the landing rule all read the same items and counts.
  const staffViews=currentRole&&STAFF_ROLES.includes(currentRole)?staffViewItems(currentRole,cases,myTasks,user?.profile?.sub,work.nav):null;
  const staffView=staffViews?resolveStaffView(queueState.view,staffViews.items):null;
  // Land on the first view that has work (owner decision, GATE P2-2), once per role and only on that role's loaded
  // data. A view the person picked wins, and the landing itself is not saved as a choice.
  if(staffViews&&currentRole&&queueFor===currentRole&&!queueLoading&&landedRole!==currentRole){
    setLandedRole(currentRole);
    const next=staffViews.items.find(item=>staffViews.counts[item.id]>0)?.id??"work";
    if(!queueState.viewChosen&&next!==queueState.view)setQueueState({...queueState,view:next,tab:next==="team"?"unowned":next==="mine"?"mine":queueState.tab,page:1});
  }
  function selectStaffView(id:StaffViewId){if(workspace)backToQueue();changeQueue({...queueState,view:id,viewChosen:true,tab:id==="team"?"unowned":id==="mine"?"mine":queueState.tab,page:1});}
  function switchRole(role:RoleKey){setActive(role);setWorkspace(null);setCases([]);setMyTasks([]);restored.current=false;const url=new URL(window.location.href);url.searchParams.delete("case");url.searchParams.set("role",role);window.history.replaceState({},"",url);}
  const clinicLink=hasClinic?{href:virtualClinicHref(locale),label:work.nav.clinic}:null;
  const clearFeedback=useCallback(()=>{setNotice("");setError("");},[]);
  if(loading)return <PortalFrame title={t.title} subtitle={t.loading}/>;
  if(controlCenterOnly)return <PortalFrame title={t.title} subtitle={locale==="ar"?"جارٍ فتح مركز التحكم…":"Opening the Control Center…"}/>;
  if(user&&!workforce&&!careEntry&&clinicAccess.loading)return <PortalFrame title={t.title} subtitle={t.loading}/>;
  if(!user)return <PortalFrame title={t.title} subtitle={t.subtitle}><div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"><div className="card p-6 sm:p-8"><p className="eyebrow">{locale==="ar"?"مساحة خاصة ومحمية":"Private, protected space"}</p><h2 className="title mt-3">{locale==="ar"?"سجّل الدخول للوصول إلى حالتك":"Sign in to open your case"}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">{locale==="ar"?"للمرضى الذين أكملوا ملفهم وفعّلوا حسابهم، وللفريق الطبي والتنسيقي. بعد الدخول تصل مباشرة إلى حالتك الحالية وخطوتها التالية.":"For patients who completed their profile and set up their account, and for the care team. After signing in you land directly on your current case and its next step."}</p><div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="btn-primary" onClick={()=>void signIn()}>{t.signIn}</button><a className="btn-secondary" href={locale==="ar"?"/en/portal":"/ar/portal"} lang={locale==="ar"?"en":"ar"}>{locale==="ar"?"English":"العربية"}</a></div><p className="mt-5 border-t border-line pt-4 text-sm leading-6 text-ink-500">{locale==="ar"?"أرسلت حالتك ولم تفعّل حسابك بعد؟ ":"Sent a case but haven't set up your account yet? "}<a className="font-semibold text-brand-700 underline underline-offset-4" href={`/${locale}/track-case`}>{locale==="ar"?"تابع حالتك عبر الرابط الآمن":"Check your case status with your secure link"}</a>{locale==="ar"?" — أما الحساب فتُنشئه عند إكمال ملفك بعد قبول العرض.":" — your account is created when you complete your profile after accepting a proposal."}</p></div><aside className="surface-muted p-6"><h2 className="font-bold text-brand-900">{locale==="ar"?"حماية الوصول":"Secure access"}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-ink-600"><li>✓ {locale==="ar"?"تسجيل دخول موحّد وآمن":"Secure single sign-on"}</li><li>✓ {locale==="ar"?"صلاحيات منفصلة لكل دور":"Role-specific access"}</li><li>✓ {locale==="ar"?"المستندات الطبية ليست عامة":"Medical files are never public"}</li></ul><p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-ink-500">{locale==="ar"?"إذا لم تتمكن من الدخول، تواصل مع منسقك أو مسؤول النظام دون مشاركة كلمة المرور.":"If you cannot sign in, contact your coordinator or system administrator without sharing your password."}</p></aside></div></PortalFrame>;
  const profile=user.profile as {name?:string;preferred_username?:string;email?:string;sub?:string};
  const accountName=profile.name??profile.preferred_username??profile.email??profile.sub??"";
  const isDoctorRole=currentRole==="doctor";
  const profileName=isDoctorRole?doctorProfile?.displayName:currentRole==="coordinator"?coordinatorProfile?.displayName:undefined;
  const baseName=preferences.displayName||profileName||accountName;
  const displayName=isDoctorRole&&profileName&&!/^d(r|octor)\b/i.test(baseName)?`Dr. ${baseName}`:baseName;
  const descriptions:Record<RoleKey,string>=locale==="ar"?{coordinator:"راجع الحالات ونسّق الخطوة التالية للرعاية.",doctor:"راجع الحالات المسندة إليك وسجّل قراراتك السريرية.",operations:"تابع الترتيبات والإجراءات المطلوبة منك.",finance:"راجع المدفوعات والموافقات المطلوبة.",patient:"تابع رعايتك وتعرّف على الخطوة التالية."}:{coordinator:"Review cases and coordinate the next step in care.",doctor:"Review assigned cases and record your clinical decisions.",operations:"Manage your assigned care and travel arrangements.",finance:"Review payments and commercial approvals that need your attention.",patient:"Follow your care and see what happens next."};
  const inWorkspace=!!workspace&&!!currentRole&&!["admin","identity"].includes(currentRole);
  const isPatientRole=currentRole==="patient";
  return <FeedbackContext.Provider value={{notice,error,clear:clearFeedback}}><PortalFrame title={isPatientRole?(locale==="ar"?"رعايتي":"My Care"):currentRole?roleLabel(currentRole,locale):t.title} subtitle={inWorkspace||isPatientRole?"":currentRole?descriptions[currentRole]:t.subtitle}>
    {currentRole&&!["admin","identity","patient"].includes(currentRole)&&<NotificationBell locale={locale} api={api} onOpenCase={caseId=>void openCaseById(caseId)}/>}
    {staffViews&&<StaffNav locale={locale} label={work.nav.label} items={staffViews.items} current={workspace?null:staffView} clinic={clinicLink} onSelect={selectStaffView}/>}
    {isPatientRole&&workspace&&<PatientNav locale={locale} view={careView} unread={workspace.messages.filter(m=>m.senderRole!=="PATIENT"&&!m.read).length} onView={changeCareView}/>}
    <PortalAccount locale={locale} name={displayName} email={profile.email} role={currentRole?roleLabel(currentRole,locale):""} api={api} signOut={signOut} preferences={preferences} onSaved={value=>{setPreferences(value);setNotice(t.success);}} patient={isPatientRole} controlCenter={controlCenter}
      roles={available.length>1?{label:work.nav.workingAs,current:currentRole,options:available.map(role=>({key:role,label:roleLabel(role,locale)})),onSelect:key=>switchRole(key as RoleKey)}:null}/>
    {/* A patient-side account that also manages a clinic keeps its one way in; staff reach it from the navigation. */}
    {isPatientRole&&clinicLink&&<p className="mb-6"><a className="btn-secondary" href={clinicLink.href}>{clinicLink.label}</a></p>}
    <ReauthenticationReturnNotice locale={locale} className="mb-4 rounded-xl bg-brand-50 p-4 text-brand-800"/>
    {!available.length&&<NoPortalWorkspace locale={locale}/>}
    {linkToken&&currentRole==="patient"&&<AccountLinkRequest locale={locale} token={linkToken} api={api} onResolved={()=>{setLinkToken(null);restored.current=false;void refresh();}}/>}
    {notice&&<p role="status" className="mb-4 rounded-xl bg-brand-50 p-4 text-brand-800">{notice}</p>}{error&&<div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-alert-50 p-4 text-alert-800"><span>{error}</span><button type="button" className="btn-secondary !min-h-9 !px-3 !text-[0.82rem]" onClick={()=>{setError("");void refresh();}}>{locale==="ar"?"إعادة المحاولة":"Retry"}</button></div>}
    {busy&&workspace&&<p role="status" className="mb-3 text-sm text-ink-500">{t.loading}</p>}
    {documentError&&workspace&&<p role="alert" className="mb-4 rounded-xl bg-alert-50 p-4 text-sm text-alert-800">{locale==="ar"?"تعذّر تحميل المستندات.":"Documents could not be loaded."} <button className="link-cta" onClick={()=>void openCase(workspace.caseSummary)}>{locale==="ar"?"إعادة المحاولة":"Retry"}</button></p>}
    {workspace
        // Keyed by case: opening another case straight from a notification or My Work must not carry this case's
        // drafts, tab or open dialogs into it (or let them be submitted against the wrong patient's case).
        ? <WorkspaceView key={workspace.caseSummary.id} locale={locale} t={t} proposalCopy={proposalCopy} role={currentRole!} value={workspace} documents={documents} doctors={doctors} categories={categories} staff={staff} catalog={catalog} fxRates={fxRates} canRebalance={leadsTeam(me,"CARE_COORDINATION")} loadAssignmentHistory={loadAssignmentHistory} load={api} downloadDoc={downloadDoc} viewDoc={viewDoc} mySubject={user?.profile?.sub} share={share&&share.caseId===workspace.caseSummary.id?share:null} sendProposal={sendProposal} busy={busy} back={backToQueue} mutate={mutate} careView={careView} onCareView={changeCareView} otherCases={cases} openCaseById={openCaseById} consultantsHref={holds(me,"CREDENTIAL_READ")?ccHref(locale,"/consultants"):null}/>
        : isPatientRole ? (queueLoading||(!landed&&patientView)||(cases.length>0&&!error)
          ? <p role="status" className="text-sm text-ink-500">{t.loading}</p>
          : <PatientNoCase locale={locale}/>)
        : null}
    {currentRole&&!["admin","identity","patient"].includes(currentRole)&&<div hidden={!!workspace}><Queue views={staffViews?.items??[]} view={staffView??"work"} onSelectView={selectStaffView} clinic={clinicLink} loading={queueLoading||queueFor!==currentRole} queueState={queueState} changeQueue={changeQueue} locale={locale} role={currentRole} openCaseById={openCaseById} cases={cases} tasks={myTasks} busy={busy||queueLoading} mySubject={user?.profile?.sub} coordinatorLead={leadsTeam(me,"CARE_COORDINATION")} staff={staff} openCase={openCase} mutate={mutate}/></div>}

    {currentRole==="finance"&&!workspace&&holds(me,"COMMERCIAL_POLICY_READ")&&<p className="mt-8 text-sm text-ink-600"><a className="font-semibold text-brand-700 underline underline-offset-4" href={ccHref(locale,"/commercial/margin-deposit")}>{locale==="ar"?"سياسات الهامش والدفعة المقدمة":"Margin & deposit policies"}</a>{locale==="ar"?" — في مركز التحكم":" — in the Control Center"}</p>}
  </PortalFrame></FeedbackContext.Provider>;
}

/** A signed-in patient with no case yet: one calm sentence and the one thing they can do. */
function PatientNoCase({locale}:{locale:Locale}){
 const ar=locale==="ar";
 return <section className="card mx-auto max-w-2xl p-6 sm:p-8" aria-labelledby="no-case-title">
  <h2 id="no-case-title" className="text-[1.15rem] font-bold text-brand-900">{ar?"لا توجد حالة نشطة بعد":"No active case yet"}</h2>
  <p className="mt-2 text-[0.95rem] leading-7 text-ink-600">{ar?"عندما ترسل حالة، تظهر رحلة رعايتك هنا: ما يحدث الآن، وما إذا كان مطلوبًا منك شيء، وما الخطوة التالية.":"When you send a case, your care journey appears here: what is happening now, whether we need anything from you, and what happens next."}</p>
  <a className="btn-primary mt-5 inline-flex" href={`/${locale}/send-my-case`}>{ar?"إرسال حالتي":"Send my case"}</a>
 </section>;
}
function PortalFrame({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <section className="portal-shell bg-[linear-gradient(180deg,var(--color-mist)_0%,#fff_32rem)]"><div className="container-site"><h1 className="headline">{title}</h1>{subtitle&&<p className="mt-2 max-w-3xl text-sm text-ink-600">{subtitle}</p>}<div className="mt-6">{children}</div></div></section>}
const STAFF_ROLES:string[]=["coordinator","doctor","operations","finance"];
const terminalStatuses=new Set(["CLOSED","CANCELLED","DECLINED","CLINICALLY_NOT_SUITABLE"]);
/** The staff views in order with the counts that decide where the home lands. My cases shows no count: it is accountability, not a to-do. */
function staffViewItems(role:string,cases:CaseView[],tasks:Task[],subject:string|undefined,nav:WorkCopy["nav"]){
  const coordinator=role==="coordinator";
  const counts:Record<StaffViewId,number>={work:tasks.length,mine:cases.filter(item=>!terminalStatuses.has(item.status)&&(!coordinator||ownershipTab(item,subject)==="mine")).length,team:coordinator?cases.filter(item=>matchesKpi(item,"unowned","coordinator")).length:0};
  const items:StaffViewItem[]=[{id:"work",label:nav.work,count:counts.work},{id:"mine",label:nav.mine},...(coordinator?[{id:"team" as const,label:nav.team,count:counts.team}]:[])];
  return {items,counts};
}
const resolveStaffView=(view:string,items:StaffViewItem[]):StaffViewId=>items.find(item=>item.id===view)?.id??"work";
function roleLabel(role:RoleKey,locale:Locale){const labels={en:{patient:"Patient",coordinator:"Coordinator",doctor:"Consultant workspace",operations:"Operations",finance:"Finance",admin:"Control Center",identity:"Identity checks"},ar:{patient:"المريض",coordinator:"منسق الحالة",doctor:"مساحة عمل الاستشاري",operations:"العمليات",finance:"المالية",admin:"مركز التحكم",identity:"التحقق من الهوية"}};return labels[locale][role];}

/**
 * The operational dashboard: work first, then the cases I own, then what the team has available.
 * Ownership ("Take ownership") belongs to the team queue; My Cases is accountability, not a task list.
 */
function Queue({views,view:current,onSelectView,clinic,loading,locale,role,cases,tasks,busy,mySubject,coordinatorLead,staff=[],openCase,openCaseById,mutate,queueState,changeQueue}:{views:StaffViewItem[];view:StaffViewId;onSelectView:(id:StaffViewId)=>void;clinic:{href:string;label:string}|null;loading:boolean;locale:Locale;role?:RoleKey;cases:CaseView[];tasks:Task[];busy:boolean;mySubject?:string;coordinatorLead:boolean;staff?:StaffMember[];openCase:(item:CaseView)=>void;openCaseById:(caseId:string)=>void;mutate:Mutate;queueState:QueueState;changeQueue:(value:QueueState)=>void}){
 const work=useWorkCopy();
  const ar=locale==="ar";
  const staffView=role!=="patient";
  const[transferCase,setTransferCase]=useState<CaseView|null>(null);
  const view=staffView?current:"cases";
  const teamWaiting=views.find(item=>item.id==="team")?.count??0;
  const title=views.find(item=>item.id===view)?.label;
  return <>{staffView&&<StaffViewLinks locale={locale} label={work.nav.label} items={views} current={view as StaffViewId} clinic={clinic} onSelect={onSelectView} variant="inline"/>}
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

function WorkspaceView({locale,t,proposalCopy,role,value,documents,doctors,categories,staff,catalog,fxRates,canRebalance,loadAssignmentHistory,load,downloadDoc,viewDoc,mySubject,share,sendProposal,busy,back,mutate,careView="care",onCareView,otherCases=[],openCaseById,consultantsHref}:{locale:Locale;t:typeof copy.en;proposalCopy:ProposalCopy;role:RoleKey;value:Workspace;documents:CaseDocument[];doctors:VerifiedDoctor[];categories:CareCategory[];staff:StaffMember[];catalog:CatalogService[];fxRates:FxRate[];canRebalance:boolean;loadAssignmentHistory?:(caseId:string)=>Promise<AssignmentHistoryEntry[]>;load:<T>(path:string)=>Promise<T>;downloadDoc:(id:string)=>void;viewDoc:(id:string)=>void;mySubject?:string;share:{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string}|null;sendProposal:(caseId:string,body:unknown)=>void;busy:boolean;back:()=>void;mutate:Mutate;careView?:CareView;onCareView?:(view:CareView)=>void;otherCases?:CaseView[];openCaseById?:(id:string)=>void;consultantsHref?:string|null}){
 const work=useWorkCopy();
 // The drawer's own confirmation replaces the generic page notice, so it is not announced twice.
 const feedback=useContext(FeedbackContext);
 const c=value.caseSummary;const approved=value.clinicalReviews.find(r=>r.status==="APPROVED");
 const isCoordinator=role==="coordinator";const owned=!!mySubject&&c.coordinatorSubject===mySubject;
 const doctorPhase=["CONSULTANT_ASSIGNMENT_PENDING","CONSULTANT_REVIEW"].includes(c.status);
 const doctorAssignment=value.assignments.find(a=>a.assigneeRole==="DOCTOR"&&!REFERRAL_ASSIGNMENTS.includes(a.assignmentType)&&(a.status==="PENDING"||a.status==="ACTIVE"));
 // Never fall back to an identity subject: the backend resolves the name, and an honest generic label
  // is better than a UUID when it cannot.
  const assignedDoctorName=doctorAssignment?(doctorAssignment.assigneeName??doctors.find(d=>d.subject===doctorAssignment.assigneeSubject)?.displayName??(locale==="ar"?"الاستشاري المعيَّن":"the assigned consultant")):"";
  const isDoctor=role==="doctor";const isPatient=role==="patient";
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
 const documentsPanel=documents.length>0?<Panel title={t.documents}>{documents.map(doc=><div key={doc.documentId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><strong className="break-all">{doc.fileName}</strong><p className="text-sm text-ink-500">{formatBytes(doc.sizeBytes)} · {new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(doc.createdAt))}</p></div>{doc.status==="CLEAN"?<div className="flex gap-2"><button className="btn-secondary" onClick={()=>viewDoc(doc.documentId)}>{locale==="ar"?"عرض":"View"}</button><button className="btn-secondary" onClick={()=>downloadDoc(doc.documentId)}>{t.download}</button></div>:<span className="rounded-full bg-mist px-3 py-1 text-sm font-bold text-ink-600">{(doc.status==="PENDING"||doc.status==="UPLOADED")?t.docScanning:t.docUnavailable}</span>}</div>)}</Panel>:null;
  // Only a real consultant assignment earns a second identity row. Falling back to the coordinator
  // here printed the same person twice under two labels, one of them the internal word "assignee".
  const consultantOnCase=doctorAssignment&&doctorPhase?assignedDoctorName:null;
 // Operations and consultants keep their stage forms; the coordinator's work is driven by the current action.
 const workflowBlock=!isCoordinator&&showActions&&!(isDoctor&&doctorPhase)?<div id="case-actions"><CaseWorkflowActions locale={locale} role={role} caseSummary={c} availableActions={available} patientAction={value.patientAction} mutate={mutate} doctors={doctors} categories={categories} staff={staff} documents={documents} travelPackage={!!c.travelPackageRequested} financeRequired={!!value.gates?.financeRequired}/></div>:null;
 const recommendationBlock=approved&&(approved.recommendedTreatment||approved.risksAndLimitations)?<div className="rounded-xl border border-line p-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700">{locale==="ar"?"التوصية السريرية للاستشاري":"Consultant's clinical recommendation"}</p>{approved.recommendedTreatment&&<div className="mb-3"><p className="text-sm font-bold text-ink-800">{t.reviewTreatment}</p><p className="mt-0.5 whitespace-pre-wrap text-ink-700">{approved.recommendedTreatment}</p></div>}{approved.risksAndLimitations&&<div><p className="text-sm font-bold text-ink-800">{t.reviewRisks}</p><p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-600">{approved.risksAndLimitations}</p></div>}</div>:null;
 // The proposal is the coordinator's work while it is being prepared or released (or, at arrival, finalised);
 // once decided it becomes reference history.
 // An assignment step has its own inline form; every other focus step lives in the proposal panel.
 const formCode=current.workType==="TRAVEL"?"ASSIGN_OPERATIONS":current.workType==="PROPOSAL_TERMS_CALL"?"RECORD_PROPOSAL_DECISION":REFERRAL_CONFIRM_WORK.includes(current.workType??"")?"CONFIRM_REFERRAL":current.code;
 const formAction=isCoordinator&&owned&&current.kind==="FOCUS"&&["ASSIGN_CONSULTANT","CONFIRM_REFERRAL","ASSIGN_OPERATIONS","ASSIGN_FINANCE"].includes(formCode)||(formCode==="RECORD_PROPOSAL_DECISION"&&isCoordinator&&owned&&!!value.proposal&&available.includes("RECORD_PROPOSAL_DECISION"));
 const proposalIsWork=isCoordinator&&owned&&(["PREPARE_PROPOSAL","RELEASE_PROPOSAL","WAIT_INTERNAL_APPROVAL","ASSIGN_FINANCE"].includes(current.code)||["PREPARE_PROPOSAL","PROPOSAL_REVISION"].includes(current.workType??"")||(!!approved&&!value.proposal)||c.status==="ARRIVAL_CONFIRMED");
 const proposalPanel=<Panel title={t.proposal} wide>{recommendationBlock}{value.proposal?<ProposalCard locale={locale} t={t} proposal={value.proposal}/>:null}{isCoordinator&&owned&&approved&&(!value.proposal||["REVISION_REQUESTED","EXPIRED"].includes(value.proposal.status))&&<ProposalSendForm caseId={c.id} reviewId={approved.id} language={c.preferredLanguage} estimate={approved} fxRates={fxRates} locale={locale} t={t} busy={busy} onSend={sendProposal}/>}{isCoordinator&&share&&<ProposalShareLinks share={share} locale={locale} t={t}/>}{isCoordinator&&value.delivery&&value.proposal&&<DeliveryCard delivery={value.delivery} caseId={c.id} versionId={value.proposal.versionId} locale={locale} busy={busy} mutate={mutate} canResend={available.includes("RESEND_PROPOSAL_LINK")}/>}{isCoordinator&&owned&&c.status==="ARRIVAL_CONFIRMED"&&<FinalQuoteActions caseId={c.id} reviewId={approved?.id} proposal={value.proposal} gates={value.gates} fxRates={fxRates} locale={locale} busy={busy} mutate={mutate}/>}{value.deposit&&<DepositCard deposit={value.deposit} caseId={c.id} role={role} locale={locale} busy={busy} mutate={mutate}/>}{showActions&&<div className={dim?"pointer-events-none opacity-50":""}><RoleActions role={role} t={t} c={c} proposal={value.proposal} gates={value.gates} availableActions={available} locale={locale} mutate={mutate}/></div>}</Panel>;
 const clinicalPanel=(value.clinicalReviews.length>0||["CONSULTANT_REVIEW","ARRIVAL_CONFIRMED"].includes(c.status))?<Panel title={t.reviews}>{value.clinicalReviews.length?value.clinicalReviews.map(r=><div key={r.id} className="rounded-lg border border-line p-4"><strong>v{r.versionNumber} · {statusLabel(r.status,locale)}</strong>{r.recommendedTreatment&&<p className="mt-1">{r.recommendedTreatment}</p>}{r.risksAndLimitations&&<p className="mt-1 text-sm text-ink-600">{r.risksAndLimitations}</p>}{r.costEstimates&&r.costEstimates.length>0&&<div className="mt-3 rounded-lg bg-brand-50 p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700">{t.estimatedByConsultant}</p>{r.proposalCurrency&&<p className="mb-2 text-xs text-ink-600">{locale==="ar"?"عملة العرض":"Proposal currency"}: <strong>{CURRENCY_LABELS[r.proposalCurrency]?.[locale]??r.proposalCurrency}</strong></p>}<ul className="space-y-1 text-sm">{r.costEstimates.map((e,i)=><li key={i} className="flex items-baseline justify-between gap-3"><span>{e.serviceDescription}</span><span className="text-end"><strong className="block whitespace-nowrap">{e.quotedCost!=null&&e.quotedCurrency?money(e.quotedCost,e.quotedCurrency,locale):money(e.estimatedCost,e.currency,locale)}</strong>{e.quotedCost!=null&&e.quotedCurrency&&<span className="block whitespace-nowrap text-[0.72rem] text-ink-500">{locale==="ar"?"الأساس":"Base"} {money(e.estimatedCost,e.currency,locale)}</span>}</span></li>)}</ul></div>}</div>):<Empty/>}{isDoctor&&c.status==="ARRIVAL_CONFIRMED"&&<FinalAssessment caseId={c.id} busy={busy} locale={locale} catalog={catalog} fxRates={fxRates} mutate={mutate}/>}</Panel>:null;
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
  const [journeyOpen,setJourneyOpen]=useState(false);
  const [messagesOpen,setMessagesOpen]=useState(false);
  const [moreOpen,setMoreOpen]=useState(false);
  const [adminOpen,setAdminOpen]=useState(false);
  const [infoOpen,setInfoOpen]=useState(false);
  const [proposalOpen,setProposalOpen]=useState(false);
  const [declineOpen,setDeclineOpen]=useState(false);
  const [recordOpen,setRecordOpen]=useState(false);const [recordDecisionOpen,setRecordDecisionOpen]=useState(false);
  const unreadMessages=value.messages.filter(m=>m.senderRole==="PATIENT"&&!m.read).length;
  const latestPatientMessage=[...value.messages].reverse().find(m=>m.senderRole==="PATIENT");
  const newestDocument=documents.length?documents[documents.length-1]:undefined;
  // The clinical review form lives in the Clinical tab, so send a consultant there rather than to an
  // overview panel that does not exist for them.
  const focusAction=()=>{setTab(isDoctor&&!workflowBlock?"clinical":"overview");requestAnimationFrame(()=>{const target=document.getElementById("case-actions")??document.getElementById("case-tab-panel");scrollIntoView(target,{behavior:"smooth",block:"center"});(target?.querySelector("button,select,input,textarea") as HTMLElement|null)?.focus();});};
  const completeWork=(evidence:string)=>{if(current.workItemId!=null)void mutate(`/tasks/${current.workItemId}/cases/${c.id}/complete`,{evidence,expectedVersion:current.workItemVersion??0});};
  const openMessages=()=>setMessagesOpen(true);
  const caseTabs=[{id:"overview" as const,label:locale==="ar"?"نظرة عامة":"Overview",count:0},{id:"clinical" as const,label:locale==="ar"?"الملف السريري":"Clinical",count:0},{id:"documents" as const,label:locale==="ar"?"المستندات":"Documents",count:documents.length},{id:"activity" as const,label:locale==="ar"?"السجل":"Activity",count:0}];
  // Utilities live in one place each: the secure-link row owns "resend", the header owns messages, and the
  // "More" drawer owns everything else the backend listed for this state.
  const moreAvailable=available.filter(code=>!code.startsWith("RESEND_")&&!(code==="RECORD_PROPOSAL_DECISION"&&formCode==="RECORD_PROPOSAL_DECISION"));
  const showMore=isCoordinator&&owned&&!value.preview&&(moreAvailable.length>0||canRebalance);

  const banners=<>
   {dim&&<div className="card border-s-4 border-brand-400 bg-brand-50 p-4"><p className="font-bold text-brand-800">{t.handoff.replace("{name}",assignedDoctorName)}</p></div>}

   {value.preview&&<p className="text-sm text-ink-500">{locale==="ar"?"هذه معاينة للاستقبال. تتاح المستندات والرسائل بعد تولّي مسؤولية الحالة.":"This intake preview supports your ownership decision. Documents and messages become available after you take responsibility for the case."}</p>}
  </>;

  // Patients get their own journey view: the staff console vocabulary is never shown to them.
  // Patients enter their care journey, not a console: My Care renders the backend's current step, the
  // proposal and deposit facts, and the coordinator — the document itself opens on demand in a drawer, where
  // the decision (when one is owed) is the only control.
  if(isPatient){
   const proposalReady=value.patientProposal?.action==="REVIEW_PROPOSAL";
   const unread=value.messages.filter(m=>m.senderRole!=="PATIENT"&&!m.read).length;
   return <div>
    <MyCare locale={locale} caseSummary={c} actions={actions} patientAction={value.patientAction} patientProposal={value.patientProposal} proposal={value.proposal??null} deposit={value.deposit??null}
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

  // Who is on the case: the owner first, then the clinical and operational people actually assigned.
  const team=[
   {label:t.coordinatorLabel,name:coordinatorLabel(c,mySubject,work.queue),pending:false},
   ...value.assignments.filter(a=>a.assigneeRole!=="COORDINATOR").map(a=>({label:a.assigneeRole==="DOCTOR"?(locale==="ar"?"الاستشاري":"Consultant"):a.assigneeRole==="OPERATIONS"?(locale==="ar"?"العمليات":"Operations"):a.assigneeRole==="FINANCE"?(locale==="ar"?"المالية":"Finance"):a.assigneeRole,name:a.assigneeName??(locale==="ar"?"عضو الفريق":"Team member"),pending:a.status==="PENDING"})),
  ];

  return <div>
  <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label={t.caseWorkspaceLabel}>
   <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-brand-800 transition hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700" onClick={back}><span aria-hidden>{locale==="ar"?"→":"←"}</span>{t.myDashboard}</button>
   <span className="text-ink-300" aria-hidden>/</span>
   <span className="font-semibold text-ink-700" dir="ltr">{c.caseNumber}</span>
  </nav>

  <header className="card p-4 sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
     <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="text-[0.78rem] font-bold text-brand-700" dir="ltr">{c.caseNumber}</span>
      {c.careCategory&&<span className="text-[0.78rem] text-ink-500">{careAreaLabel(c.careCategory,work.careAreas)}</span>}
      <span className="text-[0.78rem] text-ink-500">{c.country}</span>
      <span className="text-[0.78rem] text-ink-500">{c.preferredLanguage==="ar"?(locale==="ar"?"العربية":"Arabic"):(locale==="ar"?"الإنجليزية":"English")}</span>
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
     {!value.preview&&<button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-white px-3 text-[0.85rem] font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-800" onClick={openMessages}>
      <MessageSquare size={16} aria-hidden/>{locale==="ar"?"الرسائل":"Messages"}{value.messages.length>0&&<span className={`rounded-full px-1.5 text-[0.72rem] font-bold ${unreadMessages?"bg-brand-600 text-white":"bg-mist text-ink-600"}`}>{value.messages.length}</span>}
     </button>}
     {showMore&&<button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-white px-3 text-[0.85rem] font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-800" aria-haspopup="dialog" onClick={()=>setMoreOpen(true)}><MoreHorizontal size={16} aria-hidden/>{locale==="ar"?"المزيد":"More"}</button>}
     {isCoordinator&&!owned&&canRebalance&&!value.preview&&<button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-white px-3 text-[0.85rem] font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-800" aria-haspopup="dialog" onClick={()=>setAdminOpen(true)}>{locale==="ar"?"نقل الملكية":"Transfer ownership"}</button>}
    </div>
   </div>
  </header>

  <CurrentActionPanel locale={locale} role={role} action={current}
   response={current.workType==="REVIEW_PATIENT_RESPONSE"?{message:latestPatientMessage?.body,documentName:newestDocument?.fileName}:null}
   busy={busy} onComplete={completeWork} onFocusAction={focusAction} onClaim={()=>void mutate(`/coordinator/cases/${c.id}/claim`)}
   onAcceptAssignment={()=>{if(!myPending)return;void mutate(`/${role}/cases/${c.id}/assignments/${myPending.id}`,{accept:true}).then(result=>{if(result&&isDoctor)setTab("clinical");});}}
   onDeclineAssignment={()=>setDeclineOpen(true)}
   form={formAction?<CoordinatorActionForm locale={locale} code={formCode} caseId={c.id} version={c.version} careCategory={c.careCategory} categories={categories} staff={staff} busy={busy} mutate={mutate} load={load} consultantsHref={consultantsHref} proposal={value.proposal}/>:undefined}/>

  {isCoordinator&&<CaseBlockers locale={locale} blockers={actions.blockers} deposit={value.deposit}/>}

  <div aria-busy={busy||undefined} className="min-w-0">
   <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
    <div className="min-w-0">
     {<div role="tablist" aria-label={t.caseWorkspaceLabel} className="mb-4 flex flex-wrap gap-1 border-b border-line-strong">
      {caseTabs.map(item=><button key={item.id} type="button" role="tab" id={`case-tab-${item.id}`} aria-controls="case-tab-panel" aria-selected={tab===item.id}
        className={`-mb-px min-h-11 border-b-2 px-3 py-2 text-[0.85rem] font-bold transition ${tab===item.id?"border-brand-600 text-brand-800":"border-transparent text-ink-500 hover:text-ink-800"}`}
        onKeyDown={event=>{const target=tabKeyTarget(event.key,caseTabs.findIndex(x=>x.id===tab),caseTabs.length,locale==="ar");if(target<0)return;event.preventDefault();const next=caseTabs[target];setTab(next.id);requestAnimationFrame(()=>document.getElementById(`case-tab-${next.id}`)?.focus());}}
        tabIndex={tab===item.id?0:-1}
        onClick={()=>setTab(item.id)}>{item.label}{item.count?<span className="ms-1.5 text-[0.75rem] font-semibold text-ink-400">{item.count}</span>:null}</button>)}
     </div>}

     <div id="case-tab-panel" role="tabpanel" aria-labelledby={`case-tab-${tab}`} tabIndex={0} className="space-y-4">
      {/* Kept mounted while hidden so typed drafts (proposal notes, operations plan) survive a tab switch. */}
      <div hidden={tab!=="overview"} className="space-y-4">
       {/* Before accepting, a consultant needs the case in front of them — summary and documents, not
           a decision taken blind. Acceptance itself stays in the single Current action panel above. */}
       {myPending&&isDoctor&&<section className="card p-4" aria-labelledby="assignment-preview">
        <h3 id="assignment-preview" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{locale==="ar"?"ملف التعيين":"Assignment brief"}</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.85rem] sm:grid-cols-2 lg:grid-cols-4">
         <div><dt className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.patientLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{c.patientName||"—"}</dd></div>
         {c.careCategory&&<div><dt className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.careArea}</dt><dd className="mt-0.5 font-semibold text-ink-800">{careAreaLabel(c.careCategory,work.careAreas)}</dd></div>}
         <div><dt className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.coordinatorLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{c.coordinatorName??"—"}</dd></div>
         <div><dt className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.countryLabel}</dt><dd className="mt-0.5 font-semibold text-ink-800">{c.country}</dd></div>
        </dl>
        {value.intakeSummary?.trim()&&<div className="mt-4 rounded-lg border border-line bg-mist p-3"><p className="whitespace-pre-wrap break-words text-[0.9rem] leading-6 text-ink-700">{value.intakeSummary}</p></div>}
        <div className="mt-4">
         <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.documents} {documents.length>0&&<span className="text-ink-400">({documents.length})</span>}</p>
         {documents.length===0?<p className="mt-1.5 text-[0.88rem] text-ink-500">{locale==="ar"?"لم تُرفع مستندات.":"No documents were uploaded."}</p>
          :<ul className="mt-1.5">{documents.map(doc=><li key={doc.documentId} className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-0"><span className="min-w-0 flex-1 truncate font-semibold text-ink-800">{doc.fileName}</span>{doc.status==="CLEAN"?<span className="flex gap-2"><button type="button" className="link-cta text-[0.85rem]" onClick={()=>viewDoc(doc.documentId)}>{locale==="ar"?"عرض":"View"}</button><button type="button" className="link-cta text-[0.85rem]" onClick={()=>downloadDoc(doc.documentId)}>{t.download}</button></span>:<span className="text-[0.8rem] text-ink-500">{doc.status==="PENDING"?t.docScanning:t.docUnavailable}</span>}</li>)}</ul>}
        </div>
       </section>}
       {banners}
       {workflowBlock}
       {/* The proposal is the work while it is being prepared or released; afterwards it is reference. */}
       {isCoordinator&&(proposalIsWork?<div id={current.kind==="FOCUS"&&!formAction?"case-actions":undefined}>{proposalPanel}</div>
         :(value.proposal||value.deposit)?<ProposalSummary locale={locale} proposal={value.proposal} deposit={value.deposit} delivery={value.delivery} caseId={c.id} available={available} busy={busy} mutate={mutate} onView={()=>setProposalOpen(true)}/>:null)}
       {!isCoordinator&&!isDoctor&&(value.proposal||value.deposit)&&proposalPanel}
       {/* The case brief: the facts a coordinator decides ownership on, and the operational context once they own it. */}
       {isCoordinator&&<CoordinatorBrief locale={locale} t={t} mySubject={mySubject} c={c} actions={actions} documents={documents} preview={!!value.preview} intakeSummary={value.intakeSummary} consultantName={consultantOnCase} onClinical={()=>setTab("clinical")} onDocuments={()=>setTab("documents")}/>}
      </div>

      {/* Kept mounted for the same reason: the clinical review and final assessment drafts. */}
      <div hidden={tab!=="clinical"} className="space-y-4">
       {doctorReviewComplete&&<div className="card flex items-center gap-3 border-s-4 border-brand-500 bg-brand-50 p-4"><span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-600 font-bold text-white">✓</span><p className="font-bold text-brand-800">{c.status==="CLINICAL_RECOMMENDATION_READY"?t.doctorAccepted:c.status==="INFORMATION_REQUIRED"?t.doctorInfoSent:c.status==="CLINICALLY_NOT_SUITABLE"?t.doctorNotSuitable:t.doctorReturned}</p></div>}
       {clinicalReviewPanel}
       {isDoctor&&<ConsultantReferrals key={c.id} locale={locale} caseId={c.id} careCategory={c.careCategory} categories={categories} canRefer={c.status==="CONSULTANT_REVIEW"&&!myPending&&!secondOpinionOnly} busy={busy} load={load} mutate={mutate}/>}
       {intakePanel}
       {/* While the consultant is composing, the review history would only repeat their own draft back at them. */}
       {!clinicalReviewPanel&&clinicalPanel}
       {!intakePanel&&!clinicalPanel&&!clinicalReviewPanel&&!doctorReviewComplete&&<p className="text-sm text-ink-500">{locale==="ar"?"لا توجد معلومات سريرية بعد.":"No clinical information yet."}</p>}
      </div>

      {tab==="documents"&&(documentsPanel??<p className="text-sm text-ink-500">{locale==="ar"?"لم يتم رفع مستندات بعد.":"No documents uploaded yet."}</p>)}

      {tab==="activity"&&<><CaseActivity locale={locale} tasks={value.tasks} timeline={value.timeline} onViewJourney={()=>setJourneyOpen(true)}/>{isCoordinator&&loadAssignmentHistory&&<div className="mt-5"><AssignmentHistory key={c.id} locale={locale} caseId={c.id} load={loadAssignmentHistory}/></div>}</>}
     </div>
    </div>

    <aside className="min-w-0 space-y-4 lg:sticky lg:top-20">
     <JourneyPulse locale={locale} stage={c.status} waitingOn={actions.waitingOn} viewerRole={role} ownsCase={!!mySubject&&c.coordinatorSubject===mySubject} onViewJourney={()=>setJourneyOpen(true)}/>
     {!value.preview&&<section aria-labelledby="case-team-title" className="card p-4">
      <h2 id="case-team-title" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{locale==="ar"?"فريق الحالة":"Case team"}</h2>
      <dl className="mt-2 space-y-1.5 text-[0.82rem]">{team.map((member,i)=><div key={`${member.label}-${i}`} className="flex items-baseline justify-between gap-3"><dt className="text-ink-500">{member.label}</dt><dd className="text-end font-semibold text-ink-800">{member.name}{member.pending&&<span className="ms-1 text-[0.72rem] font-semibold text-amber-800">{locale==="ar"?"· بانتظار القبول":"· pending"}</span>}</dd></div>)}</dl>
     </section>}
    </aside>
   </div>
   {/* Explains why the workspace is read-only. The Take ownership button lives once, in the current-
       action panel above; repeating it here put the same claim on screen twice under one label. */}
   {isCoordinator&&!owned&&<p className="card mt-5 border-s-4 border-brand-400 p-4 text-ink-600">{c.coordinatorSubject?t.ownedByOther:t.ownershipHint}</p>}
  </div>

  {journeyOpen&&<FullJourneyDialog locale={locale} timeline={value.timeline} caseNumber={c.caseNumber} onClose={()=>setJourneyOpen(false)}/>}
  {messagesOpen&&<CaseDrawer locale={locale} title={locale==="ar"?"الرسائل الآمنة":"Secure messages"} onClose={()=>setMessagesOpen(false)}><CaseMessages key={c.id} locale={locale} role={role} caseId={c.id} messages={value.messages} canSend={showActions} busy={busy} mutate={mutate}/></CaseDrawer>}
  {moreOpen&&<CaseDrawer locale={locale} title={locale==="ar"?"إجراءات إضافية":"More actions"} onClose={()=>setMoreOpen(false)}>
   <MoreActions locale={locale} caseId={c.id} available={moreAvailable} travelPackage={!!c.travelPackageRequested} version={c.version} busy={busy} mutate={mutate}
    onRequestInformation={()=>{setMoreOpen(false);setInfoOpen(true);}} onRecordResponse={()=>{setMoreOpen(false);setRecordOpen(true);}}
    onRecordDecision={value.proposal?()=>{setMoreOpen(false);setRecordDecisionOpen(true);}:undefined}
    onAdministration={canRebalance?()=>{setMoreOpen(false);setAdminOpen(true);}:undefined}/>
  </CaseDrawer>}
  {/* Recording a WhatsApp/phone answer opens its own dialog; the trigger is hidden and driven from More actions so the page carries one control per business action. */}
  {isCoordinator&&owned&&available.includes("RECORD_PATIENT_RESPONSE")&&<RecordPatientResponse locale={locale} caseId={c.id} action={value.patientAction} mutate={mutate} open={recordOpen} onOpenChange={setRecordOpen} hideTrigger/>}
  {recordDecisionOpen&&value.proposal&&<CaseDrawer locale={locale} title={work.recordDecision.title} onClose={()=>setRecordDecisionOpen(false)}>
   <RecordProposalDecision key={value.proposal.versionId} locale={locale} caseId={c.id} proposal={value.proposal} busy={busy} mutate={async(path,body,method)=>{const result=await mutate(path,body,method);if(result)setRecordDecisionOpen(false);return result;}}/>
  </CaseDrawer>}
  {proposalOpen&&<CaseDrawer locale={locale} title={t.proposal} onClose={()=>setProposalOpen(false)}>
   <div className="space-y-4">{recommendationBlock}{value.proposal&&<ProposalCard locale={locale} t={t} proposal={value.proposal}/>}{value.delivery&&value.proposal&&<DeliveryCard delivery={value.delivery} caseId={c.id} versionId={value.proposal.versionId} locale={locale} busy={busy} mutate={mutate} canResend={false}/>}{value.deposit&&<DepositCard deposit={value.deposit} caseId={c.id} role={role} locale={locale} busy={busy} mutate={mutate}/>}</div>
  </CaseDrawer>}
  {adminOpen&&<CaseDrawer locale={locale} title={locale==="ar"?"نقل ملكية الحالة":"Transfer case ownership"} onClose={()=>setAdminOpen(false)}><TransferOwnership locale={locale} caseId={c.id} caseNumber={c.caseNumber} currentOwner={c.coordinatorSubject} currentOwnerName={c.coordinatorName} mySubject={mySubject} staff={staff} busy={busy} mutate={mutate} onClose={()=>setAdminOpen(false)}/></CaseDrawer>}
  {infoOpen&&<RequestInformationDialog locale={locale} caseIds={[c.id]} busy={busy} mutate={mutate} onClose={()=>setInfoOpen(false)}/>}
  {declineOpen&&myPending&&<DeclineAssignmentDialog locale={locale} caseNumber={c.caseNumber} busy={busy} onClose={()=>setDeclineOpen(false)}
   onConfirm={reason=>void mutate(`/${role}/cases/${c.id}/assignments/${myPending.id}`,{accept:false,reason})}/>}
 </div>;
}
/**
 * The proposal once it is history rather than work: version, decision, total, service count and validity
 * in one line, with the full breakdown, delivery and deposit one click away. The secure link the patient
 * currently holds is shown compactly with its one utility — resend — only while resending is valid.
 */
function ProposalSummary({locale,proposal,deposit,delivery,caseId,available,busy,mutate,onView}:{locale:Locale;proposal?:Proposal;deposit?:DepositView|null;delivery?:DeliveryStatus|null;caseId:string;available:string[];busy:boolean;mutate:Mutate;onView:()=>void}){
 const ar=locale==="ar";
 const total=proposal?proposal.items.filter(i=>!i.optional).reduce((sum,i)=>sum+i.quantity*i.unitPrice,0):null;
 const services=proposal?.items.length??0;
 const depositLabel=deposit?({REQUESTED:ar?"مطلوبة":"Requested",PARTIALLY_PAID:ar?"مدفوعة جزئيًا":"Partially paid",PAID:ar?"مدفوعة":"Paid",CANCELLED:ar?"ملغاة":"Cancelled",REFUNDED:ar?"مستردة":"Refunded",WAIVED:ar?"معفاة":"Waived"} as Record<string,string>)[deposit.status]??deposit.status:null;
 const fmt=(n:number,currency:string)=>new Intl.NumberFormat(locale,{style:"currency",currency,maximumFractionDigits:0}).format(n);
 const resendProposal=available.includes("RESEND_PROPOSAL_LINK")&&proposal;
 const resendProfile=available.includes("RESEND_ONBOARDING_LINK");
 const linkLabel=resendProfile?(ar?"رابط تفعيل الملف":"Profile link"):(ar?"رابط العرض":"Proposal link");
 const deliveryLabel=delivery?({QUEUED:ar?"في قائمة الإرسال":"Queued",DELIVERED:ar?"تم التسليم":"Delivered",RETRY:ar?"إعادة المحاولة":"Retrying",FAILED:ar?"فشل الإرسال":"Failed"} as Record<string,string>)[delivery.status]??delivery.status:null;
 return <section className="card p-4 sm:p-5" aria-labelledby="proposal-summary-title">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0">
    <h3 id="proposal-summary-title" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{ar?"آخر عرض":"Latest proposal"}</h3>
    {proposal?<>
     <p className="mt-1 text-[1rem] font-bold text-brand-900">{proposal.documentType==="FINAL_TREATMENT_QUOTE"?(ar?"عرض العلاج النهائي":"Final treatment quote"):(ar?"تقدير مبدئي":"Preliminary estimate")} · v{proposal.versionNumber} · {statusLabel(proposal.status,locale)}</p>
     <p className="mt-0.5 text-[0.85rem] text-ink-600">{total!=null&&<strong className="text-ink-900">{fmt(total,proposal.currency)}</strong>}{services>0&&<> · {services===1?(ar?"خدمة واحدة":"1 service"):ar?`${services} خدمات`:`${services} services`}</>}{proposal.validUntil&&<> · {ar?"صالح حتى":"Valid until"} {new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(proposal.validUntil))}</>}</p>
    </>:<p className="mt-1 text-[0.9rem] text-ink-600">{ar?"لا يوجد عرض بعد.":"No proposal yet."}</p>}
   </div>
   <button type="button" className="btn-secondary !min-h-9 !px-3 !text-[0.82rem]" onClick={onView}>{ar?"عرض التفاصيل":"View proposal"}</button>
  </div>
  <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-line pt-3 text-[0.85rem] sm:grid-cols-2">
   {deposit&&<div className="flex flex-wrap items-baseline justify-between gap-x-3"><dt className="text-ink-500">{ar?"وديعة التنسيق":"Coordination deposit"}</dt><dd className="font-semibold text-ink-800">{depositLabel}{deposit.totalDisplay!=null&&<> · {fmt(deposit.totalDisplay,deposit.currency||"EGP")}</>}{deposit.paidDisplay?<span className="text-ink-500"> · {ar?"المدفوع":"paid"} {fmt(deposit.paidDisplay,deposit.currency||"EGP")}</span>:null}</dd></div>}
   {(delivery||resendProfile)&&<div className="flex flex-wrap items-baseline justify-between gap-x-3"><dt className="text-ink-500">{ar?"الرابط الآمن":"Secure link"}</dt><dd className="flex flex-wrap items-center gap-x-2 font-semibold text-ink-800">
    {delivery&&!resendProfile&&<span>{deliveryLabel} · {delivery.channel==="WHATSAPP"?(ar?"واتساب":"WhatsApp"):(ar?"البريد":"Email")} · <span dir="ltr">{delivery.destinationMasked}</span></span>}
    {resendProfile&&<span>{linkLabel}{delivery?<> · {delivery.channel==="WHATSAPP"?(ar?"واتساب":"WhatsApp"):(ar?"البريد":"Email")} · <span dir="ltr">{delivery.destinationMasked}</span></>:null}</span>}
    {resendProposal&&<button type="button" className="link-cta text-[0.82rem]" disabled={busy} onClick={()=>void mutate(`/coordinator/cases/${caseId}/proposals/${proposal.versionId}/resend`)}>{ar?"إعادة الإرسال":"Resend link"}</button>}
    {resendProfile&&<button type="button" className="link-cta text-[0.82rem]" disabled={busy} onClick={()=>void mutate(`/coordinator/cases/${caseId}/onboarding-link/resend`)}>{ar?"إعادة الإرسال":"Resend link"}</button>}
   </dd></div>}
  </dl>
 </section>;
}
/**
 * What the coordinator needs to know about the case on the Overview, sized to the moment: before ownership
 * it is the routing brief that supports the take-ownership decision (facts, document count, intake summary —
 * never the files or messages themselves); after ownership it is the compact operational summary the current
 * action sits above. It renders only real data: a fact with nothing behind it is left out, not filled in.
 */
function CoordinatorBrief({locale,t,mySubject,c,actions,documents,preview,intakeSummary,consultantName,onClinical,onDocuments}:{locale:Locale;t:typeof copy.en;mySubject?:string;c:CaseView;actions:CaseActions;documents:CaseDocument[];preview:boolean;intakeSummary?:string;consultantName?:string|null;onClinical:()=>void;onDocuments:()=>void}){
 const work=useWorkCopy();
 const ar=locale==="ar";
 const when=(iso:string)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
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
  <h3 id="case-brief-title" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{preview?(ar?"ملخص الاستقبال":"Intake brief"):(ar?"ملخص الحالة":"Case brief")}</h3>
  <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.85rem] sm:grid-cols-2 lg:grid-cols-3">
   {facts.map(fact=><div key={fact.label} className="min-w-0"><dt className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{fact.label}</dt><dd className="mt-0.5 truncate font-semibold text-ink-800">{fact.value}</dd></div>)}
  </dl>
  {actions.waitingReason&&<p className="mt-3 text-[0.82rem] text-ink-600">{actions.waitingReason}</p>}
  <div className="mt-4 border-t border-line pt-3">
   <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{ar?"ملخص الحالة عند الاستقبال":"Intake summary"}</p>
   {summary?<p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-[0.88rem] leading-6 text-ink-700">{summary}</p>:<p className="mt-1 text-[0.85rem] text-ink-500">{ar?"لم يكتب المريض وصفًا للحالة.":"The patient did not describe their condition."}</p>}
   <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
    {summary&&<button type="button" className="link-cta text-[0.85rem]" onClick={onClinical}>{ar?"الملف السريري الكامل":"Full clinical file"}</button>}
    {documents.length>0&&<button type="button" className="link-cta text-[0.85rem]" onClick={onDocuments}>{ar?`المستندات (${documents.length})`:`Documents (${documents.length})`}</button>}
   </div>
  </div>
 </section>;
}
function HeaderFact({label,value}:{label:string;value:string}){
 return <span className="inline-flex items-baseline gap-1.5"><span className="text-ink-400">{label}:</span><strong className="font-semibold text-ink-800">{value}</strong></span>;
}

/** Secure messages and administration as side panels: one click away, never occupying the case page. */
function CaseDrawer({locale,title,onClose,children}:{locale:Locale;title:string;onClose:()=>void;children:React.ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 const feedback=useContext(FeedbackContext);
 // Start clean: what the page said before this drawer opened is not this drawer's result.
 const {clear}=feedback;
 useEffect(()=>{clear();},[clear]);
 const titleId=useId();
 // Return focus to whatever opened the drawer once it has really left the page. Closing it from the cleanup would fire
 // `close` (and onClose) under StrictMode's double effects, so the cleanup only restores focus after removal.
 const opener=useRef<HTMLElement|null>(null);
 useEffect(()=>{const node=dialog.current;opener.current??=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{setTimeout(()=>{if(node&&!node.isConnected)opener.current?.focus();},0);};},[]);
 return <dialog ref={dialog} className="account-dialog !w-[min(36rem,calc(100%-2rem))]" aria-labelledby={titleId} onClose={onClose}>
  <div className="sticky -top-6 z-10 -mx-6 -mt-6 flex items-start justify-between gap-4 border-b border-line bg-white px-6 pb-3 pt-6"><h2 id={titleId} className="title">{title}</h2><button type="button" className="icon-button" aria-label={locale==="ar"?"إغلاق":"Close"} onClick={()=>dialog.current?.close()}><X size={20}/></button></div>
  <div className="mt-4">
   {feedback.error&&<p role="alert" className="mb-4 rounded-lg bg-alert-50 p-3 text-[0.9rem] text-alert-800">{feedback.error}</p>}
   {feedback.notice&&<p role="status" className="mb-4 rounded-lg bg-brand-50 p-3 text-[0.9rem] text-brand-800">{feedback.notice}</p>}
   {children}
  </div>
 </dialog>;
}

/** History, not current work: every task and the recorded stage changes, out of the operational view. */
function CaseActivity({locale,tasks,timeline,onViewJourney}:{locale:Locale;tasks:Task[];timeline:{status:string;occurredAt:string}[];onViewJourney:()=>void}){
 const ar=locale==="ar";
 const open=tasks.filter(task=>["OPEN","IN_PROGRESS"].includes(task.status));
 const done=tasks.filter(task=>!["OPEN","IN_PROGRESS"].includes(task.status));
 const row=(task:Task)=><li key={task.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2.5 last:border-0">
  <span className="font-semibold text-ink-800">{task.title}</span>
  <span className={`text-[0.78rem] ${task.overdue&&["OPEN","IN_PROGRESS"].includes(task.status)?"font-bold text-alert-700":"text-ink-500"}`}>{statusLabel(task.status,locale)}</span>
 </li>;
 return <div className="space-y-5">
  <section className="card p-4">
   <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{ar?"المهام":"Work items"}</h3>
   {tasks.length===0?<p className="mt-2 text-sm text-ink-500">{ar?"لا توجد مهام على هذه الحالة.":"No work items on this case."}</p>
    :<ul className="mt-2">{open.map(row)}{done.map(row)}</ul>}
  </section>
  <section className="card p-4">
   <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{ar?"مراحل الحالة":"Case history"}</h3>
   <p className="mt-2 text-sm text-ink-600">{ar?`${timeline.length} تغييرات مسجلة.`:`${timeline.length} recorded stage changes.`}</p>
   <button type="button" className="link-cta mt-3 text-[0.88rem]" onClick={onViewJourney}>{ar?"عرض الرحلة كاملة":"View full journey"}</button>
  </section>
 </div>;
}



function ProposalSendForm({caseId,reviewId,language,estimate,locale,t,busy,onSend}:{caseId:string;reviewId:string;language:string;estimate?:Review;fxRates:FxRate[];locale:Locale;t:typeof copy.en;busy:boolean;onSend:(caseId:string,body:unknown)=>void}){
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
 const send=()=>{if(!items.length)return;onSend(caseId,{clinicalReviewId:reviewId,language,includedServices:items.map(i=>i.description).join("; "),paymentTerms:PROPOSAL_PAYMENT_TERMS_RECORD,coordinatorNotes:notes.trim()||undefined,validUntil:new Date(Date.now()+14*86400000).toISOString(),items});};
 return <div className="mt-4 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-bold text-ink-700">{labels.currency}<span className="rounded-full bg-brand-50 px-3 py-1 text-brand-800">{CURRENCY_LABELS[proposalCurrency]?.[locale]??proposalCurrency}</span></span><span className="text-xs text-ink-500">{labels.rateNote}</span></div>
  <div className="overflow-hidden rounded-xl border border-brand-200"><div className="flex flex-wrap items-center justify-between gap-2 bg-brand-50 px-4 py-3"><h4 className="font-bold text-brand-900">{t.servicesFromConsultant}</h4><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-700">✓ {labels.source}</span></div><p className="border-b border-brand-100 px-4 py-3 text-sm text-ink-600">{labels.locked}</p>{items.length?<ul className="divide-y divide-line">{items.map(item=><li key={item.sortOrder} className="flex items-baseline justify-between gap-4 px-4 py-3"><span className="font-semibold">{item.description}</span><span className="text-end"><strong className="block whitespace-nowrap">{quoted&&item.quotedPrice!=null?money(item.quotedPrice,proposalCurrency,locale):money(item.unitPrice,baseCurrency,locale)}</strong>{quoted&&<span className="block whitespace-nowrap text-[0.75rem] text-ink-500">{locale==="ar"?"الأساس":"Base"} {money(item.unitPrice,baseCurrency,locale)}</span>}</span></li>)}<li className="flex items-baseline justify-between gap-4 bg-brand-50 px-4 py-3"><span className="font-bold">{locale==="ar"?"الإجمالي":"Total"}</span><span className="text-end"><strong className="block whitespace-nowrap">{quotedTotal!=null?money(quotedTotal,proposalCurrency,locale):money(total,baseCurrency,locale)}</strong>{quotedTotal!=null&&<span className="block whitespace-nowrap text-[0.75rem] text-ink-500">{locale==="ar"?"الأساس":"Base"} {money(total,baseCurrency,locale)}</span>}</span></li></ul>:<p className="bg-alert-50 p-4 text-sm font-semibold text-alert-800">{labels.missing}</p>}{rateNote&&<p className="border-t border-brand-100 px-4 py-2 text-xs text-ink-500">{rateNote}</p>}{rateUnavailable&&<p role="alert" className="border-t border-alert-200 bg-alert-50 px-4 py-3 text-sm font-semibold text-alert-800">{locale==="ar"?`لا يتوفر سعر صرف لعملة ${proposalCurrency} حاليًا، لذلك لا يمكن عرض المبالغ بها ولا إنشاء العرض حتى يتوفر السعر.`:`No exchange rate is available for ${proposalCurrency} right now, so the amounts cannot be quoted in it and the proposal cannot be created until a rate is available.`}</p>}</div>
  <div><label className="block"><span className="title text-base">{labels.coordination}</span><span className="mt-1 block text-sm text-ink-500">{labels.coordinationHint}</span><textarea className="field mt-2 min-h-24" maxLength={20000} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
  <button type="button" disabled={busy||!items.length||rateUnavailable} className="btn-primary w-full justify-center py-3 text-base sm:w-auto" onClick={send}>{t.createProposal}</button>
 </div>;
}
function ProposalShareLinks({share,locale,t}:{share:{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string};locale:Locale;t:typeof copy.en}){
 const[copied,setCopied]=useState(false);
 const base=typeof window!=="undefined"?window.location.origin:SITE_URL;
 const link=`${base}/${locale}/proposal/${share.token}`;
 const msg=`RehletShifaa — your treatment proposal${share.caseNumber?` (${share.caseNumber})`:""}: ${link}`;
 const wa=share.whatsapp?`https://wa.me/${share.whatsapp.replace(/[^0-9]/g,"")}?text=${encodeURIComponent(msg)}`:undefined;
 const mail=`mailto:${share.email??""}?subject=${encodeURIComponent("Your RehletShifaa proposal")}&body=${encodeURIComponent(msg)}`;
 const doCopy=()=>{void navigator.clipboard?.writeText(link).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);});};
 return <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="mb-3 text-sm font-bold text-brand-800">{t.linkReady}</p><p className="mb-3 break-all rounded-lg bg-white p-2 text-sm">{link}</p><div className="flex flex-wrap gap-2">{wa&&<a className="btn-primary" href={wa} target="_blank" rel="noopener noreferrer">{t.sendWhatsapp}</a>}<a className={`btn-secondary ${share.email?"":"pointer-events-none opacity-50"}`} href={mail}>{share.email?t.sendEmail:t.noPatientEmail}</a><button type="button" className="btn-secondary" onClick={doCopy}>{copied?t.copied:t.copyLink}</button></div></div>;
}
function FinalAssessment({caseId,busy,locale,catalog,fxRates,mutate}:{caseId:string;busy:boolean;locale:Locale;catalog:CatalogService[];fxRates:FxRate[];mutate:Mutate}){
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
  <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-brand-800">{g.services}</span><select aria-label={g.currency} className="field !mt-0 w-auto py-1" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(code=><option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale]??code}</option>)}</select></div>
   {catalog.length>0&&<div className="mt-2 space-y-1.5">{catalog.map(s=>{const on=selected.has(s.id);return <button type="button" key={s.id} onClick={()=>toggle(s.id)} aria-pressed={on} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-start transition ${on?"border-brand-500 bg-white":"border-line bg-white/60"}`}><span className="flex items-center gap-2.5"><span className={`flex h-5 w-5 flex-none items-center justify-center rounded border text-xs ${on?"border-brand-500 bg-brand-500 text-white":"border-line"}`} aria-hidden>{on?"✓":""}</span><span className="text-sm font-semibold text-ink-800">{s.serviceName}</span></span><span className="text-sm font-bold">{money(s.priceEgp*rate,currency,locale)}</span></button>;})}</div>}
   <p className="mt-3 text-sm font-bold text-ink-700">{g.manual}</p>
   <div className="mt-1 space-y-2">{costs.map((row,i)=><div key={i} className="flex gap-2"><input aria-label={g.service} className="field flex-1" value={row.description} onChange={e=>updateCost(i,"description",e.target.value)} placeholder={g.service}/><input aria-label={g.amount} className="field w-32" type="number" min="0" step="0.01" value={row.amount} onChange={e=>updateCost(i,"amount",e.target.value)} placeholder={`${g.amount} (${currency})`}/>{costs.length>1&&<button type="button" className="btn-secondary" onClick={()=>setCosts(rows=>rows.filter((_,idx)=>idx!==i))} aria-label={locale==="ar"?"إزالة الخدمة":"Remove service"}>×</button>}</div>)}</div>
   <button type="button" className="btn-secondary mt-2" onClick={()=>setCosts(rows=>[...rows,{description:"",amount:""}])}>+ {g.add}</button>
  </div>
  <button className="btn-primary w-full sm:w-auto" disabled={busy} onClick={save}>{g.save}</button>
 </div>;
}
function FinalQuoteActions({caseId,reviewId,proposal,gates,fxRates,locale,busy,mutate}:{caseId:string;reviewId?:string;proposal?:Proposal;gates?:ProposalGates|null;fxRates:FxRate[];locale:Locale;busy:boolean;mutate:Mutate}){
 const[currency,setCurrency]=useState("EGP");const[scope,setScope]=useState("");
 const g=locale==="ar"?{title:"العرض النهائي",createIntro:"أنشئ العرض النهائي من التقييم النهائي المعتمد. لا يتغيّر وضع الحالة.",currency:"عملة عرض المريض",scope:"سبب تغيّر النطاق مقارنةً بالتقدير المبدئي",create:"إنشاء العرض النهائي",release:"إرسال العرض النهائي للمريض",releaseHint:"يُرسل رابطًا آمنًا. تبقى الحالة عند «تأكيد الوصول».",needReview:"يجب أن يسجّل الطبيب تقييمًا نهائيًا معتمدًا أولًا.",financeWait:"بانتظار الموافقة المالية على الخدمات المُدخلة يدويًا."}:{title:"Final treatment quote",createIntro:"Create the final quote from the approved final assessment. The case status does not change.",currency:"Patient's quote currency",scope:"Why the scope changed vs the preliminary estimate",create:"Create final quote",release:"Send final quote to patient",releaseHint:"Sends a secure link. The case stays at arrival confirmed.",needReview:"The doctor must record an approved final assessment first.",financeWait:"Waiting for finance approval of the manually-priced services."};
 const currencyOptions=["EGP",...fxRates.filter(f=>f.currency!=="EGP").map(f=>f.currency)];
 const isFinalDraft=proposal?.documentType==="FINAL_TREATMENT_QUOTE"&&["CLINICALLY_APPROVED","FINANCE_APPROVED"].includes(proposal.status);
 if(isFinalDraft&&proposal)return <div className="mt-4 rounded-xl border border-brand-200 p-4"><h4 className="font-bold text-brand-800">{g.title}</h4>{gates?.financeRequired&&!gates.financeCompleted?<p className="mt-2 text-sm text-alert-700">{g.financeWait}</p>:null}<button className="btn-primary mt-3" disabled={busy||!gates?.readyForRelease} onClick={()=>void mutate(`/coordinator/cases/${caseId}/final-quotes/${proposal.versionId}/release`)}>{g.release}</button><p className="mt-2 text-xs text-ink-500">{g.releaseHint}</p></div>;
 if(proposal?.documentType==="FINAL_TREATMENT_QUOTE")return null;
 return <div className="mt-4 rounded-xl border border-brand-200 p-4"><h4 className="font-bold text-brand-800">{g.title}</h4><p className="mt-1 text-sm text-ink-500">{g.createIntro}</p>{!reviewId?<p className="mt-2 text-sm text-ink-500">{g.needReview}</p>:<><label className="mt-3 block text-sm font-bold">{g.currency}<select className="field mt-1 w-auto" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(code=><option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale]??code}</option>)}</select></label><label className="mt-3 block text-sm font-bold">{g.scope}<textarea className="field mt-1" rows={2} value={scope} onChange={e=>setScope(e.target.value)}/></label><button className="btn-primary mt-3" disabled={busy} onClick={()=>{const validUntil=new Date(Date.now()+14*86400000).toISOString();void mutate(`/coordinator/cases/${caseId}/final-quotes`,{clinicalReviewId:reviewId,currency,scopeChangeReason:scope||undefined,validUntil});}}>{g.create}</button></>}</div>;
}
function DepositCard({deposit,caseId,role,locale,busy,mutate}:{deposit:DepositView;caseId:string;role:RoleKey;locale:Locale;busy:boolean;mutate:Mutate}){
 const isFinance=role==="finance";
 const g=locale==="ar"?{title:"وديعة التنسيق والدفعات",total:"الإجمالي",paid:"المدفوع",balance:"المتبقي",record:"تسجيل دفعة",refund:"تسجيل استرداد",amount:"المبلغ (ج.م)",method:"الطريقة",reference:"مرجع المزوّد",reason:"سبب الاسترداد",note:"تسجيل دون اتصال فقط — يسجّل الدفعات المستلمة فعليًا؛ لا تُدخل بيانات بطاقة.",credited:"تُخصم من الرصيد النهائي",REQUESTED:"مطلوبة",PARTIALLY_PAID:"مدفوعة جزئيًا",PAID:"مدفوعة",CANCELLED:"ملغاة",REFUNDED:"مستردة"}:{title:"Coordination deposit & payments",total:"Total",paid:"Paid",balance:"Balance",record:"Record a payment",refund:"Record a refund",amount:"Amount (EGP)",method:"Method",reference:"Provider reference",reason:"Refund reason",note:"Offline record-only — records payments actually received; no card data is entered.",credited:"credited to final",REQUESTED:"Requested",PARTIALLY_PAID:"Partially paid",PAID:"Paid",CANCELLED:"Cancelled",REFUNDED:"Refunded"};
 const money=(n?:number)=>n==null?"—":new Intl.NumberFormat(locale,{style:"currency",currency:deposit.currency||"EGP"}).format(n);
 const label=(g as Record<string,string>)[deposit.status]??deposit.status;
 const cls=deposit.status==="PAID"?"bg-brand-50 text-brand-700":(deposit.status==="REFUNDED"||deposit.status==="CANCELLED")?"bg-mist text-ink-600":"bg-alert-50 text-alert-700";
 return <div className="mt-4 rounded-xl border border-line p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-ink-800">{g.title}</h4><span className={`rounded px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span></div>
  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3"><div><span className="text-ink-500">{g.total}</span><br/><strong>{money(deposit.totalDisplay)}</strong></div><div><span className="text-ink-500">{g.paid}</span><br/><strong>{money(deposit.paidDisplay)}</strong></div><div><span className="text-ink-500">{g.balance}</span><br/><strong>{money(deposit.balanceDisplay)}</strong></div></div>
  {deposit.components.length>0&&<ul className="mt-3 space-y-1 text-sm">{deposit.components.map((cp,i)=><li key={i} className="flex justify-between gap-3"><span>{cp.purpose} <span className="text-xs text-ink-400">({cp.beneficiary}{cp.creditedToFinal?` · ${g.credited}`:""})</span></span><strong className="whitespace-nowrap">{money(cp.amountDisplay)}</strong></li>)}</ul>}
  {isFinance&&<>
   <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);void mutate(`/finance/cases/${caseId}/deposits/${deposit.id}/payments`,{amountEgp:Number(d.get("amount"))||0,method:String(d.get("method")||"")||undefined,providerReference:String(d.get("reference")||"")||undefined,idempotencyKey:crypto.randomUUID()}).then(result=>{if(result)f.reset();});}}>
    <label className="text-xs font-bold">{g.amount}<input className="field w-28" name="amount" type="number" min="0.01" step="0.01" required/></label>
    <label className="text-xs font-bold">{g.method}<input className="field w-28" name="method" placeholder="Bank"/></label>
    <label className="text-xs font-bold">{g.reference}<input className="field w-32" name="reference"/></label>
    <button className="btn-primary" disabled={busy}>{g.record}</button>
   </form>
   <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);void mutate(`/finance/cases/${caseId}/deposits/${deposit.id}/refunds`,{amountEgp:Number(d.get("amount"))||0,reason:String(d.get("reason")||"").trim(),idempotencyKey:crypto.randomUUID()}).then(result=>{if(result)f.reset();});}}>
    <label className="text-xs font-bold">{g.amount}<input className="field w-28" name="amount" type="number" min="0.01" step="0.01" required/></label>
    <label className="flex-1 text-xs font-bold">{g.reason}<input className="field" name="reason" required/></label>
    <button className="btn-secondary" disabled={busy}>{g.refund}</button>
   </form>
   <p className="mt-2 text-xs text-ink-500">{g.note}</p>
  </>}
 </div>;
}
function DeliveryCard({delivery,caseId,versionId,locale,busy,mutate,canResend=true}:{delivery:DeliveryStatus;caseId:string;versionId:string;locale:Locale;busy:boolean;mutate:Mutate;canResend?:boolean}){
 const g=locale==="ar"?{title:"حالة إرسال الرابط الآمن",channel:"القناة",to:"إلى",attempts:"المحاولات",resend:"إعادة إرسال الرابط",QUEUED:"في قائمة الإرسال",DELIVERED:"تم التسليم",RETRY:"إعادة المحاولة",FAILED:"فشل الإرسال",resendHint:"يُلغي الرابط ورمز التحقق السابقين ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرضًا جديدًا ولا يغيّر حالة الطلب."}:{title:"Secure link delivery",channel:"Channel",to:"To",attempts:"Attempts",resend:"Resend link",QUEUED:"Queued",DELIVERED:"Delivered",RETRY:"Retrying",FAILED:"Failed",resendHint:"Revokes the previous link and code and sends a fresh secure link to the patient's verified contact. It does not create a new proposal or change the case."};
 const label=(g as Record<string,string>)[delivery.status]??delivery.status;
 const cls=delivery.status==="DELIVERED"?"bg-brand-50 text-brand-700":delivery.status==="FAILED"?"bg-alert-50 text-alert-700":"bg-mist text-ink-600";
 return <div className="mt-4 rounded-xl border border-line p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-ink-800">{g.title}</p><span className={`rounded px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span></div>
  <p className="mt-2 text-sm text-ink-600">{g.channel}: <strong>{delivery.channel}</strong> · {g.to} <span dir="ltr">{delivery.destinationMasked}</span>{delivery.attempts>0?` · ${g.attempts}: ${delivery.attempts}`:""}</p>
  {canResend&&<button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>void mutate(`/coordinator/cases/${caseId}/proposals/${versionId}/resend`)}>{g.resend}</button>}
  {canResend&&<p className="mt-2 text-xs text-ink-500">{g.resendHint}</p>}</div>;
}
export function RoleActions({role,t,c,proposal,gates,availableActions,locale,mutate}:{role:RoleKey;t:typeof copy.en;c:CaseView;proposal?:Proposal;gates?:ProposalGates|null;availableActions:string[];locale:Locale;mutate:Mutate}){
 const[operationsPlan,setOperationsPlan]=useState(proposal?.operationalPlan??"");
 const gl=locale==="ar"?{checklist:"متطلبات الإرسال",operations:"العمليات (باقة السفر)",finance:"الموافقة المالية",notReq:"غير مطلوب",waiting:"بانتظار",done:"مكتمل",releaseHint:"يُفعَّل الإرسال بعد اكتمال جميع المتطلبات."}:{checklist:"Release requirements",operations:"Operations (travel package)",finance:"Finance approval",notReq:"Not required",waiting:"Waiting",done:"Complete",releaseHint:"Release unlocks once every required step is complete."};
 const badge=(required:boolean,done:boolean)=>{const s=!required?gl.notReq:done?gl.done:gl.waiting;const cls=!required?"bg-mist text-ink-500":done?"bg-brand-50 text-brand-700":"bg-alert-50 text-alert-700";return <span className={`rounded px-2 py-0.5 text-xs font-bold ${cls}`}>{s}</span>;};
 const checklist=gates&&["coordinator","operations","finance"].includes(role)?<div className="mt-4 rounded-xl border border-line p-3"><p className="mb-2 text-sm font-bold text-ink-800">{gl.checklist}</p><div className="space-y-1.5 text-sm"><div className="flex items-center justify-between gap-2"><span>{gl.operations}</span>{badge(gates.operationsRequired,gates.operationsCompleted)}</div><div className="flex items-center justify-between gap-2"><span>{gl.finance}</span>{badge(gates.financeRequired,gates.financeCompleted)}</div></div>{gates.financeRequired&&gates.financeReasons.length>0&&<p className="mt-2 text-xs text-ink-500">{gates.financeReasons.join(" ")}</p>}</div>:null;
 if(role==="operations")return <>{checklist}{availableActions.includes("UPDATE_TRAVEL_PLAN")&&proposal?.status==="CLINICALLY_APPROVED"?<div className="mt-4 space-y-3"><textarea className="field min-h-28" aria-label={t.operationsComplete} maxLength={30000} required value={operationsPlan} onChange={event=>setOperationsPlan(event.target.value)}/><button className="btn-primary" disabled={!operationsPlan.trim()} onClick={()=>void mutate(`/operations/cases/${c.id}/proposals/${proposal.versionId}/complete`,{plan:operationsPlan.trim()})}>{t.operationsComplete}</button></div>:null}</>;
 if(role==="finance")return <>{checklist}{availableActions.includes("APPROVE_COMMERCIAL_TERMS")&&proposal?<button className="btn-primary mt-4" onClick={()=>void mutate(`/finance/cases/${c.id}/proposals/${proposal.versionId}/approve`)}>{t.financeApprove}</button>:null}</>;
 if(role==="coordinator")return <>{checklist}{gates?.readyForRelease&&proposal?<div className="mt-4"><button className="btn-primary" onClick={()=>void mutate(`/coordinator/cases/${c.id}/proposals/${proposal.versionId}/release`)}>{t.release}</button><p className="mt-2 text-xs text-ink-500">{gl.releaseHint}</p></div>:(gates&&!gates.readyForRelease?<p className="mt-3 text-xs text-ink-500">{gl.releaseHint}</p>:null)}</>;
 return null;
}
function ProposalCard({locale,t,proposal}:{locale:Locale;t:typeof copy.en;proposal:Proposal}){const total=proposal.items.filter(i=>!i.optional).reduce((sum,i)=>sum+i.quantity*i.unitPrice,0);return <div className="rounded-xl bg-brand-50 p-5"><div className="flex justify-between gap-3"><strong>v{proposal.versionNumber} · {statusLabel(proposal.status,locale)}</strong><strong>{new Intl.NumberFormat(locale,{style:"currency",currency:proposal.currency}).format(total)}</strong></div><ul className="mt-3 space-y-1">{proposal.items.map(item=><li key={item.id} className="flex justify-between gap-3"><span>{item.description}{item.quantity>1?` × ${item.quantity}`:""}{item.optional?(locale==="ar"?" (اختياري)":" (optional)"):""}</span><strong className="whitespace-nowrap">{money(item.quantity*item.unitPrice,proposal.currency,locale)}</strong></li>)}</ul>{proposal.coordinatorNotes&&<div className="mt-3 rounded-lg bg-white/70 p-3 text-sm"><p className="font-bold text-brand-700">{t.proposalNotesLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{proposal.coordinatorNotes}</p></div>}{proposal.validUntil&&<p className="mt-3 text-sm">{locale==="ar"?"صالح حتى":"Valid until"} {new Intl.DateTimeFormat(locale).format(new Date(proposal.validUntil))}</p>}</div>}
function Panel({title,children,wide=false}:{title:string;children:React.ReactNode;wide?:boolean}){return <section className={`card mt-6 p-5 ${wide?"":""}`}><h3 className="title mb-4">{title}</h3><div className="space-y-3">{children}</div></section>}
function Empty(){return <p className="text-ink-500">—</p>}
function formatBytes(bytes:number){if(!bytes)return "0 B";const units=["B","KB","MB","GB"];const i=Math.min(units.length-1,Math.floor(Math.log(bytes)/Math.log(1024)));return `${(bytes/Math.pow(1024,i)).toFixed(i?1:0)} ${units[i]}`;}
const STATUS_LABELS:Record<string,{en:string;ar:string}>={RECEIVED:{en:"Received",ar:"تم الاستلام"},INTAKE_REVIEW:{en:"Intake review",ar:"مراجعة الاستقبال"},INFORMATION_REQUIRED:{en:"Information required",ar:"مطلوب معلومات"},READY_FOR_CONSULTANT:{en:"Ready for consultant",ar:"جاهزة للاستشاري"},CONSULTANT_ASSIGNMENT_PENDING:{en:"Assigned to consultant",ar:"تم التعيين للاستشاري"},CONSULTANT_REVIEW:{en:"Under consultant review",ar:"قيد مراجعة الاستشاري"},CLINICAL_RECOMMENDATION_READY:{en:"Treatment recommendation ready",ar:"توصية العلاج جاهزة"},PROPOSAL_PREPARATION:{en:"Preparing your proposal",ar:"جارٍ تحضير المقترح"},PROPOSAL_INTERNAL_APPROVAL:{en:"Internal approval",ar:"الموافقة الداخلية"},PATIENT_DECISION:{en:"Waiting for your decision",ar:"بانتظار قرارك"},REVISION_REQUESTED:{en:"Revision requested",ar:"مطلوب تعديل"},ACCEPTED:{en:"Preliminary estimate acknowledged",ar:"تم الإقرار بالتقدير المبدئي"},DECLINED:{en:"Proposal declined",ar:"تم رفض العرض"},CLINICALLY_NOT_SUITABLE:{en:"Not clinically suitable",ar:"غير مناسبة سريريًا"},EXPIRED:{en:"Proposal expired",ar:"انتهت صلاحية العرض"},TRAVEL_COORDINATION:{en:"Travel coordination",ar:"تنسيق السفر"},ARRIVAL_CONFIRMED:{en:"Arrival confirmed",ar:"تم تأكيد الوصول"},TREATMENT_IN_PROGRESS:{en:"Treatment in progress",ar:"العلاج جارٍ"},DISCHARGED:{en:"Discharged",ar:"تم الخروج"},FOLLOW_UP:{en:"Follow-up",ar:"المتابعة"},CLOSED:{en:"Closed",ar:"مغلقة"},CANCELLED:{en:"Cancelled",ar:"ملغاة"}};
function statusLabel(value:string,locale:Locale){return STATUS_LABELS[value]?.[locale]??value.replaceAll("_"," ");}
function Status({value,locale="en"}:{value:string;locale?:Locale}){
 const tone=["INFORMATION_REQUIRED","REVISION_REQUESTED","EXPIRED"].includes(value)?"border-amber-200 bg-amber-50 text-amber-900":["CANCELLED","DECLINED","CLINICALLY_NOT_SUITABLE"].includes(value)?"border-alert-200 bg-alert-50 text-alert-800":["CLOSED","DISCHARGED","FOLLOW_UP"].includes(value)?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-brand-200 bg-brand-50 text-brand-800";
 return <span className={`rounded-full border px-3 py-1 text-sm font-bold ${tone}`}>{statusLabel(value,locale)}</span>
}
