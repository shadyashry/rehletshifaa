"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { accessCopy } from "./access-copy";
import { EmptyState, ErrorNotice, StatusBadge } from "./cc-ui";
import { personName, useProviderDirectory } from "./provider-directory";
import { PersonPicker } from "./access-people";
import type { Api, PersonRef } from "./access-model";

type Audit = { actor: string; entity: string; action: string; outcome: string; reason: string; occurredAt: string };

/** Readable names for the recorded governance actions (the stored code stays under Advanced). */
const ACTIONS: Record<string, [string, string]> = {
  ASSIGNMENT_GRANTED: ["Access given", "مُنح وصول"], ASSIGNMENT_REVOKED: ["Access removed", "أُزيل وصول"],
  ROLE_CREATED: ["Role created", "أُنشئ دور"], VERSION_CREATED: ["Role change started", "بدأ تغيير دور"], DRAFT_SAVED: ["Role draft saved", "حُفظت مسودة دور"],
  PERMISSION_ADDED: ["Permission added to a draft", "أُضيفت صلاحية إلى مسودة"], PERMISSION_REMOVED: ["Permission removed from a draft", "أُزيلت صلاحية من مسودة"],
  ROLE_VALIDATED: ["Role draft checked", "فُحصت مسودة دور"], ROLE_PUBLISHED: ["Role version published", "نُشر إصدار دور"], ROLE_RETIRED: ["Role version retired", "أُوقف إصدار دور"],
  ACCESS_DENIED: ["Action refused", "رُفض إجراء"], ACCESS_SIMULATED: ["Access simulated", "محاكاة وصول"], ACCESS_CHECKED: ["Access checked", "فُحص وصول"],
  EFFECTIVE_ACCESS_REVIEWED: ["Access reviewed", "رُوجع وصول"], PERSON_ACCESS_REVIEWED: ["Person's access opened", "فُتح وصول شخص"], WORKSPACE_ROLES_REVIEWED: ["Workspaces viewed", "عُرضت مساحات العمل"],
  PROVIDER_MEMBER_LINKED: ["Member added to an organization", "أُضيف عضو إلى مؤسسة"], PROVIDER_MEMBER_ACTIVATED: ["Membership activated", "فُعّلت عضوية"], PROVIDER_MEMBER_DEACTIVATED: ["Membership ended", "أُنهيت عضوية"],
  PROVIDER_RELATIONSHIP_CREATED: ["Professional relationship added", "أُضيفت علاقة مهنية"],
};
export const actionLabel = (action: string, locale: Locale) => ACTIONS[action]?.[locale === "ar" ? 1 : 0] ?? action.toLowerCase().replaceAll("_", " ");

/** Append-only access history, newest first, narrowed by who acted, what happened and when. No analytics. */
export function AuditView({ locale, api, canViewProviders }: { locale: Locale; api: Api; canViewProviders: boolean }) {
  const t = accessCopy[locale]; const ar = locale === "ar";
  const directory = useProviderDirectory(canViewProviders);
  const [actor, setActor] = useState<PersonRef | null>(null); const [action, setAction] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [audits, setAudits] = useState<Audit[] | null>(null); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (actor) q.set("actor", actor.subject); if (action) q.set("action", action);
    if (from) q.set("from", new Date(from + "T00:00:00").toISOString()); if (to) q.set("to", new Date(to + "T23:59:59.999").toISOString());
    return q.toString();
  }, [actor, action, from, to]);
  const path = useCallback((offset: number) => "/audit" + (query || offset ? "?" + [query, offset ? "offset=" + offset : ""].filter(Boolean).join("&") : ""), [query]);
  useEffect(() => { setAudits(null); setError(null); void api<Audit[]>(path(0)).then(setAudits).catch((e) => { setError(e); setAudits([]); }); }, [api, path]);
  const names = useMemo(() => new Map(directory.people.map((p) => [p.subject, personName(p, locale)])), [directory.people, locale]);
  return <>
    <form className="ag-audit-filters" onSubmit={(e) => e.preventDefault()} aria-label={ar ? "تصفية السجل" : "Filter the history"}>
      <div>{actor ? <p><span className="cc-meta">{ar ? "من قام بالإجراء: " : "Done by: "}</span><strong><bdi>{actor.name ?? actor.subject}</bdi></strong> <button type="button" className="cc-ghost cc-small" onClick={() => setActor(null)}>{ar ? "إزالة" : "Clear"}</button></p>
        : <PersonPicker locale={locale} directory={directory} compact label={ar ? "من قام بالإجراء" : "Done by"} onSelect={setActor} />}</div>
      <label>{ar ? "الإجراء" : "Action"}<select value={action} onChange={(e) => setAction(e.target.value)}><option value="">{ar ? "كل الإجراءات" : "All actions"}</option>{Object.keys(ACTIONS).map((k) => <option key={k} value={k}>{actionLabel(k, locale)}</option>)}</select></label>
      <label>{ar ? "من تاريخ" : "From"}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>{ar ? "إلى تاريخ" : "To"}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    </form>
    <ErrorNotice error={error} locale={locale} action="load" />
    {audits === null ? <p role="status">{t.loading}</p>
      : !audits.length ? <EmptyState title={query ? (ar ? "لا توجد أحداث مطابقة" : "No matching events") : (ar ? "لا توجد أحداث وصول بعد" : "No access events yet")} />
      : <ol className="ag-audit" aria-live="polite">{audits.map((a, i) => (
        <li key={i}>
          <time dateTime={a.occurredAt}>{new Date(a.occurredAt).toLocaleString(ar ? "ar-EG" : "en-GB")}</time>
          <strong>{actionLabel(a.action, locale)}</strong>
          <StatusBadge tone={a.outcome === "DENY" ? "danger" : "success"}>{a.outcome === "DENY" ? (ar ? "مرفوض" : "Refused") : (ar ? "تم" : "Done")}</StatusBadge>
          <p className="cc-meta">{ar ? "بواسطة " : "By "}<bdi>{names.get(a.actor) ?? (ar ? "حساب إداري" : "an administrator account")}</bdi></p>
          <details><summary>{t.advanced}</summary><p><bdi dir="ltr">{a.action}</bdi> · <bdi dir="ltr">{a.actor}</bdi> · <bdi dir="ltr">{a.entity}</bdi></p><p><bdi>{a.reason}</bdi></p></details>
        </li>))}</ol>}
    {audits && audits.length > 0 && audits.length % 100 === 0 && <button className="cc-secondary" disabled={busy} onClick={() => { setBusy(true); void api<Audit[]>(path(audits.length)).then((more) => setAudits([...audits, ...more])).catch(setError).finally(() => setBusy(false)); }}>{ar ? "عرض المزيد" : "Show more"}</button>}
    <p className="cc-meta">{ar ? "السجل للإضافة فقط ولا يمكن تعديله." : "The history is append-only; entries can't be changed."}</p>
  </>;
}
