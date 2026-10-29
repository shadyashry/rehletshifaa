import type { RepresentativeOption } from "@/components/portal/RecordProposalDecision";
import type { CaseActions } from "@/components/portal/CurrentAction";
import type { CaseMilestones, PatientProposalState } from "@/components/portal/MyCare";
import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { PortalView as RoleKey } from "@/lib/access";

/** Shapes and pure helpers shared by the portal's shell, queue and case pages. */
export type CaseView={id:string;caseNumber:string;waitingOn?:string|null;waitingReason?:string|null;status:string;patientName:string;country:string;preferredLanguage:string;careCategory?:string;createdAt:string;updatedAt:string;version:number;coordinatorSubject?:string;doctorSubject?:string;coordinatorName?:string;doctorName?:string;travelPackageRequested?:boolean;/** P0-3: ROUTINE / PRIORITY / URGENT; staff views only. */urgency?:string|null;/** P1-13: UNDER_12 / AGE_12_17 / AGE_18_64 / AGE_65_PLUS, or null when not stated; staff views only. */ageBand?:string|null;assignmentId?:string;assignmentStatus?:string;openTaskCount?:number;overdueTaskCount?:number;documentCount?:number;/** Staff lists: open work on the case that is the viewer's (theirs, or their role's pool). */myWorkCount?:number;/** Patient case list only: SELF for the account's own case, REPRESENTATIVE for a relative's. */viewer?:string|null};

export type StaffCaseResponse={caseSummary:CaseView;assignmentId?:string;assignmentStatus?:string;openTaskCount:number;overdueTaskCount:number;documentCount:number;myWorkCount?:number};

export type CatalogService={id:string;serviceCode:string;serviceName:string;category?:string;priceEgp:number;active:boolean};

export type FxRate={currency:string;rate:number;rateDate:string;source:string};

export const REFERRAL_ASSIGNMENTS=["TRANSFER","SECOND_OPINION"];export const REFERRAL_CONFIRM_WORK=["CONFIRM_TRANSFER","CONFIRM_SECOND_OPINION"];

/** `offerExpiresAt`: P1-6, when a pending Consultant offer expires (working hours); null on every other assignment. */
export type Assignment={id:string;assigneeSubject:string;assigneeName?:string|null;assigneeRole:string;assignmentType:string;status:string;assignedAt:string;offerExpiresAt?:string|null;version:number};

export type CaseDocument={documentId:string;fileName:string;contentType:string;sizeBytes:number;status:string;createdAt:string;confirmedAt?:string};

export type VerifiedDoctor={subject:string;displayName:string;specialty?:string;subspecialty?:string;availabilityStatus?:string;careCategory?:string};

export type DoctorProfile={displayName?:string;specialty?:string;subspecialty?:string;careCategory?:string;availabilityStatus?:string;credentialingStatus?:string};

export type StaffProfile={displayName?:string;role?:string};

export type CareCategory={slug:string;nameEn:string;nameAr:string};

export type StaffMember={subject:string;name:string;role:string};

export type CostEstimate={serviceDescription:string;estimatedCost:number;currency:string;catalogServiceId?:string|null;facilityPackageId?:string|null;quotedCost?:number|null;quotedCurrency?:string|null};

export type Review={id:string;versionNumber:number;status:string;suitability?:string;recommendedTreatment?:string;risksAndLimitations?:string;createdAt:string;costEstimates?:CostEstimate[];proposalCurrency?:string|null;quoteRate?:number|null;quoteRateDate?:string|null;quoteRateSource?:string|null};

export type ProposalItem={id:string;category:string;description:string;quantity:number;unitPrice:number;optional:boolean;/** P1-19: who is paid for the line: CONSULTANT | FACILITY | OTHER | PLATFORM. */payee?:string|null};
/** P1-19: one payee's mandatory lines summed as shown, payees in document order (the Consultant and the hospital apart). */
export type PayeeTotal={payee:string;total:number};

export type Proposal={proposalId:string;versionId:string;versionNumber:number;status:string;language:string;currency:string;validUntil?:string;operationalPlan?:string;items:ProposalItem[];coordinatorNotes?:string;documentType?:string;scopeChangeReason?:string;/** When a final quote above the estimate's maximum can be accepted; null otherwise. */acceptableFrom?:string|null;/** Finance's exchange-rate re-approval of a final quote: null | PENDING | CONFIRMED. */fxReapprovalStatus?:string|null;/** P1-19: each payee's total (the staff workspace leaves the platform out). */payeeTotals?:PayeeTotal[]|null};

