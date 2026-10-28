"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck, ShieldOff } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PortalAccount, type Preferences } from "@/components/portal/PortalAccount";
import { PortalFrame } from "@/components/portal/PortalFrame";
import { StaffNav, StaffViewLinks, type StaffViewId } from "@/components/portal/StaffNav";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { useControlCenterEntry } from "@/components/platform-control-center/ControlCenterNavigation";
import { apiFetchAs } from "@/lib/api";
import { formatCalendarDate } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney, parseAmount } from "@/lib/money";
import { fillTemplate, tabKeyTarget } from "@/lib/portal-labels";
import {
  SERVICE_KINDS, useVirtualClinics, virtualClinicHref,
  type Clinic, type ClinicAuditEntry, type ClinicPermission, type ClinicService, type Manager, type ServiceChange, type Slot,
} from "./virtual-clinic-model";
import { Affiliations, DeclarationPrompt, useDeclarationStatus, type AffiliationCopy } from "./Affiliations";
import { AlertLine, Fact, Part, QUIET } from "./clinic-parts";

type Section = "overview" | "services" | "schedule" | "team" | "affiliations" | "history";
export type ClinicCall = <T = unknown>(path: string, method?: string, body?: unknown) => Promise<T>;
export type ClinicCopy = Dictionary["portalWork"]["virtualClinic"];
type NavCopy = Dictionary["portalWork"]["nav"];
type Run = (path: string, method: string, body?: unknown) => Promise<boolean>;
type Confirm = { title: string; body: string; confirm: string; cancel?: string; onConfirm: () => void };
const PERMISSIONS: ClinicPermission[] = ["PROFILE", "SCHEDULE", "SERVICES"];

/**
 * The Virtual Clinic page (UX 3-3): the portal's own shell — the staff navigation with the clinic as the current place, the
 * account menu and the `#portal-title` heading on paper — then the clinic chosen. The workspace below it is pure and testable.
 */
export function VirtualClinic({ locale, copy, navCopy, affiliationsCopy }: { locale: Locale; copy: ClinicCopy; navCopy: NavCopy; affiliationsCopy: AffiliationCopy }) {
  const { user, loading: authLoading, signIn, signOut } = useAuth();
  const { clinics, loading } = useVirtualClinics(!!user);
  const router = useRouter();
  const controlCenter = useControlCenterEntry(locale);
  const [selected, setSelected] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("clinic"));
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ practitionerId: string; clinic: Clinic | null; failed: boolean } | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({ displayName: null, locale: null });
  const current = clinics.find(c => c.practitionerId === selected) ?? clinics[0];
  const currentId = current?.practitionerId;
  const token = user?.access_token;

  const call: ClinicCall = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!token) throw new Error("AUTHENTICATION_REQUIRED");
    const response = await apiFetchAs(token, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    // The backend's stable code travels with the error, so the screen words it (P1-19 affiliations, the clinic's own refusals).
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw Object.assign(new Error(payload.message || copy.errors.generic), { code: payload.code as string | undefined }); }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }, [token, copy.errors.generic]);
  const accountApi = useCallback(<T,>(path: string, init?: RequestInit) => call<T>(path, init?.method ?? "GET", typeof init?.body === "string" ? JSON.parse(init.body) : undefined), [call]);

  const signedIn = !!user;
  useEffect(() => { if (signedIn) void accountApi<Preferences>("/account/preferences").then(setPreferences).catch(() => {}); }, [signedIn, accountApi]);
  // A reload keeps the clinic on screen until the fresh copy arrives, so the open section is not lost after a change.
  useEffect(() => {
    if (!currentId) return;
    let live = true;
    void call<Clinic>(`/clinics/${currentId}`)
      .then(clinic => { if (live) setResult({ practitionerId: currentId, clinic, failed: false }); })
      .catch(() => { if (live) setResult(previous => ({ practitionerId: currentId, clinic: previous?.practitionerId === currentId ? previous.clinic : null, failed: true })); });
    return () => { live = false; };
  }, [call, currentId, attempt]);
  const load = useCallback(() => setAttempt(n => n + 1), []);
  const shown = result && result.practitionerId === currentId ? result : null;
  const clinic = shown?.clinic ?? null;
  const failed = !!shown?.failed && !clinic;

  // A Consultant reaches My work and My cases from here as from the portal; a practice manager has no case work to go to.
  const consultant = clinics.some(c => c.relation === "OWNER");
  const viewHref = (id: StaffViewId) => `/${locale}/portal?view=${id}`;
  const navItems = consultant ? [{ id: "work" as const, label: navCopy.work }, { id: "mine" as const, label: navCopy.mine }] : [];
  const navProps = { locale, label: navCopy.label, items: navItems, current: "clinic" as const, clinic: { href: virtualClinicHref(locale), label: navCopy.clinic },
    onSelect: (id: StaffViewId) => router.push(viewHref(id)), hrefFor: viewHref };
  const showNav = consultant && !!clinic;

  if (authLoading || (user && loading)) return <PortalFrame title={copy.title} subtitle={copy.loading}/>;
  if (!user) return <PortalFrame title={copy.title} subtitle={copy.signInLead}><button type="button" className="btn-primary" onClick={() => void signIn()}>{copy.signIn}</button></PortalFrame>;
  const profile = user.profile as { name?: string; preferred_username?: string; email?: string };
  const owner = current?.relation === "OWNER";
  const account = <PortalAccount locale={locale} name={preferences.displayName || profile.name || profile.preferred_username || profile.email || ""} email={profile.email}
    role={owner ? copy.history.owner : copy.history.manager} api={accountApi} signOut={signOut} preferences={preferences} onSaved={setPreferences} controlCenter={controlCenter}/>;
  if (!current) return <PortalFrame title={copy.title} subtitle="">{account}<div className="card max-w-2xl p-5 sm:p-6"><p className="font-bold text-ink-800">{copy.none}</p><p className="mt-1 text-[0.9375rem] leading-6 text-ink-600">{copy.noneBody}</p></div></PortalFrame>;
  return <PortalFrame title={copy.title} subtitle={owner ? copy.ownerLead : copy.managerLead} nav={showNav ? <StaffViewLinks {...navProps} variant="inline"/> : null}>
    {showNav && <StaffNav {...navProps}/>}
    {account}
    {clinics.length > 1 && <label className="mb-5 block max-w-sm text-sm font-bold">{copy.switchClinic}
      <select className="field mt-1.5" value={current.practitionerId} onChange={e => { setSelected(e.target.value); window.history.replaceState({}, "", virtualClinicHref(locale, e.target.value)); }}>
        {clinics.map(c => <option key={c.practitionerId} value={c.practitionerId}>{c.consultantName}</option>)}
      </select>
    </label>}
    {failed ? <AlertLine>{copy.failed} <button type="button" className={QUIET} onClick={load}>{copy.retry}</button></AlertLine>
      : clinic ? <ClinicWorkspace key={clinic.practitionerId} locale={locale} copy={copy} clinic={clinic} call={call} reload={load} affiliationsCopy={affiliationsCopy}/>
        : <p role="status" className="text-sm text-ink-500">{copy.loading}</p>}
  </PortalFrame>;
}

