"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { EmptyState, ErrorNotice, Field, Section } from "./cc-ui";
import { personRoleLabel } from "./admin-labels";
import { PricingManagement } from "./PricingManagement";
import { AvailabilityManagement } from "./AvailabilityManagement";
import { CareAreaTemplates, DirectPriceList, ExchangeRates } from "./legacy-admin";
import { clinicianHref, directClinicianHref } from "./clinician-model";
import type { DirectConsultant, ProviderClinicianRow } from "./clinician-model";
import { pricingCopy } from "./pricing-copy";

/**
 * Choose an organization, then one of its clinicians — names only; identifiers never shown as primary text. One bounded
 * read (`GET /admin/providers/clinicians`, the UX-3 directory read) instead of one organization detail per organization.
 */
function ClinicianPicker({ locale, org, clinician, onChange, onRows }: { locale: Locale; org: string; clinician: string; onChange: (org: string, clinician: string) => void; onRows?: (rows: ProviderClinicianRow[]) => void }) {
  const ar = locale === "ar";
  const api = useAdminApi();
  const [rows, setRows] = useState<ProviderClinicianRow[] | null>(null); const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    api<ProviderClinicianRow[]>("/admin/providers/clinicians").then((r) => { const list = Array.isArray(r) ? r : []; if (live) { setRows(list); setError(null); onRows?.(list); } }, (e) => { if (live) { setError(e); setRows([]); } });
    return () => { live = false; };
  }, [api, attempt, onRows]);
  const orgs = useMemo(() => Array.from(new Map((rows ?? []).map((r) => [r.organizationId, r.organizationName])).entries()), [rows]);
  const clinicians = useMemo(() => (rows ?? []).filter((r) => r.organizationId === org && r.membershipStatus !== "REVOKED"), [rows, org]);
  useEffect(() => { if (!org && orgs.length === 1) onChange(orgs[0][0], ""); }, [org, orgs, onChange]);
  if (rows === null) return <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>;
  if (error) return <ErrorNotice error={error} locale={locale} action="load" onRetry={() => setAttempt((a) => a + 1)} />;
  if (!orgs.length) return <EmptyState title={ar ? "لا يوجد أطباء لدى الجهات بعد" : "No provider clinicians yet"} body={ar ? "أضف جهة طبية ثم أطباءها لإعداد الأسعار والمواعيد." : "Add a provider organization and its clinicians to set up prices and schedules."} action={<Link className="cc-primary" href={ccHref(locale, "/providers")}>{ar ? "فتح الجهات" : "Open organizations"}</Link>} />;
  return (
    <div className="cc-filterbar">
      <Field label={ar ? "الجهة الطبية" : "Provider organization"}><select value={org} onChange={(e) => onChange(e.target.value, "")}><option value="">{ar ? "اختر جهة" : "Choose an organization"}</option>{orgs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
      <Field label={ar ? "الطبيب" : "Clinician"}><select value={clinician} disabled={!org} onChange={(e) => onChange(org, e.target.value)}><option value="">{org && !clinicians.length ? (ar ? "لا يوجد أطباء" : "No clinicians") : (ar ? "اختر طبيبًا" : "Choose a clinician")}</option>{clinicians.map((c) => <option key={c.practitionerId} value={c.practitionerId}>{c.displayName ?? (ar ? "اسم غير مسجّل" : "Name not recorded")} — {personRoleLabel(c.clinicianType, locale)}</option>)}</select></Field>
    </div>
  );
}

function useSelection(locale: Locale, path: string, initialOrg?: string, initialClinician?: string) {
  const router = useRouter();
  const [org, setOrg] = useState(initialOrg ?? ""); const [clinician, setClinician] = useState(initialClinician ?? "");
  const change = useCallback((o: string, c: string) => { setOrg(o); setClinician(c); const q = new URLSearchParams(); if (o) q.set("org", o); if (c) q.set("clinician", c); router.replace(ccHref(locale, path) + (q.toString() ? `?${q}` : ""), { scroll: false }); }, [router, locale, path]);
  return { org, clinician, change };
}