export type Task={id:string;caseId:string;careCategory?:string|null;coordinatorName?:string|null;documentCount?:number;title:string;description?:string;ownerSubject?:string;status:string;priority:string;blocking:boolean;overdue:boolean;version:number;caseNumber?:string;patientName?:string|null;caseStatus?:string;waitingOn?:string|null;type?:string;context?:string|null;dueAt?:string|null;createdAt?:string};

export type ProposalGates={operationsRequired:boolean;operationsReason:string;operationsCompleted:boolean;financeRequired:boolean;financeReasons:string[];financeCompleted:boolean;readyForRelease:boolean};

export type DeliveryStatus={status:string;channel:string;destinationMasked:string;attempts:number;deliveredAt?:string;nextAttemptAt?:string};

export type DepositComponentT={beneficiary:string;purpose:string;amountEgp:number;amountDisplay?:number;refundability:string;cancellationTerms?:string;creditedToFinal:boolean};

export type PaymentEvent={eventType:string;amountDisplay?:number;currency?:string;method?:string;provider?:string;providerReference?:string;status:string;reason?:string;occurredAt?:string};

/** DEP-3: {@code transfer} is the latest bank-transfer reference the patient entered; {@code bankTransfer} the platform account to pay into. */
export type TransferReport={id:string;method:string;reference:string;status:"SUBMITTED"|"CONFIRMED"|"REJECTED"|string;submittedAt:string;decidedAt?:string|null;reason?:string|null;version:number;/** P0-4: the agent a cash payment went through. */agentName?:string|null};
export type BankTransfer={accountName:string;bankName:string;accountNumber:string;iban:string;swift:string;paymentReference:string};
export type DepositView={id:string;status:string;currency:string;totalEgp:number;totalDisplay?:number;paidDisplay?:number;balanceDisplay?:number;components:DepositComponentT[];events:PaymentEvent[];transfer?:TransferReport|null;bankTransfer?:BankTransfer|null;/** EGP paid and still due (QA W-26): what Finance records in. */paidEgp?:number;balanceEgp?:number};
/** QA #19: the version as Finance approves it (Finance only): each line's price source and EGP base price, the margin and the totals. */
export type ProposalCommercial={versionId:string;currency:string;fxRate?:number|null;fxRateDate?:string|null;requiresFinanceApproval:boolean;policyName?:string|null;policyCareArea?:string|null;policyVersion?:number|null;marginRate?:number|null;baseTotalEgp?:number|null;marginEgp?:number|null;patientTotalEgp?:number|null;displayTotal:number;/** While Finance re-approves a final quote's rate: the rate that tripped the band and the quote total at it. */fxReapprovalRate?:number|null;fxReapprovalTotal?:number|null;lines:{id:string;description:string;source:"CATALOG"|"MANUAL"|"FACILITY_PACKAGE"|"PLATFORM";quantity:number;baseEgp?:number|null;patientEgp?:number|null;displayUnitPrice:number;facilityPackageId?:string|null;facilityName?:string|null}[]};

export type Workspace={preview?:boolean;/** Finance only (QA #19). */commercial?:ProposalCommercial|null;/** Finance recording a deposit on a case it is not assigned to: summary, deposit and current action only. */paymentOnly?:boolean;intakeSummary?:string;patientAction?:{taskId:string;title:string;message?:string;blocking:boolean;dueAt?:string;items:{id:string;kind:string;code:string;label:string;required:boolean;completed:boolean;response?:string}[]}|null;caseSummary:CaseView;timeline:{type:string;label:string;occurredAt:string;status:string}[];tasks:Task[];messages:{id:string;senderRole:string;senderName?:string;direction:string;body:string;createdAt:string;internalOnly:boolean;read:boolean;channel?:string;attachmentStatus?:string|null}[];assignments:Assignment[];clinicalReviews:Review[];proposal?:Proposal;gates?:ProposalGates|null;delivery?:DeliveryStatus|null;deposit?:DepositView|null;actions?:CaseActions|null;patientProposal?:PatientProposalState|null;/** D-1, patient actors only: when the three stamped moments happened. */milestones?:CaseMilestones|null;representatives?:RepresentativeOption[];patientReply?:PatientReply|null;/** P0-5, staff only: the destination, its facility named. */travelPlan?:TravelPlanView|null};
/** Who answers the patient on this case for the staff viewer: the case coordinator, or their active cover instead of them. */
export type PatientReply={canReply:boolean;ownerName?:string|null;coverName?:string|null;coverEndsAt?:string|null;viewerIsCover:boolean};

