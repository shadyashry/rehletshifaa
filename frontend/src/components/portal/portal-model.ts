import type { RepresentativeOption } from "@/components/portal/RecordProposalDecision";
import type { CaseActions } from "@/components/portal/CurrentAction";
import type { PatientProposalState } from "@/components/portal/MyCare";
import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { PortalView as RoleKey } from "@/lib/access";

/** Shapes and pure helpers shared by the portal's shell, queue and case pages. */
export type CaseView={id:string;caseNumber:string;waitingOn?:string|null;waitingReason?:string|null;status:string;patientName:string;country:string;preferredLanguage:string;careCategory?:string;createdAt:string;updatedAt:string;version:number;coordinatorSubject?:string;doctorSubject?:string;coordinatorName?:string;doctorName?:string;travelPackageRequested?:boolean;assignmentId?:string;assignmentStatus?:string;openTaskCount?:number;overdueTaskCount?:number;documentCount?:number};

export type StaffCaseResponse={caseSummary:CaseView;assignmentId?:string;assignmentStatus?:string;openTaskCount:number;overdueTaskCount:number;documentCount:number};

export type CatalogService={id:string;serviceCode:string;serviceName:string;category?:string;priceEgp:number;active:boolean};

export type FxRate={currency:string;rate:number;rateDate:string;source:string};

export const REFERRAL_ASSIGNMENTS=["TRANSFER","SECOND_OPINION"];export const REFERRAL_CONFIRM_WORK=["CONFIRM_TRANSFER","CONFIRM_SECOND_OPINION"];

export type Assignment={id:string;assigneeSubject:string;assigneeName?:string|null;assigneeRole:string;assignmentType:string;status:string;assignedAt:string;version:number};

export type CaseDocument={documentId:string;fileName:string;contentType:string;sizeBytes:number;status:string;createdAt:string;confirmedAt?:string};

export type VerifiedDoctor={subject:string;displayName:string;specialty?:string;subspecialty?:string;availabilityStatus?:string;careCategory?:string};

export type DoctorProfile={displayName?:string;specialty?:string;subspecialty?:string;careCategory?:string;availabilityStatus?:string;credentialingStatus?:string};

export type StaffProfile={displayName?:string;role?:string};

export type CareCategory={slug:string;nameEn:string;nameAr:string};

export type StaffMember={subject:string;name:string;role:string};

export type CostEstimate={serviceDescription:string;estimatedCost:number;currency:string;catalogServiceId?:string|null;quotedCost?:number|null;quotedCurrency?:string|null};

export type Review={id:string;versionNumber:number;status:string;suitability?:string;recommendedTreatment?:string;risksAndLimitations?:string;createdAt:string;costEstimates?:CostEstimate[];proposalCurrency?:string|null;quoteRate?:number|null;quoteRateDate?:string|null;quoteRateSource?:string|null};

export type ProposalItem={id:string;category:string;description:string;quantity:number;unitPrice:number;optional:boolean};

export type Proposal={proposalId:string;versionId:string;versionNumber:number;status:string;language:string;currency:string;validUntil?:string;operationalPlan?:string;items:ProposalItem[];coordinatorNotes?:string;documentType?:string;scopeChangeReason?:string};

export type Task={id:string;caseId:string;careCategory?:string|null;coordinatorName?:string|null;documentCount?:number;title:string;description?:string;ownerSubject?:string;status:string;priority:string;blocking:boolean;overdue:boolean;version:number;caseNumber?:string;patientName?:string|null;caseStatus?:string;waitingOn?:string|null;type?:string;context?:string|null;dueAt?:string|null;createdAt?:string};

export type ProposalGates={operationsRequired:boolean;operationsReason:string;operationsCompleted:boolean;financeRequired:boolean;financeReasons:string[];financeCompleted:boolean;readyForRelease:boolean};

export type DeliveryStatus={status:string;channel:string;destinationMasked:string;attempts:number;deliveredAt?:string;nextAttemptAt?:string};

export type DepositComponentT={beneficiary:string;purpose:string;amountEgp:number;amountDisplay?:number;refundability:string;cancellationTerms?:string;creditedToFinal:boolean};

