"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { COUNTRIES, flagEmoji } from "@/lib/countries";
import type { Locale } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";

type Summary = { caseNumber: string; purpose: string; channel: string; destinationHint: string };
type Deposit = {
  required: boolean; status: string; currency: string;
  amountDue: number | null; amountPaid: number | null; balance: number | null; satisfied: boolean;
};
type AccountStatus = "NOT_PROVISIONED" | "SETUP_PENDING" | "ACTIVE";
type Account = { status: AccountStatus; emailHint: string | null; awaitingEmail: boolean; emailSent: boolean };
type Prefill = {
  caseNumber: string; caseStatus: string; onboardingState: string | null; profileActive: boolean; accountLinked: boolean; account: Account;
  givenName: string | null; familyName: string | null; preferredName: string | null; legacyFullName: string | null; nameConfirmationRequired: boolean;
  candidateEmail: string | null; emailVerified: boolean;
  knownMobile: string | null; mobileOwner: "PATIENT" | "REPRESENTATIVE" | null; phoneVerified: boolean;
  dateOfBirth: string | null; nationality: string | null; countryOfResidence: string | null; preferredLanguage: string | null; sex: string | null;
  submittedBy: "PATIENT" | "REPRESENTATIVE"; representativeName: string | null; representativeRelationship: string | null;
  requiredConsents: string[]; completedConsents: string[]; deposit: Deposit;
  currentAction?: PatientAction; journeyStage?: JourneyStage; waitingOn?: string | null;
};
type FieldError = { field: string; message: string };
type Form = {
  givenName: string; familyName: string; singleLegalName: boolean; preferredName: string;
  email: string; emailChoice: "candidate" | "other"; phone: string; mobileOwner: "PATIENT" | "REPRESENTATIVE" | "";
  dateOfBirth: string; nationality: string; countryOfResidence: string; preferredLanguage: string; sex: string;
};

