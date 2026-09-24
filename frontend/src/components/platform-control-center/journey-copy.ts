import type { Locale } from "@/lib/i18n";

/*
 * Care Journeys vocabulary (UX-8): the business process first — journey, version, step, who acts, action, condition,
 * next step, check, test, send for approval, publish, retire. Engine words (runtime, deployment, compiler, artifact,
 * hash, keys) appear only under Advanced. Every consequence sentence restates JourneyDefinitionService /
 * JourneyAdmissionDecisionService behaviour; nothing here decides a lifecycle rule.
 */
export const journeyCopy = {
  en: {
    navJourneys: "Journeys",
    title: "Care Journeys", intro: "The coordination processes patient cases follow: what is published, what is being changed and what needs review.",
    loading: "Loading…", denied: "You do not have access to this area.",
    error: "We could not complete this request. Refresh and try again.", retry: "Refresh", signin: "Sign in securely",
    back: "Back to workspace", backToJourneys: "Back to journeys", backToVersions: "Back to the journey",
    reason: "Change note", reasonHint: "What this draft changes. Saved in the journey history with each save, check, test and approval request (max 500 characters).", reasonRequired: "A change note is required.",
    publishReason: "Why are you publishing this version?", retireReason: "Why are you retiring this version?", copyReason: "Why are you making this change?",
    reasonNotStored: "Saved in the journey history with this action (max 500 characters).",
    historyReason: "Reason", reasonNotRecorded: "Reason not recorded",
    staleTitle: "This journey changed", staleMessage: "Someone else saved a change to this version. Reload it before saving again.", reload: "Reload",
    breadcrumbJourneys: "Journeys", breadcrumbVersions: "Versions", breadcrumbDesigner: "Design",

    journeyList: "Journeys", journeyListEmpty: "No care journey has been created yet.", newJourney: "New journey", createJourney: "Create journey",
    createIntro: "This creates the platform's care journey with an empty draft you can design next. Only one care journey is supported.",
    journeyName: "Name", journeyKey: "Journey key", createdAt: "Created", openVersions: "Open journey",
    liveNow: "Published", noLive: "Nothing published yet", changeInProgress: "Change in progress", noChange: "No change in progress",
    lastActivity: "Last activity", publishedOn: "Published on", retiredOn: "Retired on", versionsCount: (n: number) => `${n} version${n === 1 ? "" : "s"}`,
    attention: { PENDING_APPROVAL: "Needs approval", SIMULATED: "Ready to send for approval" } as Record<string, string>,

    journey: "Journey", versions: "Versions & history", versionNumber: "Version", noVersions: "No versions yet.", cloneVersion: "Edit a copy",
    cloneIntro: (n: number) => `Creates a new draft from version ${n}. The published version stays as it is.`,
    openDesigner: "Open", openDraft: "Open draft", reviewDraft: "Review for approval", viewVersion: "View",
    history: "History", historyEmpty: "No history recorded yet.", showHistory: "Show history",
    historyActions: {
      JOURNEY_CREATED: "Journey created", JOURNEY_VERSION_CREATED: "New draft created", JOURNEY_DRAFT_UPDATED: "Draft saved", JOURNEY_VALIDATED: "Checked",
      JOURNEY_SIMULATED: "Tested", JOURNEY_SUBMITTED: "Sent for approval", JOURNEY_RETURNED: "Returned to draft", JOURNEY_PUBLISHED: "Published",
      JOURNEY_RETIRED: "Retired", JOURNEY_DEPLOYED: "Runtime prepared", ACCESS_DENIED: "Action refused",
    } as Record<string, string>,
    historyOutcome: { BLOCKED: "Found problems", DENIED: "Refused", FAILURE: "Failed" } as Record<string, string>,
    runtimeStatus: "Runtime deployment", deployed: "Deployed", notDeployed: "Not deployed", deployVersion: "Deploy",
    publishedDate: "Published", retiredDate: "Retired", noPublished: "Nothing published yet.", noDraft: "No change in progress.",
    currentDraft: "Change in progress", currentPublished: "Published version", compilerVersion: "Compiler version", artifactHash: "Artifact hash",
    graphHash: "Configuration hash", versionId: "Version ID", createdBy: "Created by (account)", journeyId: "Journey ID",
    advanced: "Advanced — technical details", advancedIntro: "For support and engineering. Loaded only when opened.", showRuntime: "Load runtime details",
    nextStep: {
      DRAFT: "Next: finish the design, then run a check.", VALIDATED: "Next: test the journey.", SIMULATED: "Next: send it for approval.",
      PENDING_APPROVAL: "Waiting for an independent reviewer to publish it, or return it to draft.",
    } as Record<string, string>,

    intakeTitle: "New patient cases",
    intakeOff: "Production intake is off: new patient cases don't use Care Journeys yet. Publishing a version does not turn it on — that is a separate deployment setting.",
    intakeOn: "Production intake is on for the configured care areas: new cases there start on the newest published version.",
    intakeUnknown: "Couldn't check whether production intake is on.",

    status: {
      DRAFT: "Draft", VALIDATED: "Draft · checked", SIMULATED: "Draft · tested", PENDING_APPROVAL: "Waiting for approval", PUBLISHED: "Published", RETIRED: "Retired",
    } as Record<string, string>,

    designer: "Design", palette: "Steps", inspector: "Step details", canvas: "Journey map",
    stageList: "Steps in order", switchToGraph: "Switch to map view", switchToList: "Switch to list view",
    addStage: "Add step", saveDraft: "Save draft", saved: "Saved", unsaved: "Unsaved changes",
    validate: "Check", simulate: "Test", submit: "Send for approval", publish: "Publish", retire: "Retire",
    retireVersion: "Retire version", retireConfirmTitle: "Retire this published version?", retireConfirm: "Yes, retire version",
    retireNoNewCases: (n: number) => `Version ${n} is no longer used for new patient cases.`,
    retireReplacement: (n: number) => `Version ${n}, the newest remaining published version, would be used for new cases while production intake is on.`,
    retireNoReplacement: "No published version would remain, so new cases could not start on this journey while production intake is on.",
    retireKeepsCases: "Cases already on this version stay on it and are not moved.",
    retireFinal: "A retired version can't be published again — to reuse it, edit a copy.",
    returnToDraft: "Return to draft", cloneToEdit: "Published versions can't be edited. Use Edit a copy from the journey page to make changes.",

    stageTypes: {
      START: "Start", STAFF_TASK: "Staff step", PATIENT_ACTION: "Patient step", DECISION: "Decision",
      SYSTEM_ACTION: "Automatic step", WAIT: "Wait", TIMER: "Timer", NOTIFICATION: "Notification", END: "End",
    } as Record<string, string>,

    actorTypes: {
      PATIENT: "Patient", REPRESENTATIVE: "Representative", COORDINATOR: "Coordinator", CONSULTANT: "Consultant",
      ASSOCIATE_DOCTOR: "Associate Doctor", PRACTICE_STAFF: "Practice Staff", OPERATIONS: "Operations",
      FINANCE: "Finance", PLATFORM_STAFF: "Platform Staff", SYSTEM: "System",
    } as Record<string, string>,

    facts: {
      PROPOSAL_ACCEPTED: "Patient accepted the proposal", DEPOSIT_SATISFIED: "Coordination deposit settled",
      PROFILE_COMPLETE: "Patient profile complete", INFORMATION_COMPLETE: "Requested information complete",
      CONSULTANT_ACCEPTED: "Consultant accepted the assignment", CLINICAL_ACCEPTED: "Clinical review accepted",
      PROPOSAL_NEEDS_REWORK: "Proposal needs rework",
    } as Record<string, string>,

    selectNode: "Select a step to see and change its details.", nodeName: "Display name", nodeKey: "Step key", nodeType: "Step type",
    actorType: "Who acts", registeredAction: "Action", noAction: "No action (flow control)",
    blocking: "Blocking (the case cannot continue until this is done)", optionalStage: "Optional",
    entryCondition: "Starts when", exitCondition: "Completes when", noCondition: "None",
    conditionFact: "Condition", conditionEquals: "Must be", conditionTrue: "Yes", conditionFalse: "No",
    sla: "Service level", dueMinutes: "Due (minutes)", reminderMinutes: "Reminder (minutes)", escalationMinutes: "Escalation (minutes)",
    timerMinutes: "Timer duration (minutes)", advancedKey: "Advanced: immutable technical key",

    edges: "Next steps", addTransition: "Connect to next step", editTransition: "Change the next step",
    removeTransition: "Disconnect", transitionFrom: "From", transitionTo: "Next step", transitionCondition: "Only when",
    noTransitions: "No next step yet.",

    nonDragToolbar: "Editing tools (no drag required)", addBefore: "Add step before", addAfter: "Add step after",
    moveBefore: "Move earlier", moveAfter: "Move later", deleteNode: "Delete step", insertRecovery: "Insert recovery step",
    confirmDeleteTitle: "Delete this step?", confirmDeleteBody: "This step is connected to other steps. Deleting it also removes those connections.",
    confirmDelete: "Delete", cancel: "Cancel", close: "Close", save: "Save",

    validation: "Check", validationErrors: "Problems to fix", validationWarnings: "Notes", validationClean: "No problems found. You can test the journey next.",
    validationCanPublish: "No problems to fix. You can test the journey next.", focusOnGraph: "Go to step", issueIn: "Step",
    runValidation: "Run check", checkIntro: "The platform checks the design against its rules. Checking changes nothing for cases.",
    issueCode: "Technical code",
    issueSummary: (n: number) => `${n} problem${n === 1 ? "" : "s"} must be fixed before this version can be tested.`,

    simulation: "Test", testTitle: "Test journey", simulationFacts: "Test scenario: what is true for this pretend case", runSimulation: "Run test",
    simulationPath: "Steps the test case went through", simulationOutcome: "Result", noSimulationYet: "Run a test to see the path a case would take.",
    simulationSideEffectFree: "Testing does not publish or change the live journey. Nothing real is created — no case, work item, patient task, notification, payment or assignment.",
    stepStates: { EXPECTED: "Reached", COMPLETED: "Completed", WAITING: "Waiting", BLOCKED: "Blocked", SKIPPED: "Skipped" } as Record<string, string>,
    outcomes: {
      COMPLETED: "Completed", BLOCKED: "Blocked", WAITING: "Waiting", INVALID: "Invalid input", LOOP_LIMIT_EXCEEDED: "Loop limit exceeded",
    } as Record<string, string>,

    diff: "Compare versions", compareWith: "Compare with", diffAdded: "Added", diffRemoved: "Removed", diffChanged: "Changed",
    diffNoChanges: "No material differences from the compared version.", selectCompareVersion: "Select a version to compare.",
    diffStageAdded: "Step added", diffStageRemoved: "Step removed", diffActorChanged: "Who acts changed", diffActionChanged: "Action changed",
    diffLabelChanged: "Name changed", diffBranchChanged: "Condition changed", diffSlaChanged: "Service level changed",
    diffTransitionAdded: "Connection added", diffTransitionRemoved: "Connection removed",

    publishGovernance: "Approval & publishing", publishConfirmTitle: "Publish this journey version?",
    stepCheck: "Check", stepTest: "Test", stepSubmit: "Send for approval", stepPublish: "Publish by an independent reviewer",
    stepDone: "Done", stepWaiting: "Not yet", stepPassed: "Passed",
    makerChecker: "The person who publishes must not have edited this version. The platform enforces this.",
    makerCheckerYou: "You created this version, so another authorized person must publish it.",
    publishBecomes: (n: number, name: string) => `Version ${n} becomes a published version of ${name}. It can't be edited after publishing; changes need a new draft.`,
    publishNewCases: "While production intake is on, new patient cases start on the newest published version — this one.",
    publishKeepsCases: "Cases already on an earlier version stay on it and are not moved. Earlier published versions stay published until retired.",
    publishRuntime: "Where the journey runtime is enabled, it is prepared for this version automatically (details under Advanced).",
    publishMaterialChanges: (n: number) => `${n} change${n === 1 ? "" : "s"} since the last published version.`,
    confirmPublish: "Yes, publish version", publishBlockedValidation: "Complete a successful test before this version can be sent for approval or published.",
    publishBlockedReview: "Another authorized reviewer must publish this journey (you edited this version).",
    noPublishPermission: "Publishing needs both the publish and approve permissions.",
    independentReviewRequired: "Independent review required",
    published: "Version published.", submitted: "Sent for approval.", returned: "Returned to draft.", retiredDone: "Version retired.",

    permission: { view: "journey.view", create: "journey.create", editDraft: "journey.edit_draft", validate: "journey.validate", simulate: "journey.simulate", submit: "journey.submit", publish: "journey.publish", approve: "journey.approve", retire: "journey.retire" },
  },
  ar: {
    navJourneys: "الرحلات",
    title: "رحلات الرعاية", intro: "عمليات التنسيق التي تتبعها حالات المرضى: ما المنشور، وما الذي يتغيّر، وما الذي يحتاج مراجعة.",
    loading: "جارٍ التحميل…", denied: "ليس لديك وصول إلى هذه المساحة.",
    error: "تعذر إكمال الطلب. حدّث الصفحة وحاول مجددًا.", retry: "تحديث", signin: "تسجيل الدخول الآمن",
    back: "العودة إلى مساحة العمل", backToJourneys: "العودة إلى الرحلات", backToVersions: "العودة إلى الرحلة",
    reason: "ملاحظة التغيير", reasonHint: "ما الذي تغيّره هذه المسودة. تُحفظ في سجل الرحلة مع كل حفظ وفحص واختبار وطلب موافقة (بحد أقصى 500 حرف).", reasonRequired: "ملاحظة التغيير مطلوبة.",
    publishReason: "لماذا تنشر هذا الإصدار؟", retireReason: "لماذا تُنهي هذا الإصدار؟", copyReason: "لماذا تُجري هذا التغيير؟",
    reasonNotStored: "يُحفظ في سجل الرحلة مع هذا الإجراء (بحد أقصى 500 حرف).",
    historyReason: "السبب", reasonNotRecorded: "لم يُسجَّل سبب",
    staleTitle: "تغيّرت هذه الرحلة", staleMessage: "قام شخص آخر بحفظ تغيير على هذا الإصدار. أعد تحميله قبل الحفظ مجددًا.", reload: "إعادة تحميل",
    breadcrumbJourneys: "الرحلات", breadcrumbVersions: "الإصدارات", breadcrumbDesigner: "التصميم",

    journeyList: "الرحلات", journeyListEmpty: "لم تُنشأ أي رحلة رعاية بعد.", newJourney: "رحلة جديدة", createJourney: "إنشاء رحلة",
    createIntro: "يُنشئ هذا رحلة الرعاية للمنصة بمسودة فارغة يمكنك تصميمها بعد ذلك. تُدعم رحلة رعاية واحدة فقط.",
    journeyName: "الاسم", journeyKey: "مفتاح الرحلة", createdAt: "تاريخ الإنشاء", openVersions: "فتح الرحلة",
    liveNow: "المنشور", noLive: "لم يُنشر شيء بعد", changeInProgress: "تغيير قيد العمل", noChange: "لا يوجد تغيير قيد العمل",
    lastActivity: "آخر نشاط", publishedOn: "نُشر في", retiredOn: "أُنهي في", versionsCount: (n: number) => `${n} إصدار`,
    attention: { PENDING_APPROVAL: "يحتاج موافقة", SIMULATED: "جاهز للإرسال للموافقة" } as Record<string, string>,

    journey: "الرحلة", versions: "الإصدارات والسجل", versionNumber: "الإصدار", noVersions: "لا توجد إصدارات بعد.", cloneVersion: "تعديل نسخة",
    cloneIntro: (n: number) => `يُنشئ مسودة جديدة من الإصدار ${n}. يبقى الإصدار المنشور كما هو.`,
    openDesigner: "فتح", openDraft: "فتح المسودة", reviewDraft: "المراجعة للموافقة", viewVersion: "عرض",
    history: "السجل", historyEmpty: "لا يوجد سجل مسجل بعد.", showHistory: "عرض السجل",
    historyActions: {
      JOURNEY_CREATED: "أُنشئت الرحلة", JOURNEY_VERSION_CREATED: "أُنشئت مسودة جديدة", JOURNEY_DRAFT_UPDATED: "حُفظت المسودة", JOURNEY_VALIDATED: "فُحصت",
      JOURNEY_SIMULATED: "اختُبرت", JOURNEY_SUBMITTED: "أُرسلت للموافقة", JOURNEY_RETURNED: "أُعيدت إلى مسودة", JOURNEY_PUBLISHED: "نُشرت",
      JOURNEY_RETIRED: "أُنهيت", JOURNEY_DEPLOYED: "جُهّز التشغيل", ACCESS_DENIED: "رُفض الإجراء",
    } as Record<string, string>,
    historyOutcome: { BLOCKED: "وُجدت مشكلات", DENIED: "رُفض", FAILURE: "فشل" } as Record<string, string>,
    runtimeStatus: "النشر التشغيلي", deployed: "تم النشر التشغيلي", notDeployed: "لم يُنشر تشغيليًا", deployVersion: "نشر تشغيلي",
    publishedDate: "تاريخ النشر", retiredDate: "تاريخ الإنهاء", noPublished: "لم يُنشر شيء بعد.", noDraft: "لا يوجد تغيير قيد العمل.",
    currentDraft: "تغيير قيد العمل", currentPublished: "الإصدار المنشور", compilerVersion: "إصدار المترجم", artifactHash: "بصمة الحزمة",
    graphHash: "بصمة الإعداد", versionId: "معرّف الإصدار", createdBy: "أنشأه (الحساب)", journeyId: "معرّف الرحلة",
    advanced: "متقدم — تفاصيل تقنية", advancedIntro: "للدعم والهندسة. تُحمَّل عند الفتح فقط.", showRuntime: "تحميل تفاصيل التشغيل",
    nextStep: {
      DRAFT: "التالي: أكمل التصميم ثم شغّل الفحص.", VALIDATED: "التالي: اختبر الرحلة.", SIMULATED: "التالي: أرسلها للموافقة.",
      PENDING_APPROVAL: "بانتظار مراجع مستقل لنشرها، أو إعادتها إلى مسودة.",
    } as Record<string, string>,

    intakeTitle: "حالات المرضى الجديدة",
    intakeOff: "الاستقبال الفعلي متوقف: لا تستخدم حالات المرضى الجديدة رحلات الرعاية بعد. نشر إصدار لا يشغّله — فهو إعداد نشر منفصل.",
    intakeOn: "الاستقبال الفعلي يعمل لمجالات الرعاية المُعدّة: تبدأ الحالات الجديدة فيها على أحدث إصدار منشور.",
    intakeUnknown: "تعذّر التحقق مما إذا كان الاستقبال الفعلي يعمل.",

    status: {
      DRAFT: "مسودة", VALIDATED: "مسودة · مفحوصة", SIMULATED: "مسودة · مختبرة", PENDING_APPROVAL: "بانتظار الموافقة", PUBLISHED: "منشور", RETIRED: "منتهٍ",
    } as Record<string, string>,

    designer: "التصميم", palette: "الخطوات", inspector: "تفاصيل الخطوة", canvas: "خريطة الرحلة",
    stageList: "الخطوات بالترتيب", switchToGraph: "التبديل إلى عرض الخريطة", switchToList: "التبديل إلى عرض القائمة",
    addStage: "إضافة خطوة", saveDraft: "حفظ المسودة", saved: "تم الحفظ", unsaved: "تغييرات غير محفوظة",
    validate: "فحص", simulate: "اختبار", submit: "إرسال للموافقة", publish: "نشر", retire: "إنهاء",
    retireVersion: "إنهاء الإصدار", retireConfirmTitle: "إنهاء هذا الإصدار المنشور؟", retireConfirm: "نعم، أنهِ الإصدار",
    retireNoNewCases: (n: number) => `لن يُستخدم الإصدار ${n} للحالات الجديدة بعد الآن.`,
    retireReplacement: (n: number) => `سيُستخدم الإصدار ${n}، أحدث إصدار منشور متبقٍ، للحالات الجديدة ما دام الاستقبال الفعلي يعمل.`,
    retireNoReplacement: "لن يبقى أي إصدار منشور، لذا لا يمكن أن تبدأ حالات جديدة على هذه الرحلة ما دام الاستقبال الفعلي يعمل.",
    retireKeepsCases: "تبقى الحالات الموجودة على هذا الإصدار ولا تُنقل.",
    retireFinal: "لا يمكن نشر إصدار منتهٍ مرة أخرى — لإعادة استخدامه، عدّل نسخة منه.",
    returnToDraft: "الإعادة إلى مسودة", cloneToEdit: "لا يمكن تعديل الإصدارات المنشورة. استخدم «تعديل نسخة» من صفحة الرحلة لإجراء تغييرات.",

    stageTypes: {
      START: "بداية", STAFF_TASK: "خطوة موظف", PATIENT_ACTION: "خطوة مريض", DECISION: "قرار",
      SYSTEM_ACTION: "خطوة آلية", WAIT: "انتظار", TIMER: "مؤقّت", NOTIFICATION: "إشعار", END: "نهاية",
    } as Record<string, string>,

    actorTypes: {
      PATIENT: "المريض", REPRESENTATIVE: "الممثل", COORDINATOR: "المنسق", CONSULTANT: "الاستشاري",
      ASSOCIATE_DOCTOR: "الطبيب المشارك", PRACTICE_STAFF: "فريق العيادة", OPERATIONS: "العمليات",
      FINANCE: "المالية", PLATFORM_STAFF: "فريق المنصة", SYSTEM: "النظام",
    } as Record<string, string>,

    facts: {
      PROPOSAL_ACCEPTED: "قبل المريض العرض", DEPOSIT_SATISFIED: "سُدّدت وديعة التنسيق",
      PROFILE_COMPLETE: "ملف المريض مكتمل", INFORMATION_COMPLETE: "اكتملت المعلومات المطلوبة",
      CONSULTANT_ACCEPTED: "قبل الاستشاري التعيين", CLINICAL_ACCEPTED: "تم قبول المراجعة السريرية",
      PROPOSAL_NEEDS_REWORK: "يحتاج العرض إلى إعادة عمل",
    } as Record<string, string>,

    selectNode: "اختر خطوة لعرض تفاصيلها وتغييرها.", nodeName: "الاسم المعروض", nodeKey: "مفتاح الخطوة", nodeType: "نوع الخطوة",
    actorType: "من يتصرف", registeredAction: "الإجراء", noAction: "بدون إجراء (تحكم في المسار)",
    blocking: "مانعة (لا يمكن للحالة المتابعة حتى تكتمل)", optionalStage: "اختيارية",
    entryCondition: "تبدأ عندما", exitCondition: "تكتمل عندما", noCondition: "لا يوجد",
    conditionFact: "الشرط", conditionEquals: "يجب أن يكون", conditionTrue: "نعم", conditionFalse: "لا",
    sla: "مستوى الخدمة", dueMinutes: "الاستحقاق (دقائق)", reminderMinutes: "التذكير (دقائق)", escalationMinutes: "التصعيد (دقائق)",
    timerMinutes: "مدة المؤقّت (دقائق)", advancedKey: "متقدم: المفتاح التقني الثابت",

    edges: "الخطوات التالية", addTransition: "الاتصال بالخطوة التالية", editTransition: "تغيير الخطوة التالية",
    removeTransition: "فصل", transitionFrom: "من", transitionTo: "الخطوة التالية", transitionCondition: "فقط عندما",
    noTransitions: "لا توجد خطوة تالية بعد.",

    nonDragToolbar: "أدوات التحرير (بدون سحب)", addBefore: "إضافة خطوة قبل", addAfter: "إضافة خطوة بعد",
    moveBefore: "نقل إلى الأسبق", moveAfter: "نقل إلى الأحدث", deleteNode: "حذف الخطوة", insertRecovery: "إدراج خطوة تعافٍ",
    confirmDeleteTitle: "حذف هذه الخطوة؟", confirmDeleteBody: "ترتبط هذه الخطوة بخطوات أخرى؛ سيؤدي حذفها إلى إزالة تلك الروابط أيضًا.",
    confirmDelete: "حذف", cancel: "إلغاء", close: "إغلاق", save: "حفظ",

    validation: "الفحص", validationErrors: "مشكلات يجب إصلاحها", validationWarnings: "ملاحظات", validationClean: "لا توجد مشكلات. يمكنك اختبار الرحلة بعد ذلك.",
    validationCanPublish: "لا توجد مشكلات يجب إصلاحها. يمكنك اختبار الرحلة بعد ذلك.", focusOnGraph: "الانتقال إلى الخطوة", issueIn: "الخطوة",
    runValidation: "تشغيل الفحص", checkIntro: "تفحص المنصة التصميم وفق قواعدها. الفحص لا يغيّر شيئًا للحالات.",
    issueCode: "الرمز التقني",
    issueSummary: (n: number) => `يجب إصلاح ${n} مشكلة قبل اختبار هذا الإصدار.`,

    simulation: "الاختبار", testTitle: "اختبار الرحلة", simulationFacts: "سيناريو الاختبار: ما الصحيح لهذه الحالة التجريبية", runSimulation: "تشغيل الاختبار",
    simulationPath: "الخطوات التي مرت بها الحالة التجريبية", simulationOutcome: "النتيجة", noSimulationYet: "شغّل اختبارًا لرؤية المسار الذي ستسلكه الحالة.",
    simulationSideEffectFree: "الاختبار لا ينشر الرحلة المنشورة ولا يغيّرها. لا يُنشأ شيء حقيقي — لا حالة ولا عنصر عمل ولا مهمة مريض ولا إشعار ولا دفعة ولا تعيين.",
    stepStates: { EXPECTED: "وُصل إليها", COMPLETED: "اكتملت", WAITING: "بانتظار", BLOCKED: "متوقفة", SKIPPED: "تُخطّيت" } as Record<string, string>,
    outcomes: {
      COMPLETED: "مكتملة", BLOCKED: "متوقفة", WAITING: "بانتظار", INVALID: "مدخل غير صالح", LOOP_LIMIT_EXCEEDED: "تجاوز حد التكرار",
    } as Record<string, string>,

    diff: "مقارنة الإصدارات", compareWith: "قارن مع", diffAdded: "أُضيف", diffRemoved: "أُزيل", diffChanged: "تغيّر",
    diffNoChanges: "لا توجد فروق جوهرية عن الإصدار المُقارَن.", selectCompareVersion: "اختر إصدارًا للمقارنة.",
    diffStageAdded: "أُضيفت خطوة", diffStageRemoved: "أُزيلت خطوة", diffActorChanged: "تغيّر من يتصرف", diffActionChanged: "تغيّر الإجراء",
    diffLabelChanged: "تغيّر الاسم", diffBranchChanged: "تغيّر الشرط", diffSlaChanged: "تغيّر مستوى الخدمة",
    diffTransitionAdded: "أُضيف رابط", diffTransitionRemoved: "أُزيل رابط",

    publishGovernance: "الموافقة والنشر", publishConfirmTitle: "نشر إصدار الرحلة هذا؟",
    stepCheck: "الفحص", stepTest: "الاختبار", stepSubmit: "الإرسال للموافقة", stepPublish: "النشر بواسطة مراجع مستقل",
    stepDone: "تم", stepWaiting: "لم يتم بعد", stepPassed: "ناجح",
    makerChecker: "يجب ألّا يكون الناشر قد عدّل هذا الإصدار. تفرض المنصة ذلك.",
    makerCheckerYou: "أنت أنشأت هذا الإصدار، لذا يجب أن ينشره شخص مخوَّل آخر.",
    publishBecomes: (n: number, name: string) => `يصبح الإصدار ${n} إصدارًا منشورًا من ${name}. لا يمكن تعديله بعد النشر؛ تحتاج التغييرات إلى مسودة جديدة.`,
    publishNewCases: "ما دام الاستقبال الفعلي يعمل، تبدأ حالات المرضى الجديدة على أحدث إصدار منشور — هذا الإصدار.",
    publishKeepsCases: "تبقى الحالات الموجودة على إصدار سابق عليه ولا تُنقل. تبقى الإصدارات المنشورة السابقة منشورة حتى تُنهى.",
    publishRuntime: "حيث يكون تشغيل الرحلات مفعّلًا، يُجهَّز لهذا الإصدار تلقائيًا (التفاصيل في «متقدم»).",
    publishMaterialChanges: (n: number) => `${n} تغيير منذ آخر إصدار منشور.`,
    confirmPublish: "نعم، انشر الإصدار", publishBlockedValidation: "أكمل اختبارًا ناجحًا قبل إرسال هذا الإصدار للموافقة أو نشره.",
    publishBlockedReview: "يجب أن يقوم مراجع مخوَّل آخر بنشر هذه الرحلة (أنت عدّلت هذا الإصدار).",
    noPublishPermission: "يتطلب النشر صلاحيتي النشر والموافقة معًا.",
    independentReviewRequired: "مطلوب مراجعة مستقلة",
    published: "نُشر الإصدار.", submitted: "أُرسل للموافقة.", returned: "أُعيد إلى مسودة.", retiredDone: "أُنهي الإصدار.",

    permission: { view: "journey.view", create: "journey.create", editDraft: "journey.edit_draft", validate: "journey.validate", simulate: "journey.simulate", submit: "journey.submit", publish: "journey.publish", approve: "journey.approve", retire: "journey.retire" },
  },
};

