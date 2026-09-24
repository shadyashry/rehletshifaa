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
import { approvalStatusLabel, careAreaLabel, countryName, credentialDisplayStatus, credentialTypeLabel, formatDate, personRoleLabel } from "./admin-labels";
import { directClinicianHref, type DirectConsultant } from "./clinician-model";
import { credentialValidity, type QueueRow } from "./credential-lifecycle";
import { ValidityLine } from "./credential-ui";

type Group = "needs" | "reviewing" | "info" | "completed";
const GROUP_STATUS: Record<Exclude<Group, "completed">, string> = { needs: "SUBMITTED", reviewing: "UNDER_REVIEW", info: "MORE_INFORMATION_REQUIRED" };

/**
 * Reviews & Safety › Credential Reviews — the canonical place for independent credential review. It answers "what requires
 * review?": provider credentials grouped by their stored review status (Needs review · In review · More information
 * required · Completed), across every organization the caller can review (`GET /admin/providers/credential-reviews`), plus
 * Direct consultant approvals, which keep their own approval model.
 */
export function CredentialQueue({ locale, initialOrg, initialView }: { locale: Locale; initialOrg?: string; initialView?: "provider" | "direct" }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const canProvider = access.can("credential.review"), canDirect = access.legacy.admin;
  const [view, setView] = useState<"provider" | "direct">(initialView ?? "provider");
  const current = view === "provider" && !canProvider && canDirect ? "direct" : view;
  const title = ar ? "مراجعة التراخيص والمؤهلات" : "Credential Reviews";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="credentials" title={title} intro={ar ? "الاعتمادات التي تحتاج إلى مراجعة مستقلة، الأقدم أولًا." : "Credentials that need independent review, oldest first."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canProvider && !canDirect) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى مراجعة الاعتمادات" : "You don't have access to credential reviews"} />);
  return shell(
    <>
      {canProvider && canDirect && (
        <div className="cc-segmented" role="group" aria-label={ar ? "نوع المراجعة" : "Review type"}>
          <button type="button" aria-pressed={current === "provider"} onClick={() => setView("provider")}>{ar ? "اعتمادات مقدمي الرعاية" : "Provider credentials"}</button>
          <button type="button" aria-pressed={current === "direct"} onClick={() => setView("direct")}>{ar ? "اعتماد الاستشاريين المباشرين" : "Direct consultant approvals"}</button>
        </div>
      )}
      {current === "provider" ? <ProviderQueue locale={locale} initialOrg={initialOrg} me={user.profile.sub} /> : <DirectApprovals locale={locale} />}
    </>
  );
}

