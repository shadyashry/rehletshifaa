"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { EmptyState, ErrorNotice, StatusBadge } from "./cc-ui";
import { approvalStatusLabel, careAreaLabel, credentialDisplayStatus, credentialReviewStatus, credentialTypeLabel, formatDate } from "./admin-labels";
import { personName, useProviderDirectory } from "./provider-directory";
import type { Revision } from "./consultant-setup";
import type { DirectConsultant } from "./ConsultantDirectory";

/**
 * Credentials › Review queue — an operational queue, oldest first. The backend only exposes a per-organization
 * queue (`GET /admin/providers/{id}/credential-reviews`, gated on `credential.review`), so this aggregates the queues
 * of every organization the caller can see; organizations the caller cannot review simply contribute nothing.
 */
export function CredentialQueue({ locale, initialOrg, initialView }: { locale: Locale; initialOrg?: string; initialView?: "provider" | "direct" }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const canProvider = access.can("credential.review"), canDirect = access.legacy.admin;
  const [view, setView] = useState<"provider" | "direct">(initialView ?? "provider");
  const current = view === "provider" && !canProvider && canDirect ? "direct" : view;
  const title = ar ? "مراجعة التراخيص والمؤهلات" : "Credential Reviews";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="credentials" title={title} intro={ar ? "التراخيص والشهادات التي تنتظر قرارًا، الأقدم أولًا." : "Licences and certificates waiting for a decision, oldest first."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canProvider && !canDirect) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى مراجعة الاعتمادات" : "You don't have access to credential reviews"} />);
  return shell(
    <>
      {canProvider && canDirect && (
        <div className="cc-segmented" role="group" aria-label={title}>
          <button type="button" aria-pressed={current === "provider"} onClick={() => setView("provider")}>{ar ? "اعتمادات المؤسسات" : "Provider credentials"}</button>
          <button type="button" aria-pressed={current === "direct"} onClick={() => setView("direct")}>{ar ? "اعتماد الاستشاريين المباشرين" : "Direct consultant approvals"}</button>
        </div>
      )}
      {current === "provider" ? <ProviderQueue locale={locale} initialOrg={initialOrg} /> : <DirectApprovals locale={locale} />}
    </>
  );
}