export type PaymentEvent={eventType:string;amountDisplay?:number;currency?:string;method?:string;provider?:string;providerReference?:string;status:string;reason?:string;occurredAt?:string};

export type DepositView={id:string;status:string;currency:string;totalEgp:number;totalDisplay?:number;paidDisplay?:number;balanceDisplay?:number;components:DepositComponentT[];events:PaymentEvent[]};

export type Workspace={preview?:boolean;intakeSummary?:string;patientAction?:{taskId:string;title:string;message?:string;blocking:boolean;dueAt?:string;items:{id:string;kind:string;code:string;label:string;required:boolean;completed:boolean;response?:string}[]}|null;caseSummary:CaseView;timeline:{type:string;label:string;occurredAt:string;status:string}[];tasks:Task[];messages:{id:string;senderRole:string;senderName?:string;direction:string;body:string;createdAt:string;internalOnly:boolean;read:boolean}[];assignments:Assignment[];clinicalReviews:Review[];proposal?:Proposal;gates?:ProposalGates|null;delivery?:DeliveryStatus|null;deposit?:DepositView|null;actions?:CaseActions|null;patientProposal?:PatientProposalState|null;representatives?:RepresentativeOption[]};

export type MutationResult={id?:string;status?:string};

/** Resolves to the result when the action succeeded, `undefined` when it failed (the page shows the error), and `null` when it
 * was not sent because another action was still running. Success checks use truthiness; failure messages check `=== undefined`. */
export type Mutate=(path:string,body?:unknown,method?:string)=>Promise<MutationResult|null|undefined>;

/** A rejected command means the rendered action contract may be stale; refresh it before showing the error. */
export async function refreshAfterRejectedAction(path:string,workspace:Workspace|null,refresh:()=>Promise<void>,reopen:(item:CaseView)=>Promise<void>){
 if(path.endsWith("/claim")){await refresh();return;}
 await refresh();if(workspace)await reopen(workspace.caseSummary);
}

export function normalizeCases(rows:(CaseView|StaffCaseResponse)[]):CaseView[]{return rows.map(row=>"caseSummary" in row?{...row.caseSummary,assignmentId:row.assignmentId,assignmentStatus:row.assignmentStatus,openTaskCount:row.openTaskCount,overdueTaskCount:row.overdueTaskCount,documentCount:row.documentCount}:row);}

// Display labels for currencies the doctor can view/quote in (EGP is the base).
export const CURRENCY_LABELS:Record<string,{en:string;ar:string}>={USD:{en:"USD — US Dollar",ar:"USD — دولار أمريكي"},EUR:{en:"EUR — Euro",ar:"EUR — يورو"},EGP:{en:"EGP — Egyptian Pound",ar:"EGP — جنيه مصري"},AED:{en:"AED — UAE Dirham",ar:"AED — درهم إماراتي"},SAR:{en:"SAR — Saudi Riyal",ar:"SAR — ريال سعودي"},GBP:{en:"GBP — British Pound",ar:"GBP — جنيه إسترليني"},KWD:{en:"KWD — Kuwaiti Dinar",ar:"KWD — دينار كويتي"},QAR:{en:"QAR — Qatari Riyal",ar:"QAR — ريال قطري"},JOD:{en:"JOD — Jordanian Dinar",ar:"JOD — دينار أردني"}};

/** The shared money format (`lib/money.ts`), under the name the staff case page already uses. */
export const money=formatMoney;

export const STAFF_ROLES:string[]=["coordinator","doctor","operations","finance"];

export const terminalStatuses=new Set(["CLOSED","CANCELLED","DECLINED","CLINICALLY_NOT_SUITABLE"]);

export function roleLabel(role:RoleKey,locale:Locale){const labels={en:{patient:"Patient",coordinator:"Coordinator",doctor:"Consultant workspace",operations:"Operations",finance:"Finance",admin:"Control Center",identity:"Identity checks"},ar:{patient:"المريض",coordinator:"منسق الحالة",doctor:"مساحة عمل الاستشاري",operations:"العمليات",finance:"المالية",admin:"مركز التحكم",identity:"التحقق من الهوية"}};return labels[locale][role];}

