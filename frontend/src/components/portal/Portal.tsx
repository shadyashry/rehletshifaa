"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { CaseWorkflowActions, TaskCreateForm } from "@/components/portal/CaseWorkflowActions";
import { PatientOnboarding } from "@/components/portal/PatientOnboarding";
import { CustomerReadinessCard } from "@/components/portal/CustomerReadinessCard";
import { CaseMessages, TaskActions, PatientProposalDecision } from "@/components/portal/CaseMessages";
import { PortalAccount, type Preferences } from "@/components/portal/PortalAccount";
import { CaseQueue, initialQueue, type QueueState } from "@/components/portal/CaseQueue";
import { ReportingTeam, IdentityReviewQueue, PractitionerDirectory } from "@/components/portal/PortalDirectories";
import type { Locale } from "@/lib/i18n";

type CaseView={id:string;caseNumber:string;status:string;patientName:string;country:string;preferredLanguage:string;careCategory?:string;createdAt:string;updatedAt:string;version:number;coordinatorSubject?:string;doctorSubject?:string;coordinatorName?:string;doctorName?:string;travelPackageRequested?:boolean};
type CatalogService={id:string;serviceCode:string;serviceName:string;category?:string;priceEgp:number;active:boolean};
type FxRate={currency:string;rate:number;rateDate:string;source:string};
type Assignment={id:string;assigneeSubject:string;assigneeRole:string;assignmentType:string;status:string;assignedAt:string;version:number};
type CaseDocument={documentId:string;fileName:string;contentType:string;sizeBytes:number;status:string;createdAt:string;confirmedAt?:string};
type VerifiedDoctor={subject:string;displayName:string;specialty?:string;subspecialty?:string;availabilityStatus?:string;careCategory?:string};
type DoctorProfile={displayName?:string;specialty?:string;subspecialty?:string;careCategory?:string;availabilityStatus?:string;credentialingStatus?:string};
type StaffProfile={displayName?:string;role?:string};
type CareCategory={slug:string;nameEn:string;nameAr:string};
type StaffMember={subject:string;name:string;role:string};
type CostEstimate={serviceDescription:string;estimatedCost:number;currency:string};
type Review={id:string;versionNumber:number;status:string;suitability?:string;recommendedTreatment?:string;risksAndLimitations?:string;createdAt:string;costEstimates?:CostEstimate[]};
type ProposalItem={id:string;category:string;description:string;quantity:number;unitPrice:number;optional:boolean};
type Proposal={proposalId:string;versionId:string;versionNumber:number;status:string;language:string;currency?:string;validUntil?:string;operationalPlan?:string;items:ProposalItem[];coordinatorNotes?:string;documentType?:string;scopeChangeReason?:string};
type Task={id:string;caseId:string;title:string;description?:string;ownerSubject?:string;status:string;priority:string;blocking:boolean;overdue:boolean;version:number};
type ProposalGates={operationsRequired:boolean;operationsReason:string;operationsCompleted:boolean;financeRequired:boolean;financeReasons:string[];financeCompleted:boolean;readyForRelease:boolean};
type DeliveryStatus={status:string;channel:string;destinationMasked:string;attempts:number;deliveredAt?:string;nextAttemptAt?:string};
type DepositComponentT={beneficiary:string;purpose:string;amountEgp:number;amountDisplay?:number;refundability:string;cancellationTerms?:string;creditedToFinal:boolean};
type PaymentEvent={eventType:string;amountDisplay?:number;currency?:string;method?:string;provider?:string;providerReference?:string;status:string;reason?:string;occurredAt?:string};
type DepositView={id:string;status:string;currency:string;totalEgp:number;totalDisplay?:number;paidDisplay?:number;balanceDisplay?:number;components:DepositComponentT[];events:PaymentEvent[]};
type Workspace={preview?:boolean;intakeSummary?:string;caseSummary:CaseView;timeline:{type:string;label:string;occurredAt:string;status:string}[];tasks:Task[];messages:{id:string;senderRole:string;senderName?:string;direction:string;body:string;createdAt:string;internalOnly:boolean;read:boolean}[];assignments:Assignment[];clinicalReviews:Review[];proposal?:Proposal;gates?:ProposalGates|null;delivery?:DeliveryStatus|null;deposit?:DepositView|null};
type RoleKey="patient"|"coordinator"|"doctor"|"operations"|"finance"|"admin"|"identity";
type MutationResult={id?:string;status?:string};
type Mutate=(path:string,body?:unknown,method?:string)=>Promise<MutationResult|undefined>;
type Api=<T,>(path:string,init?:RequestInit)=>Promise<T>;
type PractitionerSummary={id:string;displayName?:string;specialty?:string;subspecialty?:string;careCategory?:string;credentialingStatus?:string;availabilityStatus?:string};
type CommercialPolicy={id:string;name:string;careCategory?:string;marginRate:number;active:boolean;version:number;createdBy?:string;validFrom?:string};
type DepositPolicy={id:string;name:string;careCategory?:string;coordinationDepositEgp:number;active:boolean;version:number;createdBy?:string;validFrom?:string};
type CatalogImportRow={line:number;serviceCode:string;serviceName:string;category?:string;priceEgp?:number;action:string;message?:string};
type CatalogImportResult={committed:boolean;added:number;updated:number;unchanged:number;errors:number;rows:CatalogImportRow[]};

const roleMap:Record<RoleKey,string[]>={patient:["PATIENT","PATIENT_REPRESENTATIVE"],coordinator:["COORDINATOR","COORDINATOR_LEAD"],doctor:["DOCTOR"],operations:["OPERATIONS","OPERATIONS_LEAD"],finance:["FINANCE","FINANCE_LEAD"],admin:["CREDENTIALING_ADMIN","SYSTEM_ADMIN","AUDITOR"],identity:["PATIENT_IDENTITY_REVIEWER","SYSTEM_ADMIN"]};
// Display labels for currencies the doctor can view/quote in (EGP is the base).
const CURRENCY_LABELS:Record<string,{en:string;ar:string}>={USD:{en:"USD — US Dollar",ar:"USD — دولار أمريكي"},EUR:{en:"EUR — Euro",ar:"EUR — يورو"},EGP:{en:"EGP — Egyptian Pound",ar:"EGP — جنيه مصري"},AED:{en:"AED — UAE Dirham",ar:"AED — درهم إماراتي"},SAR:{en:"SAR — Saudi Riyal",ar:"SAR — ريال سعودي"},GBP:{en:"GBP — British Pound",ar:"GBP — جنيه إسترليني"},KWD:{en:"KWD — Kuwaiti Dinar",ar:"KWD — دينار كويتي"},QAR:{en:"QAR — Qatari Riyal",ar:"QAR — ريال قطري"},JOD:{en:"JOD — Jordanian Dinar",ar:"JOD — دينار أردني"}};
function money(amount:number,currency:string,locale:Locale){try{return new Intl.NumberFormat(locale,{style:"currency",currency}).format(amount);}catch{return `${amount.toLocaleString(locale)} ${currency}`;}}
const copy={
  en:{title:"Secure care portal",subtitle:"One accountable workspace from intake through treatment and follow-up.",signIn:"Sign in securely",signOut:"Sign out",loading:"Loading your workspace…",noCases:"No cases are available in this queue.",grpAction:"Action required",grpTracking:"Tracking — latest status",grpMoreInfo:"More information requested",grpNotSuitable:"Not clinically suitable",claimTitle:"Link an existing request",caseId:"Case ID",code:"6-digit verification code",claim:"Link case",open:"Open workspace",back:"Back to queue",timeline:"Case journey",tasks:"Tasks",messages:"Secure messages",send:"Send message",message:"Write a message",assignments:"Care team",documents:"Patient documents",download:"Download",docScanning:"Security scan in progress",docUnavailable:"Unavailable",noDocuments:"No documents uploaded yet.",reviews:"Doctor reviews",coordinatorLabel:"Coordinator",consultantLabel:"Consultant",you:"You",signedInAs:"Signed in as",myDashboard:"My dashboard",caseWorkspaceLabel:"Case workspace",patientLabel:"Patient",careArea:"Care area",languageLabel:"Language",updatedLabel:"Last updated",countryLabel:"Country",reviewIntro:"Review the patient documents, then record your clinical decision below.",acceptHint:"Confirm the case is suitable and send your recommendation to the coordinator.",infoHint:"Ask the coordinator for more information before deciding.",returnHint:"Hand the case back to the coordinator.",reassignHint:"Release the case for a second opinion or another consultant.",notSuitableHint:"Mark the case clinically unsuitable for treatment.",decisionHeading:"Clinical decision",costTitle:"Estimated cost per service",costHint:"Add your average cost for each service. The coordinator will see these when preparing the patient proposal, and they appear on the proposal alongside your recommendation.",costService:"Service",costAmount:"Amount",costCurrency:"Currency",addCost:"Add service",estimatedByConsultant:"Cost estimate by the consultant",prefilledFromReview:"Pre-filled from the consultant's cost estimate — adjust before sending.",servicesFromConsultant:"Services & costs",additionalCostTitle:"Additional cost (optional)",additionalCostHint:"An extra optional item, shown separately and not added to the base total.",additionalCostDesc:"What is it for?",commentsTitle:"Comments for the patient (optional)",commentsHint:"Shown on the proposal alongside the recommendation and services.",proposalNotesLabel:"Coordinator note",assignedToYou:"You've been assigned to this case — accept to start your review.",doctorAccepted:"Case accepted and assigned back to the coordinator.",doctorInfoSent:"More information requested — assigned back to the coordinator.",doctorNotSuitable:"Marked not clinically suitable and returned to the coordinator.",doctorReturned:"This case has been returned to the coordinator.",proposal:"Patient proposal",genSend:"Generate & send proposal",addService:"Add service",sendWhatsapp:"Send on WhatsApp",sendEmail:"Send by email",copyLink:"Copy link",copied:"Copied!",linkReady:"Proposal link ready — send it to the patient:",noPatientEmail:"No email on file",coordinatorClaim:"Take ownership",ownershipHint:"You have view-only access. Take ownership to assign a consultant, change status, or create a proposal.",ownedByOther:"Another coordinator owns this case — you have view-only access.",handoff:"This case is with {name} for consultant review. Actions are locked until the clinical recommendation is ready.",status:"Status",transition:"Move case",reason:"Reason for change",doctorSubject:"Doctor account subject",assignDoctor:"Assign verified doctor",reviewTreatment:"Recommended treatment",reviewRisks:"Risks and limitations",saveReview:"Save clinical review",approveReview:"Approve review",reviewAccept:"Accept",reviewInfo:"Required more info",reviewReturn:"Return to coordinator",reviewReassign:"Reassign / second opinion",reviewNotSuitable:"Not clinically suitable",createProposal:"Create proposal",item:"Service description",price:"Unit price",release:"Release to patient",operationsComplete:"Complete operational plan",financeApprove:"Approve commercial terms",accept:"Accept",decline:"Decline",revise:"Request revision",adminTitle:"Onboard a practitioner",coordinatorTitle:"Onboard a coordinator",coordinatorRole:"Coordinator role",name:"Legal name",subject:"Identity account subject",specialty:"Specialty",create:"Create profile",profileId:"Practitioner profile ID",credentialTitle:"Register verified credential",credentialType:"Credential type",reference:"Registration / license number",source:"Issuing authority",expires:"Expiry date",addCredential:"Add credential",decisionTitle:"Credentialing decision",approvePractitioner:"Approve practitioner",rejectPractitioner:"Reject practitioner",rejectionReason:"Rejection reason",success:"Saved successfully.",activated:"Your account is now linked to your case — welcome to your journey.",roleDenied:"Your account has no portal role assigned.",error:"The request could not be completed."},
  ar:{title:"بوابة رحلة الشفاء الآمنة",subtitle:"مساحة عمل مسؤولة واحدة من استقبال الحالة حتى العلاج والمتابعة.",signIn:"تسجيل الدخول الآمن",signOut:"تسجيل الخروج",loading:"جارٍ تحميل مساحة العمل…",noCases:"لا توجد حالات في قائمة العمل.",grpAction:"إجراء مطلوب",grpTracking:"المتابعة — آخر حالة",grpMoreInfo:"طلب معلومات إضافية",grpNotSuitable:"غير مناسبة سريريًا",claimTitle:"ربط طلب سابق",caseId:"معرّف الحالة",code:"رمز التحقق المكوّن من 6 أرقام",claim:"ربط الحالة",open:"فتح مساحة العمل",back:"العودة إلى القائمة",timeline:"رحلة الحالة",tasks:"المهام",messages:"الرسائل الآمنة",send:"إرسال الرسالة",message:"اكتب رسالة",assignments:"فريق الرعاية",documents:"مستندات المريض",download:"تنزيل",docScanning:"جارٍ الفحص الأمني",docUnavailable:"غير متاح",noDocuments:"لم يتم رفع أي مستندات بعد.",reviews:"مراجعات الطبيب",coordinatorLabel:"المنسق",consultantLabel:"الاستشاري",you:"أنت",signedInAs:"مسجّل الدخول باسم",myDashboard:"لوحة التحكم",caseWorkspaceLabel:"مساحة عمل الحالة",patientLabel:"المريض",careArea:"مجال الرعاية",languageLabel:"اللغة",updatedLabel:"آخر تحديث",countryLabel:"الدولة",reviewIntro:"راجع مستندات المريض، ثم سجّل قرارك السريري أدناه.",acceptHint:"أكّد أن الحالة مناسبة وأرسل توصيتك إلى المنسق.",infoHint:"اطلب من المنسق معلومات إضافية قبل اتخاذ القرار.",returnHint:"أعد الحالة إلى المنسق.",reassignHint:"أتح الحالة لرأي ثانٍ أو استشاري آخر.",notSuitableHint:"اعتبر الحالة غير مناسبة سريريًا للعلاج.",decisionHeading:"القرار السريري",costTitle:"التكلفة التقديرية لكل خدمة",costHint:"أضف متوسط التكلفة لكل خدمة. سيراها المنسق عند إعداد عرض المريض، وتظهر في العرض بجانب توصيتك.",costService:"الخدمة",costAmount:"المبلغ",costCurrency:"العملة",addCost:"إضافة خدمة",estimatedByConsultant:"تقدير التكلفة من الاستشاري",prefilledFromReview:"معبأ مسبقًا من تقدير الاستشاري — عدّل قبل الإرسال.",servicesFromConsultant:"الخدمات والتكاليف",additionalCostTitle:"تكلفة إضافية (اختياري)",additionalCostHint:"بند اختياري إضافي، يُعرض بشكل منفصل ولا يُضاف إلى الإجمالي الأساسي.",additionalCostDesc:"ما الغرض منه؟",commentsTitle:"ملاحظات للمريض (اختياري)",commentsHint:"تظهر في العرض بجانب التوصية والخدمات.",proposalNotesLabel:"ملاحظة المنسق",assignedToYou:"تم تعيينك لهذه الحالة — اقبل لبدء مراجعتك.",doctorAccepted:"تم قبول الحالة وإعادتها إلى المنسق.",doctorInfoSent:"تم طلب معلومات إضافية — أُعيدت الحالة إلى المنسق.",doctorNotSuitable:"تم اعتبارها غير مناسبة سريريًا وأُعيدت إلى المنسق.",doctorReturned:"تمت إعادة هذه الحالة إلى المنسق.",proposal:"المقترح المقدم للمريض",genSend:"إنشاء وإرسال العرض",addService:"إضافة خدمة",sendWhatsapp:"إرسال عبر واتساب",sendEmail:"إرسال بالبريد",copyLink:"نسخ الرابط",copied:"تم النسخ!",linkReady:"رابط العرض جاهز — أرسله إلى المريض:",noPatientEmail:"لا يوجد بريد مسجّل",coordinatorClaim:"استلام مسؤولية الحالة",ownershipHint:"لديك صلاحية العرض فقط. استلم الحالة لتعيين استشاري أو تغيير الحالة أو إنشاء مقترح.",ownedByOther:"تملك هذه الحالة منسقة أخرى — لديك صلاحية العرض فقط.",handoff:"هذه الحالة قيد مراجعة الاستشاري {name}. الإجراءات مقفلة حتى تجهيز التوصية الطبية.",status:"الحالة",transition:"نقل الحالة",reason:"سبب التغيير",doctorSubject:"معرّف حساب الطبيب",assignDoctor:"تعيين طبيب معتمد",reviewTreatment:"العلاج الموصى به",reviewRisks:"المخاطر والقيود",saveReview:"حفظ المراجعة الطبية",approveReview:"اعتماد المراجعة",reviewAccept:"قبول",reviewInfo:"مطلوب معلومات إضافية",reviewReturn:"إعادة إلى المنسق",reviewReassign:"إعادة التعيين / رأي ثانٍ",reviewNotSuitable:"غير مناسبة سريريًا",createProposal:"إنشاء المقترح",item:"وصف الخدمة",price:"سعر الوحدة",release:"إرسال المقترح للمريض",operationsComplete:"استكمال الخطة التشغيلية",financeApprove:"اعتماد الشروط المالية",accept:"موافقة",decline:"رفض",revise:"طلب تعديل",adminTitle:"إضافة طبيب للنظام",coordinatorTitle:"إضافة منسق",coordinatorRole:"دور المنسق",name:"الاسم القانوني",subject:"معرّف حساب الهوية",specialty:"التخصص",create:"إنشاء الملف",profileId:"معرّف ملف الطبيب",credentialTitle:"تسجيل مستند اعتماد",credentialType:"نوع الاعتماد",reference:"رقم التسجيل أو الترخيص",source:"جهة الإصدار",expires:"تاريخ الانتهاء",addCredential:"إضافة الاعتماد",decisionTitle:"قرار اعتماد الطبيب",approvePractitioner:"اعتماد الطبيب",rejectPractitioner:"رفض الطبيب",rejectionReason:"سبب الرفض",success:"تم الحفظ بنجاح.",activated:"تم ربط حسابك بحالتك الآن — مرحبًا بك في رحلتك.",roleDenied:"لا يملك هذا الحساب صلاحية لإحدى بوابات النظام.",error:"تعذر إكمال الطلب."}
};

