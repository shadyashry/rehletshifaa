import type { Locale } from "@/lib/i18n";

export const ccCopy = {
  en: {
    title:"Provider Control Center", intro:"Manage provider organizations, onboarding, credentials and operational setup.",
    loading:"Loading…", denied:"You do not have access to this area. Ask your Provider Operations manager.",
    error:"We could not complete this request. Refresh and try again.", retry:"Refresh", signin:"Sign in securely", back:"Back to workspace",
    nav:{providers:"Organizations", operations:"Provider Operations", access:"Access & Governance"},
    accessRoles:"Roles", accessPermissions:"Permissions", accessEffective:"Effective access", accessAudit:"Audit",
    orgList:"Provider organizations", search:"Find an organization", empty:"No provider organizations to show.",
    newOrg:"New organization", type:"Type", status:"Status", country:"Country", currency:"Currency", legacyMapping:"Legacy mapping",
    overview:"Overview", clinicalTeam:"Clinical team", practiceTeam:"Practice team", onboarding:"Onboarding & readiness",
    members:"Members", relationships:"Relationships", noMembers:"No members yet.", noRelationships:"No relationships recorded.",
    invite:"Invite member", role:"Role", subject:"Account identifier", name:"Full name", email:"Email", reason:"Reason", locale:"Preferred language",
    activate:"Activate", deactivate:"Deactivate", invitationStatus:"Invitation", effectiveFrom:"Effective from", effectiveTo:"Effective to",
    readiness:"Readiness", readyForActivation:"Ready for activation", notReady:"Not yet ready", blockers:"Outstanding requirements",
    evaluatedAt:"Evaluated", clinicianType:"Clinician type", jurisdiction:"Jurisdiction", owner:"Owner",
    checklist:{identityProvisioned:"Identity provisioned",organizationMembershipActive:"Organization membership active",providerProfileComplete:"Provider profile complete",clinicianProfileComplete:"Clinician profile complete",requiredCredentialsSubmitted:"Required credentials submitted",requiredCredentialsVerified:"Required credentials verified",mandatoryCredentialsUnexpired:"Mandatory credentials current",requiredRelationshipsComplete:"Required relationships in place",pricingSetupComplete:"Pricing configured",availabilitySetupComplete:"Availability configured",credentialReady:"Credential-eligible"},
    close:"Close", cancel:"Cancel", save:"Save", refresh:"Refresh", noSelection:"Select an organization to view its details.",
    breadcrumbHome:"Control Center", breadcrumbProviders:"Organizations",

    breadcrumbCredentials:"Credential verification",
    credentialQueue:"Credential verification queue", credentialQueueEmpty:"No credentials are awaiting review.",
    filterOrg:"Organization", filterType:"Credential type", filterStatus:"Status", allOrgs:"All organizations", allTypes:"All types", allStatuses:"All statuses",
    submitted:"Submitted", expires:"Expires", clinician:"Clinician", credentialType:"Credential type", review:"Review",
    credentialStatus:{SUBMITTED:"Submitted",UNDER_REVIEW:"Under review",VERIFIED:"Verified",REJECTED:"Rejected",MORE_INFORMATION_REQUIRED:"More information required",SUSPENDED:"Suspended"},
    credentialReview:"Credential review", breadcrumbReview:"Review",
    evidence:"Submitted evidence", noEvidence:"No evidence documents are attached.", viewDocument:"View document", openingDocument:"Preparing a secure link…",
    decisionReason:"Decision basis / reason", decisionReasonRequired:"A reason is required for this decision.",
    startReview:"Start review", verify:"Verify", reject:"Reject", requestInformation:"Request correction / information", suspend:"Suspend", restore:"Restore",
    selfVerificationBlocked:"You are the subject of this credential. You cannot review your own submission.",
    submitterReviewBlocked:"You submitted this credential. An independent reviewer must review it.",
    decisionHistory:"Decision history", credentialDetailNotFound:"This credential revision could not be found or you do not have access to it.",

    onboardingWorkflow:"Guided onboarding", stepComplete:"Complete", stepInProgress:"In progress", stepBlocked:"Blocked", stepNeedsAction:"Needs action", stepVerified:"Verified", stepReady:"Ready",
    stepOrgProfile:"Organization profile", stepOwner:"Owner / lead Consultant", stepClinicalTeam:"Clinical team", stepPracticeTeam:"Practice / admin team",
    stepCredentials:"Credential requirements & verification", stepOperational:"Operational setup", stepCommercial:"Commercial / legal acceptance", stepActivation:"Activation readiness",
    goToCredentialQueue:"Review in credential queue", goToClinicalTeam:"Go to clinical team", goToPracticeTeam:"Go to practice team",
    activateProvider:"Activate provider organization", activateProviderConfirm:"Activate this provider organization now? This is a real business action.",
    nOutstandingCredentials:(n:number,locale:string)=>locale==="ar"?`${n} من الاعتمادات بحاجة إلى مراجعة`:`${n} credential${n===1?"":"s"} need${n===1?"s":""} review`,

    roleConsultants:"Consultants", roleAssociateDoctors:"Associate Doctors", rolePracticeManagers:"Practice Managers", roleAssistants:"Consultant Assistants",
    assignSupervisor:"Assign Consultant supervisor", assignManaged:"Add managed Consultant", assignAssisted:"Assign to Consultant",
    supervisingConsultant:"Supervising Consultant", managedConsultants:"Managed Consultants", assistsConsultant:"Assists Consultant",
    noneAssigned:"None assigned.", chooseConsultant:"Choose a Consultant", assign:"Assign",
    relationshipRemovalNote:"Relationships end automatically when a member is deactivated; there is no separate removal action.",
    pricingSummary:"Pricing", availabilitySummary:"Availability", pricingAvailabilityDeferred:"Configured in Phase 5A-3.",
    servicesAndPricing:"Services & pricing", noPricing:"No published price yet.",

    pricing:"Pricing", breadcrumbPricing:"Pricing", pricingIntro:"The organization price applies unless the clinician has their own price.",
    availability:"Availability", breadcrumbAvailability:"Availability",
    newPrice:"New price", service:"Service", serviceCode:"Service code", serviceName:"Service name", category:"Category", scope:"Scope",
    amount:"Amount", effectivePeriod:"Effective period", version:"Version", draft:"Draft", active:"Active", retired:"Retired",
    priceScope:{ORGANIZATION:"Organization price",CONSULTANT:"Clinician-specific price",ASSOCIATE_DOCTOR:"Clinician-specific price (associate doctor)"},
    priceStatus:{DRAFT:"Draft",ACTIVE:"Active",RETIRED:"Retired"},
    effectivePriceLabel:"Price that applies now", noPriceForService:"No price applies to this service yet.",
    publish:"Publish", approve:"Record Consultant approval", retire:"Retire", edit:"Edit",
    retireConfirmTitle:"Retire this price?", retireConfirmBody:"From now on it won't be used for new estimates or quotes. Proposals already sent to patients keep the price they were given. A retired price can't be reactivated — publish a new price to replace it.", retireConfirm:"Yes, retire price",
    consultantApprovalRequired:"Requires Consultant approval before publication", consultantApproved:"Consultant-approved", consultantApprovalPending:"Awaiting Consultant approval",
    onlyClinicianCanApprove:"Only the Consultant themselves can record this approval.",
    noPrices:"No prices configured yet.", priceOverlapError:"An active price already overlaps this effective period.",
    inheritanceHint:"Lower rows override higher ones for this specific clinician; the backend always resolves the most specific effective price.",

    newSlot:"New weekly slot", weeklySchedule:"Weekly schedule", exceptions:"Exceptions & leave", newException:"New exception",
    dayOfWeek:"Day of week", startTime:"Start time", endTime:"End time", timeZone:"Time zone", consultationMode:"Consultation mode", location:"Location",
    exceptionType:"Exception type", exceptionPeriod:"Period", exceptionReason:"Reason",
    days:["","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    exceptionTypes:{LEAVE:"Leave",BLOCKED:"Blocked time",CLINIC_CLOSURE:"Clinic closure",EXTRA_AVAILABILITY:"Extra availability",SPECIAL_CLINIC:"Special clinic"},
    noSlots:"No weekly availability configured yet.", noExceptions:"No exceptions or leave recorded.",
    remove:"Remove", availabilityOverlapError:"Weekly availability intervals cannot overlap.", exceptionOverlapError:"Availability exceptions cannot overlap.",
    effectiveNow:"Available right now", notAvailableNow:"Not available right now", effectiveSource:"Source",
    timeZoneNote:"All times are stored and displayed in the clinician's own time zone, shown explicitly on every entry — never silently converted to your browser's local time zone.",
  },
  ar: {
    title:"مركز التحكم بمقدمي الرعاية", intro:"إدارة مؤسسات مقدمي الرعاية والتهيئة والاعتماد والإعداد التشغيلي.",
    loading:"جارٍ التحميل…", denied:"ليس لديك وصول إلى هذه المساحة. تواصل مع مدير عمليات مقدمي الرعاية.",
    error:"تعذر إكمال الطلب. حدّث الصفحة وحاول مجددًا.", retry:"تحديث", signin:"تسجيل الدخول الآمن", back:"العودة إلى مساحة العمل",
    nav:{providers:"المؤسسات", operations:"عمليات مقدمي الرعاية", access:"الوصول والحوكمة"},
    accessRoles:"الأدوار", accessPermissions:"الصلاحيات", accessEffective:"الوصول الفعلي", accessAudit:"سجل التدقيق",
    orgList:"مؤسسات مقدمي الرعاية", search:"البحث عن مؤسسة", empty:"لا توجد مؤسسات لعرضها.",
    newOrg:"مؤسسة جديدة", type:"النوع", status:"الحالة", country:"الدولة", currency:"العملة", legacyMapping:"الربط القديم",
    overview:"نظرة عامة", clinicalTeam:"الفريق السريري", practiceTeam:"فريق العيادة", onboarding:"التهيئة والجاهزية",
    members:"الأعضاء", relationships:"العلاقات", noMembers:"لا يوجد أعضاء بعد.", noRelationships:"لا توجد علاقات مسجلة.",
    invite:"دعوة عضو", role:"الدور", subject:"معرّف الحساب", name:"الاسم الكامل", email:"البريد الإلكتروني", reason:"السبب", locale:"اللغة المفضلة",
    activate:"تفعيل", deactivate:"إلغاء التفعيل", invitationStatus:"الدعوة", effectiveFrom:"ساري من", effectiveTo:"ساري حتى",
    readiness:"الجاهزية", readyForActivation:"جاهز للتفعيل", notReady:"غير جاهز بعد", blockers:"المتطلبات المتبقية",
    evaluatedAt:"تاريخ التقييم", clinicianType:"نوع الطبيب", jurisdiction:"الولاية القضائية", owner:"المالك",
    checklist:{identityProvisioned:"تم تجهيز الهوية",organizationMembershipActive:"عضوية المؤسسة نشطة",providerProfileComplete:"ملف المؤسسة مكتمل",clinicianProfileComplete:"ملف الطبيب مكتمل",requiredCredentialsSubmitted:"تم تقديم الاعتمادات المطلوبة",requiredCredentialsVerified:"تم التحقق من الاعتمادات المطلوبة",mandatoryCredentialsUnexpired:"الاعتمادات الإلزامية سارية",requiredRelationshipsComplete:"العلاقات المطلوبة متوفرة",pricingSetupComplete:"تم إعداد الأسعار",availabilitySetupComplete:"تم إعداد التوافر",credentialReady:"مؤهل من حيث الاعتماد"},
    close:"إغلاق", cancel:"إلغاء", save:"حفظ", refresh:"تحديث", noSelection:"اختر مؤسسة لعرض تفاصيلها.",
    breadcrumbHome:"مركز التحكم", breadcrumbProviders:"المؤسسات",

    breadcrumbCredentials:"التحقق من الاعتمادات",
    credentialQueue:"قائمة التحقق من الاعتمادات", credentialQueueEmpty:"لا توجد اعتمادات بانتظار المراجعة.",
    filterOrg:"المؤسسة", filterType:"نوع الاعتماد", filterStatus:"الحالة", allOrgs:"كل المؤسسات", allTypes:"كل الأنواع", allStatuses:"كل الحالات",
    submitted:"تاريخ التقديم", expires:"تاريخ الانتهاء", clinician:"الطبيب", credentialType:"نوع الاعتماد", review:"مراجعة",
    credentialStatus:{SUBMITTED:"تم التقديم",UNDER_REVIEW:"قيد المراجعة",VERIFIED:"تم التحقق",REJECTED:"مرفوض",MORE_INFORMATION_REQUIRED:"يلزم معلومات إضافية",SUSPENDED:"موقوف"},
    credentialReview:"مراجعة الاعتماد", breadcrumbReview:"مراجعة",
    evidence:"المستندات المقدمة", noEvidence:"لا توجد مستندات مرفقة.", viewDocument:"عرض المستند", openingDocument:"جارٍ تجهيز رابط آمن…",
    decisionReason:"سبب / أساس القرار", decisionReasonRequired:"السبب مطلوب لهذا القرار.",
    startReview:"بدء المراجعة", verify:"تحقق", reject:"رفض", requestInformation:"طلب تصحيح / معلومات", suspend:"إيقاف", restore:"استعادة",
    selfVerificationBlocked:"أنت صاحب هذا الاعتماد. لا يمكنك مراجعة طلبك الخاص.",
    submitterReviewBlocked:"أنت من قدّم هذا الاعتماد. يجب أن يراجعه شخص مستقل.",
    decisionHistory:"سجل القرارات", credentialDetailNotFound:"تعذر العثور على مراجعة الاعتماد هذه أو ليس لديك صلاحية الوصول إليها.",

    onboardingWorkflow:"التهيئة الموجهة", stepComplete:"مكتمل", stepInProgress:"قيد التنفيذ", stepBlocked:"معلّق", stepNeedsAction:"يتطلب إجراء", stepVerified:"تم التحقق", stepReady:"جاهز",
    stepOrgProfile:"ملف المؤسسة", stepOwner:"المالك / الاستشاري الرئيسي", stepClinicalTeam:"الفريق السريري", stepPracticeTeam:"فريق العيادة/الإدارة",
    stepCredentials:"متطلبات الاعتماد والتحقق", stepOperational:"الإعداد التشغيلي", stepCommercial:"القبول التجاري/القانوني", stepActivation:"جاهزية التفعيل",
    goToCredentialQueue:"مراجعة في قائمة الاعتمادات", goToClinicalTeam:"الانتقال إلى الفريق السريري", goToPracticeTeam:"الانتقال إلى فريق العيادة",
    activateProvider:"تفعيل مؤسسة مقدم الرعاية", activateProviderConfirm:"هل تريد تفعيل هذه المؤسسة الآن؟ هذا إجراء تجاري فعلي.",
    nOutstandingCredentials:(n:number,locale:string)=>locale==="ar"?`${n} من الاعتمادات بحاجة إلى مراجعة`:`${n} credential${n===1?"":"s"} need${n===1?"s":""} review`,

    roleConsultants:"الاستشاريون", roleAssociateDoctors:"الأطباء المشاركون", rolePracticeManagers:"مديرو العيادات", roleAssistants:"مساعدو الاستشاريين",
    assignSupervisor:"تعيين استشاري مشرف", assignManaged:"إضافة استشاري مُدار", assignAssisted:"تعيين لاستشاري",
    supervisingConsultant:"الاستشاري المشرف", managedConsultants:"الاستشاريون المُدارون", assistsConsultant:"يساعد الاستشاري",
    noneAssigned:"لا يوجد تعيين.", chooseConsultant:"اختر استشاريًا", assign:"تعيين",
    relationshipRemovalNote:"تنتهي العلاقات تلقائيًا عند إلغاء تفعيل العضو؛ لا يوجد إجراء إزالة منفصل.",
    pricingSummary:"الأسعار", availabilitySummary:"التوافر", pricingAvailabilityDeferred:"سيتم إعدادها في المرحلة 5A-3.",
    servicesAndPricing:"الخدمات والأسعار", noPricing:"لا يوجد سعر منشور بعد.",

    pricing:"الأسعار", breadcrumbPricing:"الأسعار", pricingIntro:"يُطبَّق سعر الجهة ما لم يكن للطبيب سعر خاص به.",
    availability:"التوافر", breadcrumbAvailability:"التوافر",
    newPrice:"سعر جديد", service:"الخدمة", serviceCode:"رمز الخدمة", serviceName:"اسم الخدمة", category:"الفئة", scope:"النطاق",
    amount:"المبلغ", effectivePeriod:"الفترة السارية", version:"الإصدار", draft:"مسودة", active:"نشط", retired:"منتهٍ",
    priceScope:{ORGANIZATION:"سعر الجهة",CONSULTANT:"سعر خاص بالطبيب",ASSOCIATE_DOCTOR:"سعر خاص بالطبيب (طبيب مشارك)"},
    priceStatus:{DRAFT:"مسودة",ACTIVE:"نشط",RETIRED:"منتهٍ"},
    effectivePriceLabel:"السعر الساري", noPriceForService:"لا يوجد سعر سارٍ لهذه الخدمة.",
    publish:"نشر", approve:"تسجيل موافقة الاستشاري", retire:"إنهاء", edit:"تعديل",
    retireConfirmTitle:"إنهاء هذا السعر؟", retireConfirmBody:"لن يُستخدم بعد الآن في التقديرات أو عروض الأسعار الجديدة. تحتفظ العروض المرسلة للمرضى بالسعر الذي قُدّم لهم. لا يمكن إعادة تفعيل سعر منتهٍ — انشر سعرًا جديدًا ليحل محله.", retireConfirm:"نعم، أنهِ السعر",
    consultantApprovalRequired:"يتطلب موافقة الاستشاري قبل النشر", consultantApproved:"تمت موافقة الاستشاري", consultantApprovalPending:"بانتظار موافقة الاستشاري",
    onlyClinicianCanApprove:"يمكن للاستشاري نفسه فقط تسجيل هذه الموافقة.",
    noPrices:"لا توجد أسعار مهيأة بعد.", priceOverlapError:"يوجد بالفعل سعر نشط يتداخل مع هذه الفترة.",
    inheritanceHint:"الصفوف الأدنى تتجاوز الأعلى لهذا الطبيب تحديدًا؛ يقوم النظام دائمًا بتحديد السعر الساري الأكثر تحديدًا.",

    newSlot:"موعد أسبوعي جديد", weeklySchedule:"الجدول الأسبوعي", exceptions:"الاستثناءات والإجازات", newException:"استثناء جديد",
    dayOfWeek:"يوم الأسبوع", startTime:"وقت البدء", endTime:"وقت الانتهاء", timeZone:"المنطقة الزمنية", consultationMode:"طريقة الاستشارة", location:"الموقع",
    exceptionType:"نوع الاستثناء", exceptionPeriod:"الفترة", exceptionReason:"السبب",
    days:["","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"],
    exceptionTypes:{LEAVE:"إجازة",BLOCKED:"وقت محظور",CLINIC_CLOSURE:"إغلاق العيادة",EXTRA_AVAILABILITY:"توافر إضافي",SPECIAL_CLINIC:"عيادة خاصة"},
    noSlots:"لا يوجد توافر أسبوعي مهيأ بعد.", noExceptions:"لا توجد استثناءات أو إجازات مسجلة.",
    remove:"إزالة", availabilityOverlapError:"لا يمكن أن تتداخل فترات التوافر الأسبوعية.", exceptionOverlapError:"لا يمكن أن تتداخل استثناءات التوافر.",
    effectiveNow:"متاح الآن", notAvailableNow:"غير متاح الآن", effectiveSource:"المصدر",
    timeZoneNote:"جميع الأوقات مخزّنة ومعروضة بالمنطقة الزمنية الخاصة بالطبيب، وتظهر صراحة في كل إدخال — ولا تُحوَّل أبدًا بصمت إلى المنطقة الزمنية المحلية لمتصفحك.",
  },
};

const orgTypeAr:Record<string,string>={HOSPITAL:"مستشفى",CLINIC:"عيادة",SOLO_PRACTICE:"ممارسة فردية",DIAGNOSTIC_CENTER:"مركز تشخيص"};
const orgStatusAr:Record<string,string>={DRAFT:"مسودة",ONBOARDING:"قيد التهيئة",READINESS_REVIEW:"مراجعة الجاهزية",ACTIVE:"نشطة",SUSPENDED:"موقوفة",OFFBOARDED:"منتهية"};
const memberStatusAr:Record<string,string>={PENDING:"بانتظار التفعيل",ACTIVE:"نشط",REVOKED:"ملغى"};
const invitationAr:Record<string,string>={PENDING:"بانتظار القبول",ACTIVE:"مقبولة",FAILED:"فشلت"};
const relationshipTypeAr:Record<string,string>={MANAGES:"يدير",ASSISTS:"يساعد",SUPERVISES:"يشرف على"};
const onboardingAr:Record<string,string>={INVITED:"تمت الدعوة",PROFILE_INCOMPLETE:"الملف غير مكتمل",DOCUMENTS_SUBMITTED:"تم تقديم المستندات",UNDER_VERIFICATION:"قيد التحقق",MORE_INFORMATION_REQUIRED:"يلزم معلومات إضافية",VERIFIED:"تم التحقق",REJECTED:"مرفوض",OPERATIONAL_SETUP:"الإعداد التشغيلي",ACTIVE:"نشط",SUSPENDED:"موقوف",OFFBOARDED:"منتهٍ",LEGACY_UNREVIEWED:"سجل قديم غير مراجَع"};
const roleAr:Record<string,string>={PROVIDER_OPERATIONS_MANAGER:"مدير عمليات مقدمي الرعاية",ORGANIZATION_OWNER:"مالك المؤسسة",PRACTICE_MANAGER:"مدير العيادة",CONSULTANT:"استشاري",ASSOCIATE_DOCTOR:"طبيب مشارك",CONSULTANT_ASSISTANT:"مساعد الاستشاري"};

function pick(map:Record<string,string>,key:string,locale:Locale){return locale==="ar"?(map[key]??key.toLowerCase().replaceAll("_"," ")):key.charAt(0)+key.slice(1).toLowerCase().replaceAll("_"," ");}
export const orgTypeLabel=(key:string,locale:Locale)=>pick(orgTypeAr,key,locale);
export const orgStatusLabel=(key:string,locale:Locale)=>pick(orgStatusAr,key,locale);
export const memberStatusLabel=(key:string,locale:Locale)=>pick(memberStatusAr,key,locale);
export const invitationLabel=(key:string,locale:Locale)=>pick(invitationAr,key,locale);
export const relationshipTypeLabel=(key:string,locale:Locale)=>pick(relationshipTypeAr,key,locale);
export const onboardingStatusLabel=(key:string,locale:Locale)=>pick(onboardingAr,key,locale);
export const roleLabel=(key:string,locale:Locale)=>locale==="ar"?(roleAr[key]??key):key.charAt(0)+key.slice(1).toLowerCase().replaceAll("_"," ");
export const credentialStatusLabel=(key:string,locale:Locale):string=>{const map=ccCopy[locale].credentialStatus as Record<string,string>;return map[key]??key;};
export const priceScopeLabel=(key:string,locale:Locale):string=>{const map=ccCopy[locale].priceScope as Record<string,string>;return map[key]??key;};
export const priceStatusLabel=(key:string,locale:Locale):string=>{const map=ccCopy[locale].priceStatus as Record<string,string>;return map[key]??key;};
export const exceptionTypeLabel=(key:string,locale:Locale):string=>{const map=ccCopy[locale].exceptionTypes as Record<string,string>;return map[key]??key;};