/** The clinic's one way to word a refusal: the backend's stable code in the viewer's language, its English message only in English. */
function refusalText(copy: ClinicCopy, locale: Locale, e: unknown) {
  const code = (e as { code?: string } | null)?.code;
  if (code && Object.hasOwn(copy.errors, code)) return copy.errors[code as keyof ClinicCopy["errors"]];
  return locale === "en" && e instanceof Error && e.message ? e.message : copy.errors.generic;
}

/**
 * One clinic, as the backend returned it for this viewer. Sections the viewer has no permission for are not offered, but that
 * is courtesy only — every action is re-authorized by the backend. Each section is one white sheet of hairline parts.
 */
export function ClinicWorkspace({ locale, copy, clinic, call, reload, affiliationsCopy }: {
  locale: Locale; copy: ClinicCopy; clinic: Clinic; call: ClinicCall; reload: () => void; affiliationsCopy: AffiliationCopy;
}) {
  const owner = clinic.relation === "OWNER";
  const can = (p: ClinicPermission) => owner || clinic.permissions.includes(p);
  const sections: Section[] = ["overview", ...(can("SERVICES") ? ["services" as const] : []), ...(can("SCHEDULE") ? ["schedule" as const] : []),
    // P1-19: the yearly affiliation declaration is the Consultant's own attestation; a practice manager never files or reads it.
    ...(owner ? ["team" as const, "affiliations" as const, "history" as const] : [])];
  const [section, setSection] = useState<Section>("overview");
  // P1-19: the owner's declaration status, re-read with each clinic load, so the overview can say why no new case comes.
  const declaration = useDeclarationStatus(call, clinic.practitionerId, owner, clinic);
  const [now] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const run: Run = async (path, method, body) => {
    setBusy(true); setError("");
    try { await call(path, method, body); reload(); return true; }
    catch (e) {
      setError(refusalText(copy, locale, e));
      // Someone else's change won: show the latest clinic under the message rather than the stale one.
      if ((e as { code?: string }).code === "CLINIC_VERSION_CONFLICT") reload();
      requestAnimationFrame(() => errorRef.current?.focus());
      return false;
    }
    finally { setBusy(false); }
  };
  const base = `/clinics/${clinic.practitionerId}`;
  const label = (s: Section) => s === "affiliations" ? affiliationsCopy.tab : copy.sections[s];
  const select = (s: Section) => { setSection(s); setError(""); };
  const permissionWords = new Intl.ListFormat(intlLocale(locale), { type: "conjunction" }).format(PERMISSIONS.filter(p => clinic.permissions.includes(p)).map(p => copy.permissionPhrases[p]));
  const name = clinic.professional.displayName;

  return <div>
    <p className="font-semibold text-ink-800"><bdi>{name}</bdi></p>
    {/* The manager's line: what this person may do here, said once, under the Consultant's name. */}
    {!owner && <p className="mt-1 max-w-[70ch] text-[0.9375rem] leading-6 text-ink-600">
      {clinic.permissions.length ? fillTemplate(copy.managerCan, { name, permissions: permissionWords }) : fillTemplate(copy.managerNothing, { name })}
      {can("SERVICES") && <> {clinic.managerChangesRequireApproval ? copy.managerApproval : copy.managerNoApproval}</>}
    </p>}

    <div role="tablist" aria-label={copy.tabsLabel} className="mt-5 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line-strong)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {sections.map((s, index) => <button key={s} type="button" role="tab" id={`clinic-tab-${s}`} aria-controls="clinic-panel" aria-selected={section === s} tabIndex={section === s ? 0 : -1}
        className={`min-h-11 flex-none whitespace-nowrap border-b-2 px-3 py-2 text-[0.875rem] font-bold transition-colors ${section === s ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"}`}
        onClick={() => select(s)}
        onKeyDown={event => {
          const target = tabKeyTarget(event.key, index, sections.length, locale === "ar");
          if (target < 0) return;
          event.preventDefault(); const next = sections[target]; select(next);
          requestAnimationFrame(() => document.getElementById(`clinic-tab-${next}`)?.focus());
        }}>{label(s)}</button>)}
    </div>

    <div id="clinic-panel" role="tabpanel" aria-labelledby={`clinic-tab-${section}`} tabIndex={0} className="mt-5 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
      {error && <div ref={errorRef} tabIndex={-1} className="mb-4 outline-none"><AlertLine>{error}</AlertLine></div>}
      {/* P1-19: the declaration prompt opens the overview on the page itself, above the sheet (a slot: the overview stays unaware of affiliations). */}
      {section === "overview" && owner && <div className="mb-4 empty:hidden"><DeclarationPrompt locale={locale} copy={affiliationsCopy} view={declaration} now={now} onOpen={() => select("affiliations")}/></div>}
      <fieldset disabled={busy} aria-busy={busy || undefined} className="card min-w-0 divide-y divide-line p-4 sm:p-6">
        {section === "overview" && <Overview locale={locale} copy={copy} clinic={clinic} owner={owner} canProfile={can("PROFILE")} base={base} run={run} confirm={setConfirm}
          ineligibleReason={declaration && !declaration.declarationCurrent ? affiliationsCopy.overview.reason : null}/>}
        {section === "services" && <Services locale={locale} copy={copy} clinic={clinic} owner={owner} base={base} run={run} call={call} confirm={setConfirm}/>}
        {section === "schedule" && <Schedule locale={locale} copy={copy} clinic={clinic} base={base} run={run} confirm={setConfirm}/>}
        {section === "team" && owner && <Team locale={locale} copy={copy} clinic={clinic} base={base} run={run} confirm={setConfirm}/>}
        {section === "affiliations" && owner && <Affiliations locale={locale} copy={affiliationsCopy} practitionerId={clinic.practitionerId} call={call} onFiled={reload}/>}
        {section === "history" && owner && <ChangeHistory locale={locale} copy={copy} base={base} call={call}/>}
      </fieldset>
    </div>
    {confirm && <ConfirmDialog title={confirm.title} body={confirm.body} confirm={confirm.confirm} cancel={confirm.cancel ?? copy.keep}
      onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); confirm.onConfirm(); }}/>}
  </div>;
}