/** File sizes in the page's language and digits (Intl unit formatting: "1.2 MB" / "1.2 ميغابايت"). */
export function formatBytes(bytes:number,locale:Locale){const units=["byte","kilobyte","megabyte","gigabyte"] as const;const i=bytes?Math.min(units.length-1,Math.floor(Math.log(bytes)/Math.log(1024))):0;
  return new Intl.NumberFormat(intlLocale(locale),{style:"unit",unit:units[i],unitDisplay:"short",maximumFractionDigits:i?1:0}).format(bytes/Math.pow(1024,i));}

/** Staff-facing words for case, proposal and work-item states, in the staff voice ("the patient's decision", never "your"). Patients see their own phase wording. */
export const STATUS_LABELS:Record<string,{en:string;ar:string}>={DRAFT:{en:"Draft",ar:"مسودة"},PENDING_APPROVAL:{en:"Awaiting internal approval",ar:"بانتظار الموافقة الداخلية"},APPROVED:{en:"Approved",ar:"معتمد"},RELEASED:{en:"Sent to the patient",ar:"أُرسل إلى المريض"},VIEWED:{en:"Viewed by the patient",ar:"اطّلع عليه المريض"},SUPERSEDED:{en:"Replaced by a newer version",ar:"استُبدل بإصدار أحدث"},OPEN:{en:"Open",ar:"مفتوحة"},IN_PROGRESS:{en:"In progress",ar:"قيد التنفيذ"},BLOCKED:{en:"Blocked",ar:"متوقفة"},COMPLETED:{en:"Completed",ar:"مكتملة"},RECEIVED:{en:"Received",ar:"تم الاستلام"},INTAKE_REVIEW:{en:"Intake review",ar:"مراجعة الاستقبال"},INFORMATION_REQUIRED:{en:"Information required",ar:"مطلوب معلومات"},READY_FOR_CONSULTANT:{en:"Ready for Consultant",ar:"جاهزة للاستشاري"},CONSULTANT_ASSIGNMENT_PENDING:{en:"Assigned to Consultant",ar:"تم التعيين للاستشاري"},CONSULTANT_REVIEW:{en:"Under Consultant review",ar:"قيد مراجعة الاستشاري"},CLINICAL_RECOMMENDATION_READY:{en:"Treatment recommendation ready",ar:"توصية العلاج جاهزة"},PROPOSAL_PREPARATION:{en:"Preparing the proposal",ar:"جارٍ إعداد العرض"},PROPOSAL_INTERNAL_APPROVAL:{en:"Internal approval",ar:"الموافقة الداخلية"},PATIENT_DECISION:{en:"Waiting for the patient's decision",ar:"بانتظار قرار المريض"},REVISION_REQUESTED:{en:"Revision requested",ar:"مطلوب تعديل"},ACCEPTED:{en:"Preliminary estimate acknowledged",ar:"تم الإقرار بالتقدير المبدئي"},DECLINED:{en:"Proposal declined",ar:"تم رفض العرض"},CLINICALLY_NOT_SUITABLE:{en:"Not clinically suitable",ar:"غير مناسبة سريريًا"},EXPIRED:{en:"Proposal expired",ar:"انتهت صلاحية العرض"},TRAVEL_COORDINATION:{en:"Travel coordination",ar:"تنسيق السفر"},ARRIVAL_CONFIRMED:{en:"Arrival confirmed",ar:"تم تأكيد الوصول"},TREATMENT_IN_PROGRESS:{en:"Treatment in progress",ar:"العلاج جارٍ"},DISCHARGED:{en:"Discharged",ar:"تم الخروج"},FOLLOW_UP:{en:"Follow-up",ar:"المتابعة"},CLOSED:{en:"Closed",ar:"مغلقة"},CANCELLED:{en:"Cancelled",ar:"ملغاة"}};

export function statusLabel(value:string,locale:Locale){return STATUS_LABELS[value]?.[locale]??value.replaceAll("_"," ");}
