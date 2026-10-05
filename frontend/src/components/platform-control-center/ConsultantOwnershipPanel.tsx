"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { AdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, Facts, Field, Section, SuccessNotice } from "./cc-ui";
import { ActionDialog, json, useRead } from "./workforce-ui";
import { when, type CatalogueFunction, type WorkforcePerson } from "./workforce-model";

type Ownership = {
  id: string; ownerSubject: string; ownerName: string | null; effectiveFrom: string; effectiveTo: string | null;
  status: string; assignedBy: string; reason: string; endedBy: string | null; endReason: string | null; revision: number;
};
type OwnershipView = { practitionerId: string; current: Ownership | null; history: Ownership[] };

/** Eligibility and review conflicts are checked again under the backend governance lock. */
export function ConsultantOwnershipPanel({ locale, api, practitionerId }: { locale: Locale; api: AdminApi; practitionerId: string }) {
  const ar = locale === "ar";
  const base = `/admin/practitioners/${practitionerId}/operations-ownership`;
  const ownership = useRead<OwnershipView>(api, base);
  const people = useRead<WorkforcePerson[]>(api, "/admin/workforce/people");
  const catalogue = useRead<CatalogueFunction[]>(api, "/admin/workforce/catalogue");
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [notice, setNotice] = useState("");
  const roles = catalogue.data?.find((f) => f.key === "CONSULTANT_OPERATIONS")?.roles.map((r) => r.key) ?? [];
  const eligible = (people.data ?? []).filter((p) => p.lifecycleStatus === "ACTIVE" && p.roles.some((r) => roles.includes(r)) && p.subject !== ownership.data?.current?.ownerSubject);
  const readError = ownership.error || people.error || catalogue.error;
  return <Section id="consultant-ownership" title={ar ? "مسؤول عمليات الاستشاري" : "Consultant Operations owner"}
    description={ar ? "لا يجوز للمسؤول اتخاذ قرارات الاعتماد أو القدرات لاستشاريه. تحتفظ المراجعات المفتوحة بتعارضاتها عند تغيير المسؤول." : "The owner cannot decide this consultant's credentials or capabilities. Changing the owner preserves conflicts for reviews already open."}>
    <SuccessNotice>{notice || null}</SuccessNotice>
    <ErrorNotice error={readError} locale={locale} action="load" onRetry={() => { ownership.reload(); people.reload(); catalogue.reload(); }} />
    {!ownership.data && !ownership.error ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p> : <>
      {ownership.data?.current ? <Facts items={[
        [ar ? "المسؤول الحالي" : "Current owner", ownership.data.current.ownerName ?? ownership.data.current.ownerSubject],
        [ar ? "منذ" : "Effective from", when(ownership.data.current.effectiveFrom, locale)],
        [ar ? "السبب" : "Reason", ownership.data.current.reason],
      ]} /> : <EmptyState title={ar ? "لم يُعيّن مسؤول بعد" : "No owner assigned yet"} />}
      <button type="button" className="cc-secondary" disabled={!eligible.length || !!readError} onClick={() => { setOwner(""); setOpen(true); }}>{ar ? "تعيين المسؤول" : "Assign owner"}</button>
      {ownership.data?.history?.length ? <details className="cc-technical"><summary>{ar ? "سجل المسؤولية" : "Ownership history"}</summary><ul className="cc-checklist">
        {ownership.data.history.map((h) => <li key={h.id}><div><strong>{h.ownerName ?? h.ownerSubject}</strong><span className="cc-row-sub">{when(h.effectiveFrom, locale)} → {h.effectiveTo ? when(h.effectiveTo, locale) : (ar ? "حالي" : "Current")}</span><span className="cc-row-sub">{h.assignedBy}: {h.reason}{h.endReason ? ` · ${h.endedBy}: ${h.endReason}` : ""}</span></div></li>)}
      </ul></details> : null}
    </>}
    {open && <ActionDialog locale={locale} title={ar ? "تعيين مسؤول العمليات" : "Assign Operations owner"} confirm={ar ? "حفظ المسؤول" : "Save owner"} onClose={() => setOpen(false)}
      onSubmit={async (reason) => { await api(base, json("POST", { ownerSubject: owner, reason })); setOpen(false); setNotice(ar ? "حُفظت المسؤولية وسجلها." : "Ownership and its history saved."); ownership.reload(); }}>
      <Field label={ar ? "المسؤول" : "Owner"} required><select required value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">{ar ? "اختر المسؤول" : "Choose owner"}</option>{eligible.map((p) => <option key={p.subject} value={p.subject}>{p.displayName ?? p.subject}</option>)}</select></Field>
    </ActionDialog>}
  </Section>;
}