export type MutationResult={id?:string;status?:string};

/** Resolves to the result when the action succeeded, `undefined` when it failed (the page shows the error), and `null` when it
 * was not sent because another action was still running. Success checks use truthiness; failure messages check `=== undefined`. */
export type Mutate=(path:string,body?:unknown,method?:string)=>Promise<MutationResult|null|undefined>;

/** A rejected command means the rendered action contract may be stale; refresh it before showing the error. */
export async function refreshAfterRejectedAction(path:string,workspace:Workspace|null,refresh:()=>Promise<void>,reopen:(item:CaseView)=>Promise<void>){
 if(path.endsWith("/claim")){await refresh();return;}
 await refresh();if(workspace)await reopen(workspace.caseSummary);
}

export function normalizeCases(rows:(CaseView|StaffCaseResponse)[]):CaseView[]{return rows.map(row=>"caseSummary" in row?{...row.caseSummary,assignmentId:row.assignmentId,assignmentStatus:row.assignmentStatus,openTaskCount:row.openTaskCount,overdueTaskCount:row.overdueTaskCount,documentCount:row.documentCount,myWorkCount:row.myWorkCount}:row);}

// Display labels for currencies the doctor can view/quote in (EGP is the base).
export const CURRENCY_LABELS:Record<string,{en:string;ar:string}>={USD:{en:"USD — US Dollar",ar:"USD — دولار أمريكي"},EUR:{en:"EUR — Euro",ar:"EUR — يورو"},EGP:{en:"EGP — Egyptian Pound",ar:"EGP — جنيه مصري"},AED:{en:"AED — UAE Dirham",ar:"AED — درهم إماراتي"},SAR:{en:"SAR — Saudi Riyal",ar:"SAR — ريال سعودي"},GBP:{en:"GBP — British Pound",ar:"GBP — جنيه إسترليني"},KWD:{en:"KWD — Kuwaiti Dinar",ar:"KWD — دينار كويتي"},QAR:{en:"QAR — Qatari Riyal",ar:"QAR — ريال قطري"},JOD:{en:"JOD — Jordanian Dinar",ar:"JOD — دينار أردني"}};

/** The shared money format (`lib/money.ts`), under the name the staff case page already uses. */
export const money=formatMoney;

export const STAFF_ROLES:string[]=["coordinator","doctor","operations","finance"];

export const terminalStatuses=new Set(["CLOSED","CANCELLED","DECLINED","CLINICALLY_NOT_SUITABLE"]);

export function roleLabel(role:RoleKey,locale:Locale){const labels={en:{patient:"Patient",coordinator:"Coordinator",doctor:"Consultant workspace",operations:"Operations",finance:"Finance",admin:"Control Center",identity:"Identity checks"},ar:{patient:"المريض",coordinator:"منسّق الحالة",doctor:"مساحة عمل الاستشاري",operations:"العمليات",finance:"المالية",admin:"مركز التحكم",identity:"التحقّق من الهوية"}};return labels[locale][role];}

/** File sizes in the page's language and digits (Intl unit formatting: "1.2 MB" / "1.2 ميغابايت"). */
export function formatBytes(bytes:number,locale:Locale){const units=["byte","kilobyte","megabyte","gigabyte"] as const;const i=bytes?Math.min(units.length-1,Math.floor(Math.log(bytes)/Math.log(1024))):0;
  return new Intl.NumberFormat(intlLocale(locale),{style:"unit",unit:units[i],unitDisplay:"short",maximumFractionDigits:i?1:0}).format(bytes/Math.pow(1024,i));}

