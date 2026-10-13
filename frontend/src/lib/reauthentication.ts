/**
 * Recent-authentication UX. Sensitive actions (credential decisions, activation, access and journey governance)
 * return `REAUTHENTICATION_REQUIRED` when the sign-in is older than the backend's window. Nothing is changed by
 * that response. The UI explains why and lets the person sign in again on request. The portal also keeps the refused
 * request itself (this tab only, a few minutes) so that, back from the sign-in, the person sends it with one click
 * instead of filling the form again (QA #6 / W-6); elsewhere they are told to repeat the change.
 */
export const REAUTHENTICATION_REQUIRED = "REAUTHENTICATION_REQUIRED";
/** Governance actions (owner decisions, owner transfer) ask specifically for a passkey sign-in; the remedy is the same. */
export const isReauthenticationCode = (code: unknown) => code === REAUTHENTICATION_REQUIRED || code === "PHISHING_RESISTANT_AUTHENTICATION_REQUIRED";
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
export function takeReauthenticationReturn(now = Date.now()): boolean {
  try {
    const value = sessionStorage.getItem(KEY);
    if (!value) return false;
    sessionStorage.removeItem(KEY);
    return now - Number(value) < MARKER_TTL_MS;
  } catch { return false; }
}
