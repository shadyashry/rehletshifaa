"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { ccCopy, exceptionTypeLabel } from "./control-center-copy";

type SlotView = { id: string; dayOfWeek: number; startTime: string; endTime: string; timeZone: string; serviceCode: string | null; consultationMode: string | null; location: string | null; effectiveFrom: string; effectiveTo: string | null; status: string; revision: number };
type ExceptionView = { id: string; type: string; startsAt: string; endsAt: string; timeZone: string; serviceCode: string | null; consultationMode: string | null; location: string | null; reason: string | null; revision: number };
type ScheduleView = { organizationId: string; practitionerId: string; recurring: SlotView[]; exceptions: ExceptionView[] };
type EffectiveAvailability = { available: boolean; source: string; sourceId: string | null; evaluatedAt: string };
type Decision = { permission: string; allowed: boolean };

const EXCEPTION_TYPES = ["LEAVE", "BLOCKED", "CLINIC_CLOSURE", "EXTRA_AVAILABILITY", "SPECIAL_CLINIC"];

function toLocalInput(iso: string) { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

export function AvailabilityManagement({ locale, organizationId, practitionerId }: { locale: Locale; organizationId: string; practitionerId: string }) {
  const t = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [effective, setEffective] = useState<EffectiveAvailability | null>(null);
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addingSlot, setAddingSlot] = useState(false);
  const [editingSlot, setEditingSlot] = useState<SlotView | null>(null);
  const [slotForm, setSlotForm] = useState({ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", timeZone: "Africa/Cairo", serviceCode: "", consultationMode: "", location: "", effectiveFrom: "", effectiveTo: "" });
  const [addingException, setAddingException] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({ type: "LEAVE", startsAt: "", endsAt: "", timeZone: "Africa/Cairo", serviceCode: "", consultationMode: "", location: "", reason: "" });

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);
  const canManage = allowed("availability.manage") || allowed("availability.manage_self");
  const base = `/admin/providers/${organizationId}/clinicians/${practitionerId}`;

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, base + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === "REAUTHENTICATION_REQUIRED") { await signIn(true); throw new Error(t.denied); }
      throw new Error(data.message || t.error);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn, base]);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions: Decision[] = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      if (decisions.some((d) => d.permission === "availability.view" && d.allowed)) {
        const [sc, ef] = await Promise.all([api<ScheduleView>("/availability"), api<EffectiveAvailability>("/availability/effective")]);
        setSchedule(sc); setEffective(ef);
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, t.error]);
  useEffect(() => { void refresh(); }, [refresh]);

  const openAddSlot = () => { setSlotForm({ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", timeZone: "Africa/Cairo", serviceCode: "", consultationMode: "", location: "", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "" }); setEditingSlot(null); setAddingSlot(true); };
  const openEditSlot = (s: SlotView) => { setSlotForm({ dayOfWeek: s.dayOfWeek, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5), timeZone: s.timeZone, serviceCode: s.serviceCode ?? "", consultationMode: s.consultationMode ?? "", location: s.location ?? "", effectiveFrom: s.effectiveFrom, effectiveTo: s.effectiveTo ?? "" }); setEditingSlot(s); setAddingSlot(true); };

  const submitSlot = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const body = { dayOfWeek: Number(slotForm.dayOfWeek), startTime: slotForm.startTime, endTime: slotForm.endTime, timeZone: slotForm.timeZone, serviceCode: slotForm.serviceCode || null, consultationMode: slotForm.consultationMode || null, location: slotForm.location || null, effectiveFrom: slotForm.effectiveFrom, effectiveTo: slotForm.effectiveTo || null, revision: editingSlot?.revision ?? 0 };
      if (editingSlot) await api(`/availability/slots/${editingSlot.id}`, "PUT", body);
      else await api("/availability/slots", "POST", body);
      setAddingSlot(false); setEditingSlot(null); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const submitException = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const body = { type: exceptionForm.type, startsAt: new Date(exceptionForm.startsAt).toISOString(), endsAt: new Date(exceptionForm.endsAt).toISOString(), timeZone: exceptionForm.timeZone, serviceCode: exceptionForm.serviceCode || null, consultationMode: exceptionForm.consultationMode || null, location: exceptionForm.location || null, reason: exceptionForm.reason || null };
      await api("/availability/exceptions", "POST", body);
      setAddingException(false); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const removeException = async (ex: ExceptionView) => { setBusy(true); setError(""); try { await api(`/availability/exceptions/${ex.id}?revision=${ex.revision}`, "DELETE"); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); } };

  const crumbs = [
    { label: t.breadcrumbHome, href: `/${locale}/portal/control-center` },
    { label: t.breadcrumbProviders, href: `/${locale}/portal/control-center/providers` },
    { label: organizationId, href: `/${locale}/portal/control-center/providers/${organizationId}` },
    { label: t.breadcrumbAvailability },
  ];

  if (authLoading || (loading && !schedule)) return <ControlCenterShell locale={locale} active="providers" crumbs={crumbs} title={t.loading}><p role="status">{t.loading}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="providers" crumbs={crumbs} title={t.availability}><button onClick={() => void signIn()}>{t.signin}</button></ControlCenterShell>;

  return (
    <ControlCenterShell locale={locale} active="providers" crumbs={crumbs} title={t.availability}
      actions={<button type="button" className="cc-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.refresh}</button>}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {!allowed("availability.view") ? <p>{t.denied}</p> : !schedule ? <p className="cc-empty">{t.noSelection}</p> : (
        <>
          <p className="cc-meta">{t.timeZoneNote}</p>
          {effective && (
            <p><span className={"cc-badge " + (effective.available ? "cc-ready" : "cc-blocked")}>{effective.available ? t.effectiveNow : t.notAvailableNow}</span> · {t.effectiveSource}: {effective.source}</p>
          )}

          <h2>{t.weeklySchedule}</h2>
          {canManage && !addingSlot && <button type="button" onClick={openAddSlot}><Plus size={16} aria-hidden />{t.newSlot}</button>}
          {addingSlot && (
            <form className="cc-card" onSubmit={submitSlot} style={{ margin: "16px 0" }} aria-label={t.newSlot}>
              <label>{t.dayOfWeek}
                <select value={slotForm.dayOfWeek} onChange={(e) => setSlotForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{t.days[d]}</option>)}
                </select>
              </label>
              <div className="cc-toolbar">
                <label>{t.startTime}<input required type="time" dir="ltr" value={slotForm.startTime} onChange={(e) => setSlotForm((f) => ({ ...f, startTime: e.target.value }))} /></label>
                <label>{t.endTime}<input required type="time" dir="ltr" value={slotForm.endTime} onChange={(e) => setSlotForm((f) => ({ ...f, endTime: e.target.value }))} /></label>
                <label>{t.timeZone}<input required dir="ltr" value={slotForm.timeZone} onChange={(e) => setSlotForm((f) => ({ ...f, timeZone: e.target.value }))} /></label>
              </div>
              <div className="cc-toolbar">
                <label>{t.service}<input maxLength={60} dir="ltr" value={slotForm.serviceCode} onChange={(e) => setSlotForm((f) => ({ ...f, serviceCode: e.target.value }))} /></label>
                <label>{t.consultationMode}<input maxLength={60} value={slotForm.consultationMode} onChange={(e) => setSlotForm((f) => ({ ...f, consultationMode: e.target.value }))} /></label>
                <label>{t.location}<input maxLength={200} value={slotForm.location} onChange={(e) => setSlotForm((f) => ({ ...f, location: e.target.value }))} /></label>
              </div>
              <div className="cc-toolbar">
                <label>{locale === "ar" ? "ساري من" : "Effective from"}<input required type="date" dir="ltr" value={slotForm.effectiveFrom} onChange={(e) => setSlotForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></label>
                <label>{locale === "ar" ? "ساري حتى" : "Effective to"}<input type="date" dir="ltr" value={slotForm.effectiveTo} onChange={(e) => setSlotForm((f) => ({ ...f, effectiveTo: e.target.value }))} /></label>
              </div>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => { setAddingSlot(false); setEditingSlot(null); }}>{t.cancel}</button>
                <button disabled={busy}>{t.save}</button>
              </div>
            </form>
          )}
          {!schedule.recurring.length ? <p className="cc-empty">{t.noSlots}</p> : (
            <ul className="cc-table" aria-label={t.weeklySchedule}>
              {schedule.recurring.map((s) => (
                <li key={s.id}>
                  <span>{t.days[s.dayOfWeek]}</span>
                  <span dir="ltr">{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)} <small>({s.timeZone})</small></span>
                  <span>{s.serviceCode ?? "—"}{s.location ? ` · ${s.location}` : ""}</span>
                  <span>{canManage && <button type="button" className="cc-secondary" onClick={() => openEditSlot(s)}>{t.edit}</button>}</span>
                </li>
              ))}
            </ul>
          )}

          <h2>{t.exceptions}</h2>
          {canManage && !addingException && <button type="button" onClick={() => setAddingException(true)}><Plus size={16} aria-hidden />{t.newException}</button>}
          {addingException && (
            <form className="cc-card" onSubmit={submitException} style={{ margin: "16px 0" }} aria-label={t.newException}>
              <label>{t.exceptionType}
                <select value={exceptionForm.type} onChange={(e) => setExceptionForm((f) => ({ ...f, type: e.target.value }))}>
                  {EXCEPTION_TYPES.map((v) => <option key={v} value={v}>{exceptionTypeLabel(v, locale)}</option>)}
                </select>
              </label>
              <div className="cc-toolbar">
                <label>{t.startTime}<input required type="datetime-local" dir="ltr" value={exceptionForm.startsAt} onChange={(e) => setExceptionForm((f) => ({ ...f, startsAt: e.target.value }))} /></label>
                <label>{t.endTime}<input required type="datetime-local" dir="ltr" value={exceptionForm.endsAt} onChange={(e) => setExceptionForm((f) => ({ ...f, endsAt: e.target.value }))} /></label>
                <label>{t.timeZone}<input required dir="ltr" value={exceptionForm.timeZone} onChange={(e) => setExceptionForm((f) => ({ ...f, timeZone: e.target.value }))} /></label>
              </div>
              <label>{t.exceptionReason}<input maxLength={500} value={exceptionForm.reason} onChange={(e) => setExceptionForm((f) => ({ ...f, reason: e.target.value }))} /></label>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => setAddingException(false)}>{t.cancel}</button>
                <button disabled={busy}>{t.save}</button>
              </div>
            </form>
          )}
          {!schedule.exceptions.length ? <p className="cc-empty">{t.noExceptions}</p> : (
            <ul className="cc-table" aria-label={t.exceptions}>
              {schedule.exceptions.map((ex) => (
                <li key={ex.id}>
                  <span>{exceptionTypeLabel(ex.type, locale)}</span>
                  <span dir="ltr">{toLocalInput(ex.startsAt).replace("T", " ")}–{toLocalInput(ex.endsAt).replace("T", " ")} <small>({ex.timeZone})</small></span>
                  <span>{ex.reason ?? "—"}</span>
                  <span>{canManage && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void removeException(ex)}>{t.remove}</button>}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ControlCenterShell>
  );
}