function ProviderQueue({ locale, initialOrg }: { locale: Locale; initialOrg?: string }) {
  const ar = locale === "ar";
  const api = useAdminApi();
  const directory = useProviderDirectory(true);
  const [rows, setRows] = useState<Revision[] | null>(null); const [error, setError] = useState<unknown>(null);
  const [org, setOrg] = useState(initialOrg ?? ""); const [type, setType] = useState(""); const [status, setStatus] = useState("");
  const orgIds = useMemo(() => directory.details.map((d) => d.organization.id).join(","), [directory.details]);
  const load = useCallback(async () => {
    if (directory.loading) return;
    setError(null);
    try {
      const perOrg = await Promise.allSettled(directory.details.map((d) => api<Revision[]>(`/admin/providers/${d.organization.id}/credential-reviews`)));
      setRows(perOrg.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)));
    } catch (e) { setError(e); setRows([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIds, directory.loading, api]);
  useEffect(() => { void load(); }, [load]);
  if (directory.loading || rows === null) return <p role="status">{ar ? "جارٍ تحميل قائمة المراجعة…" : "Loading the review queue…"}</p>;
  if (directory.error || error) return <ErrorNotice error={directory.error ?? error} locale={locale} action="load" onRetry={() => { void directory.reload(); void load(); }} />;
  const orgName = (id: string) => directory.details.find((d) => d.organization.id === id)?.organization.displayName ?? (ar ? "مؤسسة" : "Organization");
  const person = (r: Revision) => { const m = directory.details.find((d) => d.organization.id === r.organizationId)?.members.find((x) => x.practitionerId === r.practitionerId); return m ? personName(m, locale) : (ar ? "طبيب" : "Clinician"); };
  const types = Array.from(new Set(rows.map((r) => r.credentialType))).sort();
  const filtered = rows.filter((r) => (!org || r.organizationId === org) && (!type || r.credentialType === type) && (!status || r.status === status));
  return (
    <>
      <div className="cc-filterbar">
        <label>{ar ? "المؤسسة" : "Organization"}<select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">{ar ? "كل المؤسسات" : "All organizations"}</option>{directory.details.map((d) => <option key={d.organization.id} value={d.organization.id}>{d.organization.displayName}</option>)}</select></label>
        <label>{ar ? "نوع الاعتماد" : "Credential type"}<select value={type} onChange={(e) => setType(e.target.value)}><option value="">{ar ? "كل الأنواع" : "All types"}</option>{types.map((v) => <option key={v} value={v}>{credentialTypeLabel(v, locale)}</option>)}</select></label>
        <label>{ar ? "الحالة" : "Status"}<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{ar ? "كل الحالات" : "All statuses"}</option>{["SUBMITTED", "UNDER_REVIEW"].map((v) => <option key={v} value={v}>{credentialReviewStatus(v, locale).label}</option>)}</select></label>
      </div>
      {!filtered.length ? <EmptyState title={ar ? "لا توجد اعتمادات بانتظار المراجعة" : "No credentials are waiting for review"} body={rows.length ? (ar ? "غيّر عوامل التصفية لعرض المزيد." : "Change the filters to see more.") : (ar ? "ستظهر الاعتمادات هنا عندما تُرسل للمراجعة." : "Credentials appear here when they are sent for review.")} /> : (
        <ul className="cc-list" aria-label={ar ? "قائمة المراجعة" : "Review queue"}>
          <li className="cc-list-head" aria-hidden><span>{ar ? "الاعتماد" : "Credential"}</span><span>{ar ? "المؤسسة" : "Organization"}</span><span>{ar ? "الحالة" : "Status"}</span><span /></li>
          {filtered.map((r) => { const s = credentialDisplayStatus(r.status, r.expiresAt, locale); return (
            <li key={r.id}>
              <span><strong>{credentialTypeLabel(r.credentialType, locale)}</strong><span className="cc-row-sub">{person(r)} · {ar ? "أُرسل" : "Submitted"} {formatDate(r.submittedAt, locale)}{r.revisionNumber > 1 ? (ar ? ` · إرسال رقم ${r.revisionNumber}` : ` · submission ${r.revisionNumber}`) : ""}</span></span>
              <span>{orgName(r.organizationId)}{r.expiresAt && <span className="cc-row-sub">{ar ? "ينتهي" : "Expires"} {formatDate(r.expiresAt, locale)}</span>}</span>
              <span><StatusBadge tone={s.tone}>{s.label}</StatusBadge></span>
              <span className="cc-row-actions"><Link className="cc-primary cc-small" href={ccHref(locale, `/credentials/${r.organizationId}/${r.id}`)} aria-label={`${ar ? "مراجعة" : "Review"}: ${credentialTypeLabel(r.credentialType, locale)} — ${person(r)}`}>{ar ? "مراجعة" : "Review"}</Link></span>
            </li>); })}
        </ul>
      )}
    </>
  );
}

function DirectApprovals({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const api = useAdminApi();
  const [items, setItems] = useState<DirectConsultant[] | null>(null); const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => { setError(null); try { setItems(await api<DirectConsultant[]>("/admin/practitioners")); } catch (e) { setError(e); setItems([]); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  if (items === null) return <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>;
  if (error) return <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />;
  const waiting = items.filter((i) => i.credentialingStatus === "UNDER_REVIEW");
  return !waiting.length ? <EmptyState title={ar ? "لا يوجد استشاريون بانتظار الاعتماد" : "No direct consultants are waiting for approval"} /> : (
    <ul className="cc-list" aria-label={ar ? "بانتظار الاعتماد" : "Waiting for approval"}>
      <li className="cc-list-head" aria-hidden><span>{ar ? "الاستشاري" : "Consultant"}</span><span>{ar ? "مجال الرعاية" : "Care area"}</span><span>{ar ? "الحالة" : "Status"}</span><span /></li>
      {waiting.map((i) => { const s = approvalStatusLabel(i.credentialingStatus, locale); return (
        <li key={i.id}>
          <span><strong>{i.displayName}</strong><span className="cc-row-sub">{i.specialty}</span></span>
          <span>{careAreaLabel(i.careCategory, locale)}</span>
          <span><StatusBadge tone={s.tone}>{s.label}</StatusBadge></span>
          <span className="cc-row-actions"><Link className="cc-primary cc-small" href={ccHref(locale, `/providers/consultants/direct/${i.id}?tab=approval`)}>{ar ? "مراجعة" : "Review"}</Link></span>
        </li>); })}
    </ul>
  );
}
