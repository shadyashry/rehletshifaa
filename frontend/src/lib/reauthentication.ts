/**
 * Recent-authentication UX. Sensitive actions (credential decisions, activation, access and journey governance)
 * return `REAUTHENTICATION_REQUIRED` when the sign-in is older than the backend's window. Nothing is changed by
 * that response. The UI explains why, lets the person sign in again on request, and — because the sign-in round
 * trip reloads the page and a half-filled form cannot be restored — tells them on return to repeat the change.
 */
export const REAUTHENTICATION_REQUIRED = "REAUTHENTICATION_REQUIRED";
/** Governance actions (owner decisions, owner transfer) ask specifically for a passkey sign-in; the remedy is the same. */
export const isReauthenticationCode = (code: unknown) => code === REAUTHENTICATION_REQUIRED || code === "PHISHING_RESISTANT_AUTHENTICATION_REQUIRED";
const KEY = "rs:reauthentication-requested";
/** A marker older than this is stale (the person abandoned the sign-in); never show the return notice for it. */
const MARKER_TTL_MS = 30 * 60_000;

export const reauthenticationCopy = {
  en: {
    required: "For your security, this change needs a recent sign-in. Nothing was changed.",
    howTo: "Sign in again, then repeat the change. Copy anything you typed first — signing in reloads this page.",
    action: "Sign in again",
    returned: "You signed in again. The change you were making was not saved — please make it again.",
    dismiss: "Dismiss",
  },
  ar: {
    required: "لحمايتك، يحتاج هذا التغيير إلى تسجيل دخول حديث. لم يتغير شيء.",
    howTo: "سجّل الدخول مجددًا ثم كرّر التغيير. انسخ ما كتبته أولًا — تسجيل الدخول يعيد تحميل هذه الصفحة.",
    action: "تسجيل الدخول مجددًا",
    returned: "سجّلت الدخول مجددًا. لم يُحفظ التغيير الذي كنت تجريه — يرجى إجراؤه مرة أخرى.",
    dismiss: "إغلاق",
  },
} as const;

/** Start the sign-in round trip for a sensitive action and remember to explain it on return. */
export async function requestReauthentication(signIn: (reauthenticate?: boolean) => Promise<void>) {
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage unavailable: the page still works, only the return notice is skipped */ }
  await signIn(true);
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
