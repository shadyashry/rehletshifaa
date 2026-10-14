import type { Locale } from "@/lib/i18n";
import type { Me } from "@/lib/access";

/**
 * D1 / MFA-1 (owner, 2026-10-14): staff sessions carry a second factor — the authenticator app, or a passkey for privileged
 * roles. When `/me` says the session lacks it, the app finishes the sign-in once, automatically (Keycloak asks only for the
 * second step); if the person comes back without it, a page explains and offers to continue instead of looping.
 */
const KEY = "rs:second-step-attempt";
const RETRY_AFTER_MS = 3 * 60_000;

export type SecondStepPlan = "none" | "redirect" | "gate";

/** What to do for this session: nothing, finish the sign-in now, or explain (an attempt just came back incomplete). */
export function secondStepPlan(me: Me | null, lastAttemptAt: number | null, now = Date.now()): SecondStepPlan {
  if (!me?.secondFactorRequired || !me.signInAcr) return "none";
  return lastAttemptAt != null && now - lastAttemptAt < RETRY_AFTER_MS ? "gate" : "redirect";
}

export function lastSecondStepAttempt(): number | null {
  try { const value = Number(sessionStorage.getItem(KEY)); return Number.isFinite(value) && value > 0 ? value : null; } catch { return null; }
}

export function rememberSecondStepAttempt(now = Date.now()) {
  try { sessionStorage.setItem(KEY, String(now)); } catch { /* storage unavailable: the gate shows instead of a second redirect */ }
}

/** Only the staff surfaces wait for the second step; public pages stay open. */
export function guardsSecondStep(pathname: string) {
  return /^\/(en|ar)\/(portal|control-center)(\/|$)/.test(pathname);
}

export const secondStepCopy: Record<Locale, {
  title: string; app: string; passkey: string; firstTime: string; continue: string; signOut: string;
}> = {
  en: {
    title: "Finish signing in",
    app: "Staff accounts use a second step: the code from your authenticator app. Nothing opens until you complete it.",
    passkey: "Your role signs in with a second step — your passkey (fingerprint, face or device PIN) or authenticator app — and confirms sensitive actions with the passkey. Nothing opens until you complete it.",
    firstTime: "If you haven't set it up yet, you'll be guided through it now. It takes about a minute.",
    continue: "Continue",
    signOut: "Sign out",
  },
  ar: {
    title: "أكمل تسجيل الدخول",
    app: "تستخدم حسابات الفريق خطوة ثانية: الرمز من تطبيق المصادقة. لن يُفتح شيء قبل إكمالها.",
    passkey: "يسجّل دورك الدخول بخطوة ثانية — مفتاح المرور (البصمة أو الوجه أو رمز الجهاز) أو تطبيق المصادقة — ويؤكّد الإجراءات الحساسة بمفتاح المرور. لن يُفتح شيء قبل إكمالها.",
    firstTime: "إن لم تُعدّها بعد، فسنرشدك إلى إعدادها الآن. يستغرق ذلك نحو دقيقة.",
    continue: "متابعة",
    signOut: "تسجيل الخروج",
  },
};
