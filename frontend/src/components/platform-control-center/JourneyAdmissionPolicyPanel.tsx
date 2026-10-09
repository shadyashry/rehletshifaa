"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { Section, StatusBadge } from "./cc-ui";
import type { JourneyReadiness, JourneyVersion } from "./journey-types";

export type JourneyAdmissionPolicy = {
  id: string; journeyVersionId: string; versionNumber: number; eligibilityScope: string; careCategories: string[];
  state: string; readiness: string; revision: number;
  preparedBy: string; preparationReason: string; preparedAt: string;
  approvedBy: string | null; approvalReason: string | null; approvedAt: string | null;
  pausedBy: string | null; pauseReason: string | null; pausedAt: string | null;
};
type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
const copy = {
  en: {
    title: "New case admission policy", intro: "A Journey Manager prepares a policy for one exact published version. A different Journey Approver activates it after readiness checks. Existing cases keep their pinned versions and continue when admission is paused.",
    loading: "Loading admission policies…", error: "Could not load admission policies.", refresh: "Reload policies", empty: "No admission policy has been prepared.",
    prepare: "Prepare admission policy", version: "Exact published version", scope: "Eligible new cases", all: "All new cases", categories: "Selected care categories", categoryList: "Care category keys (comma separated)",
    reason: "Reason", approve: "Approve and activate", reject: "Reject policy", pause: "Pause new admissions", cancel: "Cancel", history: "Policy revision history", readiness: "Readiness", revision: "Revision", prepared: "Prepared", decided: "Decision", paused: "Paused",
    independent: "A different Journey Approver must approve or reject this policy.", pending: "A policy is awaiting review. Decide it before preparing another.", noPublished: "Publish a Journey version before preparing an admission policy.",
    consequences: "Activation replaces the current admission policy for new cases. Pause stops new Journey admissions. Existing cases continue on their pinned versions; intake remains available.",
    states: { PENDING_APPROVAL: "Awaiting independent approval", ACTIVE: "Active", PAUSED: "Paused", SUPERSEDED: "Superseded", REJECTED: "Rejected" },
  },
  ar: {
    title: "سياسة قبول الحالات الجديدة", intro: "يُعدّ مدير الرحلات سياسة لإصدار منشور محدد. يفعّلها معتمد رحلات آخر بعد التحقق من الجاهزية. تحتفظ الحالات القائمة بإصداراتها المثبتة وتستمر عند إيقاف القبول.",
    loading: "جارٍ تحميل سياسات القبول…", error: "تعذّر تحميل سياسات القبول.", refresh: "إعادة تحميل السياسات", empty: "لم تُعدّ سياسة قبول بعد.",
    prepare: "إعداد سياسة قبول", version: "الإصدار المنشور المحدد", scope: "الحالات الجديدة المؤهلة", all: "جميع الحالات الجديدة", categories: "فئات رعاية محددة", categoryList: "مفاتيح فئات الرعاية (مفصولة بفواصل)",
    reason: "السبب", approve: "الموافقة والتفعيل", reject: "رفض السياسة", pause: "إيقاف القبول الجديد", cancel: "إلغاء", history: "سجل مراجعات السياسة", readiness: "الجاهزية", revision: "المراجعة", prepared: "الإعداد", decided: "القرار", paused: "الإيقاف",
    independent: "يجب أن يوافق معتمد رحلات آخر على هذه السياسة أو يرفضها.", pending: "تنتظر سياسة المراجعة. يجب البت فيها قبل إعداد سياسة أخرى.", noPublished: "انشر إصدار رحلة قبل إعداد سياسة قبول.",
    consequences: "يستبدل التفعيل سياسة قبول الحالات الجديدة الحالية. يوقف الإيقاف القبول الجديد للرحلات. تستمر الحالات القائمة بإصداراتها المثبتة ويظل استقبال الحالات متاحًا.",
    states: { PENDING_APPROVAL: "بانتظار موافقة مستقلة", ACTIVE: "فعّالة", PAUSED: "متوقفة", SUPERSEDED: "مستبدلة", REJECTED: "مرفوضة" },
  },
};

