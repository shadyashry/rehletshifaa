"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

type Invitation = { commissioningId: string; participantType: "OWNER" | "ADMINISTRATOR"; subject: string; status: string };

export function CommissioningAcceptance({ locale }: { locale: Locale }) {
  const ar = locale === "ar"; const { user, loading, signIn } = useAuth();
  const [invitation, setInvitation] = useState<Invitation | null>(null); const [reason, setReason] = useState("");
  const [error, setError] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!user) return; void apiFetchAs(user.access_token, "/governance/commissioning/current-invitation").then(async response => {
    if (!response.ok) throw new Error(response.status === 404 ? (ar ? "لا توجد دعوة تهيئة نشطة لهذا الحساب." : "No active commissioning invitation was found for this account.") : (ar ? "تعذّر تحميل الدعوة." : "The invitation could not be loaded."));
    setInvitation(await response.json());
  }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))); }, [ar, user]);
  async function accept() { if (!user || !invitation) return; setBusy(true); setError(""); try {
    const response = await apiFetchAs(user.access_token, `/governance/commissioning/${invitation.commissioningId}/acceptance`, { method: "POST", body: JSON.stringify({ reason }) });
    if (response.status === 401) { await signIn(true); return; }
    if (!response.ok) throw new Error(ar ? "تعذّر تسجيل القبول." : "Acceptance could not be recorded.");
    setDone(true);
  } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  return <main className="min-h-screen bg-mist py-10"><div className="container-site max-w-3xl"><section className="card p-6 sm:p-8"><p className="eyebrow">{ar ? "تهيئة حوكمة المنصة" : "Platform governance commissioning"}</p><h1 className="title mt-2">{ar ? "قبول مسؤولية مميّزة" : "Accept a privileged responsibility"}</h1>
    {loading ? <p role="status" className="mt-4">{ar ? "جارٍ التحقق…" : "Checking…"}</p> : !user ? <button className="btn-primary mt-5" onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button> : done ? <p role="status" className="mt-5 rounded-xl bg-brand-50 p-4 text-brand-800">{ar ? "تم تسجيل قبولك. ستكتمل التهيئة بعد قبول المشاركين الثلاثة." : "Your acceptance was recorded. Commissioning completes after all three participants accept."}</p> : <>
      {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-4 text-alert-800">{error}</p>}
      {invitation && <><p className="mt-4 text-sm leading-7 text-ink-600">{invitation.participantType === "OWNER" ? (ar ? "ستصبح المالك التنفيذي المسؤول عن مراجعة الأداء وحوكمة السلطة، وليست هذه صلاحية تشغيلية أو سريرية." : "You will become the executive owner accountable for performance and authority governance. This is not operational or clinical access.") : (ar ? "ستصبح مسؤول نظام لحوكمة الوصول فقط. لا يمنح ذلك وصولًا تلقائيًا للحالات أو العمل السريري أو المالي." : "You will become a System Administrator for access governance only. It grants no automatic case, clinical, or finance access.")}</p>
        <ul className="mt-4 list-disc space-y-2 ps-5 text-sm text-ink-600"><li>{ar ? "هذا القبول مرتبط بحسابك ولا يمكن تفويضه." : "This acceptance is bound to your signed-in identity and cannot be delegated."}</li><li>{ar ? "يتطلب مفتاح مرور حديثًا ويُسجّل في سجل تدقيق دائم." : "A recent passkey authentication is required and permanently audited."}</li><li>{ar ? "حافظ على وسائل الاسترداد خارج النظام وفق إجراءات المؤسسة ولا تشارك بيانات الدخول." : "Keep recovery methods under the organization’s sealed procedure and never share credentials."}</li></ul>
        <label className="mt-5 block text-sm font-semibold">{ar ? "سبب القبول" : "Acceptance reason"}<textarea className="mt-1 w-full" required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="btn-primary mt-4" disabled={busy || !reason.trim()} onClick={() => void accept()}>{busy ? (ar ? "جارٍ التسجيل…" : "Recording…") : (ar ? "قبول المسؤولية" : "Accept responsibility")}</button></>}
    </>}
  </section></div></main>;
}
