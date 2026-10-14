/**
 * Recent-authentication UX. Sensitive actions (credential decisions, activation, access and journey governance)
 * return `REAUTHENTICATION_REQUIRED` when the sign-in is older than the backend's window. Nothing is changed by
 * that response. The UI explains why and lets the person sign in again on request. The portal also keeps the refused
 * request itself (this tab only, a few minutes) so that, back from the sign-in, the person sends it with one click
 * instead of filling the form again (QA #6 / W-6); elsewhere they are told to repeat the change.
 */
export const REAUTHENTICATION_REQUIRED = "REAUTHENTICATION_REQUIRED";
/** Governance actions (owner decisions, owner transfer) ask specifically for a passkey sign-in; the remedy is the same. */
export const PASSKEY_REQUIRED = "PHISHING_RESISTANT_AUTHENTICATION_REQUIRED";
export const isReauthenticationCode = (code: unknown) => code === REAUTHENTICATION_REQUIRED || code === PASSKEY_REQUIRED;
const KEY = "rs:reauthentication-requested";
const PENDING_KEY = "rs:reauthentication-pending-change";
/** A refused change kept for re-sending after the sign-in; older than this it is dropped (the person has moved on). */
const PENDING_TTL_MS = 10 * 60_000;

/** The request that was refused only because the sign-in was not recent: sent again as it was, idempotency key included. */
export type PendingChange = { path: string; method: string; body?: string };
/** A marker older than this is stale (the person abandoned the sign-in); never show the return notice for it. */
const MARKER_TTL_MS = 30 * 60_000;

export const reauthenticationCopy = {
  en: {
    required: "For your security, this change needs a recent sign-in. Nothing was changed.",
    howTo: "Sign in again, then repeat the change. Copy anything you typed first — signing in reloads this page.",
    action: "Sign in again",
    returned: "You signed in again. The change you were making was not saved — please make it again.",
    abandoned: "The security check was not completed. Nothing was changed.",
    requiredRead: "To see this, confirm it's you with your second step. Nothing was changed.",
    requiredReadList: "Confirm it's you to see:",
    passkeyRequired: "This action needs your passkey. Nothing was changed.",
    passkeyHow: "Sign in again and use your passkey — if the code is asked first, choose “Try another way”. No passkey yet? Set one up first.",
    confirmPasskey: "Confirm with my passkey",
    setUpPasskey: "Set up a passkey",
    actionRead: "Confirm it's you",
    returnedPending: "You signed in again. Your change has not been sent yet.",
    resend: "Send it now",
    discard: "Discard",
    dismiss: "Dismiss",
  },
  ar: {
    required: "لحمايتك، يحتاج هذا التغيير إلى تسجيل دخول حديث. لم يتغير شيء.",
    howTo: "سجّل الدخول مجددًا ثم كرّر التغيير. انسخ ما كتبته أولًا — تسجيل الدخول يعيد تحميل هذه الصفحة.",
    action: "تسجيل الدخول مجددًا",
    returned: "سجّلت الدخول مجددًا. لم يُحفظ التغيير الذي كنت تجريه — يرجى إجراؤه مرة أخرى.",
    abandoned: "لم يكتمل التحقق الأمني. لم يتغيّر شيء.",
    requiredRead: "لعرض هذا، أكّد هويتك بخطوتك الثانية. لم يتغيّر شيء.",
    requiredReadList: "أكّد هويتك لعرض:",
    passkeyRequired: "يحتاج هذا الإجراء إلى مفتاح المرور. لم يتغيّر شيء.",
    passkeyHow: "سجّل الدخول مجددًا واستخدم مفتاح المرور — وإن طُلب الرمز أولًا فاختر «تجربة طريقة أخرى». لا تملك مفتاح مرور بعد؟ أعدّه أولًا.",
    confirmPasskey: "التأكيد بمفتاح المرور",
    setUpPasskey: "إعداد مفتاح مرور",
    actionRead: "أكّد هويتك",
    returnedPending: "سجّلت الدخول مجددًا. لم يُرسَل تغييرك بعد.",
    resend: "أرسله الآن",
    discard: "تجاهل",
    dismiss: "إغلاق",
  },
} as const;

/** Start the sign-in round trip for a sensitive action and remember to explain it on return (and, given, the change to re-send). */
export async function requestReauthentication(signIn: (reauthenticate?: boolean) => Promise<void>, pending?: PendingChange) {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, at: Date.now() }));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch { /* storage unavailable: the page still works, only the return notice is skipped */ }
  await signIn(true);
}

/** The change kept for re-sending, once, while it is fresh; cleared either way so it is never sent twice. */
export function takePendingChange(now = Date.now()): PendingChange | null {
  try {
    const value = sessionStorage.getItem(PENDING_KEY);
    if (!value) return null;
    sessionStorage.removeItem(PENDING_KEY);
    const change = JSON.parse(value) as PendingChange & { at: number };
    if (typeof change.path !== "string" || !change.path.startsWith("/") || now - change.at >= PENDING_TTL_MS) return null;
    return { path: change.path, method: change.method, body: change.body };
  } catch { return null; }
}

/** True once after returning from a re-authentication this tab started; clears the marker. */
/**
 * Back from the re-check: "completed" when the identity provider signed the person in again after the request, "abandoned"
 * when they came back without signing in (QA W-30: then nothing may claim they did), null when there is nothing to report.
 */
export type ReauthenticationReturn = "completed" | "abandoned" | null;

export function takeReauthenticationReturn(authTimeSeconds?: number, now = Date.now()): ReauthenticationReturn {
  try {
    const value = sessionStorage.getItem(KEY);
    if (!value) return null;
    sessionStorage.removeItem(KEY);
    const requestedAt = Number(value);
    if (!(now - requestedAt < MARKER_TTL_MS)) return null;
    // A sign-in older than the request (a few seconds of clock skew allowed) is the session from before: no re-check happened.
    return typeof authTimeSeconds === "number" && authTimeSeconds * 1000 < requestedAt - 5_000 ? "abandoned" : "completed";
  } catch { return null; }
}
