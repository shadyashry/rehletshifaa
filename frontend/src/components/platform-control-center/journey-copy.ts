import type { Locale } from "@/lib/i18n";

export const journeyCopy = {
  en: {
    navJourneys: "Journeys",
    title: "Journey Management", intro: "Design, validate, simulate and publish patient-journey versions.",
    loading: "Loading…", denied: "You do not have access to this area.",
    error: "We could not complete this request. Refresh and try again.", retry: "Refresh", signin: "Sign in securely",
    back: "Back to workspace", backToJourneys: "Back to journeys", backToVersions: "Back to versions",
    reason: "Governance reason", reasonHint: "Recorded on the audit trail for this change (max 500 characters).", reasonRequired: "A governance reason is required.",
    staleTitle: "This journey changed", staleMessage: "Someone else saved a change to this version. Reload it before saving again.", reload: "Reload",
    breadcrumbJourneys: "Journeys", breadcrumbVersions: "Versions", breadcrumbDesigner: "Designer",

    journeyList: "Journeys", journeyListEmpty: "No journeys have been created yet.", newJourney: "New journey", createJourney: "Create journey",
    journeyName: "Name", journeyKey: "Key", createdAt: "Created", openVersions: "Open versions",

    versions: "Versions", versionNumber: "Version", noVersions: "No versions yet.", cloneVersion: "Clone into a new draft",
    openDesigner: "Open designer", history: "History", historyEmpty: "No history recorded yet.",
    runtimeStatus: "Runtime status", deployed: "Deployed", notDeployed: "Not deployed", deployVersion: "Deploy",
    publishedDate: "Published", retiredDate: "Retired", noPublished: "No published version yet.", noDraft: "No draft in progress.",
    currentDraft: "Current draft", currentPublished: "Current published", compilerVersion: "Compiler version", artifactHash: "Artifact hash",

    status: {
      DRAFT: "Draft", VALIDATED: "Validated", SIMULATED: "Simulated", PENDING_APPROVAL: "Pending approval", PUBLISHED: "Published", RETIRED: "Retired",
    } as Record<string, string>,

    designer: "Designer", palette: "Stage palette", inspector: "Stage configuration", canvas: "Journey canvas",
    stageList: "Stage list", switchToGraph: "Switch to graph view", switchToList: "Switch to list view",
    addStage: "Add stage", saveDraft: "Save draft", saved: "Saved", unsaved: "Unsaved changes",
    validate: "Validate", simulate: "Simulate", submit: "Submit for approval", publish: "Publish", retire: "Retire",
    retireVersion: "Retire version", retireConfirmTitle: "Retire this published version?", retireConfirmBody: "It will no longer be offered for new journeys. Cases already on this version stay on it and are not moved. A retired version can't be published again — to change it, clone it into a new draft.", retireConfirm: "Yes, retire version",
    returnToDraft: "Return to draft", cloneToEdit: "Published versions are immutable. Clone this version to make changes.",

    stageTypes: {
      START: "Start", STAFF_TASK: "Staff step", PATIENT_ACTION: "Patient step", DECISION: "Decision",
      SYSTEM_ACTION: "System / automated action", WAIT: "Wait", TIMER: "Timer", NOTIFICATION: "Notification", END: "End",
    } as Record<string, string>,

    actorTypes: {
      PATIENT: "Patient", REPRESENTATIVE: "Representative", COORDINATOR: "Coordinator", CONSULTANT: "Consultant",
      ASSOCIATE_DOCTOR: "Associate Doctor", PRACTICE_STAFF: "Practice Staff", OPERATIONS: "Operations",
      FINANCE: "Finance", PLATFORM_STAFF: "Platform Staff", SYSTEM: "System",
    } as Record<string, string>,

    facts: {
      PROPOSAL_ACCEPTED: "Patient accepted the proposal", DEPOSIT_SATISFIED: "Deposit satisfied",
      PROFILE_COMPLETE: "Patient profile complete", INFORMATION_COMPLETE: "Requested information complete",
      CONSULTANT_ACCEPTED: "Consultant accepted the assignment", CLINICAL_ACCEPTED: "Clinical review accepted",
      PROPOSAL_NEEDS_REWORK: "Proposal needs rework",
    } as Record<string, string>,

    selectNode: "Select a stage to configure it.", nodeName: "Display name", nodeKey: "Stage key", nodeType: "Stage type",
    actorType: "Actor type", registeredAction: "Registered action", noAction: "No action (control stage)",
    blocking: "Blocking (case cannot proceed until complete)", optionalStage: "Optional",
    entryCondition: "Entry condition", exitCondition: "Exit condition", noCondition: "None",
    conditionFact: "Business fact", conditionEquals: "Must equal", conditionTrue: "True", conditionFalse: "False",
    sla: "Service level", dueMinutes: "Due (minutes)", reminderMinutes: "Reminder (minutes)", escalationMinutes: "Escalation (minutes)",
    timerMinutes: "Timer duration (minutes)", advancedKey: "Advanced: immutable technical key",

    edges: "Transitions", addTransition: "Connect to next step", editTransition: "Change branch target",
    removeTransition: "Disconnect", transitionFrom: "From", transitionTo: "To", transitionCondition: "Branch condition",
    noTransitions: "No outgoing transitions yet.",

    nonDragToolbar: "Editing tools (no drag required)", addBefore: "Add step before", addAfter: "Add step after",
    moveBefore: "Move earlier", moveAfter: "Move later", deleteNode: "Delete stage", insertRecovery: "Insert recovery step",
    confirmDeleteTitle: "Delete this stage?", confirmDeleteBody: "This stage has connected transitions. Deleting it also removes those transitions.",
    confirmDelete: "Delete", cancel: "Cancel", close: "Close", save: "Save",

    validation: "Validation", validationErrors: "Errors", validationWarnings: "Warnings", validationClean: "No issues found.",
    validationCanPublish: "This configuration can be submitted.", focusOnGraph: "Show on graph",
    runValidation: "Run validation",

    simulation: "Simulation", simulationFacts: "Synthetic scenario facts", runSimulation: "Run simulation",
    simulationPath: "Path taken", simulationOutcome: "Outcome", noSimulationYet: "Run a simulation to see the path.",
    simulationSideEffectFree: "Simulation is side-effect free — no case, WorkItem, PatientAction, notification, payment or assignment is created.",
    outcomes: {
      COMPLETED: "Completed", BLOCKED: "Blocked", WAITING: "Waiting", INVALID: "Invalid input", LOOP_LIMIT_EXCEEDED: "Loop limit exceeded",
    } as Record<string, string>,

    diff: "Version comparison", compareWith: "Compare with", diffAdded: "Added", diffRemoved: "Removed", diffChanged: "Changed",
    diffNoChanges: "No material differences from the compared version.", selectCompareVersion: "Select a version to compare.",
    diffStageAdded: "Stage added", diffStageRemoved: "Stage removed", diffActorChanged: "Actor changed", diffActionChanged: "Action changed",
    diffLabelChanged: "Name changed", diffBranchChanged: "Branch condition changed", diffSlaChanged: "Service level changed",
    diffTransitionAdded: "Transition added", diffTransitionRemoved: "Transition removed",

    publishGovernance: "Publish governance", publishConfirmTitle: "Publish this journey version?",
    publishImmutableWarning: "Published versions are immutable. A future change requires a new draft version.",
    publishPinningWarning: "Existing cases remain on their current journey version and are not automatically migrated.",
    publishValidationState: "Validation", publishSimulationState: "Simulation", publishMaterialChanges: "Material changes since the last published version",
    confirmPublish: "Confirm publish", publishBlockedValidation: "Complete a valid simulation before this version can be submitted or published.",
    publishBlockedReview: "Another authorized reviewer must publish this journey (you last edited this version).",
    independentReviewRequired: "Independent review required",
    runtimeDeploymentImplication: "Publishing deploys this version to the runtime so new eligible cases can start on it.",

    permission: { view: "journey.view", create: "journey.create", editDraft: "journey.edit_draft", validate: "journey.validate", simulate: "journey.simulate", submit: "journey.submit", publish: "journey.publish", approve: "journey.approve", retire: "journey.retire" },
  },
  ar: {
    navJourneys: "الرحلات",
    title: "إدارة الرحلات", intro: "تصميم إصدارات رحلة المريض والتحقق منها ومحاكاتها ونشرها.",
    loading: "جارٍ التحميل…", denied: "ليس لديك وصول إلى هذه المساحة.",
    error: "تعذر إكمال الطلب. حدّث الصفحة وحاول مجددًا.", retry: "تحديث", signin: "تسجيل الدخول الآمن",
    back: "العودة إلى مساحة العمل", backToJourneys: "العودة إلى الرحلات", backToVersions: "العودة إلى الإصدارات",
    reason: "سبب الحوكمة", reasonHint: "يُسجَّل في سجل التدقيق لهذا التغيير (بحد أقصى 500 حرف).", reasonRequired: "سبب الحوكمة مطلوب.",
    staleTitle: "تغيّرت هذه الرحلة", staleMessage: "قام شخص آخر بحفظ تغيير على هذا الإصدار. أعد تحميله قبل الحفظ مجددًا.", reload: "إعادة تحميل",
    breadcrumbJourneys: "الرحلات", breadcrumbVersions: "الإصدارات", breadcrumbDesigner: "المصمم",

    journeyList: "الرحلات", journeyListEmpty: "لم يتم إنشاء أي رحلة بعد.", newJourney: "رحلة جديدة", createJourney: "إنشاء رحلة",
    journeyName: "الاسم", journeyKey: "المفتاح", createdAt: "تاريخ الإنشاء", openVersions: "فتح الإصدارات",

    versions: "الإصدارات", versionNumber: "الإصدار", noVersions: "لا توجد إصدارات بعد.", cloneVersion: "استنساخ إلى مسودة جديدة",
    openDesigner: "فتح المصمم", history: "السجل", historyEmpty: "لا يوجد سجل مسجل بعد.",
    runtimeStatus: "حالة التشغيل", deployed: "تم النشر التشغيلي", notDeployed: "لم يُنشر تشغيليًا", deployVersion: "نشر تشغيلي",
    publishedDate: "تاريخ النشر", retiredDate: "تاريخ الإنهاء", noPublished: "لا يوجد إصدار منشور بعد.", noDraft: "لا توجد مسودة قيد العمل.",
    currentDraft: "المسودة الحالية", currentPublished: "المنشور الحالي", compilerVersion: "إصدار المترجم", artifactHash: "بصمة الحزمة",

    status: {
      DRAFT: "مسودة", VALIDATED: "تم التحقق", SIMULATED: "تمت المحاكاة", PENDING_APPROVAL: "بانتظار الموافقة", PUBLISHED: "منشور", RETIRED: "منتهٍ",
    } as Record<string, string>,

    designer: "المصمم", palette: "لوحة المراحل", inspector: "إعداد المرحلة", canvas: "مخطط الرحلة",
    stageList: "قائمة المراحل", switchToGraph: "التبديل إلى عرض المخطط", switchToList: "التبديل إلى عرض القائمة",
    addStage: "إضافة مرحلة", saveDraft: "حفظ المسودة", saved: "تم الحفظ", unsaved: "تغييرات غير محفوظة",
    validate: "التحقق", simulate: "محاكاة", submit: "إرسال للموافقة", publish: "نشر", retire: "إنهاء",
    retireVersion: "إنهاء الإصدار", retireConfirmTitle: "إنهاء هذا الإصدار المنشور؟", retireConfirmBody: "لن يُعرض بعد الآن للرحلات الجديدة. تبقى الحالات الموجودة على هذا الإصدار ولا تُنقل. لا يمكن نشر إصدار منتهٍ مرة أخرى — لتغييره، انسخه إلى مسودة جديدة.", retireConfirm: "نعم، أنهِ الإصدار",
    returnToDraft: "الإعادة إلى مسودة", cloneToEdit: "الإصدارات المنشورة غير قابلة للتعديل. استنسخ هذا الإصدار لإجراء تغييرات.",

    stageTypes: {
      START: "بداية", STAFF_TASK: "خطوة موظف", PATIENT_ACTION: "خطوة مريض", DECISION: "قرار",
      SYSTEM_ACTION: "إجراء نظام / آلي", WAIT: "انتظار", TIMER: "مؤقّت", NOTIFICATION: "إشعار", END: "نهاية",
    } as Record<string, string>,

    actorTypes: {
      PATIENT: "المريض", REPRESENTATIVE: "الممثل", COORDINATOR: "المنسق", CONSULTANT: "الاستشاري",
      ASSOCIATE_DOCTOR: "الطبيب المشارك", PRACTICE_STAFF: "فريق العيادة", OPERATIONS: "العمليات",
      FINANCE: "المالية", PLATFORM_STAFF: "فريق المنصة", SYSTEM: "النظام",
    } as Record<string, string>,

    facts: {
      PROPOSAL_ACCEPTED: "قبل المريض العرض", DEPOSIT_SATISFIED: "تم استيفاء الدفعة المقدمة",
      PROFILE_COMPLETE: "ملف المريض مكتمل", INFORMATION_COMPLETE: "اكتملت المعلومات المطلوبة",
      CONSULTANT_ACCEPTED: "قبل الاستشاري التعيين", CLINICAL_ACCEPTED: "تم قبول المراجعة السريرية",
      PROPOSAL_NEEDS_REWORK: "يحتاج العرض إلى إعادة عمل",
    } as Record<string, string>,

    selectNode: "اختر مرحلة لإعدادها.", nodeName: "الاسم المعروض", nodeKey: "مفتاح المرحلة", nodeType: "نوع المرحلة",
    actorType: "نوع الفاعل", registeredAction: "الإجراء المسجَّل", noAction: "بدون إجراء (مرحلة تحكم)",
    blocking: "مانعة (لا يمكن للحالة المتابعة حتى الاكتمال)", optionalStage: "اختيارية",
    entryCondition: "شرط الدخول", exitCondition: "شرط الخروج", noCondition: "لا يوجد",
    conditionFact: "حقيقة العمل", conditionEquals: "يجب أن يساوي", conditionTrue: "صحيح", conditionFalse: "خطأ",
    sla: "مستوى الخدمة", dueMinutes: "الاستحقاق (دقائق)", reminderMinutes: "التذكير (دقائق)", escalationMinutes: "التصعيد (دقائق)",
    timerMinutes: "مدة المؤقّت (دقائق)", advancedKey: "متقدم: المفتاح التقني الثابت",

    edges: "الانتقالات", addTransition: "الاتصال بالخطوة التالية", editTransition: "تغيير هدف الفرع",
    removeTransition: "فصل", transitionFrom: "من", transitionTo: "إلى", transitionCondition: "شرط الفرع",
    noTransitions: "لا توجد انتقالات صادرة بعد.",

    nonDragToolbar: "أدوات التحرير (بدون سحب)", addBefore: "إضافة خطوة قبل", addAfter: "إضافة خطوة بعد",
    moveBefore: "نقل إلى الأسبق", moveAfter: "نقل إلى الأحدث", deleteNode: "حذف المرحلة", insertRecovery: "إدراج خطوة تعافٍ",
    confirmDeleteTitle: "حذف هذه المرحلة؟", confirmDeleteBody: "ترتبط بهذه المرحلة انتقالات؛ سيؤدي حذفها إلى إزالة تلك الانتقالات أيضًا.",
    confirmDelete: "حذف", cancel: "إلغاء", close: "إغلاق", save: "حفظ",

    validation: "التحقق", validationErrors: "أخطاء", validationWarnings: "تحذيرات", validationClean: "لا توجد مشاكل.",
    validationCanPublish: "يمكن إرسال هذا الإعداد.", focusOnGraph: "إظهار على المخطط",
    runValidation: "تشغيل التحقق",

    simulation: "المحاكاة", simulationFacts: "حقائق سيناريو تجريبي", runSimulation: "تشغيل المحاكاة",
    simulationPath: "المسار المتّبع", simulationOutcome: "النتيجة", noSimulationYet: "شغّل محاكاة لعرض المسار.",
    simulationSideEffectFree: "المحاكاة لا تُحدث أي أثر فعلي — لا يتم إنشاء حالة أو عنصر عمل أو إجراء مريض أو إشعار أو دفعة أو تعيين.",
    outcomes: {
      COMPLETED: "مكتملة", BLOCKED: "معلّقة", WAITING: "بانتظار", INVALID: "مدخل غير صالح", LOOP_LIMIT_EXCEEDED: "تجاوز حد التكرار",
    } as Record<string, string>,

    diff: "مقارنة الإصدارات", compareWith: "قارن مع", diffAdded: "أُضيف", diffRemoved: "أُزيل", diffChanged: "تغيّر",
    diffNoChanges: "لا توجد فروق جوهرية عن الإصدار المُقارَن.", selectCompareVersion: "اختر إصدارًا للمقارنة.",
    diffStageAdded: "أُضيفت مرحلة", diffStageRemoved: "أُزيلت مرحلة", diffActorChanged: "تغيّر الفاعل", diffActionChanged: "تغيّر الإجراء",
    diffLabelChanged: "تغيّر الاسم", diffBranchChanged: "تغيّر شرط الفرع", diffSlaChanged: "تغيّر مستوى الخدمة",
    diffTransitionAdded: "أُضيف انتقال", diffTransitionRemoved: "أُزيل انتقال",

    publishGovernance: "حوكمة النشر", publishConfirmTitle: "نشر إصدار الرحلة هذا؟",
    publishImmutableWarning: "الإصدارات المنشورة غير قابلة للتعديل. يتطلب أي تغيير مستقبلي مسودة إصدار جديدة.",
    publishPinningWarning: "تبقى الحالات الحالية على إصدار الرحلة الحالي الخاص بها ولا تُنقل تلقائيًا.",
    publishValidationState: "التحقق", publishSimulationState: "المحاكاة", publishMaterialChanges: "التغييرات الجوهرية منذ آخر إصدار منشور",
    confirmPublish: "تأكيد النشر", publishBlockedValidation: "أكمل محاكاة ناجحة وصالحة قبل إرسال هذا الإصدار أو نشره.",
    publishBlockedReview: "يجب أن يقوم مراجع مخوَّل آخر بنشر هذه الرحلة (أنت آخر من عدّل هذا الإصدار).",
    independentReviewRequired: "مطلوب مراجعة مستقلة",
    runtimeDeploymentImplication: "يؤدي النشر إلى نشر هذا الإصدار تشغيليًا بحيث يمكن للحالات الجديدة المؤهلة أن تبدأ عليه.",

    permission: { view: "journey.view", create: "journey.create", editDraft: "journey.edit_draft", validate: "journey.validate", simulate: "journey.simulate", submit: "journey.submit", publish: "journey.publish", approve: "journey.approve", retire: "journey.retire" },
  },
};

export function stageTypeLabel(type: string, locale: Locale): string { return journeyCopy[locale].stageTypes[type] ?? type; }
export function actorTypeLabel(type: string | null, locale: Locale): string { if (!type) return ""; return journeyCopy[locale].actorTypes[type] ?? type; }
export function journeyStatusLabel(status: string, locale: Locale): string { return journeyCopy[locale].status[status] ?? status; }
export function factLabel(fact: string, locale: Locale): string { return journeyCopy[locale].facts[fact] ?? fact; }
export function simulationOutcomeLabel(outcome: string, locale: Locale): string { return journeyCopy[locale].outcomes[outcome] ?? outcome; }