type PricingView = "provider" | "direct" | "templates";

/**
 * A Direct clinician's price list is the current case workflow's catalogue. Someone under provider credentialing is priced
 * through their organization (`providerCredentialing`, the backend's engagement switch), so they never appear here.
 */
export const directPricingCandidates = (rows: DirectConsultant[]) => rows.filter((d) => !d.providerCredentialing);

/** Commercial › Price Lists: provider organization prices (organization and clinician-specific) and Direct clinician price lists. */
export function PricingHub({ locale, initialView, initialOrg, initialClinician }: { locale: Locale; initialView?: PricingView; initialOrg?: string; initialClinician?: string }) {
  const ar = locale === "ar";
  const p = pricingCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const canProvider = access.can("price_list.view"), legacy = access.legacy.admin;
  const views = ([["provider", ar ? "أسعار الجهات الطبية" : "Provider organization prices", canProvider], ["direct", ar ? "أسعار الأطباء المباشرين" : "Direct clinician prices", legacy], ["templates", ar ? "قوالب مجالات الرعاية" : "Care-area templates", legacy]] as [PricingView, string, boolean][]).filter(([, , v]) => v);
  const [view, setView] = useState<PricingView>(initialView ?? "provider");
  const current = views.some(([k]) => k === view) ? view : views[0]?.[0];
  const selection = useSelection(locale, "/commercial/prices", initialOrg, initialClinician);
  const [rows, setRows] = useState<ProviderClinicianRow[]>([]);
  const [direct, setDirect] = useState<DirectConsultant[] | null>(null); const [directId, setDirectId] = useState("");
  useEffect(() => { if (legacy && current === "direct") void api<DirectConsultant[]>("/admin/practitioners").then((r) => setDirect(Array.isArray(r) ? r : [])).catch(() => setDirect([])); }, [legacy, current, api]);
  const title = ar ? "قوائم الأسعار" : "Price Lists";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="pricing" title={title} intro={ar ? "أسعار الخدمات لكل طريقة عمل، ومن أين يأتي السعر المطبَّق." : "Service prices for each engagement model, and where the price that applies comes from."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!current) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى قوائم الأسعار" : "You don't have access to price lists"} />);
  const candidates = directPricingCandidates(direct ?? []);
  const excluded = (direct?.length ?? 0) - candidates.length;
  const selectedDirect = candidates.find((d) => d.id === directId);
  const selectedRow = rows.find((r) => r.organizationId === selection.org && r.practitionerId === selection.clinician);
  return shell(
    <>
      {views.length > 1 && <div className="cc-segmented" role="group" aria-label={title}>{views.map(([k, label]) => <button key={k} type="button" aria-pressed={current === k} onClick={() => setView(k)}>{label}</button>)}</div>}
      {current === "provider" && <>
        <Section title={p.howChosenTitle} description={p.howChosenNote} id="how">
          <ol className="cc-inheritance">
            {p.howChosen.map(([name, body], i) => <li key={name}><strong>{i + 1}. {name}</strong><span>{body}</span></li>)}
          </ol>
        </Section>
        <ClinicianPicker locale={locale} org={selection.org} clinician={selection.clinician} onChange={selection.change} onRows={setRows} />
        {selection.org && selection.clinician ? <>
          <p className="cc-meta"><Link href={clinicianHref(locale, selection.org, selection.clinician, "prices")}>{ar ? "فتح صفحة الطبيب" : "Open the clinician's page"}</Link></p>
          <PricingManagement key={selection.clinician} locale={locale} organizationId={selection.org} practitionerId={selection.clinician} organizationName={selectedRow?.organizationName} showOrder={false} />
        </> : <EmptyState title={ar ? "اختر طبيبًا لعرض أسعاره" : "Choose a clinician to see their prices"} body={ar ? "يظهر لكل خدمة السعر الساري الآن، وهل هو سعر الجهة أم سعر خاص بالطبيب." : "For each service you'll see the price that applies now, and whether it is the organization price or a clinician-specific price."} />}
      </>}
      {current === "direct" && <>
        {direct === null ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p> : <>
          <div className="cc-filterbar"><Field label={ar ? "الطبيب المباشر" : "Direct clinician"} hint={excluded > 0 ? (ar ? "الأطباء الذين يعملون من خلال جهة طبية تُحدَّد أسعارهم في أسعار الجهات الطبية." : "Clinicians who work through a provider organization are priced under Provider organization prices.") : undefined}>
            <select value={directId} onChange={(e) => setDirectId(e.target.value)}><option value="">{candidates.length ? (ar ? "اختر طبيبًا مباشرًا" : "Choose a Direct clinician") : (ar ? "لا يوجد أطباء مباشرون" : "No Direct clinicians")}</option>{candidates.map((d) => <option key={d.id} value={d.id}>{d.displayName}{d.specialty ? ` — ${d.specialty}` : ""}</option>)}</select></Field></div>
          {selectedDirect ? <>
            <p className="cc-meta"><Link href={directClinicianHref(locale, selectedDirect.id, "prices")}>{ar ? "فتح صفحة الطبيب" : "Open the clinician's page"}</Link></p>
            <DirectPriceList key={selectedDirect.id} locale={locale} api={api} practitionerId={selectedDirect.id} careArea={selectedDirect.careCategory} editable={access.legacy.systemAdmin} />
          </> : <EmptyState title={ar ? "اختر طبيبًا مباشرًا لعرض قائمة أسعاره" : "Choose a Direct clinician to see their price list"} body={ar ? "قائمة أسعار الطبيب المباشر بالجنيه المصري، ومشتقة من قالب مجال رعايته." : "A Direct clinician's price list is in EGP and derived from their care-area template."} />}
        </>}
      </>}
      {current === "templates" && <CareAreaTemplates locale={locale} api={api} editable={access.legacy.systemAdmin} />}
    </>
  );
}

