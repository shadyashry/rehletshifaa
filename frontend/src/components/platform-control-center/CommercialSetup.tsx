"use client";

import { useEffect, useMemo, useState } from "react";
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
import { CLINICIAN_ROLES, personName, useProviderDirectory } from "./provider-directory";
import { PricingManagement } from "./PricingManagement";
import { AvailabilityManagement } from "./AvailabilityManagement";
import { CareAreaTemplates, DirectPriceList, ExchangeRates } from "./legacy-admin";
import { clinicianHref } from "./clinician-model";
import type { DirectConsultant } from "./clinician-model";

/** Choose an organization, then one of its clinicians — names only; identifiers never shown as primary text. */
function ClinicianPicker({ locale, org, clinician, onChange }: { locale: Locale; org: string; clinician: string; onChange: (org: string, clinician: string) => void }) {
  const ar = locale === "ar";
  const directory = useProviderDirectory(true);
  const orgs = directory.details.map((d) => d.organization);
  const clinicians = useMemo(() => directory.people.filter((p) => p.organization.id === org && p.practitionerId && p.roles.some((r) => CLINICIAN_ROLES.includes(r))), [directory.people, org]);
  useEffect(() => { if (!org && orgs.length === 1) onChange(orgs[0].id, ""); }, [org, orgs, onChange]);
  if (directory.loading) return <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>;
  if (directory.error) return <ErrorNotice error={directory.error} locale={locale} action="load" onRetry={() => void directory.reload()} />;
  if (!orgs.length) return <EmptyState title={ar ? "لا توجد مؤسسات بعد" : "No organizations yet"} body={ar ? "أضف مؤسسة ثم أطباءها لإعداد الأسعار والمواعيد." : "Add an organization and its clinicians to set up prices and schedules."} action={<Link className="cc-primary" href={ccHref(locale, "/providers")}>{ar ? "فتح المؤسسات" : "Open organizations"}</Link>} />;
  return (
    <div className="cc-filterbar">
      <Field label={ar ? "المؤسسة" : "Organization"}><select value={org} onChange={(e) => onChange(e.target.value, "")}><option value="">{ar ? "اختر مؤسسة" : "Choose an organization"}</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}</select></Field>
      <Field label={ar ? "الطبيب" : "Clinician"}><select value={clinician} disabled={!org} onChange={(e) => onChange(org, e.target.value)}><option value="">{org && !clinicians.length ? (ar ? "لا يوجد أطباء" : "No clinicians") : (ar ? "اختر طبيبًا" : "Choose a clinician")}</option>{clinicians.map((c) => <option key={c.practitionerId!} value={c.practitionerId!}>{personName(c, locale)} — {c.roles.filter((r) => CLINICIAN_ROLES.includes(r)).map((r) => personRoleLabel(r, locale)).join(", ")}</option>)}</select></Field>
    </div>
  );
}

function useSelection(locale: Locale, path: string, initialOrg?: string, initialClinician?: string) {
  const router = useRouter();
  const [org, setOrg] = useState(initialOrg ?? ""); const [clinician, setClinician] = useState(initialClinician ?? "");
  const change = (o: string, c: string) => { setOrg(o); setClinician(c); const q = new URLSearchParams(); if (o) q.set("org", o); if (c) q.set("clinician", c); router.replace(ccHref(locale, path) + (q.toString() ? `?${q}` : ""), { scroll: false }); };
  return { org, clinician, change };
}

type PricingView = "provider" | "direct" | "templates";