export function Portal({locale}:{locale:Locale}){
  const t=copy[locale];const{user,roles,loading,signIn,signOut}=useAuth();const available=useMemo(()=>Object.keys(roleMap).filter(key=>roleMap[key as RoleKey].some(role=>roles.includes(role))) as RoleKey[],[roles]);
  const[active,setActive]=useState<RoleKey|undefined>();const[cases,setCases]=useState<CaseView[]>([]);const[myTasks,setMyTasks]=useState<Task[]>([]);const[workspace,setWorkspace]=useState<Workspace|null>(null);const[documents,setDocuments]=useState<CaseDocument[]>([]);const[doctors,setDoctors]=useState<VerifiedDoctor[]>([]);const[categories,setCategories]=useState<CareCategory[]>([]);const[staff,setStaff]=useState<StaffMember[]>([]);const[share,setShare]=useState<{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string}|null>(null);const[doctorProfile,setDoctorProfile]=useState<DoctorProfile|null>(null);const[coordinatorProfile,setCoordinatorProfile]=useState<StaffProfile|null>(null);const[catalog,setCatalog]=useState<CatalogService[]>([]);const[fxRates,setFxRates]=useState<FxRate[]>([]);const[busy,setBusy]=useState(false);const[notice,setNotice]=useState("");const[error,setError]=useState("");
  const [preferences,setPreferences]=useState<Preferences>({displayName:null,locale:null});
  const [queueState,setQueueState]=useState<QueueState>(initialQueue);
  const queuePosition=useRef(0);const opening=useRef(0);const mutationPending=useRef(false);
  const [documentError,setDocumentError]=useState(false);const [queueLoading,setQueueLoading]=useState(true);
  const currentRole=active&&available.includes(active)?active:available[0];
  useEffect(()=>{const selected=new URLSearchParams(window.location.search).get("role") as RoleKey;if(available.includes(selected))setActive(selected);},[available]);
  const api=useCallback(async<T,>(path:string,init?:RequestInit):Promise<T>=>{if(!user)throw new Error("AUTHENTICATION_REQUIRED");const response=await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL??"http://localhost:8080"}/api/v1${path}`,{...init,headers:{Authorization:`Bearer ${user.access_token}`,...(init?.body&&!(init.body instanceof FormData)?{"Content-Type":"application/json"}:{}),...init?.headers},cache:"no-store"});if(!response.ok){const body=await response.json().catch(()=>({message:t.error}));if(body.code==="REAUTHENTICATION_REQUIRED"){await signIn(true);throw new Error(body.message??t.error);}throw new Error(body.message??t.error);}return response.status===204?undefined as T:response.json();},[user,t.error,signIn]);
  const refresh=useCallback(async()=>{if(!currentRole||["admin","identity"].includes(currentRole))return;setBusy(true);setError("");try{const includeTasks=["coordinator","doctor","operations","finance","patient"].includes(currentRole);const[nextCases,nextTasks]=await Promise.all([api<CaseView[]>(`/${currentRole}/cases`),includeTasks?api<Task[]>("/tasks/mine"):Promise.resolve([])]);setCases(nextCases);setMyTasks(nextTasks);}catch(e){setError(e instanceof Error?e.message:t.error);}finally{setBusy(false);}},[currentRole,api,t.error]);
  useEffect(()=>{if(!user)return;void api<Preferences>("/account/preferences").then(setPreferences).catch(()=>{});},[user,api]);
  useEffect(()=>{
    if(!currentRole||["admin","identity"].includes(currentRole)){setQueueLoading(false);return;}
    let cancelled=false;setQueueLoading(true);setCases([]);setMyTasks([]);setError("");
    void Promise.all([api<CaseView[]>(`/${currentRole}/cases`),["coordinator","doctor","operations","finance","patient"].includes(currentRole)?api<Task[]>("/tasks/mine"):Promise.resolve([])])
      .then(([nextCases,nextTasks])=>{if(!cancelled){setCases(nextCases);setMyTasks(nextTasks);}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:t.error);}).finally(()=>{if(!cancelled)setQueueLoading(false);});
    return()=>{cancelled=true;};
  },[currentRole,api,t.error]);
  // Complete account activation when the patient returns from the activation link (?activate=token).
  useEffect(()=>{if(!user||!roles.some(r=>["PATIENT","PATIENT_REPRESENTATIVE"].includes(r)))return;const token=new URLSearchParams(window.location.search).get("activate");if(!token)return;void api(`/patient/account/activate`,{method:"POST",body:JSON.stringify({activationToken:token})}).then(()=>{setNotice(t.activated);window.history.replaceState({},"",window.location.pathname);void refresh();}).catch(e=>setError(e instanceof Error?e.message:t.error));},[user,roles,api,refresh,t.activated,t.error]);
  useEffect(()=>{if(currentRole!=="doctor")return;void api<DoctorProfile>("/doctor/me").then(setDoctorProfile).catch(()=>setDoctorProfile(null));void api<CatalogService[]>("/doctor/catalog").then(setCatalog).catch(()=>setCatalog([]));void api<FxRate[]>("/doctor/fx-rates").then(setFxRates).catch(()=>setFxRates([]));},[currentRole,api]);
  useEffect(()=>{if(currentRole!=="coordinator")return;void api<StaffProfile>("/coordinator/me").then(setCoordinatorProfile).catch(()=>setCoordinatorProfile(null));},[currentRole,api]);
  useEffect(()=>{if(currentRole!=="coordinator")return;void api<VerifiedDoctor[]>("/coordinator/doctors").then(setDoctors).catch(()=>setDoctors([]));void api<CareCategory[]>("/coordinator/care-categories").then(setCategories).catch(()=>setCategories([]));void api<FxRate[]>("/coordinator/fx-rates").then(setFxRates).catch(()=>setFxRates([]));void Promise.all([api<StaffMember[]>("/coordinator/staff?role=COORDINATOR"),api<StaffMember[]>("/coordinator/staff?role=OPERATIONS"),api<StaffMember[]>("/coordinator/staff?role=FINANCE")]).then(rows=>setStaff(rows.flat())).catch(()=>setStaff([]));},[currentRole,api]);
  async function openCase(item:CaseView){
    const request=++opening.current;setBusy(true);setError("");setDocumentError(false);
    if(!workspace)queuePosition.current=window.scrollY;
    try{
      if(currentRole==="coordinator"&&!item.coordinatorSubject){
        const preview=await api<{caseSummary:CaseView;intakeSummary?:string}>(`/coordinator/cases/${item.id}/intake-preview`);
        if(request===opening.current){setWorkspace({...preview,preview:true,timeline:[],tasks:[],messages:[],assignments:[],clinicalReviews:[]});setDocuments([]);}
      }else{
        const ws=await api<Workspace>(`/${currentRole}/cases/${item.id}`);
        if(request!==opening.current)return;setWorkspace(ws);setDocuments([]);
        try{const docs=await api<CaseDocument[]>(`/cases/${item.id}/documents`);if(request===opening.current)setDocuments(docs);}catch{if(request===opening.current)setDocumentError(true);}
      }
      if(request===opening.current){const url=new URL(window.location.href);url.searchParams.set("case",item.id);window.history.replaceState({},"",url);if(!workspace)requestAnimationFrame(()=>document.getElementById("case-heading")?.focus());}
    }catch(e){if(request===opening.current){setWorkspace(null);setError(e instanceof Error?e.message:t.error);void refresh();}}
    finally{if(request===opening.current)setBusy(false);}
  }
  function backToQueue(){opening.current++;setWorkspace(null);setError("");setNotice("");const url=new URL(window.location.href);url.searchParams.delete("case");window.history.replaceState({},"",url);requestAnimationFrame(()=>window.scrollTo({top:queuePosition.current,behavior:"instant"}));}
  // Keep only navigation preferences in this browser session, scoped to the signed-in account.
  useEffect(()=>{if(!user||!currentRole)return;try{const saved=sessionStorage.getItem(`portal-queue:${user.profile.sub}:${currentRole}`);setQueueState(saved?JSON.parse(saved):initialQueue);}catch{setQueueState(initialQueue);}},[user,currentRole]);
  function changeQueue(next:QueueState){setQueueState(next);if(user&&currentRole)try{sessionStorage.setItem(`portal-queue:${user.profile.sub}:${currentRole}`,JSON.stringify(next));}catch{}}
  const restored=useRef(false);
  useEffect(()=>{if(queueLoading||restored.current||!cases.length)return;restored.current=true;const id=new URLSearchParams(window.location.search).get("case");const item=cases.find(c=>c.id===id);if(item)void openCase(item);});
  async function downloadDoc(id:string){setError("");try{const res=await api<{downloadUrl:string}>(`/documents/${id}/download`);if(res?.downloadUrl)window.open(res.downloadUrl,"_blank","noopener,noreferrer");}catch(e){setError(e instanceof Error?e.message:t.error);}}
  async function sendProposal(caseId:string,body:unknown){setBusy(true);setError("");setNotice("");try{await api(`/coordinator/cases/${caseId}/proposals`,{method:"POST",body:JSON.stringify(body)});setShare(null);setNotice(t.success);if(workspace)await openCase(workspace.caseSummary);}catch(e){setError(e instanceof Error?e.message:t.error);}finally{setBusy(false);}}
  async function mutate(path:string,body?:unknown,method="POST"):Promise<MutationResult|undefined>{
    if(mutationPending.current)return;mutationPending.current=true;setBusy(true);setError("");setNotice("");
    try{const result=await api<MutationResult>(path,{method,body:body===undefined?undefined:JSON.stringify(body)});setNotice(t.success);
      await refresh();
      if(workspace)await openCase(path.endsWith("/claim")?{...workspace.caseSummary,coordinatorSubject:user?.profile.sub}:workspace.caseSummary);
      return result??{status:"SAVED"};
    }catch(e){setError(e instanceof Error?e.message:t.error);if(path.endsWith("/claim")){setWorkspace(null);await refresh();setError(e instanceof Error?e.message:t.error);}return undefined;}
    finally{mutationPending.current=false;setBusy(false);}
  }
  if(loading)return <PortalFrame title={t.title} subtitle={t.loading}/>;
  if(!user)return <PortalFrame title={t.title} subtitle={t.subtitle}><button className="btn-primary" onClick={()=>void signIn()}>{t.signIn}</button><a className="btn-secondary ms-3" href={locale==="ar"?"/en/portal":"/ar/portal"} lang={locale==="ar"?"en":"ar"}>{locale==="ar"?"English":"العربية"}</a></PortalFrame>;
  const profile=user.profile as {name?:string;preferred_username?:string;email?:string;sub?:string};
  const accountName=profile.name??profile.preferred_username??profile.email??profile.sub??"";
  const isDoctorRole=currentRole==="doctor";
  const profileName=isDoctorRole?doctorProfile?.displayName:currentRole==="coordinator"?coordinatorProfile?.displayName:undefined;
  const baseName=preferences.displayName||profileName||accountName;
  const displayName=isDoctorRole&&profileName&&!/^d(r|octor)\b/i.test(baseName)?`Dr. ${baseName}`:baseName;
  const descriptions:Record<RoleKey,string>=locale==="ar"?{coordinator:"راجع الحالات ونسّق الخطوة التالية للرعاية.",doctor:"راجع الحالات المسندة إليك وسجّل قراراتك السريرية.",operations:"تابع الترتيبات والإجراءات المطلوبة منك.",finance:"راجع المدفوعات والموافقات المطلوبة.",patient:"تابع رعايتك وتعرّف على الخطوة التالية.",admin:"إدارة الفريق واعتماد مقدّمي الرعاية.",identity:"راجع طلبات التحقق من الهوية."}:{coordinator:"Review cases and coordinate the next step in care.",doctor:"Review assigned cases and record your clinical decisions.",operations:"Manage your assigned care and travel arrangements.",finance:"Review payments and commercial approvals that need your attention.",patient:"Follow your care and see what happens next.",admin:"Manage your team and practitioner credentials.",identity:"Review identity verification requests."};
  const inWorkspace=!!workspace&&!!currentRole&&!["admin","identity"].includes(currentRole);
  return <PortalFrame title={currentRole?roleLabel(currentRole,locale):t.title} subtitle={inWorkspace?"":currentRole?descriptions[currentRole]:t.subtitle}>
    <PortalAccount locale={locale} name={displayName} email={profile.email} role={currentRole?roleLabel(currentRole,locale):""} api={api} signOut={signOut} preferences={preferences} onSaved={value=>{setPreferences(value);setNotice(t.success);}}/>
    {available.length>1&&<div className="mb-8 flex flex-wrap gap-2">{available.map(role=><button key={role} className={currentRole===role?"btn-primary":"btn-secondary"} onClick={()=>{setActive(role);setWorkspace(null);setCases([]);setMyTasks([]);restored.current=false;const url=new URL(window.location.href);url.searchParams.delete("case");url.searchParams.set("role",role);window.history.replaceState({},"",url);}}>{roleLabel(role,locale)}</button>)}</div>}
    {!available.length&&<p className="rounded-xl bg-alert-50 p-4 text-alert-800">{t.roleDenied}</p>}
    {notice&&<p role="status" className="mb-4 rounded-xl bg-brand-50 p-4 text-brand-800">{notice}</p>}{error&&<p role="alert" className="mb-4 rounded-xl bg-alert-50 p-4 text-alert-800">{error}</p>}
    {busy&&workspace&&<p role="status" className="mb-3 text-sm text-ink-500">{t.loading}</p>}
    {documentError&&workspace&&<p role="alert" className="mb-4 rounded-xl bg-alert-50 p-4 text-sm text-alert-800">{locale==="ar"?"تعذّر تحميل المستندات.":"Documents could not be loaded."} <button className="link-cta" onClick={()=>void openCase(workspace.caseSummary)}>{locale==="ar"?"إعادة المحاولة":"Retry"}</button></p>}
    {currentRole === "admin"
      ? <AdminForm t={t} busy={busy} locale={locale} api={api} mutate={mutate} readOnly={roles.includes("AUDITOR")} systemAdmin={roles.includes("SYSTEM_ADMIN")}/>
      : currentRole==="identity" ? <IdentityReviewQueue api={api} locale={locale}/>
      : workspace
        ? <WorkspaceView locale={locale} t={t} role={currentRole!} value={workspace} documents={documents} doctors={doctors} categories={categories} staff={staff} catalog={catalog} fxRates={fxRates} canRebalance={roles.includes("COORDINATOR_LEAD")} downloadDoc={downloadDoc} mySubject={user?.profile?.sub} share={share&&share.caseId===workspace.caseSummary.id?share:null} sendProposal={sendProposal} busy={busy} back={backToQueue} mutate={mutate}/>
        : null}
    {currentRole&&!["admin","identity"].includes(currentRole)&&<div hidden={!!workspace}><Queue queueState={queueState} changeQueue={changeQueue} locale={locale} t={t} role={currentRole} cases={cases} tasks={myTasks} busy={busy||queueLoading} mySubject={user?.profile?.sub} coordinatorLead={roles.includes("COORDINATOR_LEAD")} openCase={openCase} mutate={mutate}/></div>}
    {currentRole==="finance"&&!workspace&&roles.some(role=>["FINANCE_LEAD","SYSTEM_ADMIN"].includes(role))&&<details className="card mt-8 p-5"><summary className="cursor-pointer font-bold">{locale==="ar"?"السياسات المالية":"Financial policies"}</summary><FinancePolicies api={api} locale={locale}/></details>}
  </PortalFrame>;
}

function PortalFrame({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <section className="portal-shell bg-mist"><div className="container-site"><h1 className="headline">{title}</h1>{subtitle&&<p className="mt-2 max-w-3xl text-sm text-ink-600">{subtitle}</p>}<div className="mt-6">{children}</div></div></section>}
function roleLabel(role:RoleKey,locale:Locale){const labels={en:{patient:"Patient",coordinator:"Coordinator",doctor:"Doctor",operations:"Operations",finance:"Finance",admin:"Administration",identity:"Identity review"},ar:{patient:"المريض",coordinator:"منسق الحالة",doctor:"الطبيب",operations:"العمليات",finance:"المالية",admin:"الإدارة",identity:"مراجعة الهوية"}};return labels[locale][role];}

function Queue({locale,t,role,cases,tasks,busy,mySubject,coordinatorLead,openCase,queueState,changeQueue}:{locale:Locale;t:typeof copy.en;role?:RoleKey;cases:CaseView[];tasks:Task[];busy:boolean;mySubject?:string;coordinatorLead:boolean;openCase:(item:CaseView)=>void;mutate:Mutate;queueState:QueueState;changeQueue:(value:QueueState)=>void}){
  return <>{tasks.length>0&&<section className="card mb-6 p-5"><h2 className="title mb-3">{locale==="ar"?"مهامي":"My tasks"} <span className="text-ink-500">({tasks.length})</span></h2><div className="grid gap-3 sm:grid-cols-2">{tasks.map(task=>{const item=cases.find(c=>c.id===task.caseId);return <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3"><div><p className="text-sm font-bold">{task.title}</p>{task.overdue&&<p className="text-xs font-semibold text-alert-800">{locale==="ar"?"متأخرة":"Overdue"}</p>}</div>{item&&<button className="btn-secondary" disabled={busy} onClick={()=>openCase(item)}>{locale==="ar"?"فتح":"Open"}</button>}</div>;})}</div></section>}
    <CaseQueue locale={locale} role={role??""} cases={cases} subject={mySubject} lead={coordinatorLead} busy={busy} state={queueState} onChange={changeQueue} onOpen={openCase} statusLabel={value=>statusLabel(value,locale)} categoryLabel={value=>prettyCategory(value,locale)}/>
  </>;
}

function WorkspaceView({locale,t,role,value,documents,doctors,categories,staff,catalog,fxRates,canRebalance,downloadDoc,mySubject,share,sendProposal,busy,back,mutate}:{locale:Locale;t:typeof copy.en;role:RoleKey;value:Workspace;documents:CaseDocument[];doctors:VerifiedDoctor[];categories:CareCategory[];staff:StaffMember[];catalog:CatalogService[];fxRates:FxRate[];canRebalance:boolean;downloadDoc:(id:string)=>void;mySubject?:string;share:{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string}|null;sendProposal:(caseId:string,body:unknown)=>void;busy:boolean;back:()=>void;mutate:Mutate}){
 const c=value.caseSummary;const approved=value.clinicalReviews.find(r=>r.status==="APPROVED");
 const isCoordinator=role==="coordinator";const owned=!!mySubject&&c.coordinatorSubject===mySubject;
 const doctorPhase=["CONSULTANT_ASSIGNMENT_PENDING","CONSULTANT_REVIEW"].includes(c.status);
 const doctorAssignment=value.assignments.find(a=>a.assigneeRole==="DOCTOR"&&(a.status==="PENDING"||a.status==="ACTIVE"));
 const assignedDoctorName=doctorAssignment?(doctors.find(d=>d.subject===doctorAssignment.assigneeSubject)?.displayName??doctorAssignment.assigneeSubject):"";
  const isDoctor=role==="doctor";const isPatient=role==="patient";
  const assignmentRole=role.toUpperCase();
  const myPending=["doctor","operations","finance"].includes(role)?value.assignments.find(a=>a.assigneeRole===assignmentRole&&a.status==="PENDING"&&(!mySubject||a.assigneeSubject===mySubject)):undefined;
  const showActions=(!isCoordinator||owned)&&!myPending;const dim=isCoordinator&&owned&&doctorPhase;
 const doctorReviewComplete=isDoctor&&["CLINICAL_RECOMMENDATION_READY","INFORMATION_REQUIRED","CLINICALLY_NOT_SUITABLE","READY_FOR_CONSULTANT","INTAKE_REVIEW"].includes(c.status);
  const hideCoordinatorWorkflow=isCoordinator&&!canRebalance&&!["INTAKE_REVIEW","INFORMATION_REQUIRED","PROPOSAL_PREPARATION","ACCEPTED","TRAVEL_COORDINATION"].includes(c.status);
 const renderWorkflow=showActions&&!dim&&!(isDoctor&&doctorPhase)&&!hideCoordinatorWorkflow;
 // Evidence panels are reused so the consultant reads them before deciding, while the coordinator keeps
 // them below the action panels. Rendered once (the guards below are mutually exclusive by role).
 const intakePanel=value.intakeSummary?.trim()?<Panel title={locale==="ar"?"ملخص الحالة عند الاستقبال":"Intake summary"}><p className="whitespace-pre-wrap break-words text-ink-700">{value.intakeSummary}</p></Panel>:null;
 const documentsPanel=documents.length>0?<Panel title={t.documents}>{documents.map(doc=><div key={doc.documentId} className="flex flex-wrap items-center justify-between gap-3"><div><strong className="break-all">{doc.fileName}</strong><p className="text-sm text-ink-500">{formatBytes(doc.sizeBytes)} · {new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(doc.createdAt))}</p></div>{doc.status==="CLEAN"?<button className="btn-secondary" onClick={()=>downloadDoc(doc.documentId)}>{t.download}</button>:<span className="rounded-full bg-mist px-3 py-1 text-sm font-bold text-ink-600">{(doc.status==="PENDING"||doc.status==="UPLOADED")?t.docScanning:t.docUnavailable}</span>}</div>)}</Panel>:null;
 const workflowBlock=renderWorkflow?<div className={dim?"pointer-events-none opacity-50":""}><CaseWorkflowActions locale={locale} role={role} caseSummary={c} mutate={mutate} doctors={doctors} categories={categories} staff={staff} documents={documents} travelPackage={!!c.travelPackageRequested} financeRequired={!!value.gates?.financeRequired}/></div>:null;
 return <div>
  <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm" aria-label={t.caseWorkspaceLabel}>
   <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 py-2 font-semibold text-brand-800 transition hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700" onClick={back}><span aria-hidden>{locale==="ar"?"→":"←"}</span>{t.myDashboard}</button>
   <span className="text-ink-300" aria-hidden>/</span>
   <span className="text-ink-500">{t.caseWorkspaceLabel}</span>
   <span className="text-ink-300" aria-hidden>/</span>
   <span className="font-semibold text-ink-700" dir="ltr">{c.caseNumber}</span>
  </nav>
  <div className="card overflow-hidden p-0">
   <div className="flex flex-wrap items-start justify-between gap-3 bg-brand-50 p-6"><div><p className="text-sm font-bold text-brand-700" dir="ltr">{c.caseNumber}</p><h2 id="case-heading" tabIndex={-1} className="headline mt-1">{c.patientName||(locale==="ar"?"مراجعة طلب الرعاية":"Review care request")}</h2></div><Status value={c.status} locale={locale}/></div>
   <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-6 sm:grid-cols-3 lg:grid-cols-4">
    <Fact label={t.countryLabel} value={c.country}/>
    {c.careCategory&&<Fact label={t.careArea} value={prettyCategory(c.careCategory,locale)}/>}
    <Fact label={t.languageLabel} value={languageName(c.preferredLanguage,locale)}/>
    <Fact label={t.updatedLabel} value={new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(c.updatedAt))}/>
    {c.coordinatorSubject&&<Fact label={t.coordinatorLabel} value={c.coordinatorName??(locale==="ar"?"منسق الحالة":"Case coordinator")}/>}
    {c.doctorName&&role!=="patient"&&<Fact label={t.consultantLabel} value={`${c.doctorName}${isDoctor&&doctorAssignment&&doctorAssignment.assigneeSubject===mySubject?` (${t.you})`:""}`}/>}
   </div>
  </div>
  {isPatient&&<PatientStatusCard status={c.status} locale={locale}/>}
  {role==="patient"&&["ACCEPTED","TRAVEL_COORDINATION","ARRIVAL_CONFIRMED","TREATMENT_IN_PROGRESS","DISCHARGED","FOLLOW_UP"].includes(c.status)&&<div className="mt-6"><PatientOnboarding caseId={c.id} locale={locale}/></div>}
  {isCoordinator&&["ACCEPTED","TRAVEL_COORDINATION","ARRIVAL_CONFIRMED"].includes(c.status)&&<div className="mt-6 card p-5"><CustomerReadinessCard caseId={c.id} role="coordinator" locale={locale}/></div>}
  {doctorReviewComplete&&<div className="mt-6 card flex items-center gap-3 border-s-4 border-brand-500 bg-brand-50 p-5"><span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-600 font-bold text-white">✓</span><p className="font-bold text-brand-800">{c.status==="CLINICAL_RECOMMENDATION_READY"?t.doctorAccepted:c.status==="INFORMATION_REQUIRED"?t.doctorInfoSent:c.status==="CLINICALLY_NOT_SUITABLE"?t.doctorNotSuitable:t.doctorReturned}</p></div>}
  <fieldset disabled={busy} className="min-w-0">
   {dim&&<div className="mt-6 card border-s-4 border-brand-400 bg-brand-50 p-5"><p className="font-bold text-brand-800">{t.handoff.replace("{name}",assignedDoctorName)}</p></div>}
   {myPending&&<div className="mt-6 card flex flex-wrap items-center justify-between gap-3 border-s-4 border-brand-400 bg-brand-50 p-5"><p className="font-bold text-brand-800">{t.assignedToYou}</p><div className="flex gap-2"><button className="btn-primary" disabled={busy} onClick={()=>void mutate(`/${role}/cases/${c.id}/assignments/${myPending.id}?accept=true`)}>{t.accept}</button><button className="btn-secondary" disabled={busy} onClick={()=>void mutate(`/${role}/cases/${c.id}/assignments/${myPending.id}?accept=false`)}>{t.decline}</button></div></div>}
   <div className="mt-6 grid gap-6 lg:grid-cols-3 lg:items-start">
    <div className="min-w-0 space-y-6 lg:col-span-2">
     {isDoctor&&intakePanel}
     {isDoctor&&documentsPanel}
     {!isDoctor&&workflowBlock}
     {isCoordinator&&owned&&!["PATIENT_DECISION","ACCEPTED","DECLINED","TRAVEL_COORDINATION","ARRIVAL_CONFIRMED","TREATMENT_IN_PROGRESS","DISCHARGED","FOLLOW_UP","CLOSED","CANCELLED"].includes(c.status)&&<div className="card flex flex-wrap items-center justify-between gap-4 p-5"><div className="max-w-xl"><p className="font-bold text-ink-800">{locale==="ar"?"باقة سفر وعلاج متكاملة":"Full travel package requested"}</p><p className="text-sm text-ink-500">{locale==="ar"?"تشمل تنسيق الطيران والتأشيرة والإقامة والوصول إلى المستشفى. عند التفعيل يُشرَك فريق العمليات لإعداد الخطة قبل إرسال العرض للمريض.":"Covers flight, visa, accommodation and hospital arrival. When on, Operations prepares the plan before the proposal is sent to the patient."}</p></div><button type="button" role="switch" aria-checked={!!c.travelPackageRequested} disabled={busy} onClick={()=>void mutate(`/coordinator/cases/${c.id}/travel-package`,{requested:!c.travelPackageRequested},"PUT")} className={`relative h-7 w-12 flex-none rounded-full transition ${c.travelPackageRequested?"bg-brand-600":"bg-line"}`}><span className={`absolute top-1 block h-5 w-5 rounded-full bg-white shadow transition-all ${c.travelPackageRequested?"left-6":"left-1"}`}/></button></div>}
     {!isDoctor&&(value.proposal||value.deposit||(isCoordinator&&owned&&(approved||c.status==="ARRIVAL_CONFIRMED")))&&<Panel title={t.proposal} wide>{approved&&(approved.recommendedTreatment||approved.risksAndLimitations)&&<div className="rounded-xl border border-line p-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700">{locale==="ar"?"التوصية السريرية للاستشاري":"Consultant's clinical recommendation"}</p>{approved.recommendedTreatment&&<div className="mb-3"><p className="text-sm font-bold text-ink-800">{t.reviewTreatment}</p><p className="mt-0.5 whitespace-pre-wrap text-ink-700">{approved.recommendedTreatment}</p></div>}{approved.risksAndLimitations&&<div><p className="text-sm font-bold text-ink-800">{t.reviewRisks}</p><p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-600">{approved.risksAndLimitations}</p></div>}</div>}{value.proposal?<ProposalCard locale={locale} t={t} proposal={value.proposal}/>:null}{isCoordinator&&owned&&approved&&(!value.proposal||["REVISION_REQUESTED","EXPIRED"].includes(value.proposal.status))&&<ProposalSendForm caseId={c.id} reviewId={approved.id} language={c.preferredLanguage} estimate={approved} fxRates={fxRates} locale={locale} t={t} busy={busy} onSend={sendProposal}/>}{isCoordinator&&share&&<ProposalShareLinks share={share} locale={locale} t={t}/>}{isCoordinator&&value.delivery&&value.proposal&&<DeliveryCard delivery={value.delivery} caseId={c.id} versionId={value.proposal.versionId} locale={locale} busy={busy} mutate={mutate}/>}{isCoordinator&&owned&&c.status==="ARRIVAL_CONFIRMED"&&<FinalQuoteActions caseId={c.id} reviewId={approved?.id} proposal={value.proposal} gates={value.gates} fxRates={fxRates} locale={locale} busy={busy} mutate={mutate}/>}{value.deposit&&<DepositCard deposit={value.deposit} caseId={c.id} role={role} locale={locale} busy={busy} mutate={mutate}/>}{showActions&&<div className={dim?"pointer-events-none opacity-50":""}><RoleActions role={role} t={t} c={c} proposal={value.proposal} gates={value.gates} locale={locale} mutate={mutate}/></div>}</Panel>}
     {isDoctor&&(value.clinicalReviews.length>0||["CONSULTANT_REVIEW","ARRIVAL_CONFIRMED"].includes(c.status))&&<Panel title={t.reviews}>{value.clinicalReviews.length?value.clinicalReviews.map(r=><div key={r.id} className="rounded-lg border border-line p-4"><strong>v{r.versionNumber} · {statusLabel(r.status,locale)}</strong>{r.recommendedTreatment&&<p className="mt-1">{r.recommendedTreatment}</p>}{r.risksAndLimitations&&<p className="mt-1 text-sm text-ink-600">{r.risksAndLimitations}</p>}{r.costEstimates&&r.costEstimates.length>0&&<div className="mt-3 rounded-lg bg-brand-50 p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700">{t.estimatedByConsultant}</p><ul className="space-y-1 text-sm">{r.costEstimates.map((e,i)=><li key={i} className="flex justify-between gap-3"><span>{e.serviceDescription}</span><strong className="whitespace-nowrap">{money(e.estimatedCost,e.currency,locale)}</strong></li>)}</ul></div>}</div>):<Empty/>}{isDoctor&&c.status==="CONSULTANT_REVIEW"&&<DoctorReviewDecision caseId={c.id} busy={busy} t={t} locale={locale} catalog={catalog} fxRates={fxRates} mutate={mutate}/>}{isDoctor&&c.status==="ARRIVAL_CONFIRMED"&&<FinalAssessment caseId={c.id} busy={busy} locale={locale} catalog={catalog} fxRates={fxRates} mutate={mutate}/>}</Panel>}
     {isDoctor&&workflowBlock}
     {!isDoctor&&!isPatient&&intakePanel}
     {value.preview&&<p className="text-sm text-ink-500">{locale==="ar"?"هذه معاينة للاستقبال. تتاح المستندات والرسائل بعد تولّي مسؤولية الحالة.":"This intake preview supports your ownership decision. Documents and messages become available after you take responsibility."}</p>}
     {!isDoctor&&documentsPanel}
     <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">{value.tasks.length>0&&<Panel title={t.tasks}>{value.tasks.length?value.tasks.map(task=><div key={task.id} className={task.overdue?"rounded-lg border border-alert-200 bg-alert-50 p-3":""}><strong>{task.title}</strong><p className="text-sm">{task.status==="OPEN"?(locale==="ar"?"مفتوحة":"Open"):task.status==="IN_PROGRESS"?(locale==="ar"?"قيد التنفيذ":"In progress"):(locale==="ar"?"مكتملة":"Completed")}{task.overdue?(locale==="ar"?" · متأخرة":" · Overdue"):""}</p>{task.ownerSubject===mySubject&&<TaskActions locale={locale} caseId={c.id} task={task} mutate={mutate}/>}</div>):<Empty/>}</Panel>}{isCoordinator&&owned&&<TaskCreateForm locale={locale} caseId={c.id} mutate={mutate} members={value.assignments.filter(a=>a.status==="ACTIVE").map(a=>({subject:a.assigneeSubject,role:a.assigneeRole,name:doctors.find(d=>d.subject===a.assigneeSubject)?.displayName??staff.find(p=>p.subject===a.assigneeSubject)?.name??(a.assigneeSubject===mySubject?(locale==="ar"?"أنا":"Me"):(locale==="ar"?"عضو فريق الرعاية":"Care team member"))}))}/>}</div>
      {!value.preview&&<CaseMessages key={c.id} locale={locale} role={role} caseId={c.id} messages={value.messages} canSend={role==="patient"||showActions} busy={busy} mutate={mutate}/>}
     </div>
    </div>
    <aside className="min-w-0 space-y-6 lg:sticky lg:top-24">
     {value.timeline.length>0&&<Panel title={t.timeline}><ol className="relative space-y-5 border-s-2 border-brand-100 ps-5">{value.timeline.map((event,i)=>{const current=i===value.timeline.length-1;return <li key={`${event.status}-${event.occurredAt}`} className="relative"><span className={`absolute top-1 h-3 w-3 rounded-full ring-4 ${current?"bg-brand-600 ring-brand-100":"bg-brand-400 ring-brand-50"}`} style={{insetInlineStart:"-1.65rem"}}/><strong className={current?"text-brand-800":"text-ink-800"}>{statusLabel(event.status,locale)}</strong><p className="text-xs text-ink-500">{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.occurredAt))}</p></li>;})}</ol></Panel>}
     {isCoordinator&&canRebalance&&<CaseAdministration caseId={c.id} currentCoordinator={c.coordinatorSubject} mySubject={mySubject} locale={locale} staff={staff} busy={busy} mutate={mutate}/>}
    </aside>
   </div>
   {isCoordinator&&!owned&&<div className="mt-6 card flex flex-wrap items-center justify-between gap-3 border-s-4 border-brand-400 p-5"><p className="text-ink-600">{c.coordinatorSubject?t.ownedByOther:t.ownershipHint}</p>{!c.coordinatorSubject&&<button className="btn-primary" disabled={busy} onClick={()=>void mutate(`/coordinator/cases/${c.id}/claim`)}>{t.coordinatorClaim}</button>}</div>}
  </fieldset>
 </div>;
}

function CaseAdministration({caseId,currentCoordinator,mySubject,locale,staff,busy,mutate}:{caseId:string;currentCoordinator?:string;mySubject?:string;locale:Locale;staff:StaffMember[];busy:boolean;mutate:Mutate}){
 const[assignee,setAssignee]=useState("");const[reason,setReason]=useState("");
 const labels=locale==="ar"?{section:"إدارة الحالة",description:"انقل هذه الحالة إلى منسق آخر ضمن فريقك. يصبح هو المالك الجديد مع بقاء صلاحية الاطلاع لك.",title:"نقل الحالة إلى منسق آخر",coordinator:"المنسق الجديد",select:"اختر منسقًا",reason:"سبب النقل",reasonPlaceholder:"مثال: إعادة توزيع عبء العمل أو تغطية إجازة",submit:"نقل الحالة",empty:"لا يوجد منسقون ضمن فريقك بعد. يضيف مسؤول النظام منسقين إلى هيكل قيادتك قبل أن تتمكن من نقل الحالات."}:{section:"Case administration",description:"Hand this case to another coordinator on your team. They become the new owner; you keep view access.",title:"Transfer to another coordinator",coordinator:"New coordinator",select:"Select a coordinator",reason:"Reason for transfer",reasonPlaceholder:"For example: workload balancing or leave coverage",submit:"Transfer case",empty:"No coordinators report to you yet. A system administrator assigns coordinators to your reporting team before cases can be transferred."};
 // Transfer targets are the lead's own reporting team only, excluding the signed-in lead and the case's
 // current owner. The backend already scopes the directory to reports; we also drop self here.
 const coordinators=staff.filter(person=>(person.role==="COORDINATOR"||person.role==="COORDINATOR_LEAD")&&person.subject!==currentCoordinator&&person.subject!==mySubject);
 const transfer=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!assignee||!reason.trim())return;void mutate(`/coordinator/cases/${caseId}/coordinator-assignment`,{assigneeSubject:assignee,reason:reason.trim()}).then(result=>{if(result){setAssignee("");setReason("");}});};
 return <section className="card p-5"><div className="flex items-center gap-2.5 border-b border-line pb-3"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-50 text-lg text-brand-700" aria-hidden>⇄</span><h3 className="title">{labels.section}</h3></div><p className="mt-3 text-sm text-ink-500">{labels.description}</p>{coordinators.length===0?<p className="mt-4 rounded-xl border border-dashed border-line-strong bg-mist p-4 text-sm text-ink-600">{labels.empty}</p>:<form className="mt-4 space-y-4" onSubmit={transfer}><h4 className="font-bold text-brand-800">{labels.title}</h4><label className="block text-sm font-bold">{labels.coordinator}<select className="field mt-2" required value={assignee} onChange={event=>setAssignee(event.target.value)}><option value="" disabled>{labels.select}</option>{coordinators.map(person=><option key={person.subject} value={person.subject}>{person.name}</option>)}</select></label><label className="block text-sm font-bold">{labels.reason}<textarea className="field mt-2 min-h-24" required maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} placeholder={labels.reasonPlaceholder}/></label><button className="btn-secondary w-full justify-center" disabled={busy||!assignee||!reason.trim()}>{labels.submit}</button></form>}</section>;
}

// Patient-facing "where you are / what's next" hero — translates the internal case state into plain,
// reassuring language so the patient always understands the journey without staff terminology.
const PATIENT_JOURNEY:Record<string,{en:[string,string];ar:[string,string]}>={
 RECEIVED:{en:["We've received your request","Our care team is getting started on your case. We'll keep you updated here at every step."],ar:["استلمنا طلبك","بدأ فريق الرعاية العمل على حالتك. سنبقيك على اطلاع بكل خطوة هنا."]},
 INTAKE_REVIEW:{en:["Your case is being reviewed","Our coordinator is reviewing your medical information to match you with the right specialist."],ar:["جارٍ مراجعة حالتك","يراجع منسّقك معلوماتك الطبية لتوجيهك إلى الاستشاري المناسب."]},
 INFORMATION_REQUIRED:{en:["We need a little more information","Please check your secure messages below — we've asked for a few extra details to move forward."],ar:["نحتاج بعض المعلومات الإضافية","يرجى مراجعة رسائلك الآمنة أدناه — طلبنا بعض التفاصيل الإضافية للمتابعة."]},
 READY_FOR_CONSULTANT:{en:["Matching you with a specialist","Your case is ready and is being assigned to a verified consultant for review."],ar:["جارٍ توجيهك إلى استشاري","حالتك جاهزة ويجري إسنادها إلى استشاري معتمد للمراجعة."]},
 CONSULTANT_ASSIGNMENT_PENDING:{en:["A specialist is being assigned","A verified consultant is being assigned to review your case."],ar:["جارٍ تعيين استشاري","يجري تعيين استشاري معتمد لمراجعة حالتك."]},
 CONSULTANT_REVIEW:{en:["A specialist is reviewing your case","A consultant is carefully reviewing your medical information. We'll let you know as soon as there's an update."],ar:["الاستشاري يراجع حالتك","يراجع الاستشاري معلوماتك الطبية بعناية. سنخبرك فور توفر أي جديد."]},
 CLINICAL_RECOMMENDATION_READY:{en:["Preparing your treatment proposal","Good news — the specialist has reviewed your case. We're now preparing your personalized proposal."],ar:["جارٍ تجهيز عرض العلاج","خبر جيد — راجع الاستشاري حالتك. نُعِدّ الآن عرضك الشخصي."]},
 PROPOSAL_PREPARATION:{en:["Preparing your treatment proposal","We're putting together your personalized treatment proposal. It will appear here shortly."],ar:["جارٍ تجهيز عرض العلاج","نُعِدّ عرض العلاج الخاص بك. سيظهر هنا قريبًا."]},
 PROPOSAL_INTERNAL_APPROVAL:{en:["Finalizing your proposal","Your proposal is going through a final internal review before we send it to you."],ar:["اللمسات الأخيرة على عرضك","يمرّ عرضك بمراجعة داخلية أخيرة قبل إرساله إليك."]},
 PATIENT_DECISION:{en:["Your proposal is ready","Please review your treatment proposal below and let us know your decision when you're ready."],ar:["عرضك جاهز","يرجى مراجعة عرض العلاج أدناه وإخبارنا بقرارك عندما تكون مستعدًا."]},
 REVISION_REQUESTED:{en:["Updating your proposal","We're revising your proposal based on your feedback and will share the update here."],ar:["جارٍ تعديل عرضك","نُعدّل عرضك بناءً على ملاحظاتك وسنشارك التحديث هنا."]},
 ACCEPTED:{en:["Welcome aboard — let's plan your care","You've accepted your proposal. Complete the steps below so we can coordinate your treatment and travel."],ar:["أهلًا بك — لنخطط لرعايتك","لقد قبلت عرضك. أكمل الخطوات أدناه لننسّق علاجك وسفرك."]},
 TRAVEL_COORDINATION:{en:["Coordinating your travel & treatment","We're arranging your appointment, travel and stay. Track the steps below."],ar:["تنسيق سفرك وعلاجك","نرتّب موعدك وسفرك وإقامتك. تابع الخطوات أدناه."]},
 ARRIVAL_CONFIRMED:{en:["We're expecting you","Your arrival is confirmed and your care team is ready to welcome you."],ar:["في انتظارك","تم تأكيد وصولك وفريق الرعاية مستعد لاستقبالك."]},
 TREATMENT_IN_PROGRESS:{en:["Your treatment is underway","Your care team is looking after you. Reach out any time through secure messages."],ar:["علاجك جارٍ","فريق الرعاية يعتني بك. تواصل معنا في أي وقت عبر الرسائل الآمنة."]},
 DISCHARGED:{en:["Your treatment is complete","We'll stay in touch to support your recovery and follow-up care."],ar:["اكتمل علاجك","سنبقى على تواصل لدعم تعافيك ومتابعتك."]},
 FOLLOW_UP:{en:["Your follow-up care","We're supporting your recovery. Check below for any follow-up steps or messages."],ar:["متابعة رعايتك","ندعم تعافيك. راجع أدناه أي خطوات متابعة أو رسائل."]},
 CLINICALLY_NOT_SUITABLE:{en:["Specialist review complete","After careful review, this treatment isn't clinically suitable. Your coordinator can discuss alternatives with you."],ar:["اكتملت مراجعة الاستشاري","بعد مراجعة دقيقة، هذا العلاج غير مناسب سريريًا. يمكن لمنسّقك مناقشة البدائل معك."]},
};
function PatientStatusCard({status,locale}:{status:string;locale:Locale}){
 const entry=PATIENT_JOURNEY[status];const closed=["DECLINED","CANCELLED","CLOSED","EXPIRED"].includes(status);
 const [title,body]=entry?entry[locale]:closed?(locale==="ar"?["هذه الحالة مغلقة","إذا رغبت في استكشاف خياراتك مجددًا، تواصل مع منسّقك."]:["This case is closed","If you'd like to explore your options again, contact your coordinator."]):(locale==="ar"?[statusLabel(status,locale),"سيحدّث فريق الرعاية هذه الصفحة كلما تقدّمت رحلتك."]:[statusLabel(status,locale),"Your care team will update this page as your journey progresses."]);
 return <div className={`mt-6 card overflow-hidden border-s-4 ${closed?"border-line-strong":"border-brand-500"}`}><div className="flex items-start gap-4 p-6"><span className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-xl ${closed?"bg-mist text-ink-500":"bg-brand-50 text-brand-700"}`} aria-hidden>{closed?"‹":"♥"}</span><div><h3 className="title">{title}</h3><p className="mt-1 text-ink-600">{body}</p></div></div></div>;
}
function ProposalSendForm({caseId,reviewId,language,estimate,locale,t,busy,onSend}:{caseId:string;reviewId:string;language:string;estimate?:Review;fxRates:FxRate[];locale:Locale;t:typeof copy.en;busy:boolean;onSend:(caseId:string,body:unknown)=>void}){
 const estimates=estimate?.costEstimates??[];const[notes,setNotes]=useState("");
 // The consultant fixes the currency when recording the estimate; the coordinator cannot change it.
 const currency=estimates[0]?.currency??"EGP";
 const labels=locale==="ar"?{source:"اعتمدها الاستشاري",locked:"الخدمات والتكاليف الطبية أدخلها الاستشاري واعتمدها. لا يستطيع المنسق تعديلها.",missing:"لا يمكن إنشاء العرض حتى يضيف الاستشاري خدمة واحدة على الأقل وتكلفتها ضمن المراجعة المعتمدة.",coordination:"ملاحظة تنسيقية اختيارية",coordinationHint:"أضف فقط معلومات غير سريرية يحتاجها المريض، مثل نقطة التواصل أو خطوات التنسيق. لا تضف علاجًا أو تكلفة طبية هنا.",currency:"عملة عرض المريض",rateNote:"حدّدها الاستشاري عند تسجيل التقدير؛ يرى المريض العرض بهذه العملة."}:{source:"Consultant approved",locked:"Medical services and costs were entered and approved by the consultant. Coordinators cannot edit them.",missing:"A proposal cannot be created until the consultant adds at least one service and cost to the approved review.",coordination:"Optional coordination note",coordinationHint:"Add only non-clinical information the patient needs, such as the contact point or coordination steps. Do not add treatment or medical pricing here.",currency:"Patient's quote currency",rateNote:"Set by the consultant when recording the estimate; the patient sees the quote in this currency."};
 const items=estimates.map((item,index)=>({category:"MEDICAL",description:item.serviceDescription,quantity:1,unitPrice:item.estimatedCost,optional:false,sortOrder:index}));
 const total=items.reduce((a,i)=>a+i.unitPrice,0);
 const send=()=>{if(!items.length)return;onSend(caseId,{clinicalReviewId:reviewId,language,currency,includedServices:items.map(i=>i.description).join("; "),excludedServices:"Services not explicitly included",paymentTerms:"Payment schedule to be confirmed",refundTerms:"Subject to provider terms",disclaimers:"This proposal is not procedure-specific medical consent.",coordinatorNotes:notes.trim()||undefined,validUntil:new Date(Date.now()+14*86400000).toISOString(),items});};
 return <div className="mt-4 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-bold text-ink-700">{labels.currency}<span className="rounded-full bg-brand-50 px-3 py-1 text-brand-800">{CURRENCY_LABELS[currency]?.[locale]??currency}</span></span><span className="text-xs text-ink-500">{labels.rateNote}</span></div>
  <div className="overflow-hidden rounded-xl border border-brand-200"><div className="flex flex-wrap items-center justify-between gap-2 bg-brand-50 px-4 py-3"><h4 className="font-bold text-brand-900">{t.servicesFromConsultant}</h4><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-700">✓ {labels.source}</span></div><p className="border-b border-brand-100 px-4 py-3 text-sm text-ink-600">{labels.locked}</p>{items.length?<ul className="divide-y divide-line">{items.map(item=><li key={item.sortOrder} className="flex justify-between gap-4 px-4 py-3"><span className="font-semibold">{item.description}</span><strong className="whitespace-nowrap">{money(item.unitPrice,currency,locale)}</strong></li>)}<li className="flex justify-between gap-4 bg-brand-50 px-4 py-3"><span className="font-bold">{locale==="ar"?"الإجمالي":"Total"}</span><strong className="whitespace-nowrap">{money(total,currency,locale)}</strong></li></ul>:<p className="bg-alert-50 p-4 text-sm font-semibold text-alert-800">{labels.missing}</p>}</div>
  <div><label className="block"><span className="title text-base">{labels.coordination}</span><span className="mt-1 block text-sm text-ink-500">{labels.coordinationHint}</span><textarea className="field mt-2 min-h-24" maxLength={20000} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
  <button type="button" disabled={busy||!items.length} className="btn-primary w-full justify-center py-3 text-base sm:w-auto" onClick={send}>{t.createProposal}</button>
 </div>;
}
function ProposalShareLinks({share,locale,t}:{share:{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string};locale:Locale;t:typeof copy.en}){
 const[copied,setCopied]=useState(false);
 const base=(typeof window!=="undefined"?window.location.origin:process.env.NEXT_PUBLIC_SITE_URL)??"";
 const link=`${base}/${locale}/proposal/${share.token}`;
 const msg=`RehletShifaa — your treatment proposal${share.caseNumber?` (${share.caseNumber})`:""}: ${link}`;
 const wa=share.whatsapp?`https://wa.me/${share.whatsapp.replace(/[^0-9]/g,"")}?text=${encodeURIComponent(msg)}`:undefined;
 const mail=`mailto:${share.email??""}?subject=${encodeURIComponent("Your RehletShifaa proposal")}&body=${encodeURIComponent(msg)}`;
 const doCopy=()=>{void navigator.clipboard?.writeText(link).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);});};
 return <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="mb-3 text-sm font-bold text-brand-800">{t.linkReady}</p><p className="mb-3 break-all rounded-lg bg-white p-2 text-sm">{link}</p><div className="flex flex-wrap gap-2">{wa&&<a className="btn-primary" href={wa} target="_blank" rel="noopener noreferrer">{t.sendWhatsapp}</a>}<a className={`btn-secondary ${share.email?"":"pointer-events-none opacity-50"}`} href={mail}>{share.email?t.sendEmail:t.noPatientEmail}</a><button type="button" className="btn-secondary" onClick={doCopy}>{copied?t.copied:t.copyLink}</button></div></div>;
}
function DoctorReviewDecision({caseId,busy,t,locale,catalog,fxRates,mutate}:{caseId:string;busy:boolean;t:typeof copy.en;locale:Locale;catalog:CatalogService[];fxRates:FxRate[];mutate:Mutate}){
 const[treatment,setTreatment]=useState("");const[risks,setRisks]=useState("");
 const[currency,setCurrency]=useState("EGP");const[costs,setCosts]=useState([{description:"",amount:""}]);
 const[selected,setSelected]=useState<Set<string>>(new Set());
 const g=locale==="ar"?{catalog:"خدماتك المعتمدة",catalogHint:"اختر من قائمة أسعارك المعتمدة — لا تتطلب موافقة مالية.",noCatalog:"لا توجد لديك قائمة أسعار معتمدة بعد. أضف الخدمات يدويًا أدناه (تتطلب موافقة مالية).",manual:"خدمة غير مدرجة في قائمتك",manualHint:"أي خدمة خارج قائمتك المعتمدة تتطلب موافقة مالية قبل إرسال العرض للمريض.",currency:"عملة العرض",total:"الإجمالي التقديري",finance:"موافقة مالية",approved:"معتمد"}:{catalog:"Your approved services",catalogHint:"Pick from your finance-approved price list — no extra sign-off needed.",noCatalog:"You have no approved price list yet. Add services manually below (these need finance approval).",manual:"Service not on your list",manualHint:"Anything off your approved list needs finance approval before the quote can reach the patient.",currency:"Display currency",total:"Estimated total",finance:"needs finance",approved:"approved"};
 const currencyOptions=["EGP",...fxRates.filter(f=>f.currency!=="EGP").map(f=>f.currency)];
 const rate=currency==="EGP"?1:(fxRates.find(f=>f.currency===currency)?.rate??1);
 const toDisplay=(egp:number)=>egp*rate;const toEgp=(amt:number)=>rate?amt/rate:amt;
 const updateCost=(i:number,field:"description"|"amount",val:string)=>setCosts(rows=>rows.map((row,idx)=>idx===i?{...row,[field]:val}:row));
 const toggle=(id:string)=>setSelected(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n;});
 const catalogPicks=catalog.filter(s=>selected.has(s.id));
 const manualRows=costs.filter(row=>row.description.trim()&&row.amount!=="");
 const totalEgp=catalogPicks.reduce((a,s)=>a+s.priceEgp,0)+manualRows.reduce((a,row)=>a+toEgp(Number(row.amount)||0),0);
 const decide=(decision:string)=>{const costEstimates=decision==="ACCEPT"?[
   ...catalogPicks.map(s=>({serviceDescription:s.serviceName,estimatedCost:Math.round(toDisplay(s.priceEgp)*100)/100,currency,catalogServiceId:s.id})),
   ...manualRows.map(row=>({serviceDescription:row.description.trim(),estimatedCost:Math.round((Number(row.amount)||0)*100)/100,currency}))
 ]:undefined;void mutate(`/doctor/cases/${caseId}/review-decision`,{decision,recommendedTreatment:treatment,risksAndLimitations:risks,costEstimates}).then(r=>{if(r){setTreatment("");setRisks("");setCosts([{description:"",amount:""}]);setSelected(new Set());}});};
 return <div className="mt-4 space-y-5 border-t border-line pt-5">
  <div><h4 className="title text-base">{t.decisionHeading}</h4><p className="mb-3 text-sm text-ink-500">{t.reviewIntro}</p><label className="mb-1 block text-sm font-bold text-ink-700">{t.reviewTreatment}</label><textarea className="field" value={treatment} onChange={event=>setTreatment(event.target.value)} placeholder={t.reviewTreatment}/><label className="mb-1 mt-3 block text-sm font-bold text-ink-700">{t.reviewRisks}</label><textarea className="field" value={risks} onChange={event=>setRisks(event.target.value)} placeholder={t.reviewRisks}/></div>
  <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="title text-base text-brand-800">{t.costTitle}</h4><label className="flex items-center gap-2 text-sm font-bold text-ink-700">{g.currency}<select className="field !mt-0 w-auto py-1" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(code=><option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale]??code}</option>)}</select></label></div>
   {catalog.length>0?<><p className="mt-3 text-sm font-bold text-ink-700">{g.catalog}</p><p className="text-xs text-ink-500">{g.catalogHint}</p>
    <div className="mt-2 space-y-1.5">{catalog.map(s=>{const on=selected.has(s.id);return <button type="button" key={s.id} onClick={()=>toggle(s.id)} aria-pressed={on} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-start transition ${on?"border-brand-500 bg-white":"border-line bg-white/60 hover:bg-white"}`}><span className="flex min-w-0 items-center gap-2.5"><span className={`flex h-5 w-5 flex-none items-center justify-center rounded border text-xs ${on?"border-brand-500 bg-brand-500 text-white":"border-line"}`} aria-hidden>{on?"✓":""}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink-800">{s.serviceName}</span>{s.category&&<span className="block text-xs text-ink-500">{s.category}</span>}</span></span><span className="whitespace-nowrap text-sm font-bold text-ink-800">{money(toDisplay(s.priceEgp),currency,locale)}</span></button>;})}</div></>
   :<p className="mt-3 rounded-lg bg-white p-3 text-sm text-ink-600">{g.noCatalog}</p>}
   <p className="mt-4 text-sm font-bold text-ink-700">{g.manual} <span className="rounded bg-alert-50 px-1.5 py-0.5 text-xs font-bold text-alert-700">{g.finance}</span></p><p className="text-xs text-ink-500">{g.manualHint}</p>
   <div className="mt-2 space-y-2">{costs.map((row,i)=><div key={i} className="flex gap-2"><input className="field flex-1" value={row.description} onChange={e=>updateCost(i,"description",e.target.value)} placeholder={t.costService}/><input className="field w-36" type="number" min="0" step="0.01" value={row.amount} onChange={e=>updateCost(i,"amount",e.target.value)} placeholder={`${t.costAmount} (${currency})`}/>{costs.length>1&&<button type="button" className="btn-secondary" onClick={()=>setCosts(rows=>rows.filter((_,idx)=>idx!==i))} aria-label="remove">×</button>}</div>)}</div>
   <button type="button" className="btn-secondary mt-3" onClick={()=>setCosts(rows=>[...rows,{description:"",amount:""}])}>+ {t.addCost}</button>
   {(catalogPicks.length>0||manualRows.length>0)&&<div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-brand-200 pt-3"><span className="text-sm text-ink-600">{catalogPicks.length+manualRows.length} · {catalogPicks.length} {g.approved}{manualRows.length>0&&<> · {manualRows.length} {g.finance}</>}</span><span className="text-base font-bold text-ink-900">{g.total}: {money(toDisplay(totalEgp),currency,locale)}</span></div>}
  </div>
  <div className="space-y-3">
   <button className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base" disabled={busy} onClick={()=>decide("ACCEPT")}><span aria-hidden>✓</span>{t.reviewAccept}</button>
   <p className="text-center text-xs text-ink-500">{t.acceptHint}</p>
   <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
    {([["INFO",t.reviewInfo,t.infoHint],["RETURN_TO_COORDINATOR",t.reviewReturn,t.returnHint],["REASSIGN",t.reviewReassign,t.reassignHint]] as const).map(([decision,label,hint])=><button key={decision} type="button" disabled={busy} onClick={()=>decide(decision)} className="rounded-xl border border-line bg-white p-3 text-start transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"><span className="block font-bold text-ink-800">{label}</span><span className="mt-0.5 block text-xs text-ink-500">{hint}</span></button>)}
    <button type="button" disabled={busy} onClick={()=>decide("NOT_SUITABLE")} className="rounded-xl border border-alert-200 bg-white p-3 text-start transition hover:border-alert-400 hover:bg-alert-50 disabled:opacity-50"><span className="block font-bold text-alert-700">{t.reviewNotSuitable}</span><span className="mt-0.5 block text-xs text-ink-500">{t.notSuitableHint}</span></button>
   </div>
  </div>
 </div>;
}
function FinalAssessment({caseId,busy,locale,catalog,fxRates,mutate}:{caseId:string;busy:boolean;locale:Locale;catalog:CatalogService[];fxRates:FxRate[];mutate:Mutate}){
 const[treatment,setTreatment]=useState("");const[risks,setRisks]=useState("");const[currency,setCurrency]=useState("EGP");const[costs,setCosts]=useState([{description:"",amount:""}]);const[selected,setSelected]=useState<Set<string>>(new Set());
 const g=locale==="ar"?{title:"الفحص السريري النهائي",intro:"سجّل تقييمك بعد فحص المريض. سيبني المنسق العرض النهائي من الخدمات المؤكدة.",treatment:"العلاج النهائي الموصى به",risks:"المخاطر والقيود",services:"خدماتك المعتمدة",manual:"خدمة غير مدرجة (تتطلب موافقة مالية)",currency:"عملة العرض",add:"إضافة خدمة",save:"حفظ التقييم النهائي",service:"الخدمة",amount:"المبلغ"}:{title:"Final in-person assessment",intro:"Record your assessment after examining the patient. The coordinator builds the final quote from the confirmed services.",treatment:"Final recommended treatment",risks:"Risks & limitations",services:"Your approved services",manual:"Service not on your list (needs finance approval)",currency:"Display currency",add:"Add a service",save:"Save final assessment",service:"Service",amount:"Amount"};
 const currencyOptions=["EGP",...fxRates.filter(f=>f.currency!=="EGP").map(f=>f.currency)];const rate=currency==="EGP"?1:(fxRates.find(f=>f.currency===currency)?.rate??1);
 const toggle=(id:string)=>setSelected(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n;});
 const updateCost=(i:number,f:"description"|"amount",val:string)=>setCosts(rows=>rows.map((row,idx)=>idx===i?{...row,[f]:val}:row));
 const save=()=>{const picks=catalog.filter(s=>selected.has(s.id)).map(s=>({serviceDescription:s.serviceName,estimatedCost:Math.round(s.priceEgp*rate*100)/100,currency,catalogServiceId:s.id}));const manual=costs.filter(row=>row.description.trim()&&row.amount!=="").map(row=>({serviceDescription:row.description.trim(),estimatedCost:Math.round((Number(row.amount)||0)*100)/100,currency}));if(!picks.length&&!manual.length)return;void mutate(`/doctor/cases/${caseId}/final-assessment`,{recommendedTreatment:treatment,risksAndLimitations:risks,costEstimates:[...picks,...manual]}).then(r=>{if(r){setTreatment("");setRisks("");setCosts([{description:"",amount:""}]);setSelected(new Set());}});};
 return <div className="mt-4 space-y-4 border-t border-line pt-4">
  <div><h4 className="title text-base">{g.title}</h4><p className="mt-1 text-sm text-ink-500">{g.intro}</p></div>
  <label className="block text-sm font-bold">{g.treatment}<textarea className="field mt-1" value={treatment} onChange={e=>setTreatment(e.target.value)}/></label>
  <label className="block text-sm font-bold">{g.risks}<textarea className="field mt-1" value={risks} onChange={e=>setRisks(e.target.value)}/></label>
  <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-brand-800">{g.services}</span><select className="field !mt-0 w-auto py-1" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(code=><option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale]??code}</option>)}</select></div>
   {catalog.length>0&&<div className="mt-2 space-y-1.5">{catalog.map(s=>{const on=selected.has(s.id);return <button type="button" key={s.id} onClick={()=>toggle(s.id)} aria-pressed={on} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-start transition ${on?"border-brand-500 bg-white":"border-line bg-white/60"}`}><span className="flex items-center gap-2.5"><span className={`flex h-5 w-5 flex-none items-center justify-center rounded border text-xs ${on?"border-brand-500 bg-brand-500 text-white":"border-line"}`} aria-hidden>{on?"✓":""}</span><span className="text-sm font-semibold text-ink-800">{s.serviceName}</span></span><span className="text-sm font-bold">{money(s.priceEgp*rate,currency,locale)}</span></button>;})}</div>}
   <p className="mt-3 text-sm font-bold text-ink-700">{g.manual}</p>
   <div className="mt-1 space-y-2">{costs.map((row,i)=><div key={i} className="flex gap-2"><input className="field flex-1" value={row.description} onChange={e=>updateCost(i,"description",e.target.value)} placeholder={g.service}/><input className="field w-32" type="number" min="0" step="0.01" value={row.amount} onChange={e=>updateCost(i,"amount",e.target.value)} placeholder={`${g.amount} (${currency})`}/>{costs.length>1&&<button type="button" className="btn-secondary" onClick={()=>setCosts(rows=>rows.filter((_,idx)=>idx!==i))} aria-label="remove">×</button>}</div>)}</div>
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
 const g=locale==="ar"?{title:"الوديعة والدفعات",total:"الإجمالي",paid:"المدفوع",balance:"المتبقي",record:"تسجيل دفعة",refund:"تسجيل استرداد",amount:"المبلغ (ج.م)",method:"الطريقة",reference:"مرجع المزوّد",reason:"سبب الاسترداد",note:"تسجيل دون اتصال فقط — يسجّل الدفعات المستلمة فعليًا؛ لا تُدخل بيانات بطاقة.",credited:"تُخصم من الرصيد النهائي",REQUESTED:"مطلوبة",PARTIALLY_PAID:"مدفوعة جزئيًا",PAID:"مدفوعة",CANCELLED:"ملغاة",REFUNDED:"مستردة"}:{title:"Deposit & payments",total:"Total",paid:"Paid",balance:"Balance",record:"Record a payment",refund:"Record a refund",amount:"Amount (EGP)",method:"Method",reference:"Provider reference",reason:"Refund reason",note:"Offline record-only — records payments actually received; no card data is entered.",credited:"credited to final",REQUESTED:"Requested",PARTIALLY_PAID:"Partially paid",PAID:"Paid",CANCELLED:"Cancelled",REFUNDED:"Refunded"};
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
function DeliveryCard({delivery,caseId,versionId,locale,busy,mutate}:{delivery:DeliveryStatus;caseId:string;versionId:string;locale:Locale;busy:boolean;mutate:Mutate}){
 const g=locale==="ar"?{title:"حالة إرسال الرابط الآمن",channel:"القناة",to:"إلى",attempts:"المحاولات",resend:"إعادة إرسال الرابط",QUEUED:"في قائمة الإرسال",DELIVERED:"تم التسليم",RETRY:"إعادة المحاولة",FAILED:"فشل الإرسال",resendHint:"يُلغي الرابط ورمز التحقق السابقين ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرضًا جديدًا ولا يغيّر حالة الطلب."}:{title:"Secure link delivery",channel:"Channel",to:"To",attempts:"Attempts",resend:"Resend link",QUEUED:"Queued",DELIVERED:"Delivered",RETRY:"Retrying",FAILED:"Failed",resendHint:"Revokes the previous link and code and sends a fresh secure link to the patient's verified contact. It does not create a new proposal or change the case."};
 const label=(g as Record<string,string>)[delivery.status]??delivery.status;
 const cls=delivery.status==="DELIVERED"?"bg-brand-50 text-brand-700":delivery.status==="FAILED"?"bg-alert-50 text-alert-700":"bg-mist text-ink-600";
 return <div className="mt-4 rounded-xl border border-line p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-ink-800">{g.title}</p><span className={`rounded px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span></div>
  <p className="mt-2 text-sm text-ink-600">{g.channel}: <strong>{delivery.channel}</strong> · {g.to} <span dir="ltr">{delivery.destinationMasked}</span>{delivery.attempts>0?` · ${g.attempts}: ${delivery.attempts}`:""}</p>
  <button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>void mutate(`/coordinator/cases/${caseId}/proposals/${versionId}/resend`)}>{g.resend}</button>
  <p className="mt-2 text-xs text-ink-500">{g.resendHint}</p></div>;
}
function RoleActions({role,t,c,proposal,gates,locale,mutate}:{role:RoleKey;t:typeof copy.en;c:CaseView;proposal?:Proposal;gates?:ProposalGates|null;locale:Locale;mutate:Mutate}){
 const[operationsPlan,setOperationsPlan]=useState(proposal?.operationalPlan??"");
 const gl=locale==="ar"?{checklist:"متطلبات الإرسال",operations:"العمليات (باقة السفر)",finance:"الموافقة المالية",notReq:"غير مطلوب",waiting:"بانتظار",done:"مكتمل",releaseHint:"يُفعَّل الإرسال بعد اكتمال جميع المتطلبات."}:{checklist:"Release requirements",operations:"Operations (travel package)",finance:"Finance approval",notReq:"Not required",waiting:"Waiting",done:"Complete",releaseHint:"Release unlocks once every required step is complete."};
 const badge=(required:boolean,done:boolean)=>{const s=!required?gl.notReq:done?gl.done:gl.waiting;const cls=!required?"bg-mist text-ink-500":done?"bg-brand-50 text-brand-700":"bg-alert-50 text-alert-700";return <span className={`rounded px-2 py-0.5 text-xs font-bold ${cls}`}>{s}</span>;};
 const checklist=gates&&["coordinator","operations","finance"].includes(role)?<div className="mt-4 rounded-xl border border-line p-3"><p className="mb-2 text-sm font-bold text-ink-800">{gl.checklist}</p><div className="space-y-1.5 text-sm"><div className="flex items-center justify-between gap-2"><span>{gl.operations}</span>{badge(gates.operationsRequired,gates.operationsCompleted)}</div><div className="flex items-center justify-between gap-2"><span>{gl.finance}</span>{badge(gates.financeRequired,gates.financeCompleted)}</div></div>{gates.financeRequired&&gates.financeReasons.length>0&&<p className="mt-2 text-xs text-ink-500">{gates.financeReasons.join(" ")}</p>}</div>:null;
 if(role==="operations")return <>{checklist}{gates?.operationsRequired&&!gates.operationsCompleted&&proposal?.status==="CLINICALLY_APPROVED"?<div className="mt-4 space-y-3"><textarea className="field min-h-28" aria-label={t.operationsComplete} maxLength={30000} required value={operationsPlan} onChange={event=>setOperationsPlan(event.target.value)}/><button className="btn-primary" disabled={!operationsPlan.trim()} onClick={()=>void mutate(`/operations/cases/${c.id}/proposals/${proposal.versionId}/complete`,{plan:operationsPlan.trim()})}>{t.operationsComplete}</button></div>:null}</>;
 if(role==="finance")return <>{checklist}{gates?.financeRequired&&!gates.financeCompleted&&(!gates.operationsRequired||gates.operationsCompleted)&&proposal?<button className="btn-primary mt-4" onClick={()=>void mutate(`/finance/cases/${c.id}/proposals/${proposal.versionId}/approve`)}>{t.financeApprove}</button>:null}</>;
 if(role==="coordinator")return <>{checklist}{gates?.readyForRelease&&proposal?<div className="mt-4"><button className="btn-primary" onClick={()=>void mutate(`/coordinator/cases/${c.id}/proposals/${proposal.versionId}/release`)}>{t.release}</button><p className="mt-2 text-xs text-ink-500">{gl.releaseHint}</p></div>:(gates&&!gates.readyForRelease?<p className="mt-3 text-xs text-ink-500">{gl.releaseHint}</p>:null)}</>;
 if(role==="patient"&&proposal&&["RELEASED","VIEWED"].includes(proposal.status))return <PatientProposalDecision key={proposal.versionId} locale={locale} caseId={c.id} proposal={proposal} mutate={mutate}/>;
 return null;
}
function ProposalCard({locale,t,proposal}:{locale:Locale;t:typeof copy.en;proposal:Proposal}){const total=proposal.items.filter(i=>!i.optional).reduce((sum,i)=>sum+i.quantity*i.unitPrice,0);return <div className="rounded-xl bg-brand-50 p-5"><div className="flex justify-between gap-3"><strong>v{proposal.versionNumber} · {statusLabel(proposal.status,locale)}</strong><strong>{new Intl.NumberFormat(locale,{style:"currency",currency:proposal.currency??"USD"}).format(total)}</strong></div><ul className="mt-3 space-y-1">{proposal.items.map(item=><li key={item.id} className="flex justify-between gap-3"><span>{item.description}{item.quantity>1?` × ${item.quantity}`:""}{item.optional?(locale==="ar"?" (اختياري)":" (optional)"):""}</span><strong className="whitespace-nowrap">{money(item.quantity*item.unitPrice,proposal.currency??"USD",locale)}</strong></li>)}</ul>{proposal.coordinatorNotes&&<div className="mt-3 rounded-lg bg-white/70 p-3 text-sm"><p className="font-bold text-brand-700">{t.proposalNotesLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{proposal.coordinatorNotes}</p></div>}{proposal.validUntil&&<p className="mt-3 text-sm">{locale==="ar"?"صالح حتى":"Valid until"} {new Intl.DateTimeFormat(locale).format(new Date(proposal.validUntil))}</p>}</div>}
function FinancePolicies({api,locale}:{api:Api;locale:Locale}){
 const[commercial,setCommercial]=useState<CommercialPolicy[]>([]);const[deposits,setDeposits]=useState<DepositPolicy[]>([]);
 const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");const[err,setErr]=useState("");
 const g=locale==="ar"?{title:"الإعدادات التجارية (مالية عليا)",intro:"تُطبَّق هذه السياسات المركزية على الحالات الجديدة فقط، ولا تتغيّر بعد إصدار تقدير مبدئي. تتطلب مصادقة حديثة.",marginTitle:"سياسة الهامش (تُدمج في باقة المريض)",depositTitle:"سياسة الوديعة",careArea:"مجال الرعاية",default:"الافتراضي (الكل)",rate:"الهامش %",amount:"وديعة التنسيق (ج.م)",active:"نشِطة",version:"الإصدار",save:"حفظ إصدار جديد",saved:"تم الحفظ."}:{title:"Commercial settings (senior Finance)",intro:"These central policies apply to new cases only and never change after a preliminary estimate is released. Saving requires recent authentication.",marginTitle:"Margin policy (included in the patient package)",depositTitle:"Deposit policy",careArea:"Care area",default:"Default (all)",rate:"Margin %",amount:"Coordination deposit (EGP)",active:"Active",version:"Version",save:"Save new version",saved:"Saved."};
 const load=useCallback(async()=>{try{const[c,d]=await Promise.all([api<CommercialPolicy[]>("/finance/commercial-policies"),api<DepositPolicy[]>("/finance/deposit-policies")]);setCommercial(c);setDeposits(d);}catch(e){setErr(e instanceof Error?e.message:"Error");}},[api]);
 useEffect(()=>{void load();},[load]);
 const areas=["cardiology","rheumatology-rehabilitation","orthopedics"];
 const areaLabel=(a?:string)=>a?a:g.default;
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setErr("");setMsg("");try{await fn();setMsg(g.saved);await load();return true;}catch(e){setErr(e instanceof Error?e.message:"Error");return false;}finally{setBusy(false);}};
 return <section className="card mb-8 space-y-6 p-6">
  <div><h2 className="title">{g.title}</h2><p className="mt-1 text-sm text-ink-500">{g.intro}</p></div>
  {msg&&<p className="rounded-lg bg-brand-50 p-2 text-sm text-brand-800">{msg}</p>}{err&&<p className="rounded-lg bg-alert-50 p-2 text-sm text-alert-800">{err}</p>}
  <div><h3 className="font-bold text-ink-800">{g.marginTitle}</h3>
   <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs uppercase tracking-wide text-ink-500"><th className="p-2 text-start">{g.careArea}</th><th className="p-2 text-end">{g.rate}</th><th className="p-2 text-end">{g.version}</th></tr></thead><tbody>{commercial.filter(p=>p.active).map(p=><tr key={p.id} className="border-t border-line"><td className="p-2">{areaLabel(p.careCategory)}</td><td className="p-2 text-end">{(p.marginRate*100).toFixed(2)}%</td><td className="p-2 text-end">v{p.version}</td></tr>)}</tbody></table></div>
   <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);void run(()=>api("/finance/commercial-policies",{method:"PUT",body:JSON.stringify({careCategory:String(d.get("area")||"")||undefined,marginRate:(Number(d.get("rate"))||0)/100})})).then(result=>{if(result)f.reset();});}}>
    <label className="text-xs font-bold">{g.careArea}<select className="field w-52" name="area"><option value="">{g.default}</option>{areas.map(a=><option key={a} value={a}>{a}</option>)}</select></label>
    <label className="text-xs font-bold">{g.rate}<input className="field w-24" name="rate" type="number" min="0" max="50" step="0.1" placeholder="12" required/></label>
    <button className="btn-primary" disabled={busy}>{g.save}</button>
   </form></div>
  <div className="border-t border-line pt-4"><h3 className="font-bold text-ink-800">{g.depositTitle}</h3>
   <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs uppercase tracking-wide text-ink-500"><th className="p-2 text-start">{g.careArea}</th><th className="p-2 text-end">{g.amount}</th><th className="p-2 text-end">{g.version}</th></tr></thead><tbody>{deposits.filter(p=>p.active).map(p=><tr key={p.id} className="border-t border-line"><td className="p-2">{areaLabel(p.careCategory)}</td><td className="p-2 text-end">{new Intl.NumberFormat(locale).format(p.coordinationDepositEgp)} EGP</td><td className="p-2 text-end">v{p.version}</td></tr>)}</tbody></table></div>
   <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);void run(()=>api("/finance/deposit-policies",{method:"PUT",body:JSON.stringify({careCategory:String(d.get("area")||"")||undefined,coordinationDepositEgp:Number(d.get("amount"))||0})})).then(result=>{if(result)f.reset();});}}>
    <label className="text-xs font-bold">{g.careArea}<select className="field w-52" name="area"><option value="">{g.default}</option>{areas.map(a=><option key={a} value={a}>{a}</option>)}</select></label>
    <label className="text-xs font-bold">{g.amount}<input className="field w-32" name="amount" type="number" min="0" step="0.01" placeholder="3000" required/></label>
    <button className="btn-primary" disabled={busy}>{g.save}</button>
   </form></div>
 </section>;
}
function CatalogAdmin({api,locale}:{api:Api;locale:Locale}){
 const[list,setList]=useState<PractitionerSummary[]>([]);const[sel,setSel]=useState("");
 const[rows,setRows]=useState<CatalogService[]>([]);const[fx,setFx]=useState<FxRate[]>([]);
 const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");const[err,setErr]=useState("");
 const[importFile,setImportFile]=useState<File|null>(null);const[preview,setPreview]=useState<CatalogImportResult|null>(null);const[display,setDisplay]=useState("EGP");
 const g=locale==="ar"?{title:"قوائم أسعار الاستشاريين",intro:"لكل استشاري قائمته الخاصة المشتقة من قالب مجال رعايته. التعديلات تظهر فورًا في صفحة الطبيب.",pick:"اختر استشاريًا",derive:"اشتقاق من قالب المجال",noCatalog:"لا توجد قائمة أسعار بعد. اشتقّها من قالب المجال أو أضف خدمة يدويًا.",service:"الخدمة",code:"الرمز",category:"الفئة",price:"السعر (ج.م)",active:"مفعّل",save:"حفظ",deactivate:"إيقاف",add:"إضافة خدمة",saved:"تم الحفظ.",fxTitle:"أسعار الصرف",fxIntro:"تحدّد هذه الأسعار قيمة الأسعار المعروضة بكل عملة في شاشات الطبيب والمنسّق والمريض. اترك العملة على سعر السوق اليومي، أو احفظ سعرك الخاص (مثل سعر البنك المركزي المصري).",fxRate:"جنيه لكل وحدة",pin:"حفظ السعر",fxLocked:"مثبّت",source:"المصدر",importTitle:"استيراد من ملف CSV",importHint:"احفظ ملف الأسعار من إكسل بصيغة CSV بالأعمدة: service_code, service_name, category, price_egp, active. سيظهر معاينة قبل التطبيق.",template:"تنزيل نموذج CSV",chooseFile:"اختر ملف CSV",previewTitle:"معاينة الاستيراد",confirm:"تأكيد الاستيراد",cancel:"إلغاء",imported:"تم الاستيراد.",line:"سطر",action:"الإجراء",note:"ملاحظة",displayCurrency:"عرض الأسعار بعملة",convertNote:"السعر الأساسي يبقى بالجنيه المصري، ويُعرض المبلغ محوّلًا بالسعر المثبّت — كما يظهر في صفحة الطبيب.",noRate:"ثبّت سعر صرف لهذه العملة أدناه لعرض الأسعار بها."}:{title:"Consultant price lists",intro:"Each consultant has their own list derived from their care-area template. Edits show on the doctor's page immediately.",pick:"Select a consultant",derive:"Derive from care-area template",noCatalog:"No price list yet. Derive it from the care-area template, or add a service manually.",service:"Service",code:"Code",category:"Category",price:"Price (EGP)",active:"Active",save:"Save",deactivate:"Deactivate",add:"Add a service",saved:"Saved.",fxTitle:"Exchange rates",fxIntro:"These rates set the prices shown in each currency on the doctor, coordinator and patient screens. Leave a currency on the daily market rate, or save your own (e.g. the Central Bank of Egypt rate).",fxRate:"EGP per 1 unit",pin:"Save rate",fxLocked:"Locked",source:"Source",importTitle:"Import from CSV",importHint:"Save your Excel price sheet as CSV with columns: service_code, service_name, category, price_egp, active. You'll see a preview before it's applied.",template:"Download CSV template",chooseFile:"Choose CSV file",previewTitle:"Import preview",confirm:"Confirm import",cancel:"Cancel",imported:"Imported.",line:"Line",action:"Action",note:"Note",displayCurrency:"View prices in",convertNote:"The base price stays in EGP; the shown amount is converted at the pinned rate — the same figure the doctor's page uses.",noRate:"Pin an exchange rate for this currency below to view prices in it."};
 const upload=async(file:File,commit:boolean)=>{if(!sel)return;setBusy(true);setErr("");setMsg("");try{const fd=new FormData();fd.append("file",file);const res=await api<CatalogImportResult>(`/admin/practitioners/${sel}/catalog/import?commit=${commit}`,{method:"POST",body:fd});if(commit){setMsg(`${g.imported} +${res.added} · ~${res.updated}`);setPreview(null);setImportFile(null);await load(sel);}else setPreview(res);}catch(e){setErr(e instanceof Error?e.message:"Error");}finally{setBusy(false);}};
 const downloadTemplate=()=>{const csv="service_code,service_name,category,price_egp,active\nCARD-CONSULT,Diagnostic cardiology consultation,Consultation,3500,true\nCARD-ECHO,Transthoracic echocardiogram,Diagnostics,4500,true\n";const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="price-list-template.csv";a.click();URL.revokeObjectURL(url);};
 useEffect(()=>{void api<PractitionerSummary[]>("/admin/practitioners").then(setList).catch(()=>setList([]));},[api]);
 const load=useCallback(async(id:string)=>{if(!id){setRows([]);setFx([]);return;}setBusy(true);setErr("");try{const[cat,rates]=await Promise.all([api<CatalogService[]>(`/admin/practitioners/${id}/catalog`),api<FxRate[]>("/admin/fx-rates")]);setRows(cat);setFx(rates);}catch(e){setErr(e instanceof Error?e.message:"Error");}finally{setBusy(false);}},[api]);
 useEffect(()=>{void load(sel);},[sel,load]);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setErr("");setMsg("");try{await fn();setMsg(g.saved);await load(sel);return true;}catch(e){setErr(e instanceof Error?e.message:"Error");return false;}finally{setBusy(false);}};
 const patch=(id:string,field:keyof CatalogService,val:string|number|boolean)=>setRows(rs=>rs.map(r=>r.id===id?{...r,[field]:val}:r));
 const selCare=list.find(p=>p.id===sel)?.careCategory;
 const dispCurrencies=["EGP",...fx.filter(f=>f.currency!=="EGP").map(f=>f.currency)];
 const dispRate=display==="EGP"?1:(fx.find(f=>f.currency===display)?.rate??null);
 return <div className="card space-y-5 p-6">
  <div><h2 className="title">{g.title}</h2><p className="mt-1 text-sm text-ink-500">{g.intro}</p></div>
  <label className="block text-sm font-bold">{g.pick}<select className="field mt-1" value={sel} onChange={e=>setSel(e.target.value)}><option value="">—</option>{list.map(p=><option key={p.id} value={p.id}>{p.displayName} — {p.specialty??p.careCategory} · {p.credentialingStatus}</option>)}</select></label>
  {msg&&<p className="rounded-lg bg-brand-50 p-2 text-sm text-brand-800">{msg}</p>}{err&&<p className="rounded-lg bg-alert-50 p-2 text-sm text-alert-800">{err}</p>}
  {sel&&<>
   <button type="button" disabled={busy} className="btn-secondary" onClick={()=>void run(()=>api(`/admin/practitioners/${sel}/catalog/derive`,{method:"POST"}))}>{g.derive}{selCare?` · ${selCare}`:""}</button>
   {rows.length>0&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist p-2.5">
    <label className="flex items-center gap-2 text-sm font-bold text-ink-700">{g.displayCurrency}<select className="field !mt-0 w-auto py-1" value={display} onChange={e=>setDisplay(e.target.value)}>{dispCurrencies.map(c=><option key={c} value={c}>{CURRENCY_LABELS[c]?.[locale]??c}</option>)}</select></label>
    <span className="text-xs text-ink-500">{display!=="EGP"&&!dispRate?g.noRate:g.convertNote}</span>
   </div>}
   {rows.length===0?<p className="rounded-lg bg-mist p-3 text-sm text-ink-600">{g.noCatalog}</p>:
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs uppercase tracking-wide text-ink-500"><th className="p-2 text-start">{g.service}</th><th className="p-2 text-start">{g.category}</th><th className="p-2 text-end">{g.price}</th><th className="p-2 text-center">{g.active}</th><th className="p-2"></th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.id} className="border-t border-line align-top">
       <td className="p-2"><input className="field !mt-0" value={r.serviceName} onChange={e=>patch(r.id,"serviceName",e.target.value)}/><span className="ms-1 text-xs text-ink-400">{r.serviceCode}</span></td>
       <td className="p-2"><input className="field !mt-0 w-32" value={r.category??""} onChange={e=>patch(r.id,"category",e.target.value)}/></td>
       <td className="p-2 text-end"><input className="field !mt-0 w-28 text-end" type="number" min="0" step="0.01" value={r.priceEgp} onChange={e=>patch(r.id,"priceEgp",Number(e.target.value))}/>{display!=="EGP"&&dispRate&&<div className="mt-1 whitespace-nowrap text-xs font-semibold text-brand-700">≈ {money(r.priceEgp*dispRate,display,locale)}</div>}</td>
       <td className="p-2 text-center"><input type="checkbox" checked={r.active} onChange={e=>patch(r.id,"active",e.target.checked)}/></td>
       <td className="whitespace-nowrap p-2 text-end"><button type="button" disabled={busy} className="btn-secondary" onClick={()=>void run(()=>api(`/admin/practitioners/${sel}/catalog/${r.id}`,{method:"PUT",body:JSON.stringify({serviceCode:r.serviceCode,serviceName:r.serviceName,category:r.category,priceEgp:r.priceEgp,active:r.active})}))}>{g.save}</button> <button type="button" disabled={busy} className="text-sm font-semibold text-alert-700" onClick={()=>void run(()=>api(`/admin/practitioners/${sel}/catalog/${r.id}`,{method:"DELETE"}))}>{g.deactivate}</button></td>
     </tr>)}</tbody></table></div>}
   <form className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line p-3" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const d=new FormData(f);void run(()=>api(`/admin/practitioners/${sel}/catalog`,{method:"POST",body:JSON.stringify({serviceCode:String(d.get("code")).trim(),serviceName:String(d.get("name")).trim(),category:(String(d.get("category")||"").trim())||undefined,priceEgp:Number(d.get("price"))||0,active:true})})).then(result=>{if(result)f.reset();});}}>
    <input className="field flex-1" name="name" placeholder={g.service} required/><input className="field w-32" name="category" placeholder={g.category}/><input className="field w-28" name="code" placeholder={g.code} required/><input className="field w-28" name="price" type="number" min="0" step="0.01" placeholder={g.price} required/><button className="btn-primary" disabled={busy}>{g.add}</button>
   </form>
   <div className="border-t border-line pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-ink-800">{g.importTitle}</h3><button type="button" className="text-sm font-semibold text-brand-700" onClick={downloadTemplate}>{g.template} ↓</button></div>
    <p className="text-xs text-ink-500">{g.importHint}</p>
    <input className="field mt-2" type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0]??null;setImportFile(f);setPreview(null);if(f)void upload(f,false);}}/>
    {preview&&<div className="mt-3 rounded-lg border border-line p-3">
     <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">{g.previewTitle}</p><p className="text-sm text-ink-600">+{preview.added} · ~{preview.updated} · ={preview.unchanged}{preview.errors>0&&<span className="text-alert-700"> · ⚠ {preview.errors}</span>}</p></div>
     <div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-xs uppercase tracking-wide text-ink-500"><th className="p-1 text-start">{g.line}</th><th className="p-1 text-start">{g.code}</th><th className="p-1 text-start">{g.service}</th><th className="p-1 text-end">{g.price}</th><th className="p-1 text-start">{g.action}</th></tr></thead>
      <tbody>{preview.rows.map((row,i)=><tr key={i} className="border-t border-line"><td className="p-1">{row.line}</td><td className="p-1 whitespace-nowrap">{row.serviceCode}</td><td className="p-1">{row.serviceName}</td><td className="p-1 text-end">{row.priceEgp!=null?money(row.priceEgp,"EGP",locale):"—"}</td><td className="p-1"><span className={`rounded px-1.5 py-0.5 text-xs font-bold ${row.action==="NEW"?"bg-brand-50 text-brand-700":row.action==="UPDATE"?"bg-brand-100 text-brand-800":row.action==="ERROR"?"bg-alert-50 text-alert-700":"bg-mist text-ink-500"}`}>{row.action}</span>{row.message&&<span className="ms-2 text-xs text-alert-700">{row.message}</span>}</td></tr>)}</tbody></table></div>
     <div className="mt-3 flex gap-2"><button type="button" disabled={busy||!importFile||preview.added+preview.updated===0} className="btn-primary" onClick={()=>{if(importFile)void upload(importFile,true);}}>{g.confirm} (+{preview.added} · ~{preview.updated})</button><button type="button" className="btn-secondary" onClick={()=>{setPreview(null);setImportFile(null);}}>{g.cancel}</button></div>
    </div>}
   </div>
   <div className="border-t border-line pt-4"><h3 className="font-bold text-ink-800">{g.fxTitle}</h3><p className="text-xs text-ink-500">{g.fxIntro}</p>
    <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs uppercase tracking-wide text-ink-500"><th className="p-2 text-start">Currency</th><th className="p-2 text-end">{g.fxRate}</th><th className="p-2 text-start">{g.source}</th><th className="p-2"></th></tr></thead>
     <tbody>{fx.filter(f=>f.currency!=="EGP").map(f=><FxRow key={f.currency} f={f} locale={locale} busy={busy} saveLabel={g.pin} lockedLabel={g.fxLocked} onPin={async(cur,stored)=>{setBusy(true);setErr("");setMsg("");try{await api(`/admin/fx-rates/${cur}`,{method:"PUT",body:JSON.stringify({rate:stored})});setMsg(g.saved);await load(sel);return true;}catch(e){setErr(e instanceof Error?e.message:"Error");return false;}finally{setBusy(false);}}}/>)}</tbody></table></div>
   </div>
  </>}
 </div>;
}
function FxRow({f,locale,busy,saveLabel,lockedLabel,onPin}:{f:FxRate;locale:Locale;busy:boolean;saveLabel:string;lockedLabel:string;onPin:(currency:string,storedRate:number)=>Promise<boolean>}){
 const[egpPer,setEgpPer]=useState((f.rate?1/f.rate:0).toFixed(4));
 const[saved,setSaved]=useState(false);
 const per=Number(egpPer);
 const example=per>0?money(1000/per,f.currency,locale):"—"; // a 1,000 EGP service at this rate
 const locked=f.source==="MANUAL";
 const savedTxt=locale==="ar"?"تم الحفظ":"Saved";
 return <tr className="border-t border-line align-top">
  <td className="p-2 font-semibold">{f.currency}{locked&&<span className="ms-2 whitespace-nowrap rounded bg-brand-50 px-1.5 py-0.5 text-xs font-bold text-brand-700">✓ {lockedLabel}</span>}</td>
  <td className="p-2 text-end"><input className="field !mt-0 w-28 text-end" type="number" min="0" step="0.0001" value={egpPer} onChange={e=>{setEgpPer(e.target.value);setSaved(false);}}/>
   {per>0&&<div className="mt-1 whitespace-nowrap text-xs text-ink-500">1 {f.currency} = {per.toLocaleString(locale)} EGP · 1,000 EGP → <strong className="text-brand-700">{example}</strong></div>}
  </td>
  <td className="p-2 text-xs text-ink-500">{f.source} · {f.rateDate}</td>
  <td className="p-2 text-end"><button type="button" disabled={busy||!(per>0)} className="btn-secondary transition-colors"
    style={saved?{background:"#1F7A46",borderColor:"#1F7A46",color:"#fff"}:undefined}
    onClick={async()=>{const ok=await onPin(f.currency,1/per);setSaved(ok);}}>{saved?`✓ ${savedTxt}`:saveLabel}</button></td>
 </tr>;
}
type AdminTab="practitioners"|"staff"|"catalog";
function AdminForm({t,busy,locale,api,mutate,readOnly,systemAdmin}:{t:typeof copy.en;busy:boolean;locale:Locale;api:Api;mutate:Mutate;readOnly:boolean;systemAdmin:boolean}){
 const[practitionerId,setPractitionerId]=useState("");
 const[justCreated,setJustCreated]=useState(false);
 const[tab,setTab]=useState<AdminTab>("practitioners");
 const L=locale==="ar"?{
  consoleTitle:"لوحة اعتماد مقدّمي الخدمة",consoleSubtitle:"إضافة الاستشاريين والموظفين، وتسجيل مستندات الاعتماد، وتسجيل قرارات التحقق — كلٌّ في مكانه.",
  tabPractitioners:"الاستشاريون",tabStaff:"حسابات الموظفين",tabCatalog:"قائمة الأسعار",
  flowHint:"أضِف الاستشاري أولًا (خطوة 1)، ثم سجّل مستند الاعتماد (خطوة 2)، وأخيرًا سجّل القرار (خطوة 3).",
  step1:"إضافة ملف استشاري",step1hint:"يُنشئ ملفًا جديدًا بحالة «قيد المراجعة». بعد الإنشاء يُحدَّد الملف تلقائيًا للخطوتين التاليتين.",
  careCategory:"مجال الرعاية",selectCategory:"اختر مجال الرعاية",
  selectedTitle:"الملف قيد العمل",selectedNone:"لم يُحدَّد ملف بعد",selectedHint:"أنشئ استشاريًا في الأعلى أو اختر استشاريًا موجودًا للمتابعة.",createdOk:"تم إنشاء الملف — تابِع خطوتي الاعتماد والقرار.",clear:"مسح",
  step2:"تسجيل مستند اعتماد موثّق",step2hint:"مثال: رخصة مزاولة، شهادة زمالة، أو وثيقة تأمين مسؤولية.",
  step3:"قرار الاعتماد",step3hint:"الموافقة تُتيح الاستشاري للتعيين على الحالات؛ الرفض يتطلب سببًا.",
  staffTitle:"إضافة حساب موظف",staffHint:"أنشئ حساب منسّق أو عمليات أو مالية واربطه بمعرّف الهوية.",gated:"حدِّد ملفًا أولًا لتفعيل هذا الإجراء.",
  roleLabel:"الدور",roleCoordinator:"منسّق",roleOperations:"العمليات",roleFinance:"المالية",
  teamLead:"قائد الفريق",leadHint:"يمنح صلاحيات القيادة، مثل إعادة تعيين ملكية الحالة بين المنسّقين.",leadUnavailable:"مستوى القيادة متاح للمنسّقين فقط حاليًا."
 }:{
  consoleTitle:"Credentialing console",consoleSubtitle:"Onboard consultants and staff, register credentials, and record verification decisions — each in its own place.",
  tabPractitioners:"Consultants",tabStaff:"Staff accounts",tabCatalog:"Price catalog",
  flowHint:"Add the consultant first (step 1), then register their credential (step 2), then record the decision (step 3).",
  step1:"Create consultant profile",step1hint:"Creates a new profile in ‘under review’. After creating, it becomes the selected profile for the next two steps.",
  careCategory:"Care area",selectCategory:"Select a care area",
  selectedTitle:"Working on profile",selectedNone:"No profile selected yet",selectedHint:"Create a consultant above, or select an existing consultant, to continue with credentials and verification.",createdOk:"Profile created — continue with the credential and decision steps.",clear:"Clear",
  step2:"Register verified credential",step2hint:"For example: practice licence, fellowship certificate, or indemnity cover.",
  step3:"Credentialing decision",step3hint:"Approving makes the consultant available for assignment; rejecting requires a reason.",
  staffTitle:"Onboard a staff account",staffHint:"Create a coordinator, operations, or finance account and link it to an identity subject.",gated:"Select a profile first to enable this action.",
  roleLabel:"Role",roleCoordinator:"Coordinator",roleOperations:"Operations",roleFinance:"Finance",
  teamLead:"Team lead",leadHint:"Grants lead permissions, such as reassigning case ownership between coordinators.",leadUnavailable:"A lead tier currently applies to coordinators only."
 };
 if(readOnly)return <div className="space-y-5"><p className="card p-4 text-sm">{locale==="ar"?"وصول للقراءة فقط. لا يمكن لهذا الحساب تعديل السجلات.":"Read-only access. This account cannot change records."}</p><ReportingTeam api={api} locale={locale} editable={false}/></div>;
 const tabs:Array<{id:AdminTab;label:string}>=[{id:"practitioners",label:L.tabPractitioners},{id:"staff",label:L.tabStaff},{id:"catalog",label:L.tabCatalog}];
 const selectProfile=(id:string)=>{setPractitionerId(id);setJustCreated(false);};
 return <div className="space-y-6">
  <header><h2 className="headline">{L.consoleTitle}</h2><p className="lead mt-2 max-w-2xl text-base">{L.consoleSubtitle}</p></header>
  <div role="tablist" aria-label={L.consoleTitle} className="flex flex-wrap gap-1 border-b border-line">
   {tabs.map(item=><button key={item.id} role="tab" aria-selected={tab===item.id} onClick={()=>setTab(item.id)}
     className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-bold transition ${tab===item.id?"border-brand-600 text-brand-800":"border-transparent text-ink-500 hover:text-ink-800"}`}>{item.label}</button>)}
  </div>

  {tab==="practitioners"&&<div className="space-y-6" role="tabpanel">
   <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">{L.flowHint}</p>

   {/* Step 1 — create profile */}
   <form className="card p-6" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);void mutate("/admin/practitioners",{legalName:data.get("name"),displayName:data.get("name"),externalSubject:data.get("subject"),specialty:data.get("specialty"),careCategory:data.get("careCategory"),practitionerType:"CONSULTANT",contractStatus:"ACTIVE",availabilityStatus:"AVAILABLE",expectedReviewHours:48}).then(result=>{if(result?.id){setPractitionerId(result.id);setJustCreated(true);form.reset();}});}}>
    <StepHead n={1} title={L.step1} hint={L.step1hint}/>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
     <Field label={t.name}><input className="field" name="name" required/></Field>
     <Field label={t.subject}><input className="field" name="subject" required/></Field>
     <Field label={t.specialty}><input className="field" name="specialty" required/></Field>
     <Field label={L.careCategory}><select className="field" name="careCategory" required defaultValue=""><option value="" disabled>{L.selectCategory}</option><option value="cardiology">{prettyCategory("cardiology",locale)}</option><option value="rheumatology-rehabilitation">{prettyCategory("rheumatology-rehabilitation",locale)}</option><option value="orthopedics">{prettyCategory("orthopedics",locale)}</option></select></Field>
    </div>
    <div className="mt-5"><button disabled={busy} className="btn-primary">{t.create}</button></div>
   </form>

   {/* Selected-profile context bar */}
   <div className={`card border-s-4 p-5 ${practitionerId?"border-brand-500 bg-brand-50":"border-line"}`}>
    <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{L.selectedTitle}</p>
    {practitionerId?<div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="mono break-all font-mono text-sm font-semibold text-brand-800">{practitionerId}</p>{justCreated&&<p className="mt-1 text-sm text-brand-700">✓ {L.createdOk}</p>}</div>
      <button className="btn-secondary !py-1.5 text-sm" onClick={()=>selectProfile("")}>{L.clear}</button>
     </div>
     :<div className="mt-2"><p className="mb-2 text-sm text-ink-600">{L.selectedHint}</p><PractitionerDirectory api={api} locale={locale} value={practitionerId} onChange={selectProfile}/></div>}
   </div>

   {/* Steps 2 & 3 — gated on a selected profile */}
   <div className={`grid gap-6 xl:grid-cols-2 ${practitionerId?"":"opacity-60"}`}>
    <form className="card p-6" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);void mutate(`/admin/practitioners/${practitionerId}/credentials`,{credentialType:data.get("credentialType"),referenceNumber:data.get("reference"),source:data.get("source"),expiresAt:toInstant(data.get("expires"))}).then(result=>{if(result)form.reset();});}}>
     <StepHead n={2} title={L.step2} hint={L.step2hint}/>
     <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label={t.credentialType}><input className="field" name="credentialType" required disabled={!practitionerId}/></Field>
      <Field label={t.reference}><input className="field" name="reference" required disabled={!practitionerId}/></Field>
      <Field label={t.source}><input className="field" name="source" required disabled={!practitionerId}/></Field>
      <Field label={t.expires}><input className="field" name="expires" type="date" disabled={!practitionerId}/></Field>
     </div>
     <div className="mt-5"><button disabled={busy||!practitionerId} className="btn-primary">{t.addCredential}</button>{!practitionerId&&<span className="ms-3 text-sm text-ink-500">{L.gated}</span>}</div>
    </form>

    <form className="card p-6" onSubmit={event=>event.preventDefault()}>
     <StepHead n={3} title={L.step3} hint={L.step3hint}/>
     <div className="mt-5"><Field label={t.rejectionReason}><textarea className="field min-h-24" name="reason" disabled={!practitionerId}/></Field></div>
     <div className="mt-5 flex flex-wrap gap-3">
      <button disabled={busy||!practitionerId} className="btn-primary" onClick={()=>void mutate(`/admin/practitioners/${practitionerId}/decision?approved=true`)}>{t.approvePractitioner}</button>
      <button disabled={busy||!practitionerId} className="btn-secondary" onClick={event=>{const form=event.currentTarget.form;if(!form)return;const reason=new FormData(form).get("reason");void mutate(`/admin/practitioners/${practitionerId}/decision?approved=false&reason=${encodeURIComponent(String(reason??""))}`);}}>{t.rejectPractitioner}</button>
     </div>
    </form>
   </div>
  </div>}

  {tab==="staff"&&<div role="tabpanel"><StaffAccountForm t={t} L={L} busy={busy} mutate={mutate}/><ReportingTeam api={api} locale={locale} editable={systemAdmin}/></div>}

  {tab==="catalog"&&<div role="tabpanel"><CatalogAdmin api={api} locale={locale}/></div>}
 </div>;
}
// Base staff role + a "Team lead" promotion checkbox. Only Coordinator has a lead tier in the role
// model, so the checkbox shows for every role but activates only where a lead role actually exists —
// professional intent over a literal (and broken) lead option for operations/finance.
const STAFF_ROLES=["COORDINATOR","OPERATIONS","FINANCE"] as const;
// Every staff function has a lead tier; the base role is submitted as its composite _LEAD variant.
const LEAD_ROLE:Record<string,string>={COORDINATOR:"COORDINATOR_LEAD",OPERATIONS:"OPERATIONS_LEAD",FINANCE:"FINANCE_LEAD"};
function StaffAccountForm({t,L,busy,mutate}:{t:typeof copy.en;L:Record<string,string>;busy:boolean;mutate:Mutate}){
 const[role,setRole]=useState<string>("COORDINATOR");
 const[lead,setLead]=useState(false);
 const leadCapable=!!LEAD_ROLE[role];
 const effectiveRole=leadCapable&&lead?LEAD_ROLE[role]:role;
 const roleName=(value:string)=>value==="COORDINATOR"?L.roleCoordinator:value==="OPERATIONS"?L.roleOperations:L.roleFinance;
 return <form className="card max-w-2xl p-6" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);void mutate("/admin/coordinators",{name:data.get("name"),externalSubject:data.get("subject"),role:effectiveRole}).then(result=>{if(result){form.reset();setRole("COORDINATOR");setLead(false);}});}}>
  <StepHead title={L.staffTitle} hint={L.staffHint}/>
  <div className="mt-5 grid gap-4 sm:grid-cols-2">
   <Field label={t.name}><input className="field" name="name" required/></Field>
   <Field label={t.subject}><input className="field" name="subject" required/></Field>
   <Field label={L.roleLabel}><select className="field" value={role} onChange={event=>setRole(event.target.value)}>{STAFF_ROLES.map(value=><option key={value} value={value}>{roleName(value)}</option>)}</select></Field>
   <div className="flex items-end">
    <label className={`flex w-full items-start gap-3 rounded-xl border p-3 ${leadCapable?"cursor-pointer border-line bg-brand-50/60":"border-line opacity-60"}`}>
     <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none accent-brand-600" checked={leadCapable&&lead} disabled={!leadCapable} onChange={event=>setLead(event.target.checked)}/>
     <span className="text-sm"><span className="font-bold text-ink-800">{L.teamLead}</span><span className="mt-0.5 block text-xs text-ink-500">{leadCapable?L.leadHint:L.leadUnavailable}</span></span>
    </label>
   </div>
  </div>
  <div className="mt-5 flex flex-wrap items-center gap-3"><button disabled={busy} className="btn-primary">{t.create}</button><span className="text-sm text-ink-500">{roleName(role)}{leadCapable&&lead?` · ${L.teamLead}`:""}</span></div>
 </form>;
}
function StepHead({n,title,hint}:{n?:number;title:string;hint:string}){return <div className="flex items-start gap-3 border-b border-line pb-4">{n!=null&&<span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>}<div><h3 className="title">{title}</h3><p className="mt-0.5 text-sm text-ink-500">{hint}</p></div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1 block text-sm font-bold text-ink-700">{label}</span>{children}</label>}
function toInstant(value:FormDataEntryValue|null){return value?new Date(`${value}T23:59:59Z`).toISOString():null;}
function Panel({title,children,wide=false}:{title:string;children:React.ReactNode;wide?:boolean}){return <section className={`card mt-6 p-5 ${wide?"":""}`}><h3 className="title mb-4">{title}</h3><div className="space-y-3">{children}</div></section>}
function Empty(){return <p className="text-ink-500">—</p>}
function Fact({label,value}:{label:string;value:string}){if(!value?.trim())return null;return <div className="min-w-0"><p className="text-xs uppercase tracking-wide text-ink-500">{label}</p><p className="mt-0.5 break-words font-semibold text-ink-900" title={value}>{value}</p></div>}
function prettyCategory(slug:string,locale:Locale){const map:Record<string,{en:string;ar:string}>={cardiology:{en:"Cardiology",ar:"أمراض القلب"},"rheumatology-rehabilitation":{en:"Rehabilitation & Dysphagia",ar:"إعادة التأهيل والبلع"},orthopedics:{en:"Orthopedics",ar:"العظام"}};return map[slug]?.[locale]??slug.replace(/-/g," ").replace(/\b\w/g,ch=>ch.toUpperCase());}
function languageName(code:string,locale:Locale){const map:Record<string,{en:string;ar:string}>={en:{en:"English",ar:"الإنجليزية"},ar:{en:"Arabic",ar:"العربية"}};return map[code?.toLowerCase()]?.[locale]??code;}
function formatBytes(bytes:number){if(!bytes)return "0 B";const units=["B","KB","MB","GB"];const i=Math.min(units.length-1,Math.floor(Math.log(bytes)/Math.log(1024)));return `${(bytes/Math.pow(1024,i)).toFixed(i?1:0)} ${units[i]}`;}
const STATUS_LABELS:Record<string,{en:string;ar:string}>={RECEIVED:{en:"Received",ar:"تم الاستلام"},INTAKE_REVIEW:{en:"Intake review",ar:"مراجعة الاستقبال"},INFORMATION_REQUIRED:{en:"Information required",ar:"مطلوب معلومات"},READY_FOR_CONSULTANT:{en:"Ready for consultant",ar:"جاهزة للاستشاري"},CONSULTANT_ASSIGNMENT_PENDING:{en:"Assigned to consultant",ar:"تم التعيين للاستشاري"},CONSULTANT_REVIEW:{en:"Under consultant review",ar:"قيد مراجعة الاستشاري"},CLINICAL_RECOMMENDATION_READY:{en:"Treatment recommendation ready",ar:"توصية العلاج جاهزة"},PROPOSAL_PREPARATION:{en:"Preparing your proposal",ar:"جارٍ تحضير المقترح"},PROPOSAL_INTERNAL_APPROVAL:{en:"Internal approval",ar:"الموافقة الداخلية"},PATIENT_DECISION:{en:"Waiting for your decision",ar:"بانتظار قرارك"},REVISION_REQUESTED:{en:"Revision requested",ar:"مطلوب تعديل"},ACCEPTED:{en:"Preliminary estimate acknowledged",ar:"تم الإقرار بالتقدير المبدئي"},DECLINED:{en:"Proposal declined",ar:"تم رفض العرض"},CLINICALLY_NOT_SUITABLE:{en:"Not clinically suitable",ar:"غير مناسبة سريريًا"},EXPIRED:{en:"Proposal expired",ar:"انتهت صلاحية العرض"},TRAVEL_COORDINATION:{en:"Travel coordination",ar:"تنسيق السفر"},ARRIVAL_CONFIRMED:{en:"Arrival confirmed",ar:"تم تأكيد الوصول"},TREATMENT_IN_PROGRESS:{en:"Treatment in progress",ar:"العلاج جارٍ"},DISCHARGED:{en:"Discharged",ar:"تم الخروج"},FOLLOW_UP:{en:"Follow-up",ar:"المتابعة"},CLOSED:{en:"Closed",ar:"مغلقة"},CANCELLED:{en:"Cancelled",ar:"ملغاة"}};
function statusLabel(value:string,locale:Locale){return STATUS_LABELS[value]?.[locale]??value.replaceAll("_"," ");}
function Status({value,locale="en"}:{value:string;locale?:Locale}){return <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-800">{statusLabel(value,locale)}</span>}