const copy = {
  en: {
    eyebrow: "Continue your care",
    verifyTitle: "Let's confirm it's you",
    verifyIntro: "For your security we'll send a 6-digit code to",
    sendCode: "Send code", sending: "Sending…", resend: "Send a new code",
    codeLabel: "6-digit code", verify: "Continue", verifying: "Checking…",
    useEmail: "Send to email instead", useWhatsapp: "Send to WhatsApp instead",
    formTitle: "Complete your profile",
    formIntro: "We've filled in what you already shared. Please review it and complete what's missing.",
    prefilledNote: "Pre-filled from your case",
    legacyNameTitle: "Please confirm your name",
    legacyNameIntro: (n: string) => `We have your name as “${n}”. Please enter it as given name(s) and family name so it matches your records — we never split names automatically.`,
    submittedByRep: (n: string, r: string) => `This case was submitted by ${n} (${r}). The details below are about the patient.`,
    sectionAbout: "Personal details", sectionContact: "Contact", sectionAgreements: "Agreements",
    givenName: "Given name(s)", familyName: "Family name / surname", singleName: "I have a single legal name (no family name)",
    preferredName: "Preferred name", namesHelp: "As usually written — passport or ID details are not needed now.",
    dateOfBirth: "Date of birth", sex: "Sex", sexHelp: "Recorded for medical care.",
    nationality: "Nationality", residence: "Country of residence",
    accountEmail: "Account email", accountEmailHelp: "You'll use this email to sign in. We'll verify it before it becomes your account.",
    haveEmail: "We already have this email from your case.", useThisEmail: "Use this email", useAnotherEmail: "Use another email",
    emailVerifiedNote: "Verified", emailOther: "Email address",
    phone: "WhatsApp / mobile", phoneOptional: "optional", phoneHelp: "Include the country code, for example +971 50 123 4567.",
    belongsTo: "This number belongs to", ownerMe: "Me", ownerRep: "A family member / representative",
    ownerRepHelp: "We'll keep it as a contact for your case. Add your own number below if you have one.",
    ownerRepKnown: (n: string) => `The number on file (${n}) belongs to your representative and stays theirs.`,
    yourOwnPhone: "Your own WhatsApp / mobile",
    language: "Preferred language",
    required: "Required", optional: "optional",
    selectCountry: "Search country…", noCountry: "No matching country", selectOption: "Select…",
    male: "Male", female: "Female", other: "Other", undisclosed: "Prefer not to say",
    english: "English", arabic: "العربية",
    activate: "Continue", activating: "Saving…",
    passportNote: "We don't need your passport or ID now. If your treatment needs a visa or travel booking, your coordinator will ask for it later.",
    // account setup
    accountTitle: "Your profile information is complete",
    accountIntro: "One final step: create your password to securely access your RehletShifaa account.",
    accountSent: "We sent a secure account setup link to",
    accountNotSent: "We could not send the setup link just now. Press “Resend setup link” to receive it at",
    accountSentHelp: "Open the link, create your password, and you'll come straight back to your case. This private link expires for your security.",
    accountResend: "Resend setup link", accountResent: "A new setup link is on its way.", resending: "Sending…",
    accountExpired: "This setup link has expired.", accountNewLink: "Send me a new link",
    accountReady: "Your account is ready.", continueSignIn: "Continue to sign in",
    accountCheckEmail: "Check your email to continue securely.",
    amountDue: "Amount due", alreadyPaid: "Already received", balance: "Remaining",
    depositPending: "You can safely close this page — nothing is lost, and your case continues automatically once the deposit is recorded.",
    refreshStatus: "Refresh status",
    readyTitle: "Your profile is ready",
    readyIntro: "Your patient profile is active and your account is set up. Sign in to follow this case and any other case linked to your profile.",
    nextStepLabel: "Next step",
    nextDeposit: "Deposit for your accepted care estimate",
    viewDeposit: "View deposit details",
    nextDepositWho: "Your coordinator will arrange this with you.",
    depositStageTitle: "Deposit arrangements",
    depositArrangements: "Your coordinator will provide or arrange the payment instructions for your region and record the payment once it arrives.",
    noActionNeeded: "No action is required from you right now.",
    backToCase: "Go to my case",
    doneTitle: "Your treatment journey is now active",
    doneIntro: "Your RehletShifaa coordinator is starting the next stage of your treatment coordination and will contact you shortly.",
    stepProposal: "Proposal accepted", stepProfile: "Profile completed", stepAccount: "Account secured", stepDeposit: "Deposit received",
    portalIntro: "Sign in with the password you created to follow this case — and every other case you have with us — in one place.",
    viewJourney: "Sign in to my case", opening: "Opening…",
    caseLabel: "Case",
    stepOf: "Step", of: "of",
    steps: ["Verify", "Your details", "Secure account"],
    invalid: "This link is invalid or has expired. Please ask your coordinator for a new one.",
    error: "Something went wrong. Please try again.",
    tooMany: "Too many attempts. Please try again in a little while.",
    fixFields: "Please check the highlighted fields.",
    sessionExpired: "Your secure session timed out. Please confirm the code again — nothing you entered was lost.",
    errGiven: "Enter the given name(s).", errFamily: "Enter the family name, or confirm a single legal name.",
    errDob: "Enter the date of birth.", errDobFuture: "The date of birth cannot be in the future.",
    errSelect: "Please choose an option.", errPhone: "Enter a valid international number, for example +971 50 123 4567.",
    errEmail: "Enter the email address you will use to sign in.", errOwner: "Tell us whether this number is yours or a family member's.",
    errConsents: "Please accept all required agreements to continue.",
    loading: "Loading…",
  },
  ar: {
    eyebrow: "تابع رحلتك العلاجية",
    verifyTitle: "لنتأكد أنه أنت",
    verifyIntro: "لحمايتك سنرسل رمزًا من 6 أرقام إلى",
    sendCode: "إرسال الرمز", sending: "جارٍ الإرسال…", resend: "إرسال رمز جديد",
    codeLabel: "الرمز المكوّن من 6 أرقام", verify: "متابعة", verifying: "جارٍ التحقق…",
    useEmail: "أرسله إلى البريد بدلًا من ذلك", useWhatsapp: "أرسله إلى واتساب بدلًا من ذلك",
    formTitle: "أكمل ملفك الشخصي",
    formIntro: "أدخلنا مسبقًا ما شاركته معنا. يرجى مراجعته وإكمال الناقص فقط.",
    prefilledNote: "معبأ مسبقًا من حالتك",
    legacyNameTitle: "يرجى تأكيد اسمك",
    legacyNameIntro: (n: string) => `لدينا اسمك كالتالي: «${n}». يرجى إدخاله كاسم أول واسم عائلة ليطابق سجلاتك — لا نقسّم الأسماء تلقائيًا أبدًا.`,
    submittedByRep: (n: string, r: string) => `قُدّمت هذه الحالة بواسطة ${n} (${r}). البيانات أدناه تخص المريض.`,
    sectionAbout: "البيانات الشخصية", sectionContact: "التواصل", sectionAgreements: "الموافقات",
    givenName: "الاسم الأول (الأسماء الشخصية)", familyName: "اسم العائلة / اللقب", singleName: "لديّ اسم قانوني واحد فقط (بدون اسم عائلة)",
    preferredName: "الاسم المفضّل", namesHelp: "كما يُكتب عادةً — لا نحتاج بيانات جواز السفر أو الهوية الآن.",
    dateOfBirth: "تاريخ الميلاد", sex: "الجنس", sexHelp: "يُسجَّل لأغراض الرعاية الطبية.",
    nationality: "الجنسية", residence: "بلد الإقامة",
    accountEmail: "بريد الحساب", accountEmailHelp: "ستستخدم هذا البريد لتسجيل الدخول. سنتحقق منه قبل أن يصبح حسابك.",
    haveEmail: "لدينا هذا البريد بالفعل من حالتك.", useThisEmail: "استخدم هذا البريد", useAnotherEmail: "استخدم بريدًا آخر",
    emailVerifiedNote: "مُتحقَّق منه", emailOther: "البريد الإلكتروني",
    phone: "واتساب / الجوال", phoneOptional: "اختياري", phoneHelp: "أدخل رمز الدولة، مثال ‎+971 50 123 4567.",
    belongsTo: "هذا الرقم يخص", ownerMe: "أنا", ownerRep: "أحد أفراد العائلة / ممثّل",
    ownerRepHelp: "سنبقيه وسيلة تواصل لحالتك. أضف رقمك الخاص أدناه إن وُجد.",
    ownerRepKnown: (n: string) => `الرقم المسجّل (${n}) يخص ممثّلك ويبقى له.`,
    yourOwnPhone: "رقم واتساب / الجوال الخاص بك",
    language: "لغة التواصل",
    required: "مطلوب", optional: "اختياري",
    selectCountry: "ابحث عن الدولة…", noCountry: "لا توجد نتائج", selectOption: "اختر…",
    male: "ذكر", female: "أنثى", other: "أخرى", undisclosed: "أفضّل عدم الإفصاح",
    english: "English", arabic: "العربية",
    activate: "متابعة", activating: "جارٍ الحفظ…",
    passportNote: "لا نحتاج جواز سفرك أو هويتك الآن. إذا احتاج علاجك تأشيرة أو حجز سفر، سيطلبها منسقك لاحقًا.",
    accountTitle: "اكتملت معلومات ملفك",
    accountIntro: "خطوة أخيرة: أنشئ كلمة مرورك للوصول الآمن إلى حساب رحلة شفاء الخاص بك.",
    accountSent: "أرسلنا رابط إعداد الحساب الآمن إلى",
    accountNotSent: "تعذّر إرسال رابط الإعداد الآن. اضغط «إعادة إرسال رابط الإعداد» لاستلامه على",
    accountSentHelp: "افتح الرابط، أنشئ كلمة مرورك، وستعود مباشرة إلى حالتك. تنتهي صلاحية هذا الرابط الخاص لحمايتك.",
    accountResend: "إعادة إرسال رابط الإعداد", accountResent: "رابط إعداد جديد في طريقه إليك.", resending: "جارٍ الإرسال…",
    accountExpired: "انتهت صلاحية رابط الإعداد هذا.", accountNewLink: "أرسل لي رابطًا جديدًا",
    accountReady: "حسابك جاهز.", continueSignIn: "متابعة إلى تسجيل الدخول",
    accountCheckEmail: "تحقق من بريدك الإلكتروني للمتابعة بأمان.",
    amountDue: "المبلغ المستحق", alreadyPaid: "المستلم بالفعل", balance: "المتبقي",
    depositPending: "يمكنك إغلاق هذه الصفحة بأمان — لن يضيع شيء، وتستكمل حالتك تلقائيًا فور تسجيل الوديعة.",
    refreshStatus: "تحديث الحالة",
    readyTitle: "ملفك جاهز",
    readyIntro: "ملفك الطبي مُفعّل وحسابك جاهز. سجّل الدخول لمتابعة هذه الحالة وأي حالة أخرى مرتبطة بملفك.",
    nextStepLabel: "الخطوة التالية",
    nextDeposit: "وديعة تقدير الرعاية الذي قبلته",
    viewDeposit: "عرض تفاصيل الوديعة",
    nextDepositWho: "سيرتّب منسّقك ذلك معك.",
    depositStageTitle: "ترتيبات الوديعة",
    depositArrangements: "سيوفّر منسّقك تعليمات الدفع الخاصة بمنطقتك أو يرتّبها، ويسجّل الدفعة فور وصولها.",
    noActionNeeded: "لا يلزمك أي إجراء الآن.",
    backToCase: "الذهاب إلى حالتي",
    doneTitle: "رحلتك العلاجية نشطة الآن",
    doneIntro: "بدأ منسق رحلة شفاء المرحلة التالية من تنسيق علاجك وسيتواصل معك قريبًا.",
    stepProposal: "تم قبول العرض", stepProfile: "اكتمل الملف", stepAccount: "تم تأمين الحساب", stepDeposit: "تم استلام الوديعة",
    portalIntro: "سجّل الدخول بكلمة المرور التي أنشأتها لمتابعة هذه الحالة — وكل حالاتك معنا — في مكان واحد.",
    viewJourney: "تسجيل الدخول إلى حالتي", opening: "جارٍ الفتح…",
    caseLabel: "الحالة",
    stepOf: "الخطوة", of: "من",
    steps: ["التحقق", "بياناتك", "تأمين الحساب"],
    invalid: "هذا الرابط غير صالح أو انتهت صلاحيته. يرجى طلب رابط جديد من منسقك.",
    error: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
    tooMany: "محاولات كثيرة. يرجى المحاولة بعد قليل.",
    fixFields: "يرجى مراجعة الحقول المحددة.",
    sessionExpired: "انتهت جلستك الآمنة. يرجى تأكيد الرمز مرة أخرى — لم يضِع ما أدخلته.",
    errGiven: "أدخل الاسم الأول.", errFamily: "أدخل اسم العائلة، أو أكّد أن اسمك القانوني مفرد.",
    errDob: "أدخل تاريخ الميلاد.", errDobFuture: "لا يمكن أن يكون تاريخ الميلاد في المستقبل.",
    errSelect: "يرجى اختيار أحد الخيارات.", errPhone: "أدخل رقمًا دوليًا صحيحًا، مثال ‎+971 50 123 4567.",
    errEmail: "أدخل البريد الإلكتروني الذي ستستخدمه لتسجيل الدخول.", errOwner: "أخبرنا إن كان هذا الرقم لك أو لأحد أفراد العائلة.",
    errConsents: "يرجى قبول جميع الموافقات المطلوبة للمتابعة.",
    loading: "جارٍ التحميل…",
  },
};

