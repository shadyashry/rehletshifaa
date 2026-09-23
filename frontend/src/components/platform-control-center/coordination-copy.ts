import type { Locale } from "@/lib/i18n";

export const coordCopy = {
  en: {
    navCoordination: "Care Coordination", orgList: "Choose a provider organization", noOrganizations: "No provider organizations are set up for care coordination yet.", search: "Find an organization",
    loading: "Loading…", denied: "You do not have access to this area.", error: "We could not complete this request. Refresh and try again.",
    signin: "Sign in securely", retry: "Refresh", back: "Back to Care Coordination", close: "Close", cancel: "Cancel", save: "Save", reason: "Reason",

    tabOverview: "Overview", tabTeams: "Coordinator teams", tabPreferences: "Routing preferences", tabPolicy: "Routing policy",
    tabSimulation: "Routing simulation", tabQueue: "Assignment queue", tabAudit: "Assignment history",

    overviewIntro: "Operational snapshot for care coordination in this provider organization.",
    activeTeams: "Active coordinator teams", unassignedWork: "Unassigned coordination work", recentDecisions: "Recent routing decisions",
    noRecentDecisions: "No routing decisions recorded yet.", viewQueue: "Open the queue", viewTeams: "Manage teams",

    teamName: "Team name", teamPurpose: "Purpose", teamStatus: "Status", teamActive: "Active", teamInactive: "Inactive",
    careAreas: "Care areas", languages: "Languages", timeZone: "Time zone", fallbackTeam: "Fallback team", none: "None",
    newTeam: "New team", editTeam: "Edit team", noTeams: "No coordinator teams configured yet.", members: "Members", capacity: "Capacity",
    memberCount: (n: number) => `${n} member${n === 1 ? "" : "s"}`, teamLead: "Team lead", addMember: "Add member", subject: "Account identifier",
    effectiveFrom: "Effective from", effectiveTo: "Effective to (optional)", memberActive: "Active membership", deactivateMember: "Deactivate",
    activateMember: "Reactivate", noMembers: "No members yet.", maximum: "Maximum caseload", onDuty: "On duty", setCapacity: "Update capacity",
    noCapacity: "No capacity record yet — add one before this coordinator can receive work.", commaSeparated: "Comma-separated, optional",

    consultants: "Consultants", choosePreferenceConsultant: "Choose a Consultant to view or set their routing preference.",
    preferredCoordinator: "Preferred coordinator", preferredTeam: "Preferred coordinator team", inheritDefault: "Inherit provider default",
    noPreference: "No preference set — this Consultant's cases route by team/capacity only.", savePreference: "Save preference",
    preferenceNote: "A preference is not a guaranteed assignment — the Assignment Engine still checks eligibility, capacity, scope and deterministic scoring before honoring it.",
    currentPreference: "Current preference", preferenceHistory: "Preference history", noPreferenceHistory: "No prior preference versions.",

    policyIntro: "Deterministic routing precedence, engineering-configured and versioned — not a free-form rule builder.",
    currentPolicy: "Current policy", noPolicy: "No routing policy is published for this provider yet.", publishPolicy: "Publish new version",
    capacityWeight: "Capacity weight", languageWeight: "Language weight", weightsNote: "Weights must sum to 100.",
    requireOnDuty: "Require on-duty", mandatoryLanguage: "Require language match", queueHours: "Queue escalation window (hours)",
    providerTeam: "Provider default team", defaultTeam: "Fallback default team", careAreaTeams: "Care-area team routing",
    waterfall: "Routing precedence (highest first)", advanced: "Show raw configuration",
    step1: "1. Continuity — the case's existing coordinator, if still eligible", step2: "2. Consultant's preferred coordinator, if eligible",
    step3: "3. Preferred / provider / care-area / default team pools, in order, then one level of team fallback",
    step4: "4. Best-scored eligible coordinator across all remaining pools (capacity + language weighting, deterministic tie-break)",
    step5: "5. No eligible coordinator — the work is queued for manager review",

    simulationIntro: "Explore a hypothetical routing outcome under the current live policy and capacity. This never creates work, changes a Case Owner, or notifies anyone.",
    simConsultant: "Consultant (optional — uses their saved preference)", simCareArea: "Care area", simLanguage: "Patient language",
    simPreferredCoordinator: "Override: preferred coordinator (optional)", simPreferredTeam: "Override: preferred team (optional)",
    runSimulation: "Run simulation", simResult: "Result", selectedCandidate: "Selected", noCandidateSelected: "No eligible coordinator",
    selectionPathLabel: "Path", eligibleCandidates: "Eligible candidates", excludedCandidates: "Excluded candidates", noneEligible: "Nobody is eligible under the current policy and capacity.",
    scoreLabel: "Score", capacityFactor: "Capacity factor", languageFactor: "Language match",

    queueIntro: "Coordination work items awaiting a coordinator. The Assignment Engine has already found nobody eligible or a manager moved it here manually.",
    noQueue: "No unassigned coordination work.", queueReason: "Reason", queuedAt: "Queued", dueAt: "Escalation due",
    manualAssign: "Assign", manualReassign: "Reassign", lookupCase: "Look up a case", caseId: "Case ID", lookUp: "Look up",
    caseNotFound: "This case has no coordination routing record yet, or you do not have access to it.",
    currentStatus: "Current routing status", currentMode: "Mode", currentRevision: "Revision", currentOwner: "Current coordinator (WorkItem)",
    caseOwnerNote: "Case Owner is the assigned Consultant/Doctor and is never changed by coordination routing — only the coordination WorkItem assignee is.",
    caseUnassigned: "Unassigned", chooseTarget: "Choose an eligible coordinator", chooseTeam: "Team (optional — defaults to the target's own team)",
    assignmentEffect: "Assignment effect", confirmAssign: "Confirm assignment", confirmReassign: "Confirm reassignment",
    reasonRequired: "A reason is required for this action.", staleWarning: "This case's routing changed since it was loaded. Reload before retrying.",
    ineligibleTarget: "This coordinator is not eligible for this case.",

    auditIntro: "Look up a case to see its full routing decision history — every shadow comparison, adoption, automatic route, manual assignment and reassignment.",
    noHistory: "No routing decisions recorded for this case.", decisionAt: "Decided", decisionMode: "Mode", decisionSource: "Source",
    decisionExplanation: "Explanation", previousOwner: "Previous coordinator", selectedOwner: "Selected coordinator", modeShadow: "Evaluation only — nothing changed", modeLive: "Applied to the case",
    notLiveTitle: "Coordinator for this case", notLiveBody: "Routing for this case is evaluation-only, so its coordinator can't be changed here — nothing you do on this screen would change the case. To change who coordinates this case, open it in the Staff Portal and use Transfer case.", lookupOpen: "Check coordinator assignment",

    exclusions: {
      ACCESS_OR_MEMBERSHIP_DENIED: "No active access grant to receive coordination work in this provider", STAFF_DISABLED: "Staff account disabled",
      NO_ACTIVE_TEAM: "Not an active member of an eligible team", CARE_AREA_MISMATCH: "Care area does not match", LANGUAGE_MISMATCH: "Required language does not match",
      OFF_DUTY: "Off duty", AT_CAPACITY: "At maximum caseload",
    } as Record<string, string>,
    paths: {
      CONTINUITY: "Continuity (existing coordinator)", PREFERRED_COORDINATOR: "Consultant's preferred coordinator", PREFERRED_TEAM: "Consultant's preferred team",
      PROVIDER_TEAM: "Provider default team", CARE_AREA_TEAM: "Care-area team", DEFAULT_TEAM: "Fallback default team",
      CONSULTANT_FALLBACK_TEAM: "Consultant's fallback team", FALLBACK_TEAM: "Provider fallback team", TEAM_FALLBACK: "Team-to-team fallback",
      SCORED_POOL: "Best-scored eligible coordinator", NO_ELIGIBLE_COORDINATOR: "No eligible coordinator (queued)",
      MANUAL_ASSIGN: "Manually assigned", MANUAL_REASSIGN: "Manually reassigned", MANUAL_QUEUE: "Manually queued",
    } as Record<string, string>,
  },
  ar: {
    navCoordination: "تنسيق الرعاية", orgList: "اختر مؤسسة مقدم رعاية", noOrganizations: "لا توجد بعد مؤسسات مقدمي رعاية مُعدّة لتنسيق الرعاية.", search: "البحث عن مؤسسة",
    loading: "جارٍ التحميل…", denied: "ليس لديك وصول إلى هذه المساحة.", error: "تعذر إكمال الطلب. حدّث الصفحة وحاول مجددًا.",
    signin: "تسجيل الدخول الآمن", retry: "تحديث", back: "العودة إلى تنسيق الرعاية", close: "إغلاق", cancel: "إلغاء", save: "حفظ", reason: "السبب",

    tabOverview: "نظرة عامة", tabTeams: "فرق التنسيق", tabPreferences: "تفضيلات التوجيه", tabPolicy: "سياسة التوجيه",
    tabSimulation: "محاكاة التوجيه", tabQueue: "قائمة التعيينات", tabAudit: "سجل التعيينات",

    overviewIntro: "لمحة تشغيلية عن تنسيق الرعاية في مؤسسة مقدم الرعاية هذه.",
    activeTeams: "فرق التنسيق النشطة", unassignedWork: "أعمال تنسيق غير معيّنة", recentDecisions: "أحدث قرارات التوجيه",
    noRecentDecisions: "لا توجد قرارات توجيه مسجلة بعد.", viewQueue: "فتح القائمة", viewTeams: "إدارة الفرق",

    teamName: "اسم الفريق", teamPurpose: "الغرض", teamStatus: "الحالة", teamActive: "نشط", teamInactive: "غير نشط",
    careAreas: "مجالات الرعاية", languages: "اللغات", timeZone: "المنطقة الزمنية", fallbackTeam: "الفريق الاحتياطي", none: "لا يوجد",
    newTeam: "فريق جديد", editTeam: "تعديل الفريق", noTeams: "لا توجد فرق تنسيق مهيأة بعد.", members: "الأعضاء", capacity: "السعة",
    memberCount: (n: number) => `${n} عضو`, teamLead: "قائد الفريق", addMember: "إضافة عضو", subject: "معرّف الحساب",
    effectiveFrom: "ساري من", effectiveTo: "ساري حتى (اختياري)", memberActive: "عضوية نشطة", deactivateMember: "إلغاء التفعيل",
    activateMember: "إعادة التفعيل", noMembers: "لا يوجد أعضاء بعد.", maximum: "الحد الأقصى للحالات", onDuty: "في الخدمة", setCapacity: "تحديث السعة",
    noCapacity: "لا يوجد سجل سعة بعد — أضف واحدًا قبل أن يتمكن هذا المنسق من استقبال العمل.", commaSeparated: "مفصولة بفواصل، اختياري",

    consultants: "الاستشاريون", choosePreferenceConsultant: "اختر استشاريًا لعرض أو تعيين تفضيل التوجيه الخاص به.",
    preferredCoordinator: "المنسق المفضل", preferredTeam: "فريق المنسق المفضل", inheritDefault: "وراثة الافتراضي الخاص بالمؤسسة",
    noPreference: "لا يوجد تفضيل محدد — تُوجَّه حالات هذا الاستشاري حسب الفريق/السعة فقط.", savePreference: "حفظ التفضيل",
    preferenceNote: "التفضيل ليس تعيينًا مضمونًا — يتحقق محرك التعيين دائمًا من الأهلية والسعة والنطاق والتسجيل الحتمي قبل اعتماده.",
    currentPreference: "التفضيل الحالي", preferenceHistory: "سجل التفضيلات", noPreferenceHistory: "لا توجد إصدارات تفضيل سابقة.",

    policyIntro: "أولوية توجيه حتمية، مهيأة هندسيًا وذات إصدارات — وليست أداة قواعد حرة.",
    currentPolicy: "السياسة الحالية", noPolicy: "لا توجد سياسة توجيه منشورة لهذه المؤسسة بعد.", publishPolicy: "نشر إصدار جديد",
    capacityWeight: "وزن السعة", languageWeight: "وزن اللغة", weightsNote: "يجب أن يكون مجموع الأوزان 100.",
    requireOnDuty: "يتطلب أن يكون في الخدمة", mandatoryLanguage: "يتطلب تطابق اللغة", queueHours: "نافذة التصعيد في القائمة (ساعات)",
    providerTeam: "فريق المؤسسة الافتراضي", defaultTeam: "الفريق الاحتياطي الافتراضي", careAreaTeams: "توجيه الفرق حسب مجال الرعاية",
    waterfall: "أولوية التوجيه (الأعلى أولاً)", advanced: "عرض الإعداد الخام",
    step1: "١. الاستمرارية — منسق الحالة الحالي، إن ظل مؤهلاً", step2: "٢. المنسق المفضل لدى الاستشاري، إن كان مؤهلاً",
    step3: "٣. مجموعات الفريق المفضل/فريق المؤسسة/فريق مجال الرعاية/الفريق الافتراضي، بالترتيب، ثم مستوى واحد من احتياط الفريق",
    step4: "٤. أفضل منسق مؤهل من حيث التقييم عبر كل المجموعات المتبقية (ترجيح السعة واللغة، وفصل التعادل الحتمي)",
    step5: "٥. لا يوجد منسق مؤهل — يوضع العمل في القائمة لمراجعة المدير",

    simulationIntro: "استكشف نتيجة توجيه افتراضية ضمن السياسة والسعة الحالية الفعلية. لا ينشئ هذا أي عمل، ولا يغيّر مالك الحالة، ولا يُخطر أحدًا.",
    simConsultant: "الاستشاري (اختياري — يستخدم تفضيله المحفوظ)", simCareArea: "مجال الرعاية", simLanguage: "لغة المريض",
    simPreferredCoordinator: "تجاوز: المنسق المفضل (اختياري)", simPreferredTeam: "تجاوز: الفريق المفضل (اختياري)",
    runSimulation: "تشغيل المحاكاة", simResult: "النتيجة", selectedCandidate: "المختار", noCandidateSelected: "لا يوجد منسق مؤهل",
    selectionPathLabel: "المسار", eligibleCandidates: "المرشحون المؤهلون", excludedCandidates: "المرشحون المستبعدون", noneEligible: "لا يوجد مؤهل ضمن السياسة والسعة الحالية.",
    scoreLabel: "النتيجة", capacityFactor: "عامل السعة", languageFactor: "تطابق اللغة",

    queueIntro: "عناصر عمل التنسيق بانتظار منسق. إما أن محرك التعيين لم يجد أحدًا مؤهلاً أو نقلها مدير يدويًا إلى هنا.",
    noQueue: "لا توجد أعمال تنسيق غير معيّنة.", queueReason: "السبب", queuedAt: "تاريخ الإدراج", dueAt: "موعد التصعيد",
    manualAssign: "تعيين", manualReassign: "إعادة تعيين", lookupCase: "البحث عن حالة", caseId: "رقم الحالة", lookUp: "بحث",
    caseNotFound: "لا يوجد سجل توجيه تنسيقي لهذه الحالة بعد، أو ليس لديك صلاحية الوصول إليها.",
    currentStatus: "حالة التوجيه الحالية", currentMode: "الوضع", currentRevision: "الإصدار", currentOwner: "المنسق الحالي (عنصر العمل)",
    caseOwnerNote: "مالك الحالة هو الاستشاري/الطبيب المعيَّن، ولا يغيّره توجيه التنسيق أبدًا — فقط المكلَّف بعنصر عمل التنسيق هو ما يتغير.",
    caseUnassigned: "غير معيّن", chooseTarget: "اختر منسقًا مؤهلاً", chooseTeam: "الفريق (اختياري — الافتراضي فريق الهدف نفسه)",
    assignmentEffect: "أثر التعيين", confirmAssign: "تأكيد التعيين", confirmReassign: "تأكيد إعادة التعيين",
    reasonRequired: "السبب مطلوب لهذا الإجراء.", staleWarning: "تغيّر توجيه هذه الحالة منذ تحميلها. أعد التحميل قبل المحاولة مجددًا.",
    ineligibleTarget: "هذا المنسق غير مؤهل لهذه الحالة.",

    auditIntro: "ابحث عن حالة لعرض سجل قرارات التوجيه الكامل الخاص بها — كل مقارنة ظلية، واعتماد، وتوجيه تلقائي، وتعيين يدوي، وإعادة تعيين.",
    noHistory: "لا توجد قرارات توجيه مسجلة لهذه الحالة.", decisionAt: "تاريخ القرار", decisionMode: "الوضع", decisionSource: "المصدر",
    decisionExplanation: "التفسير", previousOwner: "المنسق السابق", selectedOwner: "المنسق المختار", modeShadow: "تقييم فقط — لم يتغير شيء", modeLive: "طُبّق على الحالة",
    notLiveTitle: "منسق هذه الحالة", notLiveBody: "التوجيه لهذه الحالة للتقييم فقط، لذا لا يمكن تغيير منسقها من هنا — لن يغيّر أي إجراء في هذه الشاشة الحالة. لتغيير منسق الحالة، افتحها في بوابة الموظفين واستخدم «نقل الحالة».", lookupOpen: "التحقق من تعيين المنسق",

    exclusions: {
      ACCESS_OR_MEMBERSHIP_DENIED: "لا توجد صلاحية وصول نشطة لاستقبال عمل التنسيق في هذه المؤسسة", STAFF_DISABLED: "حساب الموظف معطّل",
      NO_ACTIVE_TEAM: "ليس عضوًا نشطًا في فريق مؤهل", CARE_AREA_MISMATCH: "مجال الرعاية غير مطابق", LANGUAGE_MISMATCH: "اللغة المطلوبة غير مطابقة",
      OFF_DUTY: "خارج الخدمة", AT_CAPACITY: "بلغ الحد الأقصى للحالات",
    } as Record<string, string>,
    paths: {
      CONTINUITY: "الاستمرارية (المنسق الحالي)", PREFERRED_COORDINATOR: "المنسق المفضل لدى الاستشاري", PREFERRED_TEAM: "الفريق المفضل لدى الاستشاري",
      PROVIDER_TEAM: "فريق المؤسسة الافتراضي", CARE_AREA_TEAM: "فريق مجال الرعاية", DEFAULT_TEAM: "الفريق الاحتياطي الافتراضي",
      CONSULTANT_FALLBACK_TEAM: "الفريق الاحتياطي للاستشاري", FALLBACK_TEAM: "الفريق الاحتياطي للمؤسسة", TEAM_FALLBACK: "احتياط من فريق إلى فريق",
      SCORED_POOL: "أفضل منسق مؤهل من حيث التقييم", NO_ELIGIBLE_COORDINATOR: "لا يوجد منسق مؤهل (في القائمة)",
      MANUAL_ASSIGN: "تم التعيين يدويًا", MANUAL_REASSIGN: "تمت إعادة التعيين يدويًا", MANUAL_QUEUE: "تم الإدراج في القائمة يدويًا",
    } as Record<string, string>,
  },
};

export const exclusionLabel = (code: string, locale: Locale): string => coordCopy[locale].exclusions[code] ?? code;
export const pathLabel = (code: string, locale: Locale): string => coordCopy[locale].paths[code] ?? code;
