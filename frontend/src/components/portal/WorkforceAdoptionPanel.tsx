"use client";

import { useEffect, useState } from "react";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

type Adoption = { id: string; name: string; email: string; status: string; revision: number };

/** Holder-only acceptance. The backend derives the holder from the token and re-resolves the verified email. */
export function WorkforceAdoptionPanel({ locale, token, onAccepted }: { locale: Locale; token: string; onAccepted: () => void }) {
  const ar = locale === "ar";
  const [items, setItems] = useState<Adoption[] | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    const response = await apiFetchAs(token, "/me/workforce-adoptions");
    if (!response.ok) throw new Error(String(response.status));
    setItems(await response.json() as Adoption[]);
  };
  useEffect(() => { void load().catch(() => setError(ar ? "تعذّر تحميل الدعوة." : "We couldn't load the invitation.")); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const accept = async (item: Adoption) => {
    setError("");
    const response = await apiFetchAs(token, `/me/workforce-adoptions/${item.id}/accept`, { method: "POST", body: JSON.stringify({ revision: item.revision }) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      setError(body.message ?? (ar ? "تعذّر قبول الدعوة." : "We couldn't accept the invitation."));
      return;
    }
    onAccepted();
  };
  return <section className="card max-w-2xl p-6 sm:p-8" aria-labelledby="workforce-adoption-title">
    <h2 id="workforce-adoption-title" className="title">{ar ? "اقبل دعوة العمل" : "Accept your workforce invitation"}</h2>
    <p className="mt-2 text-sm leading-6 text-ink-600">{ar ? "تحققت المنصة من البريد لدى مزود الهوية. يؤكد القبول ربط هذه الهوية؛ ولا تصبح الصلاحيات فعالة قبل التفعيل والتحقق بخطوتين." : "The platform resolved the verified email at the identity provider. Acceptance links this identity; authority remains inactive until activation and two-step verification succeed."}</p>
    {error && <p role="alert" className="mt-4 text-sm text-alert-800">{error}</p>}
    {items === null && !error ? <p role="status" className="mt-4 text-sm">{ar ? "جارٍ التحميل…" : "Loading…"}</p> : null}
    {items?.map((item) => <div key={item.id} className="mt-5 rounded-lg border border-line p-4">
      <strong className="block text-ink-900">{item.name}</strong><span className="block text-sm text-ink-600">{item.email}</span>
      <button type="button" className="btn-primary mt-4" onClick={() => void accept(item)}>{ar ? "قبول وربط هويتي" : "Accept and link my identity"}</button>
    </div>)}
  </section>;
}
