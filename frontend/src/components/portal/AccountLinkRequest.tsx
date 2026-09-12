"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";
import { RELATIONSHIPS, type Relationship } from "@/lib/case-form-schema";

type View = { caseNumber: string; patientDisplayName: string; origin: "INTAKE" | "PROFILE"; submittedAs: "PATIENT" | "REPRESENTATIVE"; relationship: string | null; resolution: string | null };
type Api = <T,>(path: string, init?: RequestInit) => Promise<T>;

const copy = {
  en: {
    eyebrow: "Secure continuation",
    title: "Is this case for you?",
    intro: (c: string, n: string) => `Case ${c} was started for “${n}” using the email address of this account.`,
    why: "Sharing an email or phone within a family is common, so we never assume — please tell us how this case relates to you.",
    me: "Yes, this is me", meHelp: "The case joins your profile. Nothing is duplicated.",
    rep: "I'm helping this person", repHelp: "You'll coordinate on their behalf; their profile stays their own.",
    relationship: "Your relationship to the patient",
    decline: "This isn't me", declineHelp: "We'll set the email aside and a coordinator will follow up.",
    confirm: "Confirm", working: "Saving…", select: "Select…",
    doneMe: "This case now belongs to your profile.",
    doneRep: "You're now linked as this patient's representative.",
    doneDecline: "Thank you — the case will be reviewed by a coordinator.",
    invalid: "This link is no longer valid.",
    wrongAccount: "Please sign in with the account that received this email.",
    close: "Continue",
    relationships: { PARENT: "Parent", CHILD: "Child", SPOUSE: "Spouse", SIBLING: "Sibling", RELATIVE: "Relative", GUARDIAN: "Guardian", OTHER: "Other" } as Record<Relationship, string>,
  },
  ar: {
    eyebrow: "متابعة آمنة",
    title: "هل هذه الحالة لك؟",
    intro: (c: string, n: string) => `بدأت الحالة ${c} للمريض «${n}» باستخدام البريد الإلكتروني لهذا الحساب.`,
    why: "مشاركة البريد أو الهاتف بين أفراد العائلة أمر شائع، لذلك لا نفترض شيئًا — أخبرنا كيف ترتبط هذه الحالة بك.",
    me: "نعم، هذا أنا", meHelp: "تُضاف الحالة إلى ملفك دون أي تكرار.",
    rep: "أساعد هذا الشخص", repHelp: "ستنسّق نيابةً عنه، ويبقى ملفه ملكًا له.",
    relationship: "صلتك بالمريض",
    decline: "هذا ليس أنا", declineHelp: "سنضع البريد جانبًا وسيتابع المنسق الأمر.",
    confirm: "تأكيد", working: "جارٍ الحفظ…", select: "اختر…",
    doneMe: "أصبحت هذه الحالة ضمن ملفك.",
    doneRep: "تم ربطك كممثّل لهذا المريض.",
    doneDecline: "شكرًا لك — سيراجع المنسق الحالة.",
    invalid: "هذا الرابط لم يعد صالحًا.",
    wrongAccount: "يرجى تسجيل الدخول بالحساب الذي استلم هذه الرسالة.",
    close: "متابعة",
    relationships: { PARENT: "أحد الوالدين", CHILD: "ابن/ابنة", SPOUSE: "زوج/زوجة", SIBLING: "أخ/أخت", RELATIVE: "قريب", GUARDIAN: "وصي", OTHER: "أخرى" } as Record<Relationship, string>,
  },
};

/**
 * "Is this case for you?" — the authenticated owner of an already-registered email resolves, explicitly,
 * whether a case created with that address is theirs or someone they act for. Nothing is inferred from the
 * email match itself; the answer here is the only thing that links or delegates.
 */
export function AccountLinkRequest({ locale, token, api, onResolved }: { locale: Locale; token: string; api: Api; onResolved: () => void }) {
  const t = copy[locale];
  const [view, setView] = useState<View | null>(null);
  const [choice, setChoice] = useState<"SAME_PATIENT" | "REPRESENTATIVE" | "DECLINED" | "">("");
  const [relationship, setRelationship] = useState<Relationship | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string>("");

  useEffect(() => {
    let live = true;
    api<View>(`/patient/account/link-requests/${encodeURIComponent(token)}`)
      .then(v => { if (!live) return; setView(v); if (v.resolution) setDone(v.resolution === "SAME_PATIENT" ? t.doneMe : v.resolution === "REPRESENTATIVE" ? t.doneRep : t.doneDecline); })
      .catch((e: Error) => { if (live) setError(/account that received/i.test(e.message) ? t.wrongAccount : t.invalid); });
    return () => { live = false; };
  }, [api, token, t.doneMe, t.doneRep, t.doneDecline, t.wrongAccount, t.invalid]);

  async function confirm() {
    if (!choice || busy || (choice === "REPRESENTATIVE" && !relationship)) return;
    setBusy(true); setError("");
    try {
      const result = await api<View>(`/patient/account/link-requests/${encodeURIComponent(token)}/resolve`, { method: "POST", body: JSON.stringify({ resolution: choice, relationship: choice === "REPRESENTATIVE" ? relationship : null }) });
      setView(result);
      setDone(choice === "SAME_PATIENT" ? t.doneMe : choice === "REPRESENTATIVE" ? t.doneRep : t.doneDecline);
    } catch (e) { setError(e instanceof Error ? e.message : t.invalid); }
    finally { setBusy(false); }
  }

  return (
    <section className="card mb-6 border-brand-200 p-6 md:p-8" role="dialog" aria-labelledby="account-link-title" lang={locale}>
      <p className="eyebrow">{t.eyebrow}</p>
      <h2 id="account-link-title" className="title mt-2">{t.title}</h2>
      {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-4 text-sm text-alert-800">{error}</p>}
      {view && !done && (
        <>
          <p className="lead mt-3">{t.intro(view.caseNumber, view.patientDisplayName)}</p>
          <p className="mt-2 text-sm leading-6 text-ink-500">{t.why}</p>
          <div className="mt-6 grid gap-3" role="radiogroup" aria-label={t.title}>
            {([["SAME_PATIENT", t.me, t.meHelp], ["REPRESENTATIVE", t.rep, t.repHelp], ["DECLINED", t.decline, t.declineHelp]] as const).map(([key, label, help]) => (
              <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${choice === key ? "border-brand-600 bg-brand-50" : "border-line bg-white hover:border-brand-300"}`}>
                <input type="radio" name="account-link" className="mt-1 h-5 w-5 accent-brand-600" value={key} checked={choice === key} onChange={() => setChoice(key)} />
                <span><strong className="block text-ink-900">{label}</strong><span className="text-sm leading-6 text-ink-500">{help}</span></span>
              </label>
            ))}
          </div>
          {choice === "REPRESENTATIVE" && (
            <label className="mt-4 block max-w-sm">
              <span className="mb-2 block text-sm font-bold text-ink-800">{t.relationship}</span>
              <select className="field" value={relationship} onChange={e => setRelationship(e.target.value as Relationship | "")}>
                <option value="">{t.select}</option>
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{t.relationships[r]}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="btn-primary mt-6 w-full sm:w-auto" disabled={busy || !choice || (choice === "REPRESENTATIVE" && !relationship)} onClick={() => void confirm()}>
            {busy ? t.working : t.confirm}
          </button>
        </>
      )}
      {done && (
        <>
          <p className="lead mt-3" role="status">{done}</p>
          <button type="button" className="btn-primary mt-6 w-full sm:w-auto" onClick={onResolved}>{t.close}</button>
        </>
      )}
    </section>
  );
}