/** Staff-facing words for case, proposal and work-item states, in the staff voice ("the patient's decision", never "your"). Patients see their own phase wording. */
export const STATUS_LABELS:Record<string,{en:string;ar:string}>={DRAFT:{en:"Draft",ar:"مسودة"},PENDING_APPROVAL:{en:"Awaiting internal approval",ar:"بانتظار الموافقة الداخلية"},APPROVED:{en:"Approved",ar:"معتمد"},RELEASED:{en:"Sent to the patient",ar:"أُرسل إلى المريض"},VIEWED:{en:"Viewed by the patient",ar:"اطّلع عليه المريض"},SUPERSEDED:{en:"Replaced by a newer version",ar:"استُبدل بإصدار أحدث"},OPEN:{en:"Open",ar:"مفتوحة"},IN_PROGRESS:{en:"In progress",ar:"قيد التنفيذ"},BLOCKED:{en:"Blocked",ar:"متوقفة"},COMPLETED:{en:"Completed",ar:"مكتملة"},RECEIVED:{en:"Received",ar:"تم الاستلام"},INTAKE_REVIEW:{en:"Intake review",ar:"مراجعة الاستقبال"},INFORMATION_REQUIRED:{en:"Information required",ar:"مطلوب معلومات"},READY_FOR_CONSULTANT:{en:"Ready for Consultant",ar:"جاهزة للاستشاري"},CONSULTANT_ASSIGNMENT_PENDING:{en:"Assigned to Consultant",ar:"تم التعيين للاستشاري"},CONSULTANT_REVIEW:{en:"Under Consultant review",ar:"قيد مراجعة الاستشاري"},CLINICAL_RECOMMENDATION_READY:{en:"Treatment recommendation ready",ar:"توصية العلاج جاهزة"},PROPOSAL_PREPARATION:{en:"Preparing the proposal",ar:"جارٍ إعداد التقدير"},PROPOSAL_INTERNAL_APPROVAL:{en:"Ready to release",ar:"جاهز للإرسال"},PATIENT_DECISION:{en:"Waiting for the patient's decision",ar:"بانتظار قرار المريض"},REVISION_REQUESTED:{en:"Revision requested",ar:"مطلوب تعديل"},ACCEPTED:{en:"Preliminary estimate acknowledged",ar:"تم الإقرار بالتقدير المبدئي"},DECLINED:{en:"Proposal declined",ar:"تم رفض عرض السعر"},CLINICALLY_NOT_SUITABLE:{en:"Not clinically suitable",ar:"غير مناسبة سريريًا"},EXPIRED:{en:"Proposal expired",ar:"انتهت صلاحية عرض السعر"},TRAVEL_COORDINATION:{en:"Travel coordination",ar:"تنسيق السفر"},ARRIVAL_CONFIRMED:{en:"Arrival confirmed",ar:"تم تأكيد الوصول"},ADMISSION_READY:{en:"Cleared for admission",ar:"جاهز للدخول إلى المستشفى"},TREATMENT_IN_PROGRESS:{en:"Treatment in progress",ar:"العلاج جارٍ"},DISCHARGED:{en:"Discharged",ar:"تم الخروج"},FOLLOW_UP:{en:"Follow-up",ar:"المتابعة"},CLOSED:{en:"Closed",ar:"مغلقة"},CANCELLED:{en:"Cancelled",ar:"ملغاة"}};

export function statusLabel(value:string,locale:Locale){return STATUS_LABELS[value]?.[locale]??value.replaceAll("_"," ");}

/** P0-5: the facility directory behind the pickers: active facilities with their Finance-approved, in-validity packages. */
export type DirectoryPackage={id:string;procedureCode:string;name:string;careCategory:string;minEgp:number;maxEgp:number;validTo?:string|null};
export type DirectoryFacility={id:string;name:string;city:string;kind:string;accreditationStatus:string;packages:DirectoryPackage[]};