const RELATIONSHIP_LABEL: Record<string, { en: string; ar: string }> = {
  PARENT: { en: "parent", ar: "أحد الوالدين" }, CHILD: { en: "child", ar: "ابن/ابنة" }, SPOUSE: { en: "spouse", ar: "زوج/زوجة" },
  SIBLING: { en: "sibling", ar: "أخ/أخت" }, RELATIVE: { en: "relative", ar: "قريب" }, GUARDIAN: { en: "guardian", ar: "وصي" }, OTHER: { en: "representative", ar: "ممثّل" },
};

const CONSENT_TEXT: Record<string, { en: string; ar: string }> = {
  PRIVACY_DATA_PROCESSING: {
    en: "I agree that RehletShifaa may process my personal and health information to coordinate my care.",
    ar: "أوافق على أن تعالج رحلة شفاء بياناتي الشخصية والصحية لتنسيق رعايتي.",
  },
  CROSS_BORDER_CARE: {
    en: "I agree that my information may be shared across borders with the treating providers.",
    ar: "أوافق على مشاركة معلوماتي عبر الحدود مع مقدمي الرعاية المعالجين.",
  },
  DEPOSIT_CANCELLATION_TERMS: {
    en: "I have read and accept the coordination deposit, cancellation and refund terms.",
    ar: "قرأت وأقبل شروط وديعة التنسيق والإلغاء والاسترداد.",
  },
  MEDICAL_INFORMATION_SHARING: {
    en: "I agree that my medical information may be shared with the treating consultants.",
    ar: "أوافق على مشاركة معلوماتي الطبية مع الاستشاريين المعالجين.",
  },
  TELECONSULTATION: {
    en: "I agree to remote consultation where it is clinically appropriate.",
    ar: "أوافق على الاستشارة عن بُعد عندما يكون ذلك مناسبًا سريريًا.",
  },
  REPRESENTATIVE_AUTHORIZATION: {
    en: "I confirm I am authorized to act for the patient in coordinating this care.",
    ar: "أؤكد أنني مفوّض للتصرف نيابة عن المريض في تنسيق هذه الرعاية.",
  },
};