/** Dates and times in the page's one digit rule (Latin digits in both languages, as the rest of the portal). */
function useFormats(locale: Locale) {
  return useMemo(() => {
    const tag = intlLocale(locale);
    const stamp = new Intl.DateTimeFormat(tag, { dateStyle: "long" });
    const slot = new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
    return {
      /** A calendar date the backend sends as `YYYY-MM-DD`. */ day: (value?: string | null) => value ? formatCalendarDate(value, locale) : "",
      /** An instant. */ at: (value?: string | null) => value ? stamp.format(new Date(value)) : "",
      range: (start: string, end: string) => slot.formatRange(new Date(start), new Date(end)),
      number: (value: number) => new Intl.NumberFormat(tag).format(value),
      egp: (value: number) => formatMoney(value, "EGP", locale),
    };
  }, [locale]);
}

function Money({ children }: { children: string }) {
  return <bdi dir="ltr" className="tabular-nums">{children}</bdi>;
}

function priceText(f: ReturnType<typeof useFormats>, s: { priceEgp: number; priceMaxEgp?: number | null }) {
  return s.priceMaxEgp ? `${f.egp(s.priceEgp)} – ${f.egp(s.priceMaxEgp)}` : f.egp(s.priceEgp);
}

function Overview({ locale, copy, clinic, owner, canProfile, base, run, confirm, ineligibleReason }: {
  locale: Locale; copy: ClinicCopy; clinic: Clinic; owner: boolean; canProfile: boolean; base: string; run: Run; confirm: (c: Confirm) => void;
  /** Why the Consultant is not eligible, when it is known (no current affiliation declaration). */ ineligibleReason?: string | null;
}) {
  const p = clinic.professional;
  const t = copy.professional;
  const f = useFormats(locale);
  const reviewed = p.credentialingStatus === "VERIFIED";
  return <>
    <Part title={t.title}>
      <dl className="mt-3 grid gap-x-6 gap-y-4 text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t.specialty}>{p.specialty}</Fact><Fact label={t.subspecialty}>{p.subspecialty}</Fact>
        <Fact label={t.careArea}>{locale === "ar" ? p.careAreaAr ?? p.careArea : p.careAreaEn ?? p.careArea}</Fact>
        {/* PRODUCT: never "Verified" — the platform reviewed the credentials; whether they are current is said beside it. */}
        <Fact label={t.credentials}><StatusBadge tone={reviewed && p.credentialsCurrent ? "success" : "warning"}>{`${reviewed ? t.reviewed : t.notReviewed} · ${p.credentialsCurrent ? t.current : t.renewal}`}</StatusBadge></Fact>
      </dl>
      <h3 className="mt-5 text-[0.8125rem] font-semibold text-ink-500">{t.capabilities}</h3>
      {p.capabilities.length
        ? <ul className="mt-1 space-y-1 text-[0.9375rem] text-ink-800">{p.capabilities.map(c => <li key={`${c.type}:${c.code}`} className="flex items-start gap-2"><Check size={16} aria-hidden className="mt-1 flex-none text-brand-600"/><bdi>{c.label}</bdi></li>)}</ul>
        : <p className="mt-1 text-[0.9375rem] text-ink-600">{t.noCapabilities}</p>}
      <p className={`mt-5 flex items-start gap-2 text-[0.9375rem] font-semibold ${p.assignable ? "text-brand-800" : "text-ink-700"}`}>
        {p.assignable ? <ShieldCheck size={18} aria-hidden className="mt-0.5 flex-none"/> : <ShieldOff size={18} aria-hidden className="mt-0.5 flex-none"/>}
        {p.assignable ? t.assignable : ineligibleReason ? fillTemplate(t.notAssignableBecause, { reason: ineligibleReason }) : t.notAssignable}
      </p>
    </Part>

    {owner && <Availability copy={copy} clinic={clinic} base={base} run={run}/>}
    <PublicProfile copy={copy} clinic={clinic} owner={owner} canProfile={canProfile} base={base} run={run} confirm={confirm} f={f}/>

    {owner && <Part title={copy.settings.title}>
      <label className="mt-2 flex min-h-11 items-start gap-3 text-[0.9375rem] leading-6 text-ink-800">
        <input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-brand-700" checked={clinic.managerChangesRequireApproval}
          onChange={e => void run(`${base}/settings`, "PUT", { managerChangesRequireApproval: e.target.checked, expectedVersion: clinic.version })}/>
        <span>{copy.settings.requireApproval}</span>
      </label>
    </Part>}
  </>;
}