function ProviderQueue({ locale, initialOrg, me }: { locale: Locale; initialOrg?: string; me: string }) {
  const ar = locale === "ar";
  const api = useAdminApi();
  const [open, setOpen] = useState<QueueRow[] | null>(null); const [completed, setCompleted] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<unknown>(null); const [completedError, setCompletedError] = useState<unknown>(null);
  const [group, setGroup] = useState<Group>("needs");
  const [org, setOrg] = useState(initialOrg ?? ""); const [type, setType] = useState(""); const [expiry, setExpiry] = useState(""); const [mine, setMine] = useState(false); const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());
  const load = useCallback(async () => {
    setError(null);
    try { const v = await api<QueueRow[]>("/admin/providers/credential-reviews"); setOpen(Array.isArray(v) ? v : []); } catch (e) { setError(e); setOpen([]); }
  }, [api]);
  const loadCompleted = useCallback(async () => {
    setCompletedError(null);
    try { const v = await api<QueueRow[]>("/admin/providers/credential-reviews?view=completed"); setCompleted(Array.isArray(v) ? v : []); } catch (e) { setCompletedError(e); setCompleted([]); }
  }, [api]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { void load(); }, [load]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- completed work is read only when asked for
  useEffect(() => { if (group === "completed" && completed === null) void loadCompleted(); }, [group, completed, loadCompleted]);
  const all = useMemo(() => [...(open ?? []), ...(completed ?? [])], [open, completed]);
  if (open === null) return <p role="status">{ar ? "جارٍ تحميل قائمة المراجعة…" : "Loading the review queue…"}</p>;
  if (error) return <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />;

  const count = (g: Exclude<Group, "completed">) => open.filter((r) => r.status === GROUP_STATUS[g]).length;
  const groups: { key: Group; label: string; count?: number }[] = [
    { key: "needs", label: ar ? "تحتاج إلى مراجعة" : "Needs review", count: count("needs") },
    { key: "reviewing", label: ar ? "قيد المراجعة" : "In review", count: count("reviewing") },
    { key: "info", label: ar ? "مطلوب مزيد من المعلومات" : "More information required", count: count("info") },
    { key: "completed", label: ar ? "المكتملة (الأحدث)" : "Completed (recent)" },
  ];
  const organizations = Array.from(new Map(all.map((r) => [r.organizationId, r.organizationName])).entries()).sort((a, b) => a[1].localeCompare(b[1], locale));
  const types = Array.from(new Set(all.map((r) => r.credentialType))).sort();
  const source = group === "completed" ? completed : open.filter((r) => r.status === GROUP_STATUS[group]);
  const term = search.trim().toLowerCase();
  const rows = (source ?? []).filter((r) => (!org || r.organizationId === org) && (!type || r.credentialType === type)
    && (!expiry || credentialValidity(r.expiresAt, now).kind === expiry || (expiry === "none" && !r.expiresAt))
    && (!mine || r.reviewedBy === me) && (!term || (r.clinicianName ?? "").toLowerCase().includes(term)));
  const person = (r: QueueRow) => r.clinicianName || (ar ? "طبيب بلا اسم مسجّل" : "Unnamed clinician");
  const reviewerLine = (r: QueueRow) => {
    if (!r.reviewedBy) return ar ? "لم يُسند إلى مراجع" : "Not assigned";
    const name = r.reviewedBy === me ? (ar ? "أنت" : "you") : r.reviewerName || (ar ? "مراجع اعتمادات" : "a credential reviewer");
    if (r.status === "UNDER_REVIEW") return `${ar ? "بدأها" : "Review started by"} ${name}`;
    if (r.status === "MORE_INFORMATION_REQUIRED") return `${ar ? "طلبها" : "Requested by"} ${name}`;
    return `${ar ? "قرار" : "Decided by"} ${name}${r.reviewedAt ? ` · ${formatDate(r.reviewedAt, locale)}` : ""}`;
  };
  const emptyTitle: Record<Group, string> = {
    needs: ar ? "لا توجد اعتمادات تحتاج إلى مراجعة" : "No credentials need review",
    reviewing: ar ? "لا توجد مراجعات جارية" : "No reviews are in progress",
    info: ar ? "لا توجد اعتمادات بانتظار معلومات إضافية" : "No credentials are waiting for more information",
    completed: ar ? "لا توجد مراجعات مكتملة بعد" : "No completed reviews yet",
  };
  const filtered = (source ?? []).length > 0;

  return (
    <>
      <div className="cc-segmented cc-queue-groups" role="group" aria-label={ar ? "مجموعات المراجعة" : "Review groups"}>
        {groups.map((g) => <button key={g.key} type="button" aria-pressed={group === g.key} onClick={() => setGroup(g.key)}>{g.label}{g.count !== undefined && <span className="cc-count">{g.count}</span>}</button>)}
      </div>
      {group === "info" && <p className="cc-meta cc-group-note">{ar ? "بانتظار نسخة جديدة من عمليات مقدمي الرعاية أو الطبيب. عند إرسالها تظهر في «تحتاج إلى مراجعة»." : "Waiting for a new version from Provider Operations or the clinician. When it is submitted it appears in Needs review."}</p>}
      {group === "completed" && <p className="cc-meta cc-group-note">{ar ? "آخر 50 قرارًا (تم التحقق، مرفوض، موقوف)." : "The latest 50 decisions (verified, rejected, suspended)."}</p>}
      <div className="cc-filterbar">
        <label>{ar ? "بحث عن طبيب" : "Search clinician"}<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ar ? "اسم الطبيب" : "Clinician name"} /></label>
        <label>{ar ? "الجهة" : "Organization"}<select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">{ar ? "كل الجهات" : "All organizations"}</option>{organizations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}{org && !organizations.some(([id]) => id === org) && <option value={org}>{ar ? "الجهة المحددة" : "Selected organization"}</option>}</select></label>
        <label>{ar ? "نوع الاعتماد" : "Credential type"}<select value={type} onChange={(e) => setType(e.target.value)}><option value="">{ar ? "كل الأنواع" : "All types"}</option>{types.map((v) => <option key={v} value={v}>{credentialTypeLabel(v, locale)}</option>)}</select></label>
        <label>{ar ? "الصلاحية" : "Expiry"}<select value={expiry} onChange={(e) => setExpiry(e.target.value)}><option value="">{ar ? "الكل" : "Any"}</option><option value="expiring">{ar ? "تنتهي قريبًا" : "Expiring soon"}</option><option value="expired">{ar ? "منتهية الصلاحية" : "Expired"}</option><option value="none">{ar ? "بلا تاريخ انتهاء" : "No expiry date"}</option></select></label>
        {group !== "needs" && <label className="cc-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />{ar ? "المُسندة إليّ فقط" : "Only reviews assigned to me"}</label>}
      </div>
      {group === "completed" && completed === null ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
        : group === "completed" && completedError ? <ErrorNotice error={completedError} locale={locale} action="load" onRetry={() => void loadCompleted()} />
        : !rows.length ? <EmptyState title={emptyTitle[group]} body={filtered ? (ar ? "غيّر عوامل التصفية لعرض المزيد." : "Change the filters to see more.") : undefined} />
        : (
          <ul className="cc-list cc-queue-list" aria-label={groups.find((g) => g.key === group)!.label}>
            <li className="cc-list-head" aria-hidden><span>{ar ? "الطبيب" : "Clinician"}</span><span>{ar ? "الاعتماد" : "Credential"}</span><span>{ar ? "التواريخ" : "Dates"}</span><span>{ar ? "الحالة" : "Status"}</span><span /></li>
            {rows.map((r) => {
              const s = credentialDisplayStatus(r.status, r.expiresAt, locale, now);
              return (
                <li key={r.id}>
                  <span><strong><bdi>{person(r)}</bdi></strong><span className="cc-row-sub">{r.clinicianType ? `${personRoleLabel(r.clinicianType, locale)} · ` : ""}<bdi>{r.organizationName}</bdi></span></span>
                  <span><span className="cc-queue-label">{ar ? "الاعتماد: " : "Credential: "}</span>{credentialTypeLabel(r.credentialType, locale)}<span className="cc-row-sub">{r.jurisdiction ? <bdi>{countryName(r.jurisdiction, locale)}</bdi> : null}{r.revisionNumber > 1 ? (ar ? ` · النسخة ${r.revisionNumber}` : ` · version ${r.revisionNumber}`) : ""}{r.evidenceCount ? (ar ? ` · ${r.evidenceCount} مستند` : ` · ${r.evidenceCount} document${r.evidenceCount > 1 ? "s" : ""}`) : (ar ? " · بلا مستند" : " · no document")}</span></span>
                  <span><span className="cc-queue-label">{ar ? "التواريخ: " : "Dates: "}</span>{ar ? "أُرسل" : "Submitted"} {formatDate(r.submittedAt, locale)}<span className="cc-row-sub"><ValidityLine validity={credentialValidity(r.expiresAt, now)} locale={locale} none={ar ? "بلا تاريخ انتهاء" : "No expiry date"} /></span></span>
                  <span><StatusBadge tone={s.tone}>{s.label}</StatusBadge><span className="cc-row-sub">{reviewerLine(r)}</span></span>
                  <span className="cc-row-actions"><Link className={group === "needs" || group === "reviewing" ? "cc-primary cc-small" : "cc-secondary cc-small"} href={ccHref(locale, `/credentials/${r.organizationId}/${r.id}`)} aria-label={`${ar ? "فتح المراجعة" : "Open review"}: ${credentialTypeLabel(r.credentialType, locale)} — ${person(r)}`}>{ar ? "فتح المراجعة" : "Open review"}</Link></span>
                </li>
              );
            })}
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { void load(); }, [load]);
  if (items === null) return <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>;
  if (error) return <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />;
  // Someone under provider credentialing is reviewed in the provider queue; the backend refuses a Direct approval for them.
  const waiting = items.filter((i) => i.credentialingStatus === "UNDER_REVIEW" && !i.providerCredentialing);
  return (
    <>
      <p className="cc-meta cc-group-note">{ar ? "الاستشاريون المباشرون لهم نموذج اعتماد خاص: قرار واحد يغطي مراجعة الاعتماد والموافقة على الحالات." : "Direct consultants keep their own approval model: one decision covers the credential check and the approval for cases."}</p>
      {!waiting.length ? <EmptyState title={ar ? "لا يوجد استشاريون بانتظار الاعتماد" : "No direct consultants are waiting for approval"} /> : (
        <ul className="cc-list" aria-label={ar ? "بانتظار الاعتماد" : "Waiting for approval"}>
          <li className="cc-list-head" aria-hidden><span>{ar ? "الاستشاري" : "Consultant"}</span><span>{ar ? "مجال الرعاية" : "Care area"}</span><span>{ar ? "الحالة" : "Status"}</span><span /></li>
          {waiting.map((i) => { const s = approvalStatusLabel(i.credentialingStatus, locale); return (
            <li key={i.id}>
              <span><strong><bdi>{i.displayName}</bdi></strong><span className="cc-row-sub">{i.specialty}</span></span>
              <span>{careAreaLabel(i.careCategory, locale)}</span>
              <span><StatusBadge tone={s.tone}>{s.label}</StatusBadge></span>
              <span className="cc-row-actions"><Link className="cc-primary cc-small" href={directClinicianHref(locale, i.id, "approval")} aria-label={`${ar ? "مراجعة" : "Review"}: ${i.displayName ?? ""}`}>{ar ? "مراجعة" : "Review"}</Link></span>
            </li>); })}
        </ul>
      )}
    </>
  );
}