type PatientAction = "COMPLETE_PROFILE" | "SET_UP_ACCOUNT" | "NONE" | "CONTINUE_IN_PORTAL";
type JourneyStage = "PROFILE" | "ACCOUNT_SETUP" | "DEPOSIT" | "CARE_COORDINATION";
/** "account" is the setup-pending screen; "activated" is the moment everything is ready — before any money. */
type Stage = "loading" | "verify" | "form" | "account" | "activated" | "deposit" | "done" | "invalid";

/**
 * Fall back to the profile step whenever the server has not named an action: stranding someone on a
 * payment screen is the one wrong answer here, and an incomplete profile is the safe assumption.
 */
function resolveAction(data: { currentAction?: PatientAction; profileActive: boolean; deposit: Deposit; account?: Account }): PatientAction {
  if (data.currentAction) return data.currentAction;
  if (!data.profileActive) return "COMPLETE_PROFILE";
  if (data.account && data.account.status !== "ACTIVE" && data.account.awaitingEmail) return "SET_UP_ACCOUNT";
  return data.deposit.satisfied ? "CONTINUE_IN_PORTAL" : "NONE";
}

/** Resume exactly where the server says the patient stands, so a reload never reopens a finished step. */
function stageFor(action: PatientAction): Stage {
  if (action === "COMPLETE_PROFILE") return "form";
  if (action === "SET_UP_ACCOUNT") return "account";
  if (action === "CONTINUE_IN_PORTAL") return "done";
  return "deposit"; // nothing for the patient to do, but the deposit stage is what they should see
}

