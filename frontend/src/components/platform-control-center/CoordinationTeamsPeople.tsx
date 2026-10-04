"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ErrorNotice, EmptyState, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import { CARE_AREAS, careAreaLabel } from "./admin-labels";
import { coordCopy, LANGUAGES, languageLabel } from "./coordination-copy";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { ccHref } from "./control-center-nav";
import type { CoordinationContext } from "./CareCoordinationWorkspace";
import type { CoordinationPerson, Team } from "./coordination-types";

type Dialog = { kind: "profile"; team: Team } | { kind: "capacity"; person: CoordinationPerson };

/**
 * Teams & People. Care-coordination teams and their members are workforce facts (Workforce › Teams); here each team
 * gains its routing profile (care areas, languages, overflow team) and each Coordinator their capacity. Changes affect
 * future routing only — never existing case owners, open work or assignment history.
 */
export function CoordinationTeamsPeople(ctx: CoordinationContext) {
  const { locale, can, teams, people, teamName, reload } = ctx;
  const t = coordCopy[locale];
  const ar = locale === "ar";
  const configure = can("ROUTING_CONFIGURE");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState("");
  const done = async (message: string) => { setDialog(null); setNotice(message); await reload(); };
  const members = (team: Team) => people.flatMap((p) => p.teams.filter((m) => m.team === team.id).map((m) => ({ person: p, membership: m })));
  const teamsLink = <Link href={ccHref(locale, "/teams")}>{ar ? "الفرق في فريق العمل" : "Workforce › Teams"}</Link>;

  return <>
    <SuccessNotice>{notice}</SuccessNotice>
    <Section id="coordination-teams" title={t.teamsTitle} description={ar ? "فرق التنسيق من فريق العمل، وما تخدمه كل منها في التوجيه." : "Care-coordination teams from the workforce, and what each one serves in routing."}>
      <p className="cc-meta">{ar ? "تُنشأ الفرق ويُضاف أعضاؤها وقادتها في " : "Teams, their members and leads are managed in "}{teamsLink}.</p>
      {!teams.length ? <EmptyState title={t.noTeams} /> : (
        <ul className="cc-stepper">
          {teams.map((team) => {
            const current = members(team);
            return <li className="cc-step" key={team.id}>
              <div className="cc-step-head">
                <h3><bdi>{team.name}</bdi></h3>
                <StatusBadge tone={team.active ? "success" : "neutral"}>{team.active ? t.teamActive : t.teamInactive}</StatusBadge>
              </div>
              <p className="cc-meta">{t.careAreas}: {team.careAreas.length ? team.careAreas.map((c) => careAreaLabel(c, locale)).join(" · ") : t.allCareAreas}
                {" · "}{t.languages}: {team.languages.length ? team.languages.map((l) => languageLabel(l, locale)).join(" · ") : t.none}
                {team.fallbackTeam ? <>{" · "}{t.fallbackTeam}: <bdi>{teamName(team.fallbackTeam)}</bdi></> : null}</p>
              {team.revision < 0 && <p className="cc-meta">{ar ? "لم يُحدَّد ملف التوجيه بعد: يخدم الفريق كل مجالات الرعاية." : "No routing profile yet: the team serves every care area."}</p>}
              <p className="cc-meta">{t.members(current.length)}</p>
              {!current.length ? <p className="cc-meta">{t.noMembers}</p> : (
                <ul className="cc-checklist" aria-label={t.members(current.length)}>
                  {current.map(({ person, membership }) => <li key={person.subject}><span style={{ flex: 1 }}><bdi>{person.name ?? t.unnamed}</bdi>{membership.lead ? ` · ${t.lead}` : ""}</span></li>)}
                </ul>
              )}
              {configure && <div className="cc-step-actions">
                <button type="button" className="cc-secondary" onClick={() => { setNotice(""); setDialog({ kind: "profile", team }); }}>{ar ? "تعديل ملف التوجيه" : "Edit routing profile"}</button>
              </div>}
            </li>;
          })}
        </ul>
      )}
    </Section>

    <Section id="coordination-people" title={t.peopleTitle} description={t.peopleIntro}>
      {!people.length ? <EmptyState title={t.noPeople} body={t.noPeopleHint} /> : (
        <ul className="cc-cards">
          {people.map((person) => (
            <li className="cc-card" key={person.subject}>
              <h3><bdi>{person.name ?? t.unnamed}</bdi></h3>
              <p>
                <StatusBadge tone={person.account === "ACTIVE" ? "success" : person.account === "DISABLED" ? "danger" : "neutral"}>{person.account === "ACTIVE" ? t.person.active : person.account === "DISABLED" ? t.person.disabled : (ar ? "ليس منسقًا حاليًا" : "Not currently a Coordinator")}</StatusBadge>
                {" "}{person.capacity && <StatusBadge tone={person.capacity.onDuty ? "success" : "neutral"}>{person.capacity.onDuty ? t.onDuty : t.offDuty}</StatusBadge>}
              </p>
              <p className="cc-meta">{t.person.teams}: {person.teams.length ? person.teams.map((m) => <span key={m.team}><bdi>{teamName(m.team)}</bdi>{m.lead ? ` (${t.lead})` : ""} </span>) : t.person.noTeams}</p>
              <p className="cc-meta">{t.caseload(person.workload, person.capacity?.maximum ?? null)}</p>
              {person.capacity ? <p className="cc-meta">{t.languages}: {person.capacity.languages.length ? person.capacity.languages.map((l) => languageLabel(l, locale)).join(" · ") : t.none}{" · "}{t.careAreas}: {person.capacity.careAreas.length ? person.capacity.careAreas.map((c) => careAreaLabel(c, locale)).join(" · ") : t.allCareAreas}</p>
                : <p className="cc-meta">{t.noCapacity}</p>}
              {configure && person.account === "ACTIVE" && <div className="cc-step-actions"><button type="button" className="cc-secondary" onClick={() => { setNotice(""); setDialog({ kind: "capacity", person }); }}>{t.capacityEdit}</button></div>}
            </li>
          ))}
        </ul>
      )}
    </Section>

    {dialog?.kind === "profile" && <ProfileDialog ctx={ctx} team={dialog.team} onClose={() => setDialog(null)} onDone={() => void done(t.done.team)} />}
    {dialog?.kind === "capacity" && <CapacityDialog ctx={ctx} person={dialog.person} onClose={() => setDialog(null)} onDone={() => void done(t.done.capacity)} />}
  </>;
}