/** Commercial › Price Lists: provider service prices with their inheritance, and the current workflow's price lists. */
export function PricingHub({ locale, initialView, initialOrg, initialClinician }: { locale: Locale; initialView?: PricingView; initialOrg?: string; initialClinician?: string }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const canProvider = access.can("price_list.view"), legacy = access.legacy.admin;
  const views = ([["provider", ar ? "أسعار المؤسسات" : "Provider prices", canProvider], ["direct", ar ? "قوائم أسعار الاستشاريين المباشرين" : "Direct consultant price lists", legacy], ["templates", ar ? "قوالب مجالات الرعاية" : "Care-area templates", legacy]] as [PricingView, string, boolean][]).filter(([, , v]) => v);
  const [view, setView] = useState<PricingView>(initialView ?? "provider");
  const current = views.some(([k]) => k === view) ? view : views[0]?.[0];
  const selection = useSelection(locale, "/commercial/prices", initialOrg, initialClinician);
  const [direct, setDirect] = useState<DirectConsultant[]>([]); const [directId, setDirectId] = useState("");
  useEffect(() => { if (legacy && current === "direct") void api<DirectConsultant[]>("/admin/practitioners").then(setDirect).catch(() => setDirect([])); }, [legacy, current, api]);
  const title = ar ? "قوائم الأسعار" : "Price Lists";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="pricing" title={title} intro={ar ? "أسعار الخدمات وكيف يُختار السعر المطبّق على كل حالة." : "Service prices, and how the price applied to each case is chosen."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!current) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى قوائم الأسعار" : "You don't have access to price lists"} />);
  const selectedDirect = direct.find((d) => d.id === directId);
  return shell(
    <>
      {views.length > 1 && <div className="cc-segmented" role="group" aria-label={title}>{views.map(([k, label]) => <button key={k} type="button" aria-pressed={current === k} onClick={() => setView(k)}>{label}</button>)}</div>}
      {current === "provider" && <>
        <Section title={ar ? "كيف يُختار السعر" : "How a price is chosen"} description={ar ? "النظام يطبّق دائمًا السعر الأكثر تحديدًا الساري." : "The platform always applies the most specific live price."} id="how">
          <ol className="cc-inheritance">
            <li><strong>1. {ar ? "السعر الافتراضي للمؤسسة" : "Organization default"}</strong><span>{ar ? "لكل أطباء المؤسسة" : "For every clinician in the organization"}</span></li>
            <li><strong>2. {ar ? "سعر خاص بالاستشاري" : "Consultant override"}</strong><span>{ar ? "يحل محل الافتراضي لهذا الاستشاري" : "Replaces the default for that consultant"}</span></li>
            <li><strong>3. {ar ? "سعر خاص بالطبيب المشارك" : "Associate doctor override"}</strong><span>{ar ? "يحل محل الافتراضي لهذا الطبيب" : "Replaces the default for that doctor"}</span></li>
          </ol>
        </Section>
        <ClinicianPicker locale={locale} org={selection.org} clinician={selection.clinician} onChange={selection.change} />
        {selection.org && selection.clinician ? <>
          <p className="cc-meta"><Link href={clinicianHref(locale, selection.org, selection.clinician)}>{ar ? "فتح صفحة الطبيب" : "Open the clinician's page"}</Link></p>
          <PricingManagement key={selection.clinician} locale={locale} organizationId={selection.org} practitionerId={selection.clinician} showOrder={false} />
        </> : <EmptyState title={ar ? "اختر طبيبًا لعرض أسعاره" : "Choose a clinician to see their prices"} body={ar ? "ستظهر الأسعار الافتراضية للمؤسسة والأسعار الخاصة بالطبيب معًا." : "The organization defaults and the clinician's own prices appear together."} />}
      </>}
      {current === "direct" && <>
        <div className="cc-filterbar"><Field label={ar ? "الاستشاري" : "Consultant"}><select value={directId} onChange={(e) => setDirectId(e.target.value)}><option value="">{ar ? "اختر استشاريًا" : "Choose a consultant"}</option>{direct.map((d) => <option key={d.id} value={d.id}>{d.displayName}{d.specialty ? ` — ${d.specialty}` : ""}</option>)}</select></Field></div>
        {selectedDirect ? <DirectPriceList key={selectedDirect.id} locale={locale} api={api} practitionerId={selectedDirect.id} careArea={selectedDirect.careCategory} editable={access.legacy.systemAdmin} />
          : <EmptyState title={ar ? "اختر استشاريًا لعرض قائمة أسعاره" : "Choose a consultant to see their price list"} body={ar ? "كل قائمة مشتقة من قالب مجال رعايته." : "Each list is derived from their care-area template."} />}
      </>}
      {current === "templates" && <CareAreaTemplates locale={locale} api={api} editable={access.legacy.systemAdmin} />}
    </>
  );
}

/** Commercial › Exchange Rates: the rates used to show EGP prices in other currencies (current case workflow). */
export function ExchangeRatesPage({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const title = ar ? "أسعار الصرف" : "Exchange Rates";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="exchangeRates" title={title} intro={ar ? "الأسعار المستخدمة لعرض الأسعار بالجنيه المصري بعملات أخرى." : "The rates used to show EGP prices in other currencies."}>{body}</ControlCenterShell>;
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