export function ProfileActivation({ locale, token }: { locale: Locale; token: string }) {
  const t = copy[locale];

  const [stage, setStage] = useState<Stage>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [grant, setGrant] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [action, setAction] = useState<PatientAction | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [consents, setConsents] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step heading so keyboard and screen-reader users follow the flow.
  useEffect(() => { if (stage !== "loading") headingRef.current?.focus(); }, [stage]);

  const call = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(apiUrl(`/public/onboarding/${encodeURIComponent(token)}${path}`), {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      throw { status: response.status, code: problem?.code, message: problem?.message, errors: problem?.errors as FieldError[] | undefined };
    }
    return response.json();
  }, [token]);

  useEffect(() => {
    let live = true;
    call("").then((data: Summary) => {
      if (!live) return;
      setSummary(data);
      setChannel(data.channel === "EMAIL" ? "EMAIL" : "WHATSAPP");
      setStage("verify");
    }).catch(() => { if (live) setStage("invalid"); });
    return () => { live = false; };
  }, [call]);

  function describe(e: unknown): string {
    const err = e as { status?: number; message?: string };
    if (err?.status === 429) return t.tooMany;
    return err?.message || t.error;
  }

  async function sendCode(next?: "WHATSAPP" | "EMAIL") {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const chosen = next ?? channel;
      const data: Summary = await call("/request-access", { channel: chosen });
      setSummary(data); setChannel(chosen); setCodeSent(true); setCode("");
    } catch (e) { setNotice(describe(e)); } finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true); setNotice(null);
    try {
      const granted: { grant: string } = await call("/verify", { code });
      const data: Prefill = await call("/profile", { grant: granted.grant });
      setGrant(granted.grant);
      setPrefill(data);
      setDeposit(data.deposit);
      setAccount(data.account);
      const repOwned = data.mobileOwner === "REPRESENTATIVE";
      // Keep anything already typed: re-verifying after a timeout must never discard the patient's work.
      setForm(previous => previous ?? {
        givenName: data.givenName ?? "",
        familyName: data.familyName ?? "",
        singleLegalName: !!data.givenName && !data.familyName,
        preferredName: data.preferredName ?? "",
        email: data.candidateEmail ?? "",
        emailChoice: data.candidateEmail ? "candidate" : "other",
        phone: repOwned ? "" : (data.knownMobile ?? ""),
        mobileOwner: data.mobileOwner ?? "",
        dateOfBirth: data.dateOfBirth ?? "",
        nationality: data.nationality ?? "",
        countryOfResidence: data.countryOfResidence ?? "",
        preferredLanguage: data.preferredLanguage ?? locale,
        sex: data.sex ?? "",
      });
      setConsents(previous => previous.length ? previous : data.completedConsents.filter(c => data.requiredConsents.includes(c)));
      const resolved = resolveAction(data);
      setAction(resolved);
      setStage(stageFor(resolved));
    } catch (e) { setNotice(describe(e)); } finally { setBusy(false); }
  }

  /**
   * A first pass so obvious mistakes are caught without a round-trip. The backend re-validates everything
   * and remains authoritative; this only mirrors its rules for a faster, calmer correction loop.
   */
  function checkLocally(values: Form, agreed: string[], required: string[]): Record<string, string> {
    const e: Record<string, string> = {};
    if (values.givenName.trim().length < 1) e.givenName = t.errGiven;
    if (!values.familyName.trim() && !values.singleLegalName) e.familyName = t.errFamily;
    if (!values.dateOfBirth) e.dateOfBirth = t.errDob;
    else if (values.dateOfBirth > new Date().toISOString().slice(0, 10)) e.dateOfBirth = t.errDobFuture;
    if (!values.sex) e.sex = t.errSelect;
    if (!values.nationality) e.nationality = t.errSelect;
    if (!values.countryOfResidence) e.countryOfResidence = t.errSelect;
    if (!values.mobileOwner) e.mobileOwner = t.errOwner;
    const phone = values.phone.replace(/[^\d+]/g, "");
    if (values.mobileOwner === "PATIENT" && !/^\+[1-9]\d{6,14}$/.test(phone)) e.phone = t.errPhone;
    if (values.mobileOwner === "REPRESENTATIVE" && phone && !/^\+[1-9]\d{6,14}$/.test(phone)) e.phone = t.errPhone;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) e.email = t.errEmail;
    if (required.some(type => !agreed.includes(type))) e.consents = t.errConsents;
    return e;
  }

  async function activate(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !form || !grant || !prefill) return;
    const local = checkLocally(form, consents, prefill.requiredConsents);
    if (Object.keys(local).length) { setFieldErrors(local); setNotice(t.fixFields); return; }
    setBusy(true); setNotice(null); setFieldErrors({});
    try {
      const profile = {
        givenName: form.givenName, familyName: form.familyName, singleLegalName: form.singleLegalName, preferredName: form.preferredName || null,
        email: form.email, phone: form.phone || null, mobileOwner: form.mobileOwner || null,
        dateOfBirth: form.dateOfBirth, nationality: form.nationality, countryOfResidence: form.countryOfResidence,
        preferredLanguage: form.preferredLanguage, sex: form.sex, consents,
      };
      const result: { profileActive: boolean; deposit: Deposit; account: Account; currentAction?: PatientAction } = await call("/activate", { grant, profile });
      setDeposit(result.deposit);
      setAccount(result.account);
      const resolved = resolveAction(result);
      setAction(resolved);
      // Profile complete → account setup is the very next screen. Only an already-active account skips it.
      setStage(resolved === "SET_UP_ACCOUNT" ? "account" : "activated");
    } catch (e) {
      const err = e as { errors?: FieldError[]; status?: number };
      if (err?.errors?.length) {
        setFieldErrors(Object.fromEntries(err.errors.map(x => [x.field, x.message])));
        setNotice(t.fixFields);
      } else if (err?.status === 401) {
        // The short-lived grant expired while the form was open: re-verify, keeping everything typed.
        setGrant(null); setCodeSent(false); setCode(""); setStage("verify"); setNotice(t.sessionExpired);
      } else setNotice(describe(e));
    } finally { setBusy(false); }
  }

  async function resendSetup() {
    if (busy || !grant) return;
    setBusy(true); setNotice(null); setResent(false);
    try {
      const data: Account = await call("/resend-setup", { grant });
      setAccount(data);
      if (data.status === "ACTIVE") { setAction("CONTINUE_IN_PORTAL"); setStage("activated"); }
      else setResent(true);
    } catch (e) { setNotice(describe(e)); } finally { setBusy(false); }
  }

  const refreshDeposit = useCallback(async () => {
    if (!grant) return;
    try {
      const data: Deposit = await call("/deposit", { grant });
      setDeposit(data);
      if (data.satisfied) { setAction("CONTINUE_IN_PORTAL"); setStage("done"); }
    } catch { /* keep the current view; the patient can retry */ }
  }, [call, grant]);

  /**
   * Continue into the normal authenticated portal. With provider-owned accounts the patient simply signs in
   * with the password they created; the portal opens straight on this case. A legacy profile without any
   * account receives the old one-time binding credential instead.
   */
  async function openPortal() {
    if (busy || !grant) return;
    setBusy(true); setNotice(null);
    try {
      const handoff: { activationToken: string | null; alreadyLinked: boolean; account: Account; caseId: string } = await call("/portal-access", { grant });
      setAccount(handoff.account);
      if (!handoff.alreadyLinked && handoff.account.awaitingEmail) { setStage("account"); setBusy(false); return; }
      const portal = `/${locale}/portal?case=${encodeURIComponent(handoff.caseId)}`;
      window.location.assign(handoff.activationToken ? `${portal}&activate=${encodeURIComponent(handoff.activationToken)}` : `${portal}&signin=1`);
    } catch (e) { setNotice(describe(e)); setBusy(false); }
  }

  const stepIndex = stage === "verify" ? 0 : stage === "form" ? 1 : 2;

  if (stage === "loading") return <Shell locale={locale}><p className="text-ink-500">{t.loading}</p></Shell>;
  if (stage === "invalid") return (
    <Shell locale={locale}>
      <div className="card p-6 md:p-8">
        <h1 className="title" tabIndex={-1} ref={headingRef}>{t.invalid}</h1>
      </div>
    </Shell>
  );

  const repOwned = form?.mobileOwner === "REPRESENTATIVE";
  const relationshipLabel = prefill?.representativeRelationship ? (RELATIONSHIP_LABEL[prefill.representativeRelationship]?.[locale] ?? prefill.representativeRelationship) : "";

  return (
    <Shell locale={locale}>
      {stage !== "done" && <Steps labels={t.steps} current={stepIndex} stepOf={t.stepOf} of={t.of} />}

      {notice && (
        <p role="alert" className="mb-5 rounded-xl border border-alert-200 bg-alert-50 p-4 text-sm text-alert-800">{notice}</p>
      )}

      {stage === "verify" && (
        <section className="card p-6 md:p-8">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.verifyTitle}</h1>
          <p className="lead mt-3">
            {t.verifyIntro} <strong className="text-ink-900" dir="ltr">{summary?.destinationHint}</strong>
          </p>
          {!codeSent ? (
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => void sendCode()}>
                {busy ? t.sending : t.sendCode}
              </button>
              <button type="button" className="link-cta self-start text-sm" disabled={busy}
                      onClick={() => void sendCode(channel === "WHATSAPP" ? "EMAIL" : "WHATSAPP")}>
                {channel === "WHATSAPP" ? t.useEmail : t.useWhatsapp}
              </button>
            </div>
          ) : (
            <form className="mt-7" onSubmit={verify} noValidate>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-ink-800">{t.codeLabel}</span>
                <input
                  className="field max-w-[16rem] text-center text-2xl tracking-[0.5em]" dir="ltr"
                  inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </label>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button className="btn-primary w-full sm:w-auto" disabled={busy || code.length !== 6}>
                  {busy ? t.verifying : t.verify}
                </button>
                <button type="button" className="link-cta self-start text-sm" disabled={busy} onClick={() => void sendCode()}>{t.resend}</button>
              </div>
            </form>
          )}
        </section>
      )}

      {stage === "form" && form && prefill && (
        <form className="card p-6 md:p-8" onSubmit={activate} noValidate>
          <p className="eyebrow">{t.caseLabel} {prefill.caseNumber}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.formTitle}</h1>
          <p className="lead mt-3">{t.formIntro}</p>
          {prefill.submittedBy === "REPRESENTATIVE" && prefill.representativeName && (
            <p className="mt-4 rounded-xl bg-mist p-4 text-sm leading-6 text-ink-700">{t.submittedByRep(prefill.representativeName, relationshipLabel)}</p>
          )}
          {prefill.nameConfirmationRequired && prefill.legacyFullName && (
            <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
              <p className="font-semibold text-brand-900">{t.legacyNameTitle}</p>
              <p className="mt-1 text-sm leading-6 text-ink-700">{t.legacyNameIntro(prefill.legacyFullName)}</p>
            </div>
          )}

          <Fieldset legend={t.sectionAbout}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.givenName} required requiredLabel={t.required} error={fieldErrors.givenName} hint={prefill.givenName ? t.prefilledNote : undefined}>
                <input className={`field ${fieldErrors.givenName ? "field-error" : ""}`} autoComplete="given-name"
                       value={form.givenName} onChange={e => setForm({ ...form, givenName: e.target.value })} />
              </Field>
              <Field label={form.singleLegalName ? `${t.familyName} (${t.optional})` : t.familyName} required={!form.singleLegalName} requiredLabel={t.required} error={fieldErrors.familyName} hint={prefill.familyName ? t.prefilledNote : undefined}>
                <input className={`field ${fieldErrors.familyName ? "field-error" : ""}`} autoComplete="family-name"
                       value={form.familyName} onChange={e => setForm({ ...form, familyName: e.target.value })} />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.singleLegalName} onChange={e => setForm({ ...form, singleLegalName: e.target.checked })} />{t.singleName}</label>
            <p className="text-xs leading-5 text-ink-500">{t.namesHelp}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={`${t.preferredName} (${t.optional})`} error={fieldErrors.preferredName}>
                <input className="field" autoComplete="nickname" value={form.preferredName} onChange={e => setForm({ ...form, preferredName: e.target.value })} />
              </Field>
              <Field label={t.dateOfBirth} required requiredLabel={t.required} error={fieldErrors.dateOfBirth}>
                <input type="date" dir="ltr" className={`field ${fieldErrors.dateOfBirth ? "field-error" : ""}`}
                       max={new Date().toISOString().slice(0, 10)} autoComplete="bday"
                       value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.sex} required requiredLabel={t.required} help={t.sexHelp} error={fieldErrors.sex}>
                <select className={`field ${fieldErrors.sex ? "field-error" : ""}`} value={form.sex}
                        onChange={e => setForm({ ...form, sex: e.target.value })}>
                  <option value="">{t.selectOption}</option>
                  <option value="MALE">{t.male}</option>
                  <option value="FEMALE">{t.female}</option>
                  <option value="OTHER">{t.other}</option>
                  <option value="UNDISCLOSED">{t.undisclosed}</option>
                </select>
              </Field>
              <Field label={t.nationality} required requiredLabel={t.required} error={fieldErrors.nationality}>
                <CountrySelect value={form.nationality} placeholder={t.selectCountry} empty={t.noCountry}
                               invalid={!!fieldErrors.nationality} onChange={v => setForm({ ...form, nationality: v })} />
              </Field>
            </div>
            <Field label={t.residence} required requiredLabel={t.required} error={fieldErrors.countryOfResidence} hint={prefill.countryOfResidence ? t.prefilledNote : undefined}>
              <CountrySelect value={form.countryOfResidence} placeholder={t.selectCountry} empty={t.noCountry}
                             invalid={!!fieldErrors.countryOfResidence} onChange={v => setForm({ ...form, countryOfResidence: v })} />
            </Field>
          </Fieldset>

          <Fieldset legend={t.sectionContact}>
            {/* Account email: mandatory, security-sensitive. A known address is offered, never assumed. */}
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-sm font-bold text-ink-800">{t.accountEmail} <span className="text-alert-700" aria-hidden>*</span></p>
              <p className="mt-1 text-xs leading-5 text-ink-500">{t.accountEmailHelp}</p>
              {prefill.candidateEmail && (
                <div className="mt-3 rounded-lg bg-brand-50 p-3">
                  <p className="text-sm text-ink-700"><span dir="ltr" className="font-semibold text-ink-900">{maskEmail(prefill.candidateEmail)}</span>{prefill.emailVerified && <span className="ms-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">{t.emailVerifiedNote}</span>}</p>
                  <p className="mt-1 text-xs text-ink-500">{t.haveEmail}</p>
                  <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t.accountEmail}>
                    <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${form.emailChoice === "candidate" ? "border-brand-600 bg-white text-brand-800" : "border-line bg-white text-ink-600"}`}>
                      <input type="radio" name="emailChoice" className="sr-only" checked={form.emailChoice === "candidate"} onChange={() => setForm({ ...form, emailChoice: "candidate", email: prefill.candidateEmail ?? "" })} />{t.useThisEmail}
                    </label>
                    <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${form.emailChoice === "other" ? "border-brand-600 bg-white text-brand-800" : "border-line bg-white text-ink-600"}`}>
                      <input type="radio" name="emailChoice" className="sr-only" checked={form.emailChoice === "other"} onChange={() => setForm({ ...form, emailChoice: "other", email: "" })} />{t.useAnotherEmail}
                    </label>
                  </div>
                </div>
              )}
              {(!prefill.candidateEmail || form.emailChoice === "other") && (
                <div className="mt-3">
                  <Field label={t.emailOther} required requiredLabel={t.required} error={fieldErrors.email}>
                    <input className={`field ${fieldErrors.email ? "field-error" : ""}`} type="email" dir="ltr" inputMode="email"
                           autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </Field>
                </div>
              )}
              {prefill.candidateEmail && form.emailChoice === "candidate" && fieldErrors.email && <p className="error-text mt-2">{fieldErrors.email}</p>}
            </div>

            {/* Mobile: shown as known, ownership made explicit; never promoted to the patient by default. */}
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-sm font-bold text-ink-800">{t.phone}</p>
              {prefill.knownMobile && (
                <>
                  <p className="mt-1 text-sm text-ink-700"><span dir="ltr" className="font-semibold text-ink-900">{prefill.knownMobile}</span> <span className="text-xs text-ink-500">· {t.prefilledNote}</span></p>
                  <p className="mt-3 text-sm font-semibold text-ink-800">{t.belongsTo}</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t.belongsTo}>
                    {([["PATIENT", t.ownerMe], ["REPRESENTATIVE", t.ownerRep]] as const).map(([key, label]) => (
                      <label key={key} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${form.mobileOwner === key ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white text-ink-600"}`}>
                        <input type="radio" name="mobileOwner" className="sr-only" checked={form.mobileOwner === key}
                               onChange={() => setForm({ ...form, mobileOwner: key, phone: key === "PATIENT" ? (prefill.knownMobile ?? "") : "" })} />{label}
                      </label>
                    ))}
                  </div>
                  {fieldErrors.mobileOwner && <p className="error-text mt-2">{fieldErrors.mobileOwner}</p>}
                  {repOwned && <p className="mt-2 text-xs leading-5 text-ink-500">{t.ownerRepKnown(prefill.knownMobile)} {t.ownerRepHelp}</p>}
                </>
              )}
              {(!prefill.knownMobile || repOwned) && (
                <div className="mt-3">
                  <Field label={repOwned ? `${t.yourOwnPhone} (${t.phoneOptional})` : t.phone} required={!repOwned} requiredLabel={t.required} help={t.phoneHelp} error={fieldErrors.phone}>
                    <input className={`field ${fieldErrors.phone ? "field-error" : ""}`} dir="ltr" inputMode="tel" autoComplete="tel"
                           value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value, mobileOwner: form.mobileOwner || "PATIENT" })} />
                  </Field>
                </div>
              )}
              {prefill.knownMobile && form.mobileOwner === "PATIENT" && fieldErrors.phone && <p className="error-text mt-2">{fieldErrors.phone}</p>}
            </div>

            <Field label={t.language} error={fieldErrors.preferredLanguage}>
              <select className="field" value={form.preferredLanguage}
                      onChange={e => setForm({ ...form, preferredLanguage: e.target.value })}>
                <option value="en">{t.english}</option>
                <option value="ar">{t.arabic}</option>
              </select>
            </Field>
          </Fieldset>

          <Fieldset legend={t.sectionAgreements}>
            {fieldErrors.consents && <p className="error-text mb-2">{fieldErrors.consents}</p>}
            <ul className="space-y-3">
              {prefill.requiredConsents.map(type => {
                const checked = consents.includes(type);
                return (
                  <li key={type}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-brand-50/50 p-4">
                      <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-brand-600" checked={checked}
                             onChange={e => setConsents(v => e.target.checked ? [...v, type] : v.filter(x => x !== type))} />
                      <span className="text-sm leading-6 text-ink-700">{CONSENT_TEXT[type]?.[locale] ?? type}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 rounded-xl bg-mist p-4 text-sm leading-6 text-ink-600">{t.passportNote}</p>
          </Fieldset>

          <button className="btn-primary mt-8 w-full sm:w-auto" disabled={busy}>{busy ? t.activating : t.activate}</button>
        </form>
      )}

      {/* Account setup: the password is created inside the identity provider from a link in the inbox. */}
      {stage === "account" && (
        <section className="card p-6 md:p-8">
          <p className="eyebrow">{t.caseLabel} {prefill?.caseNumber}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.accountTitle}</h1>
          <p className="lead mt-3">{t.accountIntro}</p>
          <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5">
            <p className="text-ink-800">{account?.emailSent === false ? t.accountNotSent : t.accountSent} <strong dir="ltr" className="text-ink-900">{account?.emailHint ?? "***"}</strong></p>
            <p className="mt-2 text-sm leading-6 text-ink-600">{t.accountSentHelp}</p>
          </div>
          {resent && <p role="status" className="mt-4 text-sm font-semibold text-brand-800">{t.accountResent}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void resendSetup()}>{busy ? t.resending : t.accountResend}</button>
          </div>
        </section>
      )}

      {/* Profile + account complete: its own finish line. Money is named as the next task, never as part of it. */}
      {stage === "activated" && (
        <section className="card p-6 md:p-8">
          <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-xl text-white">✓</span>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-5 outline-none">{t.readyTitle}</h1>
          <p className="lead mt-3">{t.readyIntro}</p>

          {action === "CONTINUE_IN_PORTAL" || !deposit?.required ? (
            <button type="button" className="btn-primary mt-7 w-full sm:w-auto" disabled={busy} onClick={() => void openPortal()}>
              {busy ? t.opening : t.backToCase}
            </button>
          ) : (
            <>
              <div className="mt-7 border-t border-line pt-5">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.nextStepLabel}</p>
                <p className="mt-1.5 font-semibold text-ink-900">{t.nextDeposit}</p>
                <p className="mt-1 text-[0.88rem] leading-6 text-ink-600">{t.nextDepositWho}</p>
              </div>
              <button type="button" className="mt-5 text-[0.9rem] font-semibold text-brand-800 underline underline-offset-4"
                      onClick={() => setStage("deposit")}>
                {t.viewDeposit}
              </button>
            </>
          )}
        </section>
      )}

      {/* A status, not a task. Staff arrange the offline deposit, so this screen offers the patient no
          action to take and no button that pretends otherwise — only a quiet way back to their case. */}
      {stage === "deposit" && deposit && (
        <section className="card p-6 md:p-8">
          <p className="eyebrow">{t.caseLabel} {prefill?.caseNumber}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.depositStageTitle}</h1>
          <p className="lead mt-3">{t.depositArrangements}</p>

          <dl className="mt-7 overflow-hidden rounded-xl border border-line">
            <Row label={t.amountDue} value={money(deposit.amountDue, deposit.currency, locale)} strong />
            {(deposit.amountPaid ?? 0) > 0 && <Row label={t.alreadyPaid} value={money(deposit.amountPaid, deposit.currency, locale)} />}
            {(deposit.balance ?? 0) > 0 && (deposit.amountPaid ?? 0) > 0 && (
              <Row label={t.balance} value={money(deposit.balance, deposit.currency, locale)} />
            )}
          </dl>

          <p className="mt-6 rounded-xl bg-mist p-4 text-[0.92rem] font-semibold leading-6 text-ink-700" role="status">
            {t.noActionNeeded}
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-500">{t.depositPending}</p>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-6">
            <button type="button" className="text-[0.9rem] font-semibold text-brand-800 underline underline-offset-4 disabled:opacity-50"
                    disabled={busy} onClick={() => void openPortal()}>
              {busy ? t.opening : t.backToCase}
            </button>
            <button type="button" className="text-[0.88rem] font-semibold text-ink-500 underline underline-offset-4 disabled:opacity-50"
                    disabled={busy} onClick={() => void refreshDeposit()}>{t.refreshStatus}</button>
          </div>
        </section>
      )}

      {stage === "done" && (
        <section className="card p-6 md:p-8">
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-2xl text-white">✓</span>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-5 outline-none">{t.doneTitle}</h1>
          <p className="lead mt-3">{t.doneIntro}</p>
          <ul className="mt-7 space-y-3">
            {[t.stepProposal, t.stepProfile, t.stepAccount, t.stepDeposit].map(step => (
              <li key={step} className="flex items-center gap-3 text-ink-800">
                <span aria-hidden className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">✓</span>
                {step}
              </li>
            ))}
          </ul>
          <p className="mt-7 leading-7 text-ink-600">{t.portalIntro}</p>
          <button type="button" className="btn-primary mt-6 w-full sm:w-auto" disabled={busy} onClick={() => void openPortal()}>
            {busy ? t.opening : t.viewJourney}
          </button>
        </section>
      )}
    </Shell>
  );
}

