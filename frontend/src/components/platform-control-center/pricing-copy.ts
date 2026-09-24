import type { Locale } from "@/lib/i18n";

/**
 * Commercial pricing vocabulary (UX-8). One set of business words for both engagement models:
 * Organization price · Clinician-specific price · Direct clinician price · Using organization price.
 * Every consequence sentence below restates backend behaviour (ProviderOperationalSetupService, PricingCatalogService);
 * nothing here decides which price applies — `GET …/prices/effective` does.
 */
export const pricingCopy = {
  en: {
    organizationPrice: "Organization price", clinicianPrice: "Clinician-specific price", directPrice: "Direct clinician price",
    usingOrganization: "Using organization price", overridesOrganization: "Overrides the organization price for this service",
    ownPriceOnly: "This clinician's own price — no organization price is in effect for this service",
    directSource: "From this clinician's Direct price list",
    organizationLabel: "Organization", appliesNow: "Price that applies now", noneApplies: "No price applies to this service yet.",
    appliesTo: "Applies to", appliesToOrganization: (org: string) => `Every clinician in ${org} (organization price)`,
    appliesToClinician: "Only this clinician (clinician-specific price)", thisOrganization: "this organization",
    levelOrganization: "Organization price", levelClinician: "Clinician-specific price",
    howChosenTitle: "How the price that applies is chosen",
    howChosen: [
      ["Organization price", "Set once for the organization; it applies to every clinician there who has no price of their own for the service."],
      ["Clinician-specific price", "When a clinician has their own price for a service, it is used instead of the organization price."],
    ] as [string, string][],
    howChosenNote: "Each service below says which price applies now and where it comes from, so you don't have to compare screens.",
    status: { current: "Current", scheduled: "Scheduled", ended: "Ended", draft: "Draft", awaiting: "Draft · awaiting clinician approval", approved: "Draft · approved by the clinician", retired: "Retired" },
    from: "From", until: "Until", noEnd: "no end date",
    newPrice: "New price", editDraft: "Edit draft", publish: "Publish", approve: "Record Consultant approval", retire: "Retire", cancel: "Cancel", save: "Save draft",
    onlyClinicianCanApprove: "Only the Consultant themselves can record this approval.",
    approvalRequired: "The clinician must approve this price before it can be published",
    approvalRequiredHint: "Only for a clinician-specific price: the clinician records the approval themselves.",
    serviceCode: "Service code", serviceName: "Service name", category: "Category", amount: "Amount", currency: "Currency",
    effectiveFrom: "Effective from", effectiveTo: "Effective until", optional: "optional",
    egpNote: "A clinician-specific price in another currency is also added to the clinician's case price list in EGP, converted at the rate on its effective date.",
    noPrices: "No prices configured yet.", noPricesBody: "Add a price, then publish it to make it live.",
    draftHint: "Saving keeps it as a draft. Nothing changes for cases until it is published.",
    technical: "Technical details", versionLabel: "Version", internalStatus: "Stored status", priceId: "Price ID",
    retireTitle: "Retire this price version?", retireConfirm: "Yes, retire price",
    retireNow: "It stops applying immediately: its end date is set to now.",
    retireOrgReplacement: (org: string) => `Clinicians in ${org} who don't have their own price for this service will then have no price for it until a new organization price is published. Clinician-specific prices are not affected.`,
    retireClinicianFallback: "After that, the organization price applies to this clinician for this service.",
    retireClinicianNone: "No organization price is in effect for this service, so this clinician will have no price for it until a new one is published.",
    retireCatalog: "It is also removed from the services this Consultant can choose in a case review.",
    retireKeeps: "Estimates and proposals already prepared keep the prices they were given.",
    retireFinal: "A retired price can't be reactivated — publish a new price to replace it.",
  },
  ar: {
    organizationPrice: "سعر الجهة", clinicianPrice: "سعر خاص بالطبيب", directPrice: "سعر الطبيب المباشر",
    usingOrganization: "يُطبَّق سعر الجهة", overridesOrganization: "يحل محل سعر الجهة لهذه الخدمة",
    ownPriceOnly: "سعر الطبيب الخاص — لا يوجد سعر جهة سارٍ لهذه الخدمة",
    directSource: "من قائمة أسعار الطبيب المباشر",
    organizationLabel: "الجهة", appliesNow: "السعر الساري الآن", noneApplies: "لا يوجد سعر سارٍ لهذه الخدمة بعد.",
    appliesTo: "يُطبَّق على", appliesToOrganization: (org: string) => `كل أطباء ${org} (سعر الجهة)`,
    appliesToClinician: "هذا الطبيب فقط (سعر خاص بالطبيب)", thisOrganization: "هذه الجهة",
    levelOrganization: "سعر الجهة", levelClinician: "سعر خاص بالطبيب",
    howChosenTitle: "كيف يُختار السعر المطبَّق",
    howChosen: [
      ["سعر الجهة", "يُحدَّد مرة واحدة للجهة، ويُطبَّق على كل طبيب فيها ليس له سعر خاص بالخدمة."],
      ["سعر خاص بالطبيب", "إذا كان للطبيب سعر خاص بخدمة ما، يُستخدم بدلًا من سعر الجهة."],
    ] as [string, string][],
    howChosenNote: "توضّح كل خدمة أدناه السعر الساري الآن ومصدره، فلا حاجة للمقارنة بين الشاشات.",
    status: { current: "الحالي", scheduled: "مجدول", ended: "انتهى", draft: "مسودة", awaiting: "مسودة · بانتظار موافقة الطبيب", approved: "مسودة · وافق عليها الطبيب", retired: "منتهٍ" },
    from: "من", until: "حتى", noEnd: "بلا تاريخ انتهاء",
    newPrice: "سعر جديد", editDraft: "تعديل المسودة", publish: "نشر", approve: "تسجيل موافقة الاستشاري", retire: "إنهاء", cancel: "إلغاء", save: "حفظ المسودة",
    onlyClinicianCanApprove: "يمكن للاستشاري نفسه فقط تسجيل هذه الموافقة.",
    approvalRequired: "يجب أن يوافق الطبيب على هذا السعر قبل نشره",
    approvalRequiredHint: "للسعر الخاص بالطبيب فقط: يسجّل الطبيب الموافقة بنفسه.",
    serviceCode: "رمز الخدمة", serviceName: "اسم الخدمة", category: "الفئة", amount: "المبلغ", currency: "العملة",
    effectiveFrom: "ساري من", effectiveTo: "ساري حتى", optional: "اختياري",
    egpNote: "يُضاف السعر الخاص بالطبيب بعملة أخرى أيضًا إلى قائمة أسعار حالات الطبيب بالجنيه المصري، محوَّلًا بسعر صرف تاريخ سريانه.",
    noPrices: "لا توجد أسعار بعد.", noPricesBody: "أضف سعرًا ثم انشره ليصبح ساريًا.",
    draftHint: "الحفظ يُبقيه مسودة. لا يتغير شيء للحالات حتى يُنشر.",
    technical: "تفاصيل تقنية", versionLabel: "الإصدار", internalStatus: "الحالة المخزّنة", priceId: "معرّف السعر",
    retireTitle: "إنهاء إصدار السعر هذا؟", retireConfirm: "نعم، أنهِ السعر",
    retireNow: "يتوقف تطبيقه فورًا: يُضبط تاريخ انتهائه على الآن.",
    retireOrgReplacement: (org: string) => `بعدها لن يكون لأطباء ${org} الذين ليس لهم سعر خاص بهذه الخدمة أي سعر لها حتى يُنشر سعر جهة جديد. لا تتأثر الأسعار الخاصة بالأطباء.`,
    retireClinicianFallback: "بعدها يُطبَّق سعر الجهة على هذا الطبيب لهذه الخدمة.",
    retireClinicianNone: "لا يوجد سعر جهة سارٍ لهذه الخدمة، لذا لن يكون لهذا الطبيب سعر لها حتى يُنشر سعر جديد.",
    retireCatalog: "ويُزال أيضًا من الخدمات التي يمكن لهذا الاستشاري اختيارها في مراجعة الحالة.",
    retireKeeps: "تحتفظ التقديرات والعروض المُعدّة مسبقًا بالأسعار التي قُدّمت بها.",
    retireFinal: "لا يمكن إعادة تفعيل سعر منتهٍ — انشر سعرًا جديدًا ليحل محله.",
  },
} as const;

export type PricingCopy = (typeof pricingCopy)[Locale];

type PriceTiming = { status: string; effectiveFrom: string; effectiveTo: string | null; consultantApprovalRequired: boolean; consultantApprovedBy: string | null };
export type PriceStage = "current" | "scheduled" | "ended" | "draft" | "awaiting" | "approved" | "retired";

/**
 * The business stage of one stored price version: its stored status plus its own effective dates. Presentation only —
 * which price applies to a clinician is never derived here (the backend resolver answers that).
 */
export function priceStage(p: PriceTiming, now = Date.now()): PriceStage {
  if (p.status === "RETIRED") return "retired";
  if (p.status === "DRAFT") return p.consultantApprovalRequired ? (p.consultantApprovedBy ? "approved" : "awaiting") : "draft";
  if (new Date(p.effectiveFrom).getTime() > now) return "scheduled";
  if (p.effectiveTo && new Date(p.effectiveTo).getTime() <= now) return "ended";
  return "current";
}
