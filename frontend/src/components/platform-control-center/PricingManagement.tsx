"use client";

import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { EmptyState, StatusBadge } from "./cc-ui";
import type { Tone } from "./admin-labels";
import { ccCopy } from "./control-center-copy";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { priceStage, pricingCopy, type PriceStage } from "./pricing-copy";

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
const STAGE_TONE: Record<PriceStage, Tone> = { current: "success", scheduled: "info", ended: "neutral", draft: "warning", awaiting: "warning", approved: "info", retired: "neutral" };
const STAGE_ORDER: Record<PriceStage, number> = { current: 0, scheduled: 1, awaiting: 2, approved: 2, draft: 2, ended: 3, retired: 4 };

function money(amount: string, currency: string, locale: Locale) {
  const n = Number(amount);
  try { return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n); }
  catch { return `${n.toLocaleString(locale)} ${currency}`; }
}
const day = (iso: string, locale: Locale) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));

/**
 * Service prices for one clinician — an embeddable panel (clinician page, Commercial › Price Lists, Provider Workspace).
 * The backend resolves which price applies (`/prices/effective`); the panel names that source in business words and
 * never re-derives precedence. Actions follow the caller's real decisions: view, edit draft, record approval, publish, retire.
 */
export function PricingManagement({ locale, organizationId, practitionerId, organizationName, onChanged, showOrder = true, decisions, clinicianScopeOnly = false, appliedOnly = false }: {
  locale: Locale; organizationId: string; practitionerId: string; onChanged?: () => void; showOrder?: boolean;
  /** Shown with "Using organization price" so the source is clear without another screen. */
  organizationName?: string;
  /**
   * Decisions for THIS clinician from the Provider Workspace self read (V-11). `/admin/access/me` cannot report self- or
   * MANAGES-scoped grants, so without this a clinician or practice manager would be shown "no access". Navigation only:
   * every price call is still authorized by the backend.
   */
  decisions?: Decision[];
  /**
   * Provider Workspace (practice manager): offer changes to this clinician's own price versions only. The backend also
   * accepts organization-wide price changes through a managed clinician's route (M-4, Phase 8D); that is broader than the
   * approved workspace exposure (prices of the clinicians they manage), so it is not offered here.
   */
  clinicianScopeOnly?: boolean;
  /** Provider Workspace (the clinician's own view): only the price versions in effect — no drafts or approval prompts. */
  appliedOnly?: boolean;
}) {
  const t = ccCopy[locale];
  const p = pricingCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [prices, setPrices] = useState<PriceView[]>([]);
  const [effective, setEffective] = useState<Record<string, EffectivePrice | "none">>({});
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retiring, setRetiring] = useState<PriceView | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PriceView | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ serviceCode: "", serviceName: "", category: "", scopeType: "ORGANIZATION", amount: "", currency: "EGP", effectiveFrom: "", effectiveTo: "", consultantApprovalRequired: false });

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);
  const base = `/admin/providers/${organizationId}/clinicians/${practitionerId}`;
  // A stable key, so a re-rendered parent passing an equal decision list does not reload the prices.
  const provided = decisions ? JSON.stringify(decisions) : null;
  const org = organizationName ?? p.thisOrganization;

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
      const decisions: Decision[] = provided ? JSON.parse(provided) : await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      if (decisions.some((d) => d.permission === "price_list.view" && d.allowed)) {
        const [ob, rows] = await Promise.all([api<Onboarding>("/onboarding"), api<PriceView[]>("/prices")]);
        setOnboarding(ob); setPrices(rows);
        // One backend resolution per service that has a live version (bounded by this clinician's services).
        const services = Array.from(new Set(rows.filter((r) => r.status === "ACTIVE").map((r) => r.serviceCode)));
        const resolved = await Promise.all(services.map(async (code) => {
          try { return [code, await api<EffectivePrice>(`/prices/effective?serviceCode=${encodeURIComponent(code)}`)] as const; }
          catch { return [code, "none"] as const; }
        }));
        setEffective(Object.fromEntries(resolved));
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, t.error, provided]);
  useEffect(() => { void refresh(); }, [refresh]);

  const clinicianScope = onboarding?.clinicianType === "CONSULTANT" ? "CONSULTANT" : onboarding?.clinicianType === "ASSOCIATE_DOCTOR" ? "ASSOCIATE_DOCTOR" : null;
  const scopeOptions = clinicianScopeOnly ? (clinicianScope ? [clinicianScope] : []) : ["ORGANIZATION", ...(clinicianScope ? [clinicianScope] : [])];
  /** A version the caller may act on here: everything, or — clinician-scope-only — never an organization-wide price. */
  const actionable = (x: PriceView) => !clinicianScopeOnly || x.scopeType !== "ORGANIZATION";
  const scopeName = (scope: string) => (scope === "ORGANIZATION" ? p.organizationPrice : p.clinicianPrice);

  const openCreate = () => { setForm({ serviceCode: "", serviceName: "", category: "", scopeType: scopeOptions[0] ?? "ORGANIZATION", amount: "", currency: "EGP", effectiveFrom: "", effectiveTo: "", consultantApprovalRequired: false }); setEditing(null); setCreating(true); };
  const openEdit = (x: PriceView) => { setForm({ serviceCode: x.serviceCode, serviceName: x.serviceName, category: x.category ?? "", scopeType: x.scopeType, amount: x.amount, currency: x.currency, effectiveFrom: x.effectiveFrom.slice(0, 10), effectiveTo: x.effectiveTo ? x.effectiveTo.slice(0, 10) : "", consultantApprovalRequired: x.consultantApprovalRequired }); setEditing(x); setCreating(true); };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const body = {
        serviceCode: form.serviceCode, serviceName: form.serviceName, category: form.category || null, scopeType: form.scopeType,
        amount: form.amount, currency: form.currency, effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null,
        // Only a clinician-specific price can be approved (the backend records approval by the scoped clinician only).
        consultantApprovalRequired: form.scopeType !== "ORGANIZATION" && form.consultantApprovalRequired,
      };
      if (editing) await api(`/prices/${editing.id}?revision=${editing.revision}`, "PUT", body);
      else await api("/prices", "POST", body);
      setCreating(false); setEditing(null); await refresh(); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const act = async (work: () => Promise<unknown>, changed = true) => { setBusy(true); setError(""); try { await work(); await refresh(); if (changed) onChanged?.(); return true; } catch (e) { setError(e instanceof Error ? e.message : t.error); return false; } finally { setBusy(false); } };
  const publish = (x: PriceView) => act(() => api(`/prices/${x.id}/publish?revision=${x.revision}`, "POST"));
  const approve = (x: PriceView) => act(() => api(`/prices/${x.id}/approve?revision=${x.revision}`, "POST"), false);
  const retire = (x: PriceView) => act(() => api(`/prices/${x.id}/retire?revision=${x.revision}`, "POST")).then((ok) => { if (ok) setRetiring(null); });

  const visible = appliedOnly ? prices.filter((x) => x.status === "ACTIVE") : prices;
  const grouped = Object.entries(visible.reduce<Record<string, PriceView[]>>((acc, x) => { (acc[x.serviceCode] ??= []).push(x); return acc; }, {})).sort(([a], [b]) => a.localeCompare(b));

  if (authLoading || (loading && !onboarding)) return <p role="status">{t.loading}</p>;
  if (!user) return <button onClick={() => void signIn()}>{t.signin}</button>;

  const orgCurrentFor = (code: string) => prices.some((x) => x.serviceCode === code && x.scopeType === "ORGANIZATION" && priceStage(x) === "current");
  const source = (code: string, eff: EffectivePrice) => {
    if (eff.sourceLevel === "ORGANIZATION") return <>{p.usingOrganization}{organizationName && <> · {p.organizationLabel}: <bdi>{organizationName}</bdi></>}</>;
    if (eff.sourceLevel === "LEGACY_CONSULTANT") return <>{p.directPrice} · {p.directSource}</>;
    return <>{p.clinicianPrice} · {orgCurrentFor(code) ? p.overridesOrganization : p.ownPriceOnly}</>;
  };

  return (
    <div className="cc-panel">
      {error && <p role="alert" className="cc-message">{error}</p>}
      {!allowed("price_list.view") ? <p>{t.denied}</p> : (
        <>
          {showOrder && <div className="cc-card cc-price-explainer">
            <p><strong>{p.howChosenTitle}</strong></p>
            <ol className="cc-inheritance" aria-label={p.howChosenTitle}>
              {p.howChosen.filter((_, i) => i === 0 || clinicianScope).map(([title, body]) => <li key={title}><strong>{title}</strong><span>{body}</span></li>)}
            </ol>
          </div>}
          {allowed("price_list.manage") && scopeOptions.length > 0 && !creating && <div className="cc-section-actions" style={{ marginBottom: 16 }}><button type="button" onClick={openCreate}><Plus size={16} aria-hidden />{p.newPrice}</button></div>}

          {creating && (
            <form className="cc-card cc-price-form" onSubmit={submitForm} style={{ margin: "16px 0" }} aria-label={editing ? p.editDraft : p.newPrice}>
              <label>{p.serviceName}<input required maxLength={500} value={form.serviceName} onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))} /></label>
              <label>{p.serviceCode}<input required maxLength={60} dir="ltr" disabled={!!editing} value={form.serviceCode} onChange={(e) => setForm((f) => ({ ...f, serviceCode: e.target.value }))} /></label>
              <label>{p.category} <span className="cc-optional">({p.optional})</span><input maxLength={120} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></label>
              <label>{p.appliesTo}
                <select value={form.scopeType} onChange={(e) => setForm((f) => ({ ...f, scopeType: e.target.value }))}>
                  {scopeOptions.map((s) => <option key={s} value={s}>{s === "ORGANIZATION" ? p.appliesToOrganization(org) : p.appliesToClinician}</option>)}
                </select>
              </label>
              <div className="cc-toolbar">
                <label>{p.amount}<input required type="number" min="0" step="0.01" dir="ltr" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></label>
                <label>{p.currency}
                  <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                    {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              {form.scopeType === "CONSULTANT" && form.currency !== "EGP" && <p className="cc-meta">{p.egpNote}</p>}
              <div className="cc-toolbar">
                <label>{p.effectiveFrom}<input required type="date" dir="ltr" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></label>
                <label>{p.effectiveTo} <span className="cc-optional">({p.optional})</span><input type="date" dir="ltr" value={form.effectiveTo} onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))} /></label>
              </div>
              {form.scopeType !== "ORGANIZATION" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.consultantApprovalRequired} onChange={(e) => setForm((f) => ({ ...f, consultantApprovalRequired: e.target.checked }))} />
                  <span>{p.approvalRequired}<span className="cc-row-sub">{p.approvalRequiredHint}</span></span>
                </label>
              )}
              <p className="cc-meta">{p.draftHint}</p>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => { setCreating(false); setEditing(null); }}>{p.cancel}</button>
                <button disabled={busy}>{p.save}</button>
              </div>
            </form>
          )}

          {!grouped.length ? <EmptyState title={p.noPrices} body={appliedOnly ? undefined : p.noPricesBody} /> : grouped.map(([code, rows]) => {
            const eff = effective[code];
            const levels = (["ORGANIZATION", clinicianScope ?? "CONSULTANT"] as const).map((level) => ({
              level, rows: rows.filter((x) => (level === "ORGANIZATION" ? x.scopeType === "ORGANIZATION" : x.scopeType !== "ORGANIZATION"))
                .sort((a, b) => STAGE_ORDER[priceStage(a)] - STAGE_ORDER[priceStage(b)] || b.versionNumber - a.versionNumber),
            })).filter((g) => g.rows.length);
            return (
              <section className="cc-card cc-price-service" key={code} aria-labelledby={`price-${code}`}>
                <h3 id={`price-${code}`} style={{ marginTop: 0 }}>{rows[0]?.serviceName ?? code}</h3>
                {eff && eff !== "none" ? (
                  <p className="cc-price-applied"><span className="cc-meta">{p.appliesNow}</span> <strong><bdi dir="ltr">{money(eff.amount, eff.currency, locale)}</bdi></strong><span className="cc-row-sub">{source(code, eff)}</span></p>
                ) : <p className="cc-empty">{p.noneApplies}</p>}
                {levels.map((g) => (
                  <div key={g.level} className="cc-price-level">
                    <h4>{g.level === "ORGANIZATION" ? p.levelOrganization : p.levelClinician}</h4>
                    <ul className="cc-price-versions">
                      {g.rows.map((x) => {
                        const stage = priceStage(x);
                        return (
                          <li key={x.id}>
                            <div className="cc-price-version-head">
                              <strong><bdi dir="ltr">{money(x.amount, x.currency, locale)}</bdi></strong>
                              <StatusBadge tone={STAGE_TONE[stage]}>{p.status[stage]}</StatusBadge>
                            </div>
                            <p className="cc-meta">{p.from} {day(x.effectiveFrom, locale)} · {p.until} {x.effectiveTo ? day(x.effectiveTo, locale) : p.noEnd}</p>
                            {x.status === "DRAFT" && actionable(x) && (
                              <div className="cc-step-actions">
                                {allowed("price_list.manage") && <button type="button" className="cc-secondary cc-small" onClick={() => openEdit(x)}>{p.editDraft}</button>}
                                {x.consultantApprovalRequired && !x.consultantApprovedBy && (
                                  allowed("price_list.manage") && user.profile.sub === onboarding?.ownerSubject
                                    ? <button type="button" className="cc-secondary cc-small" disabled={busy} onClick={() => void approve(x)}>{p.approve}</button>
                                    : <span className="cc-meta">{p.onlyClinicianCanApprove}</span>
                                )}
                                {allowed("price_list.publish") && <button type="button" className="cc-small" disabled={busy || (x.consultantApprovalRequired && !x.consultantApprovedBy)} onClick={() => void publish(x)}>{p.publish}</button>}
                              </div>
                            )}
                            {x.status === "ACTIVE" && stage !== "ended" && allowed("price_list.publish") && actionable(x) && (
                              <div className="cc-step-actions"><button type="button" className="cc-secondary cc-danger-button cc-small" disabled={busy} onClick={() => setRetiring(x)}>{p.retire}</button></div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {!appliedOnly && <details className="cc-technical"><summary>{p.technical}</summary><dl>
                  <div><dt>{p.serviceCode}</dt><dd><bdi dir="ltr">{code}</bdi></dd></div>
                  {rows.map((x) => <div key={x.id}><dt>{scopeName(x.scopeType)} · {p.versionLabel} {x.versionNumber}</dt><dd><bdi dir="ltr">{x.status} · {x.id}</bdi></dd></div>)}
                </dl></details>}
              </section>
            );
          })}
        </>
      )}
      {retiring && (
        <FocusTrapDialog label={p.retireTitle} onClose={busy ? () => undefined : () => setRetiring(null)}>
          <h2 className="cc-dialog-title">{p.retireTitle}</h2>
          <p><strong>{retiring.serviceName}</strong> · {scopeName(retiring.scopeType)} · <bdi dir="ltr">{money(retiring.amount, retiring.currency, locale)}</bdi></p>
          <ul className="cc-consequences">
            <li>{p.retireNow}</li>
            <li>{retiring.scopeType === "ORGANIZATION" ? p.retireOrgReplacement(org) : orgCurrentFor(retiring.serviceCode) ? p.retireClinicianFallback : p.retireClinicianNone}</li>
            {retiring.legacyCatalogId && <li>{p.retireCatalog}</li>}
            <li>{p.retireKeeps}</li>
            <li>{p.retireFinal}</li>
          </ul>
          {error && <p role="alert" className="cc-message">{error}</p>}
          <div className="cc-form-actions"><button type="button" className="cc-danger-button" disabled={busy} onClick={() => void retire(retiring)}>{p.retireConfirm}</button><button type="button" className="cc-secondary" disabled={busy} onClick={() => setRetiring(null)}>{p.cancel}</button></div>
        </FocusTrapDialog>
      )}
    </div>
  );
}