function ReasonField({ locale, value, onChange }: { locale: CoordinationContext["locale"]; value: string; onChange: (v: string) => void }) {
  const t = coordCopy[locale];
  return <Field label={t.reason} hint={t.reasonHint} required><textarea required maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

function ProfileDialog({ ctx, team, onClose, onDone }: { ctx: CoordinationContext; team: Team; onClose: () => void; onDone: () => void }) {
  const { locale, api, base, teams } = ctx;
  const t = coordCopy[locale];
  const [careAreas, setCareAreas] = useState<string[]>(team.careAreas);
  const [languages, setLanguages] = useState<string[]>(team.languages);
  const [fallback, setFallback] = useState(team.fallbackTeam ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const languageOptions = [...new Set([...Object.keys(LANGUAGES), ...languages])];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`${base}/teams/${team.id}/profile`, { method: "PUT", body: { profile: { careAreas, languages, fallbackTeam: fallback || null }, revision: team.revision, reason } });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const title = locale === "ar" ? `ملف التوجيه: ${team.name}` : `Routing profile: ${team.name}`;
  return <FocusTrapDialog label={title} onClose={onClose}>
    <h2><bdi>{title}</bdi></h2>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={submit}>
      <fieldset className="cc-choices"><legend className="cc-field-label">{t.careAreas}</legend><span className="cc-field-hint">{t.careAreasHint}</span>
        {CARE_AREAS.map((area) => <label key={area} className="cc-choice"><input type="checkbox" checked={careAreas.includes(area)} onChange={() => setCareAreas((l) => toggle(l, area))} /><span>{careAreaLabel(area, locale)}</span></label>)}
      </fieldset>
      <fieldset className="cc-choices"><legend className="cc-field-label">{t.languages}</legend>
        {languageOptions.map((code) => <label key={code} className="cc-choice"><input type="checkbox" checked={languages.includes(code)} onChange={() => setLanguages((l) => toggle(l, code))} /><span>{languageLabel(code, locale)}</span></label>)}
      </fieldset>
      <Field label={t.fallbackTeam}><select value={fallback} onChange={(e) => setFallback(e.target.value)}><option value="">{t.none}</option>{teams.filter((x) => x.id !== team.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <ReasonField locale={locale} value={reason} onChange={setReason} />
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button><button disabled={busy || !reason.trim()}>{t.save}</button></div>
    </form>
  </FocusTrapDialog>;
}

function CapacityDialog({ ctx, person, onClose, onDone }: { ctx: CoordinationContext; person: CoordinationPerson; onClose: () => void; onDone: () => void }) {
  const { locale, api, base } = ctx;
  const t = coordCopy[locale];
  const c = person.capacity;
  const [maximum, setMaximum] = useState(String(c?.maximum ?? 10));
  const [onDuty, setOnDuty] = useState(c?.onDuty ?? true);
  const [languages, setLanguages] = useState<string[]>(c?.languages ?? []);
  const [careAreas, setCareAreas] = useState<string[]>(c?.careAreas ?? []);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const languageOptions = [...new Set([...Object.keys(LANGUAGES), ...languages])];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`${base}/capacity`, { method: "PUT", body: { capacity: { subject: person.subject, maximum: Number(maximum), onDuty, languages, careAreas, revision: c?.revision ?? -1 }, reason } });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const title = t.capacityTitle(person.name ?? t.unnamed);
  return <FocusTrapDialog label={title} onClose={onClose}>
    <h2><bdi>{title}</bdi></h2>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={submit}>
      <Field label={t.maximum} hint={t.maximumHint} required><input type="number" required min={0} max={10000} dir="ltr" value={maximum} onChange={(e) => setMaximum(e.target.value)} /></Field>
      <label className="cc-choice"><input type="checkbox" checked={onDuty} onChange={(e) => setOnDuty(e.target.checked)} /><span>{t.onDutyLabel}</span></label>
      <fieldset className="cc-choices"><legend className="cc-field-label">{t.capacityLanguages}</legend>
        {languageOptions.map((code) => <label key={code} className="cc-choice"><input type="checkbox" checked={languages.includes(code)} onChange={() => setLanguages((l) => toggle(l, code))} /><span>{languageLabel(code, locale)}</span></label>)}
      </fieldset>
      <fieldset className="cc-choices"><legend className="cc-field-label">{t.capacityCareAreas}</legend><span className="cc-field-hint">{t.capacityCareAreasHint}</span>
        {CARE_AREAS.map((area) => <label key={area} className="cc-choice"><input type="checkbox" checked={careAreas.includes(area)} onChange={() => setCareAreas((l) => toggle(l, area))} /><span>{careAreaLabel(area, locale)}</span></label>)}
      </fieldset>
      <ReasonField locale={locale} value={reason} onChange={setReason} />
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button><button disabled={busy || !reason.trim()}>{t.save}</button></div>
    </form>
  </FocusTrapDialog>;
}