/** Commercial › Exchange Rates: the stored daily rates used to show EGP prices in other currencies. */
export function ExchangeRatesPage({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const title = ar ? "أسعار الصرف" : "Exchange Rates";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="exchangeRates" title={title} intro={ar ? "أسعار يومية مخزّنة لتحويل الأسعار بالجنيه المصري إلى عملات أخرى. يحتفظ كل عرض بالسعر المجمَّد يوم إرساله." : "Stored daily rates that convert EGP prices into other currencies. Each proposal keeps the rate frozen on the day it was sent."}>{body}</ControlCenterShell>;
  if (authLoading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!access.legacy.admin) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى أسعار الصرف" : "You don't have access to exchange rates"} />);
  return shell(<ExchangeRates locale={locale} api={api} editable={access.legacy.systemAdmin} />);
}

/** Providers › Clinicians › Schedules: pick a clinician, then manage their weekly hours and exceptions. */
export function AvailabilityHub({ locale, initialOrg, initialClinician }: { locale: Locale; initialOrg?: string; initialClinician?: string }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const selection = useSelection(locale, "/commercial/availability", initialOrg, initialClinician);
  const title = ar ? "الجداول" : "Schedules";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="availability" title={title} intro={ar ? "الساعات الأسبوعية والإجازات وإغلاق العيادات لكل طبيب." : "Weekly hours, leave and clinic closures for each clinician."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!access.can("availability.view")) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى الجداول" : "You don't have access to schedules"} />);
  return shell(
    <>
      <ClinicianPicker locale={locale} org={selection.org} clinician={selection.clinician} onChange={selection.change} />
      {selection.org && selection.clinician ? <AvailabilityManagement key={selection.clinician} locale={locale} organizationId={selection.org} practitionerId={selection.clinician} />
        : <EmptyState title={ar ? "اختر طبيبًا لعرض جدوله" : "Choose a clinician to see their schedule"} />}
    </>
  );
}
