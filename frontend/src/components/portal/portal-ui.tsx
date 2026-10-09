"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { statusLabel } from "@/components/portal/portal-model";

/**
 * Asks once before an action that cannot be taken back (a refund, a revoked link, an ended access). An in-page alert
 * dialog in the page's language: the safe choice has the focus, and Escape or Cancel changes nothing.
 */
export function ConfirmDialog({title,body,confirm,cancel,onConfirm,onCancel}:{title:string;body:string;confirm:string;cancel:string;onConfirm:()=>void;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const confirmed=useRef(false);const safe=useRef<HTMLButtonElement>(null);const id=useId();
 useEffect(()=>{dialog.current?.showModal();safe.current?.focus();},[]);
 return <dialog ref={dialog} className="account-dialog" role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onClose={()=>(confirmed.current?onConfirm():onCancel())}>
  <h2 id={`${id}-title`} className="title">{title}</h2>
  <p id={`${id}-body`} className="mt-2 text-[0.9375rem] leading-6 text-ink-600">{body}</p>
  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
   <button type="button" ref={safe} className="btn-secondary" onClick={()=>dialog.current?.close()}>{cancel}</button>
   <button type="button" className="btn-primary" onClick={()=>{confirmed.current=true;dialog.current?.close();}}>{confirm}</button>
  </div>
 </dialog>;
}

export const copy={
  en:{title:"Secure care portal",subtitle:"One accountable workspace from intake through treatment and follow-up.",signIn:"Sign in securely",signOut:"Sign out",loading:"Loading your workspace…",noCases:"No cases are available in this queue.",grpAction:"Action required",grpTracking:"Tracking — latest status",grpMoreInfo:"More information requested",grpNotSuitable:"Not clinically suitable",claimTitle:"Link an existing request",caseId:"Case ID",code:"6-digit verification code",claim:"Link case",open:"Open workspace",back:"Back to queue",timeline:"Case journey",tasks:"Tasks",messages:"Secure messages",send:"Send message",message:"Write a message",assignments:"Care team",documents:"Patient documents",download:"Download",docScanning:"Security scan in progress",docUnavailable:"Unavailable",noDocuments:"No documents uploaded yet.",reviews:"Doctor reviews",coordinatorLabel:"Coordinator",consultantLabel:"Consultant",you:"You",signedInAs:"Signed in as",myDashboard:"My dashboard",caseWorkspaceLabel:"Case workspace",patientLabel:"Patient",careArea:"Care area",languageLabel:"Language",updatedLabel:"Last updated",countryLabel:"Country",estimatedByConsultant:"Cost estimate by the consultant",prefilledFromReview:"Pre-filled from the consultant's cost estimate — adjust before sending.",servicesFromConsultant:"Services & costs",additionalCostTitle:"Additional cost (optional)",additionalCostHint:"An extra optional item, shown separately and not added to the base total.",additionalCostDesc:"What is it for?",commentsTitle:"Comments for the patient (optional)",commentsHint:"Shown on the proposal alongside the recommendation and services.",proposalNotesLabel:"Coordinator note",assignedToYou:"You've been assigned to this case — accept to start your review.",doctorAccepted:"Case accepted and assigned back to the coordinator.",doctorInfoSent:"More information requested — assigned back to the coordinator.",doctorNotSuitable:"Marked not clinically suitable and returned to the coordinator.",doctorReturned:"This case has been returned to the coordinator.",proposal:"Patient proposal",genSend:"Generate & send proposal",addService:"Add service",sendWhatsapp:"Send on WhatsApp",sendEmail:"Send by email",copyLink:"Copy link",copied:"Copied!",linkReady:"Proposal link ready — send it to the patient:",noPatientEmail:"No email on file",coordinatorClaim:"Take ownership",ownershipHint:"You have view-only access. Take ownership to assign a consultant, change status, or create a proposal.",ownedByOther:"Another coordinator owns this case — you have view-only access.",handoff:"This case is with {name} for consultant review. Actions are locked until the clinical recommendation is ready.",status:"Status",transition:"Move case",reason:"Reason for change",doctorSubject:"Doctor account subject",reviewTreatment:"Recommended treatment",reviewRisks:"Risks and limitations",saveReview:"Save clinical review",approveReview:"Approve review",createProposal:"Create proposal",item:"Service description",price:"Unit price",release:"Release to patient",operationsComplete:"Complete operational plan",financeApprove:"Approve commercial terms",accept:"Accept",decline:"Decline",revise:"Request revision",adminTitle:"Onboard a practitioner",coordinatorTitle:"Onboard a coordinator",coordinatorRole:"Coordinator role",name:"Legal name",subject:"Identity account subject",specialty:"Specialty",create:"Create profile",profileId:"Practitioner profile ID",credentialTitle:"Register verified credential",credentialType:"Credential type",reference:"Registration / license number",source:"Issuing authority",expires:"Expiry date",addCredential:"Add credential",decisionTitle:"Credentialing decision",approvePractitioner:"Approve practitioner",rejectPractitioner:"Reject practitioner",rejectionReason:"Rejection reason",success:"Saved successfully.",activated:"Your account is now linked to your case — welcome to your journey.",error:"The request could not be completed."},
  ar:{title:"بوابة رحلة الشفاء الآمنة",subtitle:"مساحة عمل مسؤولة واحدة من استقبال الحالة حتى العلاج والمتابعة.",signIn:"تسجيل الدخول الآمن",signOut:"تسجيل الخروج",loading:"جارٍ تحميل مساحة العمل…",noCases:"لا توجد حالات في قائمة العمل.",grpAction:"إجراء مطلوب",grpTracking:"المتابعة — آخر حالة",grpMoreInfo:"طلب معلومات إضافية",grpNotSuitable:"غير مناسبة سريريًا",claimTitle:"ربط طلب سابق",caseId:"معرّف الحالة",code:"رمز التحقق المكوّن من 6 أرقام",claim:"ربط الحالة",open:"فتح مساحة العمل",back:"العودة إلى القائمة",timeline:"رحلة الحالة",tasks:"المهام",messages:"الرسائل الآمنة",send:"إرسال الرسالة",message:"اكتب رسالة",assignments:"فريق الرعاية",documents:"مستندات المريض",download:"تنزيل",docScanning:"جارٍ الفحص الأمني",docUnavailable:"غير متاح",noDocuments:"لم يتم رفع أي مستندات بعد.",reviews:"مراجعات الطبيب",coordinatorLabel:"المنسق",consultantLabel:"الاستشاري",you:"أنت",signedInAs:"مسجّل الدخول باسم",myDashboard:"لوحة التحكم",caseWorkspaceLabel:"مساحة عمل الحالة",patientLabel:"المريض",careArea:"مجال الرعاية",languageLabel:"اللغة",updatedLabel:"آخر تحديث",countryLabel:"الدولة",estimatedByConsultant:"تقدير التكلفة من الاستشاري",prefilledFromReview:"معبأ مسبقًا من تقدير الاستشاري — عدّل قبل الإرسال.",servicesFromConsultant:"الخدمات والتكاليف",additionalCostTitle:"تكلفة إضافية (اختياري)",additionalCostHint:"بند اختياري إضافي، يُعرض بشكل منفصل ولا يُضاف إلى الإجمالي الأساسي.",additionalCostDesc:"ما الغرض منه؟",commentsTitle:"ملاحظات للمريض (اختياري)",commentsHint:"تظهر في العرض بجانب التوصية والخدمات.",proposalNotesLabel:"ملاحظة المنسق",assignedToYou:"تم تعيينك لهذه الحالة — اقبل لبدء مراجعتك.",doctorAccepted:"تم قبول الحالة وإعادتها إلى المنسق.",doctorInfoSent:"تم طلب معلومات إضافية — أُعيدت الحالة إلى المنسق.",doctorNotSuitable:"تم اعتبارها غير مناسبة سريريًا وأُعيدت إلى المنسق.",doctorReturned:"تمت إعادة هذه الحالة إلى المنسق.",proposal:"المقترح المقدم للمريض",genSend:"إنشاء وإرسال العرض",addService:"إضافة خدمة",sendWhatsapp:"إرسال عبر واتساب",sendEmail:"إرسال بالبريد",copyLink:"نسخ الرابط",copied:"تم النسخ!",linkReady:"رابط العرض جاهز — أرسله إلى المريض:",noPatientEmail:"لا يوجد بريد مسجّل",coordinatorClaim:"استلام مسؤولية الحالة",ownershipHint:"لديك صلاحية العرض فقط. استلم الحالة لتعيين استشاري أو تغيير الحالة أو إنشاء مقترح.",ownedByOther:"يتولى هذه الحالة منسّق آخر — لديك صلاحية العرض فقط.",handoff:"هذه الحالة قيد مراجعة الاستشاري {name}. الإجراءات مقفلة حتى تجهيز التوصية الطبية.",status:"الحالة",transition:"نقل الحالة",reason:"سبب التغيير",doctorSubject:"معرّف حساب الطبيب",reviewTreatment:"العلاج الموصى به",reviewRisks:"المخاطر والقيود",saveReview:"حفظ المراجعة الطبية",approveReview:"اعتماد المراجعة",createProposal:"إنشاء المقترح",item:"وصف الخدمة",price:"سعر الوحدة",release:"إرسال المقترح للمريض",operationsComplete:"استكمال الخطة التشغيلية",financeApprove:"اعتماد الشروط المالية",accept:"موافقة",decline:"رفض",revise:"طلب تعديل",adminTitle:"إضافة طبيب للنظام",coordinatorTitle:"إضافة منسق",coordinatorRole:"دور المنسق",name:"الاسم القانوني",subject:"معرّف حساب الهوية",specialty:"التخصص",create:"إنشاء الملف",profileId:"معرّف ملف الطبيب",credentialTitle:"تسجيل مستند اعتماد",credentialType:"نوع الاعتماد",reference:"رقم التسجيل أو الترخيص",source:"جهة الإصدار",expires:"تاريخ الانتهاء",addCredential:"إضافة الاعتماد",decisionTitle:"قرار اعتماد الطبيب",approvePractitioner:"اعتماد الطبيب",rejectPractitioner:"رفض الطبيب",rejectionReason:"سبب الرفض",success:"تم الحفظ بنجاح.",activated:"تم ربط حسابك بحالتك الآن — مرحبًا بك في رحلتك.",error:"تعذر إكمال الطلب."}
};

/**
 * The page's success and error messages, also shown inside an open drawer: a modal dialog makes the page banner inert and
 * unseen, so a drawer action would otherwise end with no visible result. A drawer clears them when it opens, so it only
 * shows what happened while it was open.
 */
export type Feedback={notice:string;error:string;clear:()=>void;clearNotice:()=>void};

export const FeedbackContext=createContext<Feedback>({notice:"",error:"",clear:()=>{},clearNotice:()=>{}});

export function HeaderFact({label,value}:{label:string;value:string}){
 return <span className="inline-flex items-baseline gap-1.5"><span className="text-ink-400">{label}:</span><strong className="font-semibold text-ink-800">{value}</strong></span>;
}

/** Secure messages and administration as side panels: one click away, never occupying the case page. */
export function CaseDrawer({locale,title,onClose,children}:{locale:Locale;title:string;onClose:()=>void;children:React.ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 const feedback=useContext(FeedbackContext);
 // What the page said before this drawer opened is not this drawer's result: a stale success notice is cleared, an
 // earlier error stays on the page (with its Retry) and is simply not repeated in here.
 const {clearNotice}=feedback;const [errorAtOpen]=useState(feedback.error);
 useEffect(()=>{clearNotice();},[clearNotice]);
 const titleId=useId();
 // Return focus to whatever opened the drawer once it has really left the page. Closing it from the cleanup would fire
 // `close` (and onClose) under StrictMode's double effects, so the cleanup only restores focus after removal.
 const opener=useRef<HTMLElement|null>(null);
 useEffect(()=>{const node=dialog.current;opener.current??=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{setTimeout(()=>{if(node&&!node.isConnected)opener.current?.focus();},0);};},[]);
 return <dialog ref={dialog} className="account-dialog case-drawer !w-[min(36rem,calc(100%-2rem))]" aria-labelledby={titleId} onClose={onClose}>
  <div className="sticky -top-6 z-10 -mx-6 -mt-6 flex items-start justify-between gap-4 border-b border-line bg-white px-6 pb-3 pt-6"><h2 id={titleId} className="title">{title}</h2><button type="button" className="icon-button" aria-label={locale==="ar"?"إغلاق":"Close"} onClick={()=>dialog.current?.close()}><X size={20}/></button></div>
  <div className="mt-4">
   {feedback.error&&feedback.error!==errorAtOpen&&<p role="alert" className="mb-4 rounded-lg bg-alert-50 p-3 text-[0.9rem] text-alert-800">{feedback.error}</p>}
   {feedback.notice&&<p role="status" className="mb-4 rounded-lg bg-brand-50 p-3 text-[0.9rem] text-brand-800">{feedback.notice}</p>}
   {children}
  </div>
 </dialog>;
}

export function Panel({title,children,wide=false}:{title:string;children:React.ReactNode;wide?:boolean}){return <section className={`card mt-6 p-5 ${wide?"":""}`}><h3 className="title mb-4">{title}</h3><div className="space-y-3">{children}</div></section>}

export function Empty(){return <p className="text-ink-500">—</p>}

export function Status({value,locale="en"}:{value:string;locale?:Locale}){
 const tone=["INFORMATION_REQUIRED","REVISION_REQUESTED","EXPIRED"].includes(value)?"border-amber-200 bg-amber-50 text-amber-900":["CANCELLED","DECLINED","CLINICALLY_NOT_SUITABLE"].includes(value)?"border-alert-200 bg-alert-50 text-alert-800":["CLOSED","DISCHARGED","FOLLOW_UP"].includes(value)?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-brand-200 bg-brand-50 text-brand-800";
 return <span className={`rounded-full border px-3 py-1 text-sm font-bold ${tone}`}>{statusLabel(value,locale)}</span>
}
