import type { Locale } from "@/lib/i18n";

export const accessCopy = {
  en: { title:"Roles & Access", intro:"Define responsibilities, review capabilities and understand who can do what.",
    roles:"Role catalogue", permissions:"Capabilities", effective:"Effective access", audit:"Access history",
    loading:"Loading access governance…", denied:"You do not have access to this area. Ask your access governance manager.",
    error:"We could not complete this request. Refresh and try again.", retry:"Refresh", signin:"Sign in securely", back:"Back to workspace",
    newRole:"Create role", search:"Find a role", empty:"No results to show.", allowed:"Allowed", deniedAction:"Not allowed",
    future:"Available in a later phase", risk:"Sensitivity", scope:"Data scope", relationship:"Required relationship",
    version:"Version", history:"Version history", edit:"Create new draft", resume:"Configure draft", close:"Back to catalogue",
    purpose:"Role purpose", name:"Business name", description:"Description", base:"Base template", capabilities:"Business capabilities",
    steps:["Purpose","Base template","Capabilities","Data scope","Relationships","Sensitive data","Journey participation","Channels","Constraints","Simulate","Review & publish"],
    next:"Continue", previous:"Back", save:"Save draft", validate:"Validate configuration", publish:"Publish version", retire:"Retire version",
    reason:"Reason for change", effectiveDate:"Effective from", saved:"Draft saved.", valid:"Configuration validated.", invalid:"Resolve the following checks before publishing.",
    independent:"An independent authorized reviewer must publish. Published versions are preserved; assignments keep their selected version.",
    actor:"Journey participation", channel:"Channel access", none:"No additional relationship", noGrants:"No capabilities selected. This role grants no access.",
    subject:"Account identifier", organization:"Organization identifier", inspect:"Review access", simulate:"Check access", advanced:"Advanced details",
    preview:"Access preview", can:"Can — within the selected scope", cannot:"Cannot — outside the selected scope or without required relationships",
    futureHint:"Provider capabilities can be configured, but remain unavailable until provider verification and workflow checks are implemented.",
    dependency:"Required supporting capabilities were included.", conflicts:"Dependencies, conflicts and actor compatibility are checked by the service.",
    source:"Access source", status:"Status", revision:"Revision", changes:"Changes from the previous version", added:"Added", removed:"Removed", unchanged:"No capability changes.",
    pending:"Pending verification grants no access.", recent:"Sensitive actions require a recent sign-in. For another account, that condition cannot be confirmed here.",
    accessRead:"Access is evaluated for the platform governance context. Provider and case access requires verified resource context.",
    grant:"Grant access", revoke:"Revoke access", assignment:"Role assignment", roleVersion:"Published role version", noAccess:"No matching access assignment.",
    choose:"Choose", technical:"Registered capability", review:"Review", date:"Date", action:"Action", outcome:"Outcome",
  },
  ar: { title:"الأدوار والوصول", intro:"حدد المسؤوليات وراجع الصلاحيات وافهم ما يستطيع كل شخص القيام به.",
    roles:"دليل الأدوار", permissions:"الصلاحيات", effective:"الوصول الفعلي", audit:"سجل الوصول",
    loading:"جارٍ تحميل حوكمة الوصول…", denied:"ليس لديك وصول إلى هذه المساحة. تواصل مع مدير حوكمة الوصول.",
    error:"تعذر إكمال الطلب. حدّث الصفحة وحاول مجددًا.", retry:"تحديث", signin:"تسجيل الدخول الآمن", back:"العودة إلى مساحة العمل",
    newRole:"إنشاء دور", search:"البحث عن دور", empty:"لا توجد نتائج للعرض.", allowed:"مسموح", deniedAction:"غير مسموح",
    future:"متاح في مرحلة لاحقة", risk:"الحساسية", scope:"نطاق البيانات", relationship:"العلاقة المطلوبة",
    version:"الإصدار", history:"سجل الإصدارات", edit:"إنشاء مسودة جديدة", resume:"إعداد المسودة", close:"العودة إلى الدليل",
    purpose:"الغرض من الدور", name:"اسم الدور", description:"الوصف", base:"القالب الأساسي", capabilities:"صلاحيات الأعمال",
    steps:["الغرض","القالب الأساسي","الصلاحيات","نطاق البيانات","العلاقات","البيانات الحساسة","المشاركة في الرحلة","قنوات الوصول","الضوابط","المحاكاة","المراجعة والنشر"],
    next:"متابعة", previous:"رجوع", save:"حفظ المسودة", validate:"التحقق من الإعداد", publish:"نشر الإصدار", retire:"إيقاف الإصدار",
    reason:"سبب التغيير", effectiveDate:"ساري من", saved:"تم حفظ المسودة.", valid:"تم التحقق من الإعداد.", invalid:"عالج الملاحظات التالية قبل النشر.",
    independent:"يجب أن ينشر مراجع مستقل مخوّل هذا الدور. تُحفظ الإصدارات المنشورة وتبقى التعيينات مرتبطة بإصداراتها.",
    actor:"المشاركة في الرحلة", channel:"قناة الوصول", none:"لا توجد علاقة إضافية", noGrants:"لم يتم تحديد صلاحيات. لا يمنح هذا الدور أي وصول.",
    subject:"معرّف الحساب", organization:"معرّف المؤسسة", inspect:"مراجعة الوصول", simulate:"فحص الوصول", advanced:"تفاصيل متقدمة",
    preview:"معاينة الوصول", can:"يمكن — ضمن النطاق المحدد", cannot:"لا يمكن — خارج النطاق أو دون العلاقات المطلوبة",
    futureHint:"يمكن إعداد صلاحيات مقدمي الرعاية، لكنها تبقى غير متاحة حتى اكتمال التحقق من المؤسسات وضوابط الرحلة.",
    dependency:"تم تضمين الصلاحيات الداعمة المطلوبة.", conflicts:"تتحقق الخدمة من المتطلبات والتعارضات وتوافق المشاركة.",
    source:"مصدر الوصول", status:"الحالة", revision:"المراجعة", changes:"التغييرات مقارنة بالإصدار السابق", added:"إضافة", removed:"إزالة", unchanged:"لا توجد تغييرات في الصلاحيات.",
    pending:"لا تمنح التعيينات المعلقة أي وصول.", recent:"تتطلب الإجراءات الحساسة تسجيل دخول حديثًا. لا يمكن تأكيد هذا الشرط لحساب آخر هنا.",
    accessRead:"يُقيّم الوصول في سياق حوكمة المنصة. يتطلب وصول المؤسسات والحالات سياق موارد موثّقًا.",
    grant:"منح الوصول", revoke:"إلغاء الوصول", assignment:"تعيين الدور", roleVersion:"إصدار الدور المنشور", noAccess:"لا يوجد تعيين وصول مطابق.",
    choose:"اختر", technical:"الصلاحية المسجلة", review:"مراجعة", date:"التاريخ", action:"الإجراء", outcome:"النتيجة",
  }
};
const roleNames:Record<string,string> = {"PLATFORM_OWNER":"مالك رحلة الشفاء","ACCESS_GOVERNANCE_MANAGER":"مدير حوكمة الوصول","PLATFORM_ADMIN":"مسؤول النظام","PROVIDER_OPERATIONS_MANAGER":"مدير عمليات مقدمي الرعاية","CREDENTIAL_VERIFIER":"مسؤول التحقق من الاعتماد","JOURNEY_MANAGER":"مدير الرحلات","JOURNEY_APPROVER":"معتمد الرحلات","CARE_COORDINATION_MANAGER":"مدير تنسيق الرعاية","COMPLIANCE_AUDITOR":"مراجع الامتثال والتدقيق","SUPPORT_AGENT":"مسؤول الدعم","ORGANIZATION_OWNER":"مالك المؤسسة","PRACTICE_MANAGER":"مدير العيادة","CONSULTANT":"استشاري","ASSOCIATE_DOCTOR":"طبيب مشارك","CONSULTANT_ASSISTANT":"مساعد الاستشاري","COORDINATOR":"منسق الرعاية","OPERATIONS":"أخصائي العمليات","FINANCE":"مسؤول المالية","SERVICE_ACCOUNT":"حساب خدمة التكامل"};
const labels:Record<string,[string,string]> = {
  PLATFORM:["Platform governance","حوكمة المنصة"], SELF:["Own information","المعلومات الشخصية"], ASSIGNED_CASES:["Assigned cases","الحالات المسندة"],
  MANAGED_CLINICIANS:["Managed clinicians","الأطباء تحت الإدارة"], ORGANIZATION:["One organization","مؤسسة واحدة"],
  ASSIGNED_ORGANIZATIONS:["Assigned organizations","المؤسسات المسندة"], SPECIFIC_RESOURCE:["A specific resource","مورد محدد"],
  GOVERNANCE:["Governance","الحوكمة"], PRACTICE_OPERATIONS:["Practice operations","عمليات العيادة"], CONSULTANT:["Consultant","استشاري"],
  ASSOCIATE_DOCTOR:["Associate doctor","طبيب مشارك"], CLINICAL_SUPPORT:["Clinical support","الدعم السريري"], COORDINATOR:["Care coordination","تنسيق الرعاية"],
  OPERATIONS:["Operations","العمليات"], FINANCE:["Finance","المالية"], SERVICE:["Integration service","خدمة التكامل"], PATIENT:["Patient","المريض"], REPRESENTATIVE:["Representative","الممثل"],
  ADMIN_WEB:["Administration web","بوابة الإدارة"], STAFF_WEB:["Staff web","بوابة الموظفين"], CONSULTANT_WEB:["Consultant web","بوابة الاستشاري"],
  CONSULTANT_MOBILE:["Consultant mobile","تطبيق الاستشاري"], PRACTICE_MOBILE:["Practice mobile","تطبيق العيادة"], API:["Approved integrations","التكاملات المعتمدة"],
  DRAFT:["Draft","مسودة"], VALIDATED:["Validated","تم التحقق"], PUBLISHED:["Published","منشور"], RETIRED:["Retired","متوقف"], ACTIVE:["Active","نشط"], PENDING:["Pending verification","بانتظار التحقق"], REVOKED:["Revoked","ملغى"],
  LOW:["Low","منخفضة"], MEDIUM:["Moderate","متوسطة"], HIGH:["High","مرتفعة"], CRITICAL:["Critical — independent review","حساسة — مراجعة مستقلة"],
  MANAGES:["Manages the clinician","يدير الطبيب"], ASSISTS:["Assists the consultant","يساعد الاستشاري"], SUPERVISES:["Supervises the doctor","يشرف على الطبيب"],
  COORDINATES:["Coordinates the case","ينسق الحالة"], ASSIGNED_TO:["Assigned to the work","مسند إلى العمل"], VERIFIES:["Verifies the evidence","يتحقق من الأدلة"], REPRESENTS:["Represents the patient","يمثل المريض"],
  PREFERRED_COORDINATOR:["Preferred coordinator","المنسق المفضل"], PREFERRED_COORDINATOR_TEAM:["Preferred coordination team","فريق التنسيق المفضل"],
  ALLOWED:["All required conditions are met","جميع الشروط المطلوبة مستوفاة"], NO_MATCHING_GRANT:["No matching active capability","لا توجد صلاحية نشطة مطابقة"],
  INACTIVE_MEMBERSHIP:["No active membership in this organization","لا توجد عضوية نشطة في هذه المؤسسة"], UNVERIFIED_ORGANIZATION:["Organization verification is required","يلزم التحقق من المؤسسة"],
  UNAVAILABLE_CAPABILITY:["Capability is not available for use yet","الصلاحية غير متاحة للاستخدام بعد"], RESOURCE_UNRESOLVED:["Verified resource context is required","يلزم سياق مورد موثّق"],
  RECENT_AUTHENTICATION_REQUIRED:["Recent sign-in must be confirmed","يلزم تأكيد تسجيل دخول حديث"], RELATIONSHIP_REQUIRED:["Required relationship is missing","العلاقة المطلوبة غير موجودة"],
  SCOPE_MISMATCH:["Resource is outside the assigned scope","المورد خارج النطاق المسند"], SELF_VERIFICATION_PROHIBITED:["Self verification is prohibited","التحقق الذاتي محظور"],
  WORKFLOW_AUTHORITY_REQUIRED:["Current journey authority is required","يلزم تفويض المرحلة الحالية"], CONFLICTING_ACCESS:["Assignments conflict with separation of duties","التعيينات تتعارض مع فصل المسؤوليات"],
  AUTHENTICATION_REQUIRED:["Sign-in is required","يلزم تسجيل الدخول"], UNREGISTERED_PERMISSION:["Capability is not registered","الصلاحية غير مسجلة"],
  INVALID_CONFIGURATION:["Resolve draft dependencies and conflicts before simulation","عالج متطلبات المسودة وتعارضاتها قبل المحاكاة"],
  BOOTSTRAP:["Initial governance appointment","تعيين الحوكمة الأولي"], ADMINISTRATIVE:["Approved appointment","تعيين معتمد"],
};
export function businessLabel(key:string, locale:Locale) { return labels[key]?.[locale==="ar"?1:0] ?? (locale==="ar"?"تفاصيل الحوكمة":key.toLowerCase().replaceAll("_"," ")); }
export function roleLabel(role:{key:string;name:string},locale:Locale) { return locale==="ar" ? roleNames[role.key]??role.name : role.name; }
const family:Record<string,string>={access:"الوصول",provider:"مقدمي الرعاية",credential:"الاعتماد",availability:"التوافر",appointment:"المواعيد",service_catalog:"دليل الخدمات",price_list:"قوائم الأسعار",clinical:"الرعاية السريرية",finance:"المالية",journey:"الرحلات",assignment:"التعيينات",audit:"التدقيق",support:"الدعم",integration:"التكامل"};
export function familyLabel(key:string,locale:Locale) { return locale==="ar"?family[key]??key:key.replaceAll("_"," "); }
const accessArabic:Record<string,string>={"access.role.view":"عرض الأدوار والصلاحيات","access.role.create":"إنشاء قوالب الأدوار","access.role.edit_draft":"إعداد مسودات الأدوار","access.role.simulate":"محاكاة الوصول","access.role.publish":"نشر إصدارات الأدوار","access.role.retire":"إيقاف إصدارات الأدوار","access.assignment.manage":"منح الوصول وإلغاؤه","access.relationship.manage":"إدارة علاقات التفويض","access.effective_access.view":"مراجعة الوصول الفعلي","access.audit.view":"مراجعة سجل الوصول"};
const words:Record<string,string>={view:"عرض",create:"إنشاء",update:"تحديث",activate:"تفعيل",suspend:"تعليق",member:"الأعضاء",invite:"دعوة",deactivate:"إلغاء التفعيل",clinician:"الطبيب",practice_staff:"موظفي العيادة",manage:"إدارة",submit:"تقديم",review:"مراجعة",request_information:"طلب معلومات",verify:"تحقق",reject:"رفض",manage_self:"إدارة التوافر الشخصي",schedule:"جدولة",reschedule:"إعادة جدولة",cancel:"إلغاء",publish:"نشر",case:"الحالة",document:"المستندات",recommendation:"التوصية",draft:"إعداد مسودة",outcome:"النتيجة",record:"تسجيل",export:"تصدير",deposit:"الدفعة",confirm:"تأكيد",waive:"إعفاء",refund:"استرداد",reconcile:"مطابقة",edit_draft:"تعديل المسودة",validate:"تحقق من الإعداد",simulate:"محاكاة",approve:"اعتماد",retire:"إيقاف",instance_migrate:"نقل الرحلة",team:"الفريق",policy:"السياسة",manual_assign:"تعيين يدوي",reassign:"إعادة تعيين",audit:"التدقيق",account:"الحساب",invitation:"الدعوة",resend:"إعادة إرسال",invoke:"تشغيل"};
export function permissionLabel(p:{key:string;name:string;family:string},locale:Locale) {
  return locale==="en"?p.name:accessArabic[p.key]??p.key.split(".").slice(1).reverse().map(v=>words[v]??"").join(" ")+" — "+familyLabel(p.family,locale);
}
