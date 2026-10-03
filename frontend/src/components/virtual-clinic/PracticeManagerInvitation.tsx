"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import type { ManagerInvitation } from "./virtual-clinic-model";

export function PracticeManagerInvitation({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading, signIn } = useAuth();
  const [invites, setInvites] = useState<ManagerInvitation[]>([]);
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const token = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? "";

  useEffect(() => {
    if (!user?.access_token) return;
    void apiFetchAs(user.access_token, "/clinics/invitations/mine")
      .then(async response => response.ok ? response.json() as Promise<ManagerInvitation[]> : [])
      .then(setInvites).catch(() => setInvites([]));
  }, [user?.access_token]);

  const accept = async () => {
    if (!user?.access_token || !token) return;
    setState("working"); setMessage("");
    const response = await apiFetchAs(user.access_token, "/clinics/invitations/accept", { method: "POST", body: JSON.stringify({ token }) });
    if (response.ok) { setState("done"); return; }
    if (response.status === 401) { await signIn(true); return; }
    const body = await response.json().catch(() => ({})) as { message?: string };
    setMessage(body.message ?? (ar ? "تعذر قبول الدعوة." : "The invitation could not be accepted.")); setState("error");
  };

  if (loading) return <main className="container-site section"><p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (!user) return <main className="container-site section"><div className="card max-w-2xl p-6"><h1 className="title">{ar ? "دعوة مدير العيادة" : "Practice Manager invitation"}</h1><p className="mt-3 text-ink-600">{ar ? "سجّل الدخول بالبريد المدعو والمصادقة متعددة العوامل لمراجعة التفويض وقبوله." : "Sign in with the invited email and multi-factor authentication to review and accept this delegation."}</p><button className="btn-primary mt-5" onClick={() => void signIn(true)}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button></div></main>;
  if (state === "done") return <main className="container-site section"><div className="card max-w-2xl p-6"><h1 className="title">{ar ? "تم قبول التفويض" : "Delegation accepted"}</h1><p className="mt-3 text-ink-600">{ar ? "يمكنك الآن فتح العيادة الافتراضية ضمن الصلاحيات التي وافقت عليها." : "You can now open the Virtual Clinic within the permissions you accepted."}</p><a className="btn-primary mt-5 inline-flex" href={`/${locale}/portal/virtual-clinic`}>{ar ? "فتح العيادة الافتراضية" : "Open Virtual Clinic"}</a></div></main>;
  const invite = invites[0];
  return <main className="container-site section"><div className="card max-w-2xl p-6">
    <h1 className="title">{ar ? "دعوة مدير العيادة" : "Practice Manager invitation"}</h1>
    <p className="mt-3 text-ink-600">{invite ? (ar ? `دعاك ${invite.consultantName} للمساعدة في إدارة عيادته الافتراضية.` : `${invite.consultantName} invited you to help administer their Virtual Clinic.`) : (ar ? "راجع التفويض الآمن أدناه." : "Review the secure delegation below.")}</p>
    {invite && <ul className="mt-4 list-disc space-y-1 ps-5 text-sm text-ink-700">{invite.permissions.map(permission => <li key={permission}>{permission}</li>)}</ul>}
    <p className="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-ink-700">{ar ? "لا يمنح هذا التفويض أي وصول إلى المرضى أو الحالات أو المستندات أو الرسائل أو المهام أو الإحالات أو القرارات السريرية." : "This delegation grants no access to patients, cases, documents, messages, tasks, referrals, credential decisions, or clinical information."}</p>
    {!token && <p role="alert" className="mt-4 text-danger">{ar ? "رابط الدعوة غير صالح." : "The invitation link is invalid."}</p>}
    {message && <p role="alert" className="mt-4 text-danger">{message}</p>}
    <button className="btn-primary mt-5" disabled={!token || state === "working"} onClick={() => void accept()}>{state === "working" ? (ar ? "جارٍ القبول…" : "Accepting…") : (ar ? "قبول التفويض" : "Accept delegation")}</button>
  </div></main>;
}