export function JourneyAdmissionPolicyPanel({ locale, definitionId, versions, permissions, currentUser, api, onChanged }: {
  locale: Locale; definitionId: string; versions: JourneyVersion[]; permissions: string[]; currentUser?: string;
  api: Api; onChanged: () => Promise<void>;
}) {
  const t = copy[locale];
  const [policies, setPolicies] = useState<JourneyAdmissionPolicy[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [versionId, setVersionId] = useState("");
  const [scope, setScope] = useState("ALL_NEW_CASES");
  const [categories, setCategories] = useState("");
  const [reason, setReason] = useState("");
  // Runtime readiness is kept with the version it was read for; another version's is unknown until read.
  const [readinessRead, setReadinessRead] = useState<{ versionId: string; status: string } | null>(null);
  const readiness = readinessRead?.versionId === versionId ? readinessRead.status : null;
  const [decision, setDecision] = useState<{ action: "approve" | "reject" | "pause"; policy: JourneyAdmissionPolicy } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const allowed = (permission: string) => permissions.includes(permission);
  const base = "/admin/journey-cutover/policies";
  const published = versions.filter((v) => v.status === "PUBLISHED");
  const pending = policies?.some((p) => p.state === "PENDING_APPROVAL");
  const refresh = useCallback(async () => {
    try { setPolicies(await api<JourneyAdmissionPolicy[]>(base)); setError(""); }
    catch (e) { setPolicies(null); setError(e instanceof Error ? e.message : t.error); }
  }, [api, t.error]);
  useEffect(() => {
    let live = true;
    api<JourneyAdmissionPolicy[]>(base).then((rows) => { if (live) { setPolicies(rows); setError(""); } },
      (e) => { if (live) { setPolicies(null); setError(e instanceof Error ? e.message : t.error); } });
    return () => { live = false; };
  }, [api, t.error]);
  useEffect(() => {
    let cancelled = false;
    if (versionId) void api<JourneyReadiness>(`/admin/journeys/${definitionId}/versions/${versionId}/runtime`)
      .then((value) => { if (!cancelled) setReadinessRead({ versionId, status: value.status }); })
      .catch(() => { if (!cancelled) setReadinessRead({ versionId, status: "UNKNOWN" }); });
    return () => { cancelled = true; };
  }, [api, definitionId, versionId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policies || busy || !reason.trim() || !versionId || pending) return;
    setBusy(true); setError("");
    try {
      await api(base, "POST", { journeyVersionId: versionId, eligibilityScope: scope,
        careCategories: scope === "CARE_CATEGORY" ? categories.split(",").map((c) => c.trim()).filter(Boolean) : [], reason: reason.trim() });
      setReason(""); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); }
    finally { setBusy(false); }
  };
  const decide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision || busy || !decisionReason.trim()) return;
    setBusy(true); setError("");
    try {
      await api(`${base}/${decision.policy.id}/${decision.action}`, "POST", { revision: decision.policy.revision, reason: decisionReason.trim() });
      setDecision(null); await refresh(); await onChanged();
    } catch (e) {
      // Keep the attempted revision pinned until the operator explicitly reloads and reviews it.
      setError(e instanceof Error ? e.message : t.error);
    } finally { setBusy(false); }
  };
  const open = (action: "approve" | "reject" | "pause", policy: JourneyAdmissionPolicy) => { setDecision({ action, policy }); setDecisionReason(""); };
  const actionLabel = (action: "approve" | "reject" | "pause") => t[action];
  const when = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const evidence = (label: string, actor: string | null, why: string | null, at: string | null) => actor && <p className="cc-meta">{label}: <bdi>{actor}</bdi> · {at ? when(at) : "—"}<br /><bdi>{why}</bdi></p>;

  return <Section title={t.title} id="journey-admission-policy">
    <p className="cc-meta">{t.intro}</p>
    {error && !decision && <p role="alert">{error}</p>}
    <button type="button" className="cc-secondary cc-small" disabled={busy} onClick={() => { setDecision(null); void refresh(); }}>{t.refresh}</button>
    {!policies && !error && <p role="status">{t.loading}</p>}
    {policies && <>
      {!policies.length && <p>{t.empty}</p>}
      <h3 className="cc-subhead">{t.history}</h3>
      <ul className="cc-journey-steps" aria-label={t.history}>
        {policies.map((p) => <li key={p.id}>
          <div><strong>{t.version}: {p.versionNumber}</strong> · <bdi dir="ltr">{p.journeyVersionId}</bdi> <StatusBadge tone={p.state === "ACTIVE" ? "success" : p.state === "PENDING_APPROVAL" ? "warning" : "neutral"}>{t.states[p.state as keyof typeof t.states] ?? p.state}</StatusBadge></div>
          <p className="cc-meta">{t.scope}: {p.eligibilityScope === "ALL_NEW_CASES" ? t.all : p.careCategories.join(", ")} · {t.readiness}: <bdi>{p.readiness}</bdi> · {t.revision}: {p.revision}</p>
          {evidence(t.prepared, p.preparedBy, p.preparationReason, p.preparedAt)}
          {evidence(t.decided, p.approvedBy, p.approvalReason, p.approvedAt)}
          {evidence(t.paused, p.pausedBy, p.pauseReason, p.pausedAt)}
          {p.state === "PENDING_APPROVAL" && allowed("JOURNEY_APPROVE") && <>
            <div className="cc-toolbar">
              <button type="button" disabled={busy || !currentUser || currentUser === p.preparedBy || p.readiness !== "DEPLOYED"} onClick={() => open("approve", p)}>{t.approve}</button>
              <button type="button" className="cc-secondary" disabled={busy || !currentUser || currentUser === p.preparedBy} onClick={() => open("reject", p)}>{t.reject}</button>
            </div>
            {currentUser === p.preparedBy && <p className="cc-meta">{t.independent}</p>}
          </>}
          {p.state === "ACTIVE" && allowed("JOURNEY_ADMISSION_PAUSE") && <button type="button" className="cc-secondary" disabled={busy} onClick={() => open("pause", p)}>{t.pause}</button>}
        </li>)}
      </ul>
      {allowed("JOURNEY_EDIT") && (pending ? <p className="cc-meta">{t.pending}</p> : !published.length ? <p>{t.noPublished}</p> : <form onSubmit={submit}>
        <h3 className="cc-subhead">{t.prepare}</h3>
        <label className="cc-field"><span>{t.version}</span><select required value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={busy}>
          <option value="">—</option>{published.map((v) => <option key={v.id} value={v.id}>{v.number} · {v.id}</option>)}
        </select></label>
        {versionId && <p className="cc-meta" role="status">{t.readiness}: {readiness ?? "…"}</p>}
        <label className="cc-field"><span>{t.scope}</span><select value={scope} onChange={(e) => setScope(e.target.value)} disabled={busy}>
          <option value="ALL_NEW_CASES">{t.all}</option><option value="CARE_CATEGORY">{t.categories}</option>
        </select></label>
        {scope === "CARE_CATEGORY" && <label className="cc-field"><span>{t.categoryList}</span><input required value={categories} onChange={(e) => setCategories(e.target.value)} disabled={busy} pattern="[a-z0-9][a-z0-9-]{0,59}(\s*,\s*[a-z0-9][a-z0-9-]{0,59})*" /></label>}
        <label className="cc-field"><span>{t.reason}</span><textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !versionId || !reason.trim() || (scope === "CARE_CATEGORY" && !categories.trim())}>{t.prepare}</button>
      </form>)}
    </>}
    {decision && <FocusTrapDialog label={actionLabel(decision.action)} onClose={busy ? () => undefined : () => setDecision(null)}>
      <form onSubmit={decide}>
        <h2>{actionLabel(decision.action)}</h2>
        {error && <p role="alert">{error}</p>}
        <p>{t.version}: {decision.policy.versionNumber} · <bdi>{decision.policy.journeyVersionId}</bdi> · {t.revision}: {decision.policy.revision}</p>
        <p>{t.consequences}</p>
        <label className="cc-field"><span>{t.reason}</span><textarea required maxLength={500} value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} disabled={busy} /></label>
        <div className="cc-form-actions"><button disabled={busy || !decisionReason.trim()}>{actionLabel(decision.action)}</button><button type="button" className="cc-secondary" disabled={busy} onClick={() => setDecision(null)}>{t.cancel}</button></div>
      </form>
    </FocusTrapDialog>}
  </Section>;
}
