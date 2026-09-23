"use client";

import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { EmptyState, StatusBadge } from "./cc-ui";
import { priceLiveStatus } from "./admin-labels";
import { ccCopy, priceScopeLabel } from "./control-center-copy";

type PriceView = {
  id: string; organizationId: string; serviceCode: string; serviceName: string; category: string | null;
  scopeType: "ORGANIZATION" | "CONSULTANT" | "ASSOCIATE_DOCTOR"; scopeKey: string; clinicianId: string | null;
  amount: string; currency: string; effectiveFrom: string; effectiveTo: string | null; status: "DRAFT" | "ACTIVE" | "RETIRED";
  versionNumber: number; consultantApprovalRequired: boolean; consultantApprovedBy: string | null; legacyCatalogId: string | null; revision: number;
};
type EffectivePrice = { amount: string; currency: string; sourceLevel: string; priceId: string; version: number; effectiveFrom: string; effectiveTo: string | null };
type Onboarding = { organizationId: string; practitionerId: string; clinicianType: string; status: string; jurisdiction: string; version: number; ownerSubject: string };
type Decision = { permission: string; allowed: boolean };

/** Mirrors the backend's default `app.currency.supported` set; the server remains the sole authority and rejects anything else with a real 400. */
const SUPPORTED_CURRENCIES = ["EGP", "USD", "EUR", "SAR", "AED", "GBP"];

function money(amount: string, currency: string, locale: Locale) {
  const n = Number(amount);
  try { return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n); }
  catch { return `${n.toLocaleString(locale)} ${currency}`; }
}

/**
 * Service prices for one clinician — an embeddable panel (consultant workspace, onboarding working-setup step,
 * Commercial setup › Pricing). The backend resolves which level applies; the panel only shows that result.
 */