function Availability({ copy, clinic, base, run }: { copy: ClinicCopy; clinic: Clinic; base: string; run: Run }) {
  const t = copy.availability;
  const p = clinic.professional;
  const id = useId();
  const [accepting, setAccepting] = useState(p.availabilityStatus === "AVAILABLE");
  const [hours, setHours] = useState(p.expectedReviewHours ? String(p.expectedReviewHours) : "");
  const [invalid, setInvalid] = useState(false);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const value = hours.trim() ? parseAmount(hours) : null;
    if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 720)) { setInvalid(true); document.getElementById(`${id}-hours`)?.focus(); return; }
    setInvalid(false);
    void run(`${base}/availability`, "PUT", { availabilityStatus: accepting ? "AVAILABLE" : "UNAVAILABLE", expectedReviewHours: value, expectedVersion: p.practitionerVersion });
  };
  return <Part title={t.title}>
    <form className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,16rem)] sm:items-start sm:gap-x-10" onSubmit={save} noValidate>
      <label className="flex min-h-11 items-center gap-3 text-[0.9375rem] font-semibold text-ink-800">
        <input type="checkbox" className="h-4 w-4 flex-none accent-brand-700" checked={accepting} onChange={e => setAccepting(e.target.checked)}/>{t.accepting}
      </label>
      <div>
        <label htmlFor={`${id}-hours`} className="block text-sm font-bold">{t.reviewHours}</label>
        <input id={`${id}-hours`} className={`field mt-1.5 tabular-nums ${invalid ? "field-error" : ""}`} inputMode="numeric" dir="ltr" value={hours} onChange={e => setHours(e.target.value)}
          aria-invalid={invalid || undefined} aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ""}`}/>
        <p id={`${id}-hint`} className="mt-1 text-[0.8125rem] text-ink-500">{t.reviewHoursHint}</p>
        {invalid && <p id={`${id}-error`} className="error-text mt-1">{t.reviewHoursInvalid}</p>}
      </div>
      <div className="sm:col-span-2"><button className="btn-secondary">{t.save}</button></div>
    </form>
  </Part>;
}

function PublicProfile({ copy, clinic, owner, canProfile, base, run, confirm, f }: {
  copy: ClinicCopy; clinic: Clinic; owner: boolean; canProfile: boolean; base: string; run: Run; confirm: (c: Confirm) => void; f: ReturnType<typeof useFormats>;
}) {
  const t = copy.profile;
  const [editing, setEditing] = useState(false);
  const published = clinic.publicProfile;
  const draft = clinic.draft;
  const source = draft ?? published;
  const submit = (form: HTMLFormElement, publish: boolean) => {
    const data = new FormData(form);
    const body = { displayName: data.get("displayName"), headline: data.get("headline"), bio: data.get("bio"), languages: data.get("languages"), expectedVersion: clinic.version };
    void run(`${base}/profile-draft?publish=${publish}`, "PUT", body).then(ok => { if (ok) setEditing(false); });
  };
  return <Part title={t.title}>
    {published.publishedAt ? <div className="mt-2 text-[0.9375rem] leading-6 text-ink-700">
      <p className="text-[0.8125rem] font-semibold text-ink-500">{fillTemplate(t.publishedOn, { date: f.at(published.publishedAt) })}</p>
      <ProfileText profile={published}/>
    </div> : <p className="mt-1 text-[0.9375rem] text-ink-600">{t.notPublished}</p>}

    {/* The draft is what the form edits, so it steps aside while the form is open: one place for the profile's words at a time. */}
    {draft && !editing && <div className="mt-5 border-t border-line pt-4">
      <h3 className="font-bold text-ink-800">{owner ? t.draftTitle : t.draftWaiting}</h3>
      {draft.updatedByName && <p className="mt-0.5 text-[0.8125rem] text-ink-500">{fillTemplate(t.draftBy, { name: draft.updatedByName, date: f.at(draft.updatedAt) })}</p>}
      <div className="text-[0.9375rem] leading-6 text-ink-700"><ProfileText profile={draft}/></div>
      {owner && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="btn-primary" onClick={() => void run(`${base}/profile-draft/approve`, "POST", { expectedVersion: clinic.version })}>{t.approvePublish}</button>
        <button type="button" className={QUIET} onClick={() => confirm({ ...t.discardConfirm, onConfirm: () => void run(`${base}/profile-draft/discard`, "POST", { expectedVersion: clinic.version }) })}>{t.discard}</button>
      </div>}
    </div>}

    {canProfile && (editing ? <form className="mt-5 grid gap-4 border-t border-line pt-4" onSubmit={e => { e.preventDefault(); submit(e.currentTarget, false); }}>
      <label className="block text-sm font-bold">{t.displayName}<input name="displayName" dir="auto" className="field mt-1.5" maxLength={160} defaultValue={source.displayName ?? clinic.professional.displayName}/></label>
      <label className="block text-sm font-bold">{t.headline}<input name="headline" dir="auto" className="field mt-1.5" maxLength={300} defaultValue={source.headline ?? ""}/></label>
      <label className="block text-sm font-bold">{t.bio}<textarea name="bio" dir="auto" className="field mt-1.5 min-h-28" maxLength={5000} defaultValue={source.bio ?? ""}/></label>
      <label className="block text-sm font-bold">{t.languages}<input name="languages" dir="auto" className="field mt-1.5" maxLength={300} defaultValue={source.languages ?? ""}/></label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button className="btn-primary">{owner ? t.saveDraft : t.saveForApproval}</button>
        {owner && <button type="button" className="btn-secondary" onClick={e => { const form = e.currentTarget.form; if (form?.reportValidity()) submit(form, true); }}>{t.publishNow}</button>}
        <button type="button" className={QUIET} onClick={() => setEditing(false)}>{t.cancel}</button>
      </div>
    </form> : <button type="button" className="btn-secondary mt-5" onClick={() => setEditing(true)}>{t.edit}</button>)}
  </Part>;
}

function ProfileText({ profile }: { profile: { displayName?: string | null; headline?: string | null; bio?: string | null; languages?: string | null } }) {
  return <>
    <p dir="auto" className="mt-1 font-semibold text-ink-900">{profile.displayName}</p>
    {profile.headline && <p dir="auto">{profile.headline}</p>}
    {profile.bio && <p dir="auto" className="mt-1 max-w-[70ch] whitespace-pre-wrap">{profile.bio}</p>}
    {profile.languages && <p dir="auto" className="mt-1 text-ink-500">{profile.languages}</p>}
  </>;
}

function Services({ locale, copy, clinic, owner, base, run, call, confirm }: {
  locale: Locale; copy: ClinicCopy; clinic: Clinic; owner: boolean; base: string; run: Run; call: ClinicCall; confirm: (c: Confirm) => void;
}) {
  const t = copy.services;
  const f = useFormats(locale);
  const [form, setForm] = useState<ClinicService | "new" | null>(null);
  const pendingFor = new Set(clinic.pendingChanges.map(c => c.serviceId).filter(Boolean));
  const change = (s: ClinicService) => void run(`${base}/service-changes`, "POST", { serviceId: s.id, changeType: s.active ? "RETIRE" : "ACTIVATE" });
  const retire = (s: ClinicService) => {
    const words = owner ? t.retireConfirm : t.retireConfirmManager;
    confirm({ title: fillTemplate(words.title, { service: s.serviceName }), body: words.body, confirm: words.confirm, onConfirm: () => change(s) });
  };
  const pending = <Pending locale={locale} copy={copy} clinic={clinic} owner={owner} base={base} run={run}/>;
  return <>
    {/* A decision owed comes first for the Consultant; a practice manager reads the services first and what waits after. */}
    {owner && clinic.pendingChanges.length > 0 && pending}
    <Part title={t.listLabel} lead={t.lead}>
      {clinic.services.length === 0 ? <p className="mt-3 text-[0.9375rem] text-ink-600">{t.empty}</p> :
        <ul className="mt-3 divide-y divide-line border-t border-line">{clinic.services.map(s => <ServiceRow key={s.id} copy={copy} service={s} f={f} waiting={pendingFor.has(s.id)}
          base={base} call={call} onEdit={() => setForm(s)} onStatus={() => s.active ? retire(s) : change(s)}/>)}</ul>}
      {form ? <ServiceForm copy={copy} service={form === "new" ? null : form} owner={owner} onCancel={() => setForm(null)}
        onSubmit={body => void run(`${base}/service-changes`, "POST", body).then(ok => { if (ok) setForm(null); })}/>
        : <button type="button" className="btn-secondary mt-4" onClick={() => setForm("new")}>{t.add}</button>}
    </Part>
    {!owner && clinic.pendingChanges.length > 0 && pending}
  </>;
}

function ServiceRow({ copy, service: s, f, waiting, base, call, onEdit, onStatus }: {
  copy: ClinicCopy; service: ClinicService; f: ReturnType<typeof useFormats>; waiting: boolean; base: string; call: ClinicCall; onEdit: () => void; onStatus: () => void;
}) {
  const t = copy.services;
  const [history, setHistory] = useState<ServiceChange[] | "failed" | null>(null);
  const [open, setOpen] = useState(false);
  const named = (template: string) => fillTemplate(template, { service: s.serviceName });
  const toggleHistory = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!history) void call<ServiceChange[]>(`${base}/services/${s.id}/history`).then(rows => setHistory(Array.isArray(rows) ? rows : []), () => setHistory("failed"));
  };
  const historyId = `service-history-${s.id}`;
  return <li className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0">
      <p dir="auto" className="font-semibold text-ink-900">{s.serviceName}</p>
      <p className="text-[0.875rem] text-ink-600">{s.serviceKind ? t.kinds[s.serviceKind as keyof typeof t.kinds] ?? s.serviceKind : "—"}
        {s.effectiveFrom && <> · {fillTemplate(t.from, { date: f.day(s.effectiveFrom) })}</>}{s.validUntil && <> {fillTemplate(t.until, { date: f.day(s.validUntil) })}</>}</p>
      <p className="text-[0.8125rem] text-ink-500">{fillTemplate(t.code, { code: `⁦${s.serviceCode}⁩`, revision: f.number(s.revision) })} · {t.approvalStatus[s.approvalStatus as keyof typeof t.approvalStatus] ?? s.approvalStatus}</p>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end">
      <p className="font-semibold text-ink-900"><Money>{priceText(f, s)}</Money></p>
      <StatusBadge tone={s.active ? "success" : "neutral"}>{s.active ? t.active : t.retired}</StatusBadge>
    </div>
    <div className="flex flex-wrap items-center gap-x-5 sm:col-span-2">
      {waiting ? <p className="inline-flex min-h-11 items-center text-[0.875rem] font-semibold text-ink-600">{t.waiting}</p> : <>
        <button type="button" className={QUIET} aria-label={named(t.editNamed)} onClick={onEdit}>{t.edit}</button>
        <button type="button" className={QUIET} aria-label={named(s.active ? t.retireNamed : t.activateNamed)} onClick={onStatus}>{s.active ? t.retire : t.activate}</button>
      </>}
      <button type="button" className={QUIET} aria-label={named(t.historyNamed)} aria-expanded={open} aria-controls={open ? historyId : undefined} onClick={toggleHistory}>{open ? t.closeHistory : t.history}</button>
    </div>
    {open && <div id={historyId} className="sm:col-span-2">
      {history === null ? <p role="status" className="text-[0.875rem] text-ink-500">{copy.history.loading}</p>
        : history === "failed" ? <p className="text-[0.875rem] text-alert-800">{copy.history.failed}</p>
        : history.length === 0 ? <p className="text-[0.875rem] text-ink-600">{t.historyEmpty}</p>
        : <ol className="space-y-1.5 border-s-2 border-line ps-3 text-[0.875rem] text-ink-700">{history.map(r => <li key={r.id}>
          <p>{fillTemplate(t.historyRow, { revision: r.appliedRevision ? f.number(r.appliedRevision) : "—", change: t.changeType[r.changeType as keyof typeof t.changeType] ?? r.changeType, price: `⁦${priceText(f, r)}⁩` })}</p>
          <p className="text-[0.8125rem] text-ink-500">{fillTemplate(t.historyBy, { name: [r.proposedByName, r.decidedByName].filter(Boolean).join(" → ") || "—", date: f.at(r.decidedAt ?? r.proposedAt) })}</p>
        </li>)}</ol>}
    </div>}
  </li>;
}

function Pending({ locale, copy, clinic, owner, base, run }: { locale: Locale; copy: ClinicCopy; clinic: Clinic; owner: boolean; base: string; run: Run }) {
  const t = copy.services;
  const f = useFormats(locale);
  const id = useId();
  const [rejecting, setRejecting] = useState<string | null>(null);
  return <Part title={owner ? t.pendingTitle : t.pendingTitleManager}>
    <ul className="mt-3 divide-y divide-line border-t border-line">{clinic.pendingChanges.map(c => {
        const named = (template: string) => fillTemplate(template, { service: c.serviceName });
        return <li key={c.id} className="py-4">
          <p className="text-ink-900"><span className="font-semibold">{t.changeType[c.changeType as keyof typeof t.changeType] ?? c.changeType}: </span><bdi>{c.serviceName}</bdi></p>
          <p className="text-[0.875rem] text-ink-700"><Money>{priceText(f, c)}</Money> · {fillTemplate(t.from, { date: f.day(c.effectiveFrom) })}</p>
          <p className="text-[0.8125rem] text-ink-500">{fillTemplate(t.proposedBy, { name: c.proposedByName ?? (c.proposedByRole === "CONSULTANT" ? copy.history.owner : copy.history.manager), date: f.at(c.proposedAt) })}</p>
          {owner ? (rejecting === c.id
            ? <form className="mt-3 grid gap-3 sm:max-w-xl" onSubmit={e => { e.preventDefault(); const reason = new FormData(e.currentTarget).get("reason"); void run(`${base}/service-changes/${c.id}/reject`, "POST", { expectedVersion: c.version, reason }).then(ok => { if (ok) setRejecting(null); }); }}>
                <label htmlFor={`${id}-${c.id}`} className="block text-sm font-bold">{t.rejectReason}</label>
                <input id={`${id}-${c.id}`} name="reason" required maxLength={500} dir="auto" className="field" autoFocus/>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><button className="btn-secondary">{t.rejectSend}</button><button type="button" className={QUIET} onClick={() => setRejecting(null)}>{t.cancel}</button></div>
              </form>
            : <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                <button type="button" className="btn-secondary" aria-label={named(t.approveNamed)} onClick={() => void run(`${base}/service-changes/${c.id}/approve`, "POST", { expectedVersion: c.version })}><Check size={16} aria-hidden/>{t.approve}</button>
                <button type="button" className={QUIET} aria-label={named(t.rejectNamed)} onClick={() => setRejecting(c.id)}>{t.reject}</button>
              </div>)
            : <p className="mt-1 text-[0.875rem] font-semibold text-ink-600">{t.waiting}</p>}
        </li>;
      })}</ul>
  </Part>;
}

function ServiceForm({ copy, service, owner, onSubmit, onCancel }: { copy: ClinicCopy; service: ClinicService | null; owner: boolean; onSubmit: (body: Record<string, unknown>) => void; onCancel: () => void }) {
  const t = copy.services;
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [errors, setErrors] = useState<{ price?: string; max?: string }>({});
  useEffect(() => { heading.current?.focus(); }, []);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = (k: string) => { const v = String(data.get(k) ?? "").trim(); return v || null; };
    const price = parseAmount(text("priceEgp") ?? "");
    const max = text("priceMaxEgp") ? parseAmount(text("priceMaxEgp")!) : null;
    const next = { price: Number.isNaN(price) || price < 0 ? t.priceInvalid : undefined, max: max !== null && (Number.isNaN(max) || max <= price) ? t.rangeInvalid : undefined };
    setErrors(next);
    if (next.price || next.max) { document.getElementById(`${id}-${next.price ? "price" : "max"}`)?.focus(); return; }
    onSubmit({
      serviceId: service?.id ?? null, changeType: service ? "UPDATE" : "CREATE", serviceCode: service ? null : text("serviceCode"),
      serviceName: text("serviceName"), serviceKind: text("serviceKind"), description: text("description"), includedScope: text("includedScope"), excludedScope: text("excludedScope"),
      currency: "EGP", priceEgp: price, priceMaxEgp: max, effectiveFrom: text("effectiveFrom"), validUntil: text("validUntil"),
    });
  };
  const field = "block text-sm font-bold";
  return <form className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2" onSubmit={submit} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} ref={heading} tabIndex={-1} className="font-bold text-ink-800 outline-none sm:col-span-2">{service ? fillTemplate(t.editTitle, { service: service.serviceName }) : t.add}</h3>
    {!service && <div><label htmlFor={`${id}-code`} className={field}>{t.fieldCode}</label>
      <input id={`${id}-code`} name="serviceCode" required maxLength={60} pattern="[A-Za-z0-9._\-]+" dir="ltr" className="field mt-1.5" aria-describedby={`${id}-code-hint`}/>
      <p id={`${id}-code-hint`} className="mt-1 text-[0.8125rem] text-ink-500">{t.fieldCodeHint}</p></div>}
    <label className={field}>{t.fieldName}<input name="serviceName" required maxLength={500} dir="auto" className="field mt-1.5" defaultValue={service?.serviceName}/></label>
    <label className={field}>{t.fieldKind}<select name="serviceKind" required className="field mt-1.5" defaultValue={service?.serviceKind ?? ""}>
      <option value="" disabled>—</option>{SERVICE_KINDS.map(k => <option key={k} value={k}>{t.kinds[k]}</option>)}</select></label>
    <div><label htmlFor={`${id}-price`} className={field}>{t.fieldPrice}</label>
      <input id={`${id}-price`} name="priceEgp" required inputMode="decimal" dir="ltr" className={`field mt-1.5 tabular-nums ${errors.price ? "field-error" : ""}`} defaultValue={service?.priceEgp}
        aria-invalid={!!errors.price || undefined} aria-describedby={errors.price ? `${id}-price-error` : undefined}/>
      {errors.price && <p id={`${id}-price-error`} className="error-text mt-1">{errors.price}</p>}</div>
    <div><label htmlFor={`${id}-max`} className={field}>{t.fieldPriceMax}</label>
      <input id={`${id}-max`} name="priceMaxEgp" inputMode="decimal" dir="ltr" className={`field mt-1.5 tabular-nums ${errors.max ? "field-error" : ""}`} defaultValue={service?.priceMaxEgp ?? undefined}
        aria-invalid={!!errors.max || undefined} aria-describedby={errors.max ? `${id}-max-error` : undefined}/>
      {errors.max && <p id={`${id}-max-error`} className="error-text mt-1">{errors.max}</p>}</div>
    <label className={field}>{t.fieldFrom}<input name="effectiveFrom" type="date" className="field mt-1.5" defaultValue={service?.effectiveFrom ?? undefined}/></label>
    <label className={field}>{t.fieldUntil}<input name="validUntil" type="date" className="field mt-1.5" defaultValue={service?.validUntil ?? undefined}/></label>
    <label className={`${field} sm:col-span-2`}>{t.fieldDescription}<textarea name="description" maxLength={4000} dir="auto" className="field mt-1.5" defaultValue={service?.description ?? ""}/></label>
    <label className={field}>{t.fieldIncluded}<textarea name="includedScope" maxLength={4000} dir="auto" className="field mt-1.5" defaultValue={service?.includedScope ?? ""}/></label>
    <label className={field}>{t.fieldExcluded}<textarea name="excludedScope" maxLength={4000} dir="auto" className="field mt-1.5" defaultValue={service?.excludedScope ?? ""}/></label>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2"><button className="btn-primary">{owner ? t.submit : t.submitForApproval}</button><button type="button" className={QUIET} onClick={onCancel}>{t.cancel}</button></div>
  </form>;
}

function Schedule({ locale, copy, clinic, base, run, confirm }: { locale: Locale; copy: ClinicCopy; clinic: Clinic; base: string; run: Run; confirm: (c: Confirm) => void }) {
  const t = copy.schedule;
  const f = useFormats(locale);
  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const start = new Date(String(data.get("startsAt")));
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + Number(data.get("duration")) * 60_000);
    const target = e.currentTarget;
    void run(`${base}/slots`, "POST", { startsAt: start.toISOString(), endsAt: end.toISOString(), mode: data.get("mode"), note: String(data.get("note") ?? "").trim() || null }).then(ok => { if (ok) target.reset(); });
  };
  const cancel = (s: Slot, when: string) => confirm({ title: t.cancelConfirm.title, body: fillTemplate(t.cancelConfirm.body, { when }), confirm: t.cancelConfirm.confirm, cancel: t.cancelConfirm.keep,
    onConfirm: () => void run(`${base}/slots/${s.id}/cancel`, "POST", { expectedVersion: s.version }) });
  return <>
    <Part title={t.listLabel} lead={t.lead}>
      {clinic.slots.length === 0 ? <p className="mt-3 text-[0.9375rem] text-ink-600">{t.empty}</p> :
        <ul className="mt-3 divide-y divide-line border-t border-line">{clinic.slots.map(s => {
          const when = f.range(s.startsAt, s.endsAt);
          return <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
            <div className="min-w-0">
              <p className="font-semibold tabular-nums text-ink-900">{when}</p>
              <p className="text-[0.875rem] text-ink-600">{s.mode === "VIDEO" ? t.video : t.inPerson}{s.note && <> · <bdi>{s.note}</bdi></>}</p>
            </div>
            <div className="flex items-center gap-x-4">
              <StatusBadge tone={s.status === "OPEN" ? "info" : "neutral"}>{s.status === "OPEN" ? t.open : t.cancelled}</StatusBadge>
              {s.status === "OPEN" && <button type="button" className={QUIET} aria-label={fillTemplate(t.cancelNamed, { when })} onClick={() => cancel(s, when)}>{t.cancel}</button>}
            </div>
          </li>;
        })}</ul>}
    </Part>
    <Part title={t.addTitle}>
      <form className="mt-3 grid gap-4 sm:grid-cols-3 sm:items-end" onSubmit={add}>
        <label className="block text-sm font-bold">{t.startsAt}<input name="startsAt" type="datetime-local" required className="field mt-1.5"/></label>
        <label className="block text-sm font-bold">{t.duration}<select name="duration" className="field mt-1.5" defaultValue="30">{[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{fillTemplate(t.minutes, { count: f.number(m) })}</option>)}</select></label>
        <label className="block text-sm font-bold">{t.mode}<select name="mode" className="field mt-1.5" defaultValue="VIDEO"><option value="VIDEO">{t.video}</option><option value="IN_PERSON">{t.inPerson}</option></select></label>
        <label className="block text-sm font-bold sm:col-span-3">{t.note}<input name="note" maxLength={500} dir="auto" className="field mt-1.5"/></label>
        <div className="sm:col-span-3"><button className="btn-primary">{t.add}</button></div>
      </form>
    </Part>
  </>;
}

function Team({ locale, copy, clinic, base, run, confirm }: { locale: Locale; copy: ClinicCopy; clinic: Clinic; base: string; run: Run; confirm: (c: Confirm) => void }) {
  const t = copy.team;
  const f = useFormats(locale);
  const [drafts, setDrafts] = useState<Record<string, ClinicPermission[]>>({});
  const toggle = (id: string, current: ClinicPermission[], p: ClinicPermission) => setDrafts(d => {
    const list = d[id] ?? current;
    return { ...d, [id]: list.includes(p) ? list.filter(x => x !== p) : [...list, p] };
  });
  const invite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const target = e.currentTarget;
    void run(`${base}/managers`, "POST", { name: data.get("name"), email: data.get("email"), permissions: PERMISSIONS.filter(p => data.get(p) === "on"), locale }).then(ok => { if (ok) target.reset(); });
  };
  const revoke = (m: Manager) => confirm({ ...t.revokeConfirm, title: fillTemplate(t.revokeConfirm.title, { name: m.name }),
    onConfirm: () => void run(`${base}/managers/${m.id}`, "PUT", { permissions: [], active: false, expectedVersion: m.version }) });
  const choice = "flex min-h-11 items-center gap-2.5 text-[0.9375rem] text-ink-800";
  return <>
    <Part title={copy.sections.team} lead={t.lead}>
      {clinic.managers.length === 0 ? <p className="mt-3 text-[0.9375rem] text-ink-600">{t.empty}</p> :
        <ul className="mt-3 divide-y divide-line border-t border-line">{clinic.managers.map(m => {
          const perms = drafts[m.id] ?? m.permissions;
          const active = m.status === "ACTIVE";
          return <li key={m.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="min-w-0"><bdi className="font-semibold text-ink-900">{m.name}</bdi>{m.email && <> · <bdi dir="ltr" className="text-[0.875rem] text-ink-600">{m.email}</bdi></>}</p>
              <StatusBadge tone={active ? "success" : "neutral"}>{active ? t.active : t.revoked}</StatusBadge>
            </div>
            <p className="text-[0.8125rem] text-ink-500">{fillTemplate(t.invitedOn, { date: f.at(m.invitedAt) })}</p>
            <fieldset className="mt-2">
              <legend className="text-[0.8125rem] font-semibold text-ink-500">{fillTemplate(t.permissionsLegend, { name: m.name })}</legend>
              <div className="flex flex-wrap gap-x-6">{PERMISSIONS.map(p => <label key={p} className={choice}><input type="checkbox" className="h-4 w-4 flex-none accent-brand-700" checked={perms.includes(p)} onChange={() => toggle(m.id, perms, p)}/>{copy.permissions[p]}</label>)}</div>
            </fieldset>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
              <button type="button" className="btn-secondary" onClick={() => void run(`${base}/managers/${m.id}`, "PUT", { permissions: perms, active: true, expectedVersion: m.version })}>{active ? t.save : t.reinstate}</button>
              {active && <button type="button" className={QUIET} onClick={() => revoke(m)}>{t.revoke}</button>}
            </div>
          </li>;
        })}</ul>}
    </Part>
    <Part title={t.inviteTitle}>
      <form className="mt-3 grid gap-4 sm:grid-cols-2" onSubmit={invite}>
        <label className="block text-sm font-bold">{t.name}<input name="name" required maxLength={160} dir="auto" autoComplete="off" className="field mt-1.5"/></label>
        <label className="block text-sm font-bold">{t.email}<input name="email" type="email" required maxLength={254} dir="ltr" autoComplete="off" spellCheck={false} className="field mt-1.5"/></label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-bold">{t.invitePermissions}</legend>
          <div className="flex flex-wrap gap-x-6">{PERMISSIONS.map(p => <label key={p} className={choice}><input type="checkbox" name={p} className="h-4 w-4 flex-none accent-brand-700"/>{copy.permissions[p]}</label>)}</div>
        </fieldset>
        <div className="sm:col-span-2"><button className="btn-primary">{t.send}</button></div>
      </form>
    </Part>
  </>;
}

function ChangeHistory({ locale, copy, base, call }: { locale: Locale; copy: ClinicCopy; base: string; call: ClinicCall }) {
  const t = copy.history;
  const [rows, setRows] = useState<ClinicAuditEntry[] | "failed" | null>(null);
  useEffect(() => { void call<ClinicAuditEntry[]>(`${base}/audit`).then(r => setRows(Array.isArray(r) ? r : []), () => setRows("failed")); }, [call, base]);
  const when = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }), [locale]);
  return <Part title={copy.sections.history} lead={t.lead}>
    {rows === null ? <p role="status" className="mt-3 text-[0.9375rem] text-ink-500">{t.loading}</p>
      : rows === "failed" ? <div className="mt-3"><AlertLine>{t.failed}</AlertLine></div>
      : rows.length === 0 ? <p className="mt-3 text-[0.9375rem] text-ink-600">{t.empty}</p>
      : <ul className="mt-3 divide-y divide-line border-t border-line">{rows.map((r, i) => <li key={`${r.occurredAt}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3">
        <p className="min-w-0"><span className="font-semibold text-ink-900">{t.events[r.event as keyof typeof t.events] ?? t.other}</span> · <bdi className="text-ink-700">{r.actorName ?? (r.actorRole === "DOCTOR" ? t.owner : t.manager)}</bdi></p>
        <p className="text-[0.8125rem] tabular-nums text-ink-500"><time dateTime={r.occurredAt}>{when.format(new Date(r.occurredAt))}</time></p>
      </li>)}</ul>}
  </Part>;
}