function maskEmail(value: string) {
  const at = value.indexOf("@");
  if (at <= 0) return value;
  const user = value.slice(0, at);
  return `${user.length <= 2 ? user[0] : user.slice(0, 2)}***${value.slice(at)}`;
}

// ---------- presentational helpers ----------

function Shell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <section className="section section-soft">
      <div className="container-site" style={{ maxWidth: "44rem" }} lang={locale}>{children}</div>
    </section>
  );
}

function Steps({ labels, current, stepOf, of }: { labels: string[]; current: number; stepOf: string; of: string }) {
  return (
    <nav className="mb-6" aria-label={`${stepOf} ${current + 1} ${of} ${labels.length}`}>
      <ol className="flex items-center gap-2">
        {labels.map((label, index) => {
          const done = index < current, active = index === current;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <span aria-hidden
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-brand-600 text-white" : active ? "border-2 border-brand-600 text-brand-700" : "border border-line-strong text-ink-400"}`}>
                {done ? "✓" : index + 1}
              </span>
              <span className={`truncate text-sm ${active ? "font-bold text-ink-900" : "text-ink-500"}`}>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-8 min-w-0 border-0 p-0">
      <legend className="text-sm font-bold uppercase tracking-wide text-accent-700">{legend}</legend>
      <div className="mt-4 space-y-5">{children}</div>
    </fieldset>
  );
}

function Field({ label, required, requiredLabel, help, hint, error, children }: {
  label: string; required?: boolean; requiredLabel?: string; help?: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-ink-800">
        {label}
        {required && <span className="text-alert-700"><span aria-hidden>*</span><span className="sr-only"> {requiredLabel}</span></span>}
        {hint && <span className="text-xs font-normal text-ink-400">· {hint}</span>}
      </span>
      {children}
      {error ? <span className="error-text mt-2 block">{error}</span>
             : help ? <span className="mt-2 block text-xs leading-5 text-ink-500">{help}</span> : null}
    </label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className={strong ? "text-lg font-bold text-ink-900" : "text-ink-800"} dir="ltr">{value}</dd>
    </div>
  );
}

function CountrySelect({ value, placeholder, empty, invalid, onChange }: {
  value: string; placeholder: string; empty: string; invalid?: boolean; onChange: (iso2: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = useMemo(() => COUNTRIES.find(c => c.iso2 === value), [value]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase() === q) : COUNTRIES;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function choose(iso2: string) { onChange(iso2); setQuery(""); setOpen(false); }

  return (
    <div ref={root} className="relative">
      <input
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        className={`field ${invalid ? "field-error" : ""}`}
        placeholder={placeholder}
        value={open ? query : selected ? `${flagEmoji(selected.iso2)} ${selected.name}` : ""}
        onFocus={() => { setOpen(true); setActive(0); }}
        onChange={e => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); choose(results[active].iso2); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg">
          {results.length === 0 ? <li className="px-4 py-3 text-sm text-ink-500">{empty}</li> : results.map((c, i) => (
            <li key={c.iso2} role="option" aria-selected={c.iso2 === value}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm ${i === active ? "bg-brand-50" : ""}`}
                onMouseEnter={() => setActive(i)} onMouseDown={e => { e.preventDefault(); choose(c.iso2); }}>
              <span aria-hidden className="text-lg leading-none">{flagEmoji(c.iso2)}</span>
              <span className="min-w-0 flex-1 truncate text-ink-800">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function money(amount: number | null, currency: string, locale: Locale) {
  if (amount == null) return "—";
  // Decimals only when the amount has them, matching how the proposal states the same money.
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency", currency,
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  }
  catch { return `${amount.toLocaleString(locale)} ${currency}`; }
}
