"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, StatusBadge } from "./cc-ui";
import { addConsultantHref, caseEligibility, consultantHref, credentialStatus, setupStatus, type Badge, type Consultant, type SetupBucket } from "./consultant-model";

/**
 * Consultants — every Consultant with their credential status, setup and case eligibility as separate facts. Readable
 * with CREDENTIAL_READ; adding one needs CONSULTANT_ONBOARD. Management happens on the Consultant's page.
 */
export function ConsultantDirectory({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const canRead = access.can("CREDENTIAL_READ");
  const canAdd = access.can("CONSULTANT_ONBOARD");
  const [rows, setRows] = useState<Consultant[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => { setError(null); try { setRows(await api<Consultant[]>("/admin/practitioners")); } catch (e) { setError(e); setRows([]); } }, [api]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { if (user && canRead) void load(); }, [user, canRead, load]);
  const addLink = canAdd ? <Link className="cc-primary" href={addConsultantHref(locale)}><Plus size={16} aria-hidden />{ar ? "إضافة استشاري" : "Add consultant"}</Link> : undefined;
  const title = ar ? "الاستشاريون" : "Consultants";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" title={title} intro={ar ? "كل الاستشاريين: حالة الاعتماد والإعداد، وهل يمكنهم استقبال الحالات." : "Every consultant: credential and setup status, and whether they can receive cases."} actions={addLink}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canRead) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى الاستشاريين" : "You don't have access to consultants"} />);
  if (rows === null) return shell(<p role="status">{ar ? "جارٍ تحميل الاستشاريين…" : "Loading consultants…"}</p>);
  if (error) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if (!rows.length) return shell(<EmptyState title={ar ? "لا يوجد استشاريون بعد" : "No consultants yet"} body={canAdd ? (ar ? "أضف أول استشاري لبدء إعداده." : "Add your first consultant to begin setup.") : undefined} action={addLink} />);
  return shell(<DirectoryList locale={locale} rows={rows} />);
}

function DirectoryList({ locale, rows }: { locale: Locale; rows: Consultant[] }) {
  const ar = locale === "ar";
  const [query, setQuery] = useState(""); const [setup, setSetup] = useState<SetupBucket | "">("");
  const q = query.trim().toLowerCase();
  const unnamed = ar ? "استشاري بلا اسم مسجّل" : "Unnamed consultant";
  const shown = rows
    .filter((c) => (!setup || setupStatus(c, locale).bucket === setup) && (!q || `${c.displayName ?? ""} ${c.specialty ?? ""}`.toLowerCase().includes(q)))
    .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? "", locale));
  const filtered = !!(q || setup);
  return (
    <>
      <div className="cc-filterbar" role="search" aria-label={ar ? "تصفية الاستشاريين" : "Filter consultants"}>
        <label>{ar ? "بحث" : "Search"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "الاسم أو التخصص" : "Name or specialty"} /></label>
        <label>{ar ? "الإعداد" : "Setup"}<select value={setup} onChange={(e) => setSetup(e.target.value as SetupBucket | "")}><option value="">{ar ? "الكل" : "All"}</option><option value="progress">{ar ? "قيد التنفيذ" : "In progress"}</option><option value="complete">{ar ? "مكتمل" : "Complete"}</option><option value="inactive">{ar ? "موقوف أو غير نشط" : "Suspended or inactive"}</option></select></label>
      </div>
      <p className="cc-meta" role="status" aria-live="polite">{filtered ? (ar ? `${shown.length} من ${rows.length} استشاري` : `${shown.length} of ${rows.length} consultants`) : (ar ? `${rows.length} استشاري` : `${rows.length} consultant${rows.length === 1 ? "" : "s"}`)}</p>
      {!shown.length ? <EmptyState title={ar ? "لا يوجد استشاريون يطابقون عوامل التصفية هذه." : "No consultants match these filters."} action={<button type="button" className="cc-secondary" onClick={() => { setQuery(""); setSetup(""); }}>{ar ? "مسح عوامل التصفية" : "Clear filters"}</button>} /> : (
        <ul className="cc-list cc-clinician-list" aria-label={ar ? "الاستشاريون" : "Consultants"}>
          <li className="cc-list-head" aria-hidden><span>{ar ? "الاستشاري" : "Consultant"}</span><span>{ar ? "الاعتمادات" : "Credentials"}</span><span>{ar ? "الإعداد" : "Setup"}</span><span>{ar ? "أهلية الحالات" : "Case eligibility"}</span></li>
          {shown.map((c) => (
            <li key={c.id}>
              <span><Link className="cc-row-title" href={consultantHref(locale, c.id)}><bdi>{c.displayName?.trim() || unnamed}</bdi></Link><span className="cc-row-sub">{[c.specialty, c.subspecialty].filter(Boolean).join(" · ")}</span></span>
              <Fact label={ar ? "الاعتمادات" : "Credentials"} badge={credentialStatus(c, locale)} />
              <Fact label={ar ? "الإعداد" : "Setup"} badge={setupStatus(c, locale)} />
              <Fact label={ar ? "أهلية الحالات" : "Case eligibility"} badge={caseEligibility(c, locale)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Fact({ label, badge }: { label: string; badge: Badge }) {
  return <span className="cc-clinician-fact"><span className="cc-clinician-fact-label">{label}</span><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>{badge.detail && <span className="cc-row-sub">{badge.detail}</span>}</span>;
}