export type TravelPlanView={id:string;status:string;plannedArrival?:string|null;confirmedArrival?:string|null;visaStatus?:string|null;flightDetails?:string|null;airportReception?:string|null;accommodation?:string|null;localTransport?:string|null;companionDetails?:string|null;facilityId?:string|null;facilityName?:string|null;exceptions?:string|null;updatedAt:string};
/** P1-15: one evidence-ledger row as staff see it (the payload stays server-side). */
export type AdmissionEvidence={id:string;kind:string;stage?:string|null;documentId?:string|null;reference?:string|null;amountEgp?:number|null;effectiveAt?:string|null;recordedBy?:string|null;recordedRole?:string|null;recordedAt:string;countersignedBy?:string|null;countersignedRole?:string|null;countersignedAt?:string|null;supersedesId?:string|null;superseded:boolean};
/** P1-15: the frozen voucher; EGP amounts and, at the frozen rate, the patient's currency. */
export type AdmissionVoucher={id:string;voucherNumber:string;revision:number;status:string;proposalVersionId?:string|null;packageTotalEgp:number;platformFeeEgp:number;depositPaidEgp:number;depositCreditEgp:number;feeBalanceEgp:number;patientPaysAtFacilityEgp:number;displayCurrency?:string|null;fxRate?:number|null;fxRateDate?:string|null;patientPaysAtFacilityDisplay?:number|null;feeBalanceDisplay?:number|null;issuedAt:string};
/** P1-15: the staff "Admission & money" panel, read from `GET /{operations|finance|coordinator|doctor}/cases/{id}/admission`. */
export type AdmissionView={caseId:string;caseStatus?:string|null;admissionId?:string|null;facilityId?:string|null;facilityName?:string|null;facilityCity?:string|null;plannedAdmissionAt?:string|null;admissionStatus?:string|null;letterCheck?:string|null;letterReferenceMaxEgp?:number|null;voucher?:AdmissionVoucher|null;balanceOwedEgp?:number|null;feeBalanceOwedEgp?:number|null;pointOfNoReturnAt?:string|null;pointOfNoReturnApproved:boolean;admissionNumber?:string|null;emergencyOverride:boolean;admissionBlockers:string[];evidence:AdmissionEvidence[]};
/** P1-15: the patient's own admission view: where, when, the voucher number and what to pay where (null before a reservation). */
export type PatientAdmissionView={facilityName?:string|null;facilityCity?:string|null;plannedAdmissionAt?:string|null;voucherNumber?:string|null;payAtFacilityEgp?:number|null;payAtFacilityDisplay?:number|null;feeBalanceEgp?:number|null;feeBalanceDisplay?:number|null;depositCreditEgp?:number|null;displayCurrency?:string|null;balanceState:"DUE"|"CHECKING"|"PAID"|"NO_VOUCHER"|string;cleared:boolean};
/** P1-16: one treatment milestone as the case team sees it; the clinical fields are null for a reader without the clinical record. */
export type TreatmentMilestone={id:string;kind:string;occurredAt:string;recordedRole?:string|null;recordedAt:string;needsCountersign:boolean;countersigned:boolean;countersignedAt?:string|null;plannedDischargeOn?:string|null;documentId?:string|null;operativeNoteReference?:string|null;implants?:string|null;note?:string|null;incidentId?:string|null;supersedesId?:string|null;superseded:boolean};
export type ChangeOrderLine={id:string;lineNo:number;kind:string;description:string;quantity:number;unitEgp?:number|null;lineEgp?:number|null};
/** P1-16 (D-E): a change order for staff; `reason` only for a reader of the clinical record; totals as the API returns them. */
export type ChangeOrder={id:string;orderNumber:string;status:string;emergency:boolean;reason?:string|null;lines:ChangeOrderLine[];totalEgp?:number|null;totalDisplay?:number|null;displayCurrency?:string|null;fxRate?:number|null;bandLimitEgp?:number|null;withinBand?:boolean|null;proposedBy?:string|null;proposedAt:string;pricedAt?:string|null;decisionChannel?:string|null;decidedRole?:string|null;decidedAt?:string|null};
/** P1-16: the running money of the stay; variance = billed − authorised (positive is over). */
export type TreatmentMoney={packageEgp:number;changeOrdersEgp:number;authorisedEgp:number;interimBilledEgp:number;interimPendingEgp?:number|null;varianceEgp:number;bandLimitEgp:number;bandUsedEgp:number};
export type StageChecklist={stage:string;complete:boolean;items:{code:string;required:boolean;done:boolean}[]};
/** P1-16: the staff "Treatment" panel, read from `GET /{operations|finance|coordinator|doctor}/cases/{id}/treatment`. */
export type TreatmentView={caseId:string;caseStatus?:string|null;milestones:TreatmentMilestone[];nextMilestoneDueAt?:string|null;changeOrders:ChangeOrder[];money:TreatmentMoney;interimBills:AdmissionEvidence[];checklist:StageChecklist[]};
/** P1-16: the patient's calm timeline line; CARE_UPDATE stands for a complication, CARE_TEAM for a line not yet countersigned. */
export type PatientMilestone={kind:string;occurredAt:string;reportedBy:"CONSULTANT"|"CARE_TEAM"|string;plannedDischargeOn?:string|null};
export type PatientChangeOrder={id:string;orderNumber:string;status:string;emergency:boolean;reason?:string|null;lines:{kind:string;description:string;quantity:number;lineEgp?:number|null;lineDisplay?:number|null}[];totalEgp?:number|null;totalDisplay?:number|null;displayCurrency?:string|null;awaitingDecision:boolean;decisionChannel?:string|null;decidedAt?:string|null};
/** P1-16: the patient's treatment page (My Care and the verified status link). */
export type PatientTreatmentView={facilityName?:string|null;facilityCity?:string|null;timeline:PatientMilestone[];changeOrders:PatientChangeOrder[];awaitingDecisionId?:string|null};
/** P1-17: one medicine to take home and one implant, as the Consultant recorded them. */
export type DischargeMedication={name:string;dose:string;frequency:string;duration:string};
export type DischargeImplant={description:string;manufacturer?:string|null;reference?:string|null};
/** P1-17: one pack item; DONE, MISSING, NOT_REQUIRED or (fit to fly) BEFORE_RETURN. The clinical fields are null for a reader without the clinical record. */
export type DischargePackItem={kind:string;requiredForDischarge:boolean;status:string;evidenceId?:string|null;documentId?:string|null;recordedAt?:string|null;examinedAt?:string|null;validUntil?:string|null;diagnosis?:string|null;procedures?:string|null;pendingResults?:string|null;warningSigns?:string|null;medications?:DischargeMedication[]|null;implants?:DischargeImplant[]|null;note?:string|null};
export type HandoverLetter={evidenceId:string;generatedAt:string;english?:string|null;arabic?:string|null};
/** P1-17: the staff "Discharge" panel, read from `GET /{operations|finance|coordinator|doctor}/cases/{id}/discharge`. */
export type DischargeView={caseId:string;caseStatus?:string|null;pack:DischargePackItem[];followUpPlan?:{id:string;dueAt:string;mode:string}|null;finalInvoice?:AdmissionEvidence|null;returnTravel?:{evidenceId:string;mode:string;departureAt:string;reference?:string|null;fitToFlyEvidenceId?:string|null;confirmedAt:string}|null;departedAt?:string|null;handoverLetter?:HandoverLetter|null;treatmentChecklist?:StageChecklist|null;blockers:{code:string;label:string}[];readyForDischarge:boolean;reconciliationSettled:boolean;fitToFlyHours:number};
/** P1-17: the patient's "Going home" (My Care and the verified status link); empty with `discharged` false before discharge. */
export type PatientDischargeView={discharged:boolean;documents:{kind:string;documentId:string;recordedAt:string}[];medications:DischargeMedication[];warningSigns?:string|null;followUpDueAt?:string|null;followUpMode?:string|null;returnMode?:string|null;returnDepartureAt?:string|null;departed:boolean;handoverLetter?:HandoverLetter|null};
export type StatementLine={kind:string;description?:string|null;amountEgp:number;amountDisplay?:number|null};
/** P1-17: a statement's totals in EGP and, at the frozen rate, the patient's currency; one of balance and credit is 0. */
export type StatementTotals={packageEgp:number;changeOrdersEgp:number;medicalChargedEgp:number;platformFeeEgp:number;totalChargedEgp:number;totalChargedDisplay?:number|null;depositPaidEgp:number;feeBalancePaidEgp:number;paidAtFacilityEgp:number;refundedEgp:number;balanceDueEgp:number;balanceDueDisplay?:number|null;creditDueEgp:number;creditDueDisplay?:number|null};
/** P1-17: the patient's statement (current revision of each kind). */
export type PatientStatement={id:string;kind:string;statementNumber:string;revision:number;issuedAt:string;displayCurrency?:string|null;totals:StatementTotals;lines:StatementLine[]};
/** P1-17: a statement as staff see it: every revision, with the e-invoice reference. */
export type StaffStatement=PatientStatement&{current:boolean;issuedBy?:string|null;fxRate?:number|null;eInvoiceRef?:string|null;eInvoiceRecordedAt?:string|null;supersedesId?:string|null};
export type QuoteLine={source:string;matchedId?:string|null;orderNumber?:string|null;kind?:string|null;description?:string|null;quantity?:number|null;authorisedEgp:number};
export type InvoiceLine={lineNo:number;description:string;invoiceEgp:number;source:string;matchedId?:string|null;authorisedEgp?:number|null;chargedEgp?:number|null;varianceEgp?:number|null;varianceCode?:string|null};
/** P1-17: the Finance reconciliation workbench, read from `GET /{finance|coordinator|operations}/cases/{id}/reconciliation`. */
export type ReconciliationView={caseId:string;caseStatus?:string|null;finalInvoice?:{evidenceId:string;invoiceNumber?:string|null;amountEgp?:number|null;issuedAt?:string|null;documentId?:string|null;countersigned:boolean}|null;reconciliationId?:string|null;status?:string|null;authorisedEgp?:number|null;bandLimitEgp?:number|null;quote:QuoteLine[];lines:InvoiceLine[];chargedEgp?:number|null;varianceEgp?:number|null;disputedEgp?:number|null;paidAtFacilityEgp?:number|null;needsCountersign:boolean;openedBy?:string|null;openedAt?:string|null;submittedBy?:string|null;submittedAt?:string|null;countersignedBy?:string|null;countersignedAt?:string|null;settledAt?:string|null;disputeOutcome?:string|null;disputeResolvedAt?:string|null;note?:string|null;facilityName?:string|null;facilityCity?:string|null;statements:StaffStatement[]};
/** P1-18: one follow-up contact; `note` is the Consultant's record (or the cancellation reason), null for the coordinator. */
export type FollowUpContact={id:string;origin:"PLAN"|"ADDED"|string;dueAt:string;mode:string;status:"SCHEDULED"|"DONE"|"MISSED"|"CANCELLED"|string;reminderSentAt?:string|null;recordedBy?:string|null;recordedAt?:string|null;note?:string|null};
/** P1-18: a coordinator check-in (D3, D14, D30): NOT_YET, DUE from the day before its day, DONE once recorded. */
export type FollowUpCheckIn={point:"D3"|"D14"|"D30"|string;dueAt:string;status:"NOT_YET"|"DUE"|"DONE"|string;outcome?:"REACHED"|"NOT_REACHED"|string|null;note?:string|null;recordedBy?:string|null;recordedAt?:string|null};
/** P1-18: one outcome question (D30, D90) and its answer; the free text is null for the coordinator. */
export type FollowUpOutcome={point:"D30"|"D90"|string;requestedAt:string;open:boolean;reportedAt?:string|null;channel?:"MY_CARE"|"SECURE_LINK"|string|null;reportedRole?:"PATIENT"|"PATIENT_REPRESENTATIVE"|string|null;pain?:number|null;function?:number|null;satisfaction?:number|null;complication?:boolean|null;complicationNote?:string|null;incidentId?:string|null;reviewedAt?:string|null;reviewedBy?:string|null;reviewNote?:string|null};
/** P1-18: the staff "Follow-up" panel, read from `GET /{doctor|coordinator}/cases/{id}/follow-up`. */
export type FollowUpView={caseId:string;caseStatus?:string|null;window?:{dischargedAt:string;freeDays:number;endsAt:string;closedAt?:string|null}|null;plan?:{id:string;dueAt:string;mode:string;requiredTests?:string|null;instructions?:string|null}|null;contacts:FollowUpContact[];checkIns:FollowUpCheckIn[];outcomes:FollowUpOutcome[];closureBlockers:{code:string;label:string}[];reopenAvailable:boolean};
/** P1-18: the patient's follow-up (My Care and the verified status link); `active` is false before discharge. No answers come back. */
export type PatientFollowUpView={active:boolean;contacts:{dueAt:string;mode:string;status:string}[];windowEndsAt?:string|null;windowClosed:boolean;outcomes:{point:string;requestedAt:string;open:boolean;reportedAt?:string|null}[];openOutcome?:"D30"|"D90"|string|null;closed:boolean};
/** P1-18: the outcome answers, as both My Care and the OUTCOME link send them (the link adds who is answering). */
export type OutcomeAnswer={pain:number;function:number;satisfaction:number;complication:boolean;complicationNote:string|null;noticeVersion:string};