/** Arabic wording for the backend's validation messages, keyed by issue code (copy only; the rule stays in JourneyGraphValidator). */
const ISSUE_AR: Record<string, (step: string) => string> = {
  ACTOR_REQUIRED: (s) => `${s} تحتاج إلى من يتصرف.`, CONTROL_ACTOR: (s) => `${s} يجب أن يتصرف فيها النظام.`, CONTROL_ACTION: (s) => `${s} لا يمكنها تنفيذ إجراء عمل.`,
  UNSUPPORTED_ACTION: (s) => `${s} تحتاج إلى إجراء مسجَّل مدعوم.`, ACTION_COMPATIBILITY: (s) => `إجراء ${s} لا يتوافق مع نوعها أو مع من يتصرف.`,
  OUTGOING_PATH: (s) => `${s} ليس لها خطوة تالية واحدة غير مشروطة؛ استخدم قرارًا للتفرعات.`, UNREACHABLE: (s) => `لا يمكن الوصول إلى ${s} من البداية.`,
  NO_COMPLETION: (s) => `${s} ليس لها مسار إلى النهاية.`, DECISION_OUTCOMES: (s) => `${s} تحتاج إلى مساري «نعم» و«لا» للشرط نفسه.`,
  END_OUTGOING: (s) => `${s} خطوة نهاية ولا يمكن أن تكون لها خطوة تالية.`, START_INCOMING: () => "لا يمكن الوصول إلى البداية من خطوة أخرى.", START_COUNT: () => "اختر بداية واحدة بالضبط.",
  NODE_LABEL: () => "أعطِ كل خطوة اسمًا لا يتجاوز 120 حرفًا.", WAIT_CONDITION: (s) => `${s} تحتاج إلى شرط اكتمال يصف الحدث المنتظر.`,
  INVALID_SLA: (s) => `${s} تحتاج إلى وقت استحقاق موجب، وتذكير قبله، وتصعيد عنده أو بعده.`, INVALID_TIMER: (s) => `${s} تحتاج إلى مدة مؤقّت موجبة على خطوة مؤقّت فقط.`,
  TERMINAL_METADATA: (s) => `${s} لا يمكن أن تحمل شروطًا أو مستوى خدمة أو مؤقّتًا.`, CYCLE_SELF_LOOP: (s) => `${s} لا يمكن أن تعود إلى نفسها.`,
  CYCLE_UNGATED: () => "يجب أن تتفرع حلقة التعافي من خطوة قرار على شرط عمل مدعوم.", CYCLE_NO_HUMAN_ACTION: () => "يجب أن تتضمن حلقة التعافي إجراءً واحدًا على الأقل لموظف أو مريض.",
  INVALID_CONDITION: () => "اختر شرط عمل مدعومًا وقيمة «نعم» أو «لا».", DANGLING_EDGE: () => "رابط يشير إلى خطوة غير موجودة.",
  RUNTIME_NOT_DEPLOYED: () => "الفحص والاختبار لا يغيّران الحالات: تستمر الحالات الموجودة على الرحلة الحالية.",
};
const ISSUE_EN: Record<string, string> = { RUNTIME_NOT_DEPLOYED: "Checking and testing never change cases: existing cases continue on the journey they are on." };
/** The backend's own message in English; an Arabic rendering of the same message by code; the backend text as the fallback. */
export function issueMessage(issue: { code: string; message: string }, locale: Locale, stepLabel?: string): string {
  if (locale === "ar") { const f = ISSUE_AR[issue.code]; return f ? f(stepLabel ? `«${stepLabel}»` : "هذه الخطوة") : issue.message; }
  return ISSUE_EN[issue.code] ?? issue.message;
}

export function stageTypeLabel(type: string, locale: Locale): string { return journeyCopy[locale].stageTypes[type] ?? type; }
export function actorTypeLabel(type: string | null, locale: Locale): string { if (!type) return ""; return journeyCopy[locale].actorTypes[type] ?? type; }
export function journeyStatusLabel(status: string, locale: Locale): string { return journeyCopy[locale].status[status] ?? status; }
export function factLabel(fact: string, locale: Locale): string { return journeyCopy[locale].facts[fact] ?? fact; }
export function simulationOutcomeLabel(outcome: string, locale: Locale): string { return journeyCopy[locale].outcomes[outcome] ?? outcome; }
export function historyActionLabel(action: string, locale: Locale): string { return journeyCopy[locale].historyActions[action] ?? action.replace(/^JOURNEY_/, "").replaceAll("_", " ").toLowerCase(); }