export function PricingManagement({ locale, organizationId, practitionerId, onChanged, showOrder = true }: { locale: Locale; organizationId: string; practitionerId: string; onChanged?: () => void; showOrder?: boolean }) {
  const t = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [prices, setPrices] = useState<PriceView[]>([]);
  const [effective, setEffective] = useState<Record<string, EffectivePrice | "none">>({});
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retiring, setRetiring] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PriceView | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ serviceCode: "", serviceName: "", category: "", scopeType: "ORGANIZATION", amount: "", currency: "EGP", effectiveFrom: "", effectiveTo: "", consultantApprovalRequired: false });

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);
  const base = `/admin/providers/${organizationId}/clinicians/${practitionerId}`;

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, base + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === REAUTHENTICATION_REQUIRED) { await requestReauthentication(signIn); throw new Error(reauthenticationCopy[locale].required); }
      throw new Error(data.message || t.error);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn, base, locale]);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions: Decision[] = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      if (decisions.some((d) => d.permission === "price_list.view" && d.allowed)) {
        const [ob, rows] = await Promise.all([api<Onboarding>("/onboarding"), api<PriceView[]>("/prices")]);
        setOnboarding(ob); setPrices(rows);
        const services = Array.from(new Set(rows.filter((p) => p.status === "ACTIVE").map((p) => p.serviceCode)));
        const resolved = await Promise.all(services.map(async (code) => {
          try { return [code, await api<EffectivePrice>(`/prices/effective?serviceCode=${encodeURIComponent(code)}`)] as const; }
          catch { return [code, "none"] as const; }
        }));
        setEffective(Object.fromEntries(resolved));
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, t.error]);
  useEffect(() => { void refresh(); }, [refresh]);

  const clinicianScope = onboarding?.clinicianType === "CONSULTANT" ? "CONSULTANT" : onboarding?.clinicianType === "ASSOCIATE_DOCTOR" ? "ASSOCIATE_DOCTOR" : null;
  const scopeOptions = ["ORGANIZATION", ...(clinicianScope ? [clinicianScope] : [])];

  const openCreate = () => { setForm({ serviceCode: "", serviceName: "", category: "", scopeType: "ORGANIZATION", amount: "", currency: "EGP", effectiveFrom: "", effectiveTo: "", consultantApprovalRequired: false }); setEditing(null); setCreating(true); };
  const openEdit = (p: PriceView) => { setForm({ serviceCode: p.serviceCode, serviceName: p.serviceName, category: p.category ?? "", scopeType: p.scopeType, amount: p.amount, currency: p.currency, effectiveFrom: p.effectiveFrom.slice(0, 10), effectiveTo: p.effectiveTo ? p.effectiveTo.slice(0, 10) : "", consultantApprovalRequired: p.consultantApprovalRequired }); setEditing(p); setCreating(true); };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const body = {
        serviceCode: form.serviceCode, serviceName: form.serviceName, category: form.category || null, scopeType: form.scopeType,
        amount: form.amount, currency: form.currency, effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null, consultantApprovalRequired: form.consultantApprovalRequired,
      };
      if (editing) await api(`/prices/${editing.id}?revision=${editing.revision}`, "PUT", body);
      else await api("/prices", "POST", body);
      setCreating(false); setEditing(null); await refresh(); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const publish = async (p: PriceView) => { setBusy(true); setError(""); try { await api(`/prices/${p.id}/publish?revision=${p.revision}`, "POST"); await refresh(); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); } };
  const approve = async (p: PriceView) => { setBusy(true); setError(""); try { await api(`/prices/${p.id}/approve?revision=${p.revision}`, "POST"); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); } };
  const retire = async (p: PriceView) => { setBusy(true); setError(""); try { await api(`/prices/${p.id}/retire?revision=${p.revision}`, "POST"); setRetiring(null); await refresh(); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); } };

  const grouped = Object.entries(
    prices.reduce<Record<string, PriceView[]>>((acc, p) => { (acc[p.serviceCode] ??= []).push(p); return acc; }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  const scopeOrder = { ORGANIZATION: 0, CONSULTANT: 1, ASSOCIATE_DOCTOR: 1 } as const;

  if (authLoading || (loading && !onboarding)) return <p role="status">{t.loading}</p>;
  if (!user) return <button onClick={() => void signIn()}>{t.signin}</button>;
  const ar = locale === "ar";
  const levels = ["ORGANIZATION", ...(clinicianScope ? [clinicianScope] : [])];

  return (
    <div className="cc-panel">
      {error && <p role="alert" className="cc-message">{error}</p>}
      {!allowed("price_list.view") ? <p>{t.denied}</p> : (
        <>
          {showOrder && <><p className="cc-meta">{ar ? "كيف يُحدَّد السعر:" : "How the price is chosen:"}</p>
          <ol className="cc-inheritance" aria-label={ar ? "ترتيب الأسعار" : "Price order"}>
            {levels.map((l, i) => <li key={l}><strong>{i + 1}. {priceScopeLabel(l, locale)}</strong><span>{l === "ORGANIZATION" ? (ar ? "يُطبَّق على كل أطباء المؤسسة" : "Applies to every clinician in the organization") : (ar ? "يحل محل السعر الافتراضي لهذا الطبيب فقط" : "Replaces the default for this clinician only")}</span></li>)}
          </ol></>}
          {allowed("price_list.manage") && !creating && <div className="cc-section-actions" style={{ marginBottom: 16 }}><button type="button" onClick={openCreate}><Plus size={16} aria-hidden />{t.newPrice}</button></div>}

          {creating && (
            <form className="cc-card" onSubmit={submitForm} style={{ margin: "16px 0" }} aria-label={t.newPrice}>
              <label>{t.serviceCode}<input required maxLength={60} dir="ltr" disabled={!!editing} value={form.serviceCode} onChange={(e) => setForm((f) => ({ ...f, serviceCode: e.target.value }))} /></label>
              <label>{t.serviceName}<input required maxLength={500} value={form.serviceName} onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))} /></label>
              <label>{t.category}<input maxLength={120} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></label>
              <label>{t.scope}
                <select value={form.scopeType} onChange={(e) => setForm((f) => ({ ...f, scopeType: e.target.value }))}>
                  {scopeOptions.map((s) => <option key={s} value={s}>{priceScopeLabel(s, locale)}</option>)}
                </select>
              </label>
              <div className="cc-toolbar">
                <label>{t.amount}<input required type="number" min="0" step="0.01" dir="ltr" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></label>
                <label>{t.currency}
                  <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                    {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <div className="cc-toolbar">
                <label>{locale === "ar" ? "ساري من" : "Effective from"}<input required type="date" dir="ltr" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></label>
                <label>{locale === "ar" ? "ساري حتى" : "Effective to"}<input type="date" dir="ltr" value={form.effectiveTo} onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))} /></label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.consultantApprovalRequired} onChange={(e) => setForm((f) => ({ ...f, consultantApprovalRequired: e.target.checked }))} />
                {t.consultantApprovalRequired}
              </label>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => { setCreating(false); setEditing(null); }}>{t.cancel}</button>
                <button disabled={busy}>{t.save}</button>
              </div>
            </form>
          )}

          {!grouped.length ? <EmptyState title={t.noPrices} body={ar ? "أضف سعرًا ثم انشره ليصبح متاحًا." : "Add a price, then publish it to make it live."} /> : (
            <>
              {grouped.map(([code, rows]) => {
                const sorted = [...rows].sort((a, b) => (scopeOrder[a.scopeType] - scopeOrder[b.scopeType]) || b.versionNumber - a.versionNumber);
                const eff = effective[code];
                return (
                  <section className="cc-card" key={code} style={{ marginBottom: 14 }}>
                    <h3 style={{ marginTop: 0 }}>{sorted[0]?.serviceName ?? code} <small className="cc-meta">({code})</small></h3>
                    {eff && eff !== "none" ? (
                      <p className="cc-meta"><span className="cc-badge cc-ready">{t.effectivePriceLabel}: {money(eff.amount, eff.currency, locale)}</span> · {eff.sourceLevel === "ORGANIZATION" ? (locale === "ar" ? "يُطبَّق سعر الجهة" : "Using organization price") : priceScopeLabel(eff.sourceLevel, locale)}</p>
                    ) : <p className="cc-empty">{t.noPriceForService}</p>}
                    <ul className="cc-stepper">
                      {sorted.map((p) => (
                        <li className="cc-step" key={p.id}>
                          <div className="cc-step-head">
                            <h3>{priceScopeLabel(p.scopeType, locale)} · v{p.versionNumber}</h3>
                            <StatusBadge tone={priceLiveStatus(p.status, locale).tone}>{priceLiveStatus(p.status, locale).label}</StatusBadge>
                          </div>
                          <p className="cc-meta">{money(p.amount, p.currency, locale)} · {new Date(p.effectiveFrom).toLocaleDateString(locale)}{p.effectiveTo ? ` – ${new Date(p.effectiveTo).toLocaleDateString(locale)}` : ""}</p>
                          {p.consultantApprovalRequired && (
                            <p className="cc-meta">{p.consultantApprovedBy ? t.consultantApproved : t.consultantApprovalPending}</p>
                          )}
                          {p.status === "DRAFT" && (
                            <div className="cc-step-actions">
                              {allowed("price_list.manage") && <button type="button" className="cc-secondary" onClick={() => openEdit(p)}>{t.edit}</button>}
                              {p.consultantApprovalRequired && !p.consultantApprovedBy && (
                                allowed("price_list.manage") && user.profile.sub === onboarding?.ownerSubject
                                  ? <button type="button" className="cc-secondary" disabled={busy} onClick={() => void approve(p)}>{t.approve}</button>
                                  : <span className="cc-meta">{t.onlyClinicianCanApprove}</span>
                              )}
                              {allowed("price_list.publish") && <button type="button" disabled={busy || (p.consultantApprovalRequired && !p.consultantApprovedBy)} onClick={() => void publish(p)}>{t.publish}</button>}
                            </div>
                          )}
                          {p.status === "ACTIVE" && allowed("price_list.publish") && (
                            <div className="cc-step-actions">
                              {retiring === p.id ? (
                                <div className="cc-card" role="group" aria-label={t.retireConfirmTitle}>
                                  <p><strong>{t.retireConfirmTitle}</strong></p>
                                  <p>{t.retireConfirmBody}</p>
                                  <div className="cc-form-actions"><button type="button" className="cc-danger-button" disabled={busy} onClick={() => void retire(p)}>{t.retireConfirm}</button><button type="button" className="cc-secondary" onClick={() => setRetiring(null)}>{t.cancel}</button></div>
                                </div>
                              ) : <button type="button" className="cc-secondary cc-danger-button cc-small" disabled={busy} onClick={() => setRetiring(p.id)}>{t.retire}</button>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
