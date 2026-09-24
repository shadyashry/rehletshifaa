"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { ErrorNotice, EmptyState, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import { CARE_AREAS, careAreaLabel, formatDate } from "./admin-labels";
import { coordCopy, LANGUAGES, languageLabel } from "./coordination-copy";
import { FocusTrapDialog } from "./FocusTrapDialog";
import type { CoordinationContext } from "./CareCoordinationWorkspace";
import type { CoordinationPerson, PersonTeam, Team } from "./coordination-types";

const today = () => new Date().toISOString().slice(0, 10);
const startOfDay = (value: string) => new Date(`${value}T00:00:00`).toISOString();
const activeNow = (m: PersonTeam) => m.active && new Date(m.effectiveFrom).getTime() <= Date.now() && (!m.effectiveTo || new Date(m.effectiveTo).getTime() > Date.now());

type Dialog =
  | { kind: "team"; team: Team | null }
  | { kind: "add"; team: Team }
  | { kind: "remove"; team: Team; person: CoordinationPerson; membership: PersonTeam }
  | { kind: "capacity"; person: CoordinationPerson };

/**
 * Teams & People: which coordinator teams exist, who is in each, who is active and how much work they can take.
 * People are always names; account identifiers never appear. Membership and capacity changes affect future routing
 * recommendations only — they never touch existing case owners, open work or assignment history.
 */
export function CoordinationTeamsPeople(ctx: CoordinationContext) {
  const { locale, can, teams, people, teamName, reload } = ctx;
  const t = coordCopy[locale];
  const manage = can("assignment.team.manage");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState("");
  const done = async (message: string) => { setDialog(null); setNotice(message); await reload(); };
  const members = (team: Team) => people.flatMap((p) => p.teams.filter((m) => m.team === team.id).map((m) => ({ person: p, membership: m })));

  return <>
    <SuccessNotice>{notice}</SuccessNotice>
    <Section id="coordination-teams" title={t.teamsTitle} description={t.teamsIntro}
      actions={manage ? <button type="button" onClick={() => { setNotice(""); setDialog({ kind: "team", team: null }); }}><Plus size={16} aria-hidden />{t.newTeam}</button> : undefined}>
      {!teams.length ? <EmptyState title={t.noTeams} body={manage ? t.noTeamsHint : undefined} /> : (
        <ul className="cc-stepper">
          {teams.map((team) => {
            const rows = members(team);
            const current = rows.filter((r) => activeNow(r.membership));
            const former = rows.filter((r) => !activeNow(r.membership));
            return <li className="cc-step" key={team.id}>
              <div className="cc-step-head">
                <h3><bdi>{team.name}</bdi></h3>
                <StatusBadge tone={team.configuration.active ? "success" : "neutral"}>{team.configuration.active ? t.teamActive : t.teamInactive}</StatusBadge>
              </div>
              {team.configuration.purpose && <p className="cc-meta">{team.configuration.purpose}</p>}
              <p className="cc-meta">{t.careAreas}: {team.configuration.careAreas.length ? team.configuration.careAreas.map((c) => careAreaLabel(c, locale)).join(" · ") : t.allCareAreas}
                {" · "}{t.languages}: {team.configuration.languages.length ? team.configuration.languages.map((l) => languageLabel(l, locale)).join(" · ") : t.none}
                {team.configuration.fallbackTeam ? <>{" · "}{t.fallbackTeam}: <bdi>{teamName(team.configuration.fallbackTeam)}</bdi></> : null}</p>
              <p className="cc-meta">{t.members(current.length)}</p>
              {!current.length ? <p className="cc-meta">{t.noMembers}</p> : (
                <ul className="cc-checklist" aria-label={t.members(current.length)}>
                  {current.map(({ person, membership }) => <li key={person.subject}>
                    <span style={{ flex: 1 }}><bdi>{person.name ?? t.unnamed}</bdi>{membership.lead ? ` · ${t.lead}` : ""}</span>
                    {manage && <button type="button" className="cc-secondary cc-small" onClick={() => { setNotice(""); setDialog({ kind: "remove", team, person, membership }); }}>{t.removeFromTeam}</button>}
                  </li>)}
                </ul>
              )}
              {former.length > 0 && <details className="cc-technical"><summary>{locale === "ar" ? "أعضاء سابقون" : "Former members"} ({former.length})</summary>
                <ul className="cc-checklist">{former.map(({ person, membership }) => <li key={person.subject}>
                  <span style={{ flex: 1 }}><bdi>{person.name ?? t.unnamed}</bdi>{membership.effectiveTo ? ` · ${formatDate(membership.effectiveTo, locale)}` : ""}</span>
                </li>)}</ul>
              </details>}
              {manage && <div className="cc-step-actions">
                <button type="button" className="cc-secondary" onClick={() => { setNotice(""); setDialog({ kind: "add", team }); }}>{t.addPerson}</button>
                <button type="button" className="cc-secondary" onClick={() => { setNotice(""); setDialog({ kind: "team", team }); }}>{t.editTeam}</button>
              </div>}
            </li>;
          })}
        </ul>
      )}
    </Section>

    <Section id="coordination-people" title={t.peopleTitle} description={t.peopleIntro}>
      {!people.length ? <EmptyState title={t.noPeople} body={t.noPeopleHint} /> : (
        <ul className="cc-cards">
          {people.map((person) => {
            const active = person.teams.filter(activeNow);
            return <li className="cc-card" key={person.subject}>
              <h3><bdi>{person.name ?? t.unnamed}</bdi></h3>
              <p>
                <StatusBadge tone={person.account === "ACTIVE" ? "success" : person.account === "DISABLED" ? "danger" : "neutral"}>{person.account === "ACTIVE" ? t.person.active : person.account === "DISABLED" ? t.person.disabled : t.person.noAccount}</StatusBadge>
                {" "}{person.capacity && <StatusBadge tone={person.capacity.onDuty ? "success" : "neutral"}>{person.capacity.onDuty ? t.onDuty : t.offDuty}</StatusBadge>}
              </p>
              {!person.member && <p className="cc-meta">{t.person.notMember}</p>}
              <p className="cc-meta">{t.person.teams}: {active.length ? active.map((m) => <span key={m.team}><bdi>{teamName(m.team)}</bdi>{m.lead ? ` (${t.lead})` : ""} </span>) : t.person.noTeams}</p>
              <p className="cc-meta">{t.caseload(person.workload, person.capacity?.maximum ?? null)}</p>
              {person.capacity ? <p className="cc-meta">{t.languages}: {person.capacity.languages.length ? person.capacity.languages.map((l) => languageLabel(l, locale)).join(" · ") : t.none}{" · "}{t.careAreas}: {person.capacity.careAreas.length ? person.capacity.careAreas.map((c) => careAreaLabel(c, locale)).join(" · ") : t.allCareAreas}</p>
                : <p className="cc-meta">{t.noCapacity}</p>}
              {manage && person.member && person.account === "ACTIVE" && <div className="cc-step-actions"><button type="button" className="cc-secondary" onClick={() => { setNotice(""); setDialog({ kind: "capacity", person }); }}>{t.capacityEdit}</button></div>}
            </li>;
          })}
        </ul>
      )}
    </Section>

    {dialog?.kind === "team" && <TeamDialog ctx={ctx} team={dialog.team} onClose={() => setDialog(null)} onDone={() => void done(t.done.team)} />}
    {dialog?.kind === "add" && <AddPersonDialog ctx={ctx} team={dialog.team} onClose={() => setDialog(null)} onDone={() => void done(t.done.added)} />}
    {dialog?.kind === "remove" && <RemoveDialog ctx={ctx} team={dialog.team} person={dialog.person} membership={dialog.membership} onClose={() => setDialog(null)} onDone={() => void done(t.done.removed)} />}
    {dialog?.kind === "capacity" && <CapacityDialog ctx={ctx} person={dialog.person} onClose={() => setDialog(null)} onDone={() => void done(t.done.capacity)} />}
  </>;

}

function ReasonField({ locale, value, onChange }: { locale: CoordinationContext["locale"]; value: string; onChange: (v: string) => void }) {
  const t = coordCopy[locale];
  return <Field label={t.reason} hint={t.reasonHint} required><textarea required maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

function TeamDialog({ ctx, team, onClose, onDone }: { ctx: CoordinationContext; team: Team | null; onClose: () => void; onDone: () => void }) {
  const { locale, api, base, teams } = ctx;
  const t = coordCopy[locale];
  const c = team?.configuration;
  const [name, setName] = useState(team?.name ?? "");
  const [purpose, setPurpose] = useState(c?.purpose ?? "");
  const [careAreas, setCareAreas] = useState<string[]>(c?.careAreas ?? []);
  const [languages, setLanguages] = useState<string[]>(c?.languages ?? []);
  const [timeZone, setTimeZone] = useState(c?.timeZone ?? "Asia/Dubai");
  const [fallback, setFallback] = useState(c?.fallbackTeam ?? "");
  const [active, setActive] = useState(c?.active ?? true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const languageOptions = [...new Set([...Object.keys(LANGUAGES), ...languages])];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const configuration = { active, purpose, careAreas, languages, timeZone: timeZone.trim(), fallbackTeam: fallback || null };
    try {
      if (team) await api(`${base}/teams/${team.id}`, { method: "PUT", body: { name, configuration, revision: team.revision, reason } });
      else await api(`${base}/teams`, { method: "POST", body: { name, configuration, revision: 0, reason } });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const title = team ? t.editTeam : t.newTeam;
  return <FocusTrapDialog label={title} onClose={onClose}>
    <h2>{title}</h2>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={submit}>
      <Field label={t.teamName} required><input required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t.teamPurpose} required><input required maxLength={500} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
      <fieldset className="cc-choices"><legend className="cc-field-label">{t.careAreas}</legend><span className="cc-field-hint">{t.careAreasHint}</span>
        {CARE_AREAS.map((area) => <label key={area} className="cc-choice"><input type="checkbox" checked={careAreas.includes(area)} onChange={() => setCareAreas((l) => toggle(l, area))} /><span>{careAreaLabel(area, locale)}</span></label>)}
      </fieldset>
      <fieldset className="cc-choices"><legend className="cc-field-label">{t.languages}</legend>
        {languageOptions.map((code) => <label key={code} className="cc-choice"><input type="checkbox" checked={languages.includes(code)} onChange={() => setLanguages((l) => toggle(l, code))} /><span>{languageLabel(code, locale)}</span></label>)}
      </fieldset>
      <Field label={t.timeZone} hint={t.timeZoneHint} required><input required dir="ltr" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} /></Field>
      <Field label={t.fallbackTeam}><select value={fallback} onChange={(e) => setFallback(e.target.value)}><option value="">{t.none}</option>{teams.filter((x) => x.id !== team?.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      {team && <label className="cc-choice"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>{t.teamActive}</span></label>}
      <ReasonField locale={locale} value={reason} onChange={setReason} />
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button><button disabled={busy || !reason.trim()}>{t.save}</button></div>
    </form>
  </FocusTrapDialog>;
}

function AddPersonDialog({ ctx, team, onClose, onDone }: { ctx: CoordinationContext; team: Team; onClose: () => void; onDone: () => void }) {
  const { locale, api, base, people } = ctx;
  const t = coordCopy[locale];
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [start, setStart] = useState(today());
  const [lead, setLead] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Valid people only: an active coordinator account with membership here, not already active in this team.
  const candidates = people.filter((p) => p.account === "ACTIVE" && p.member && !p.teams.some((m) => m.team === team.id && activeNow(m)));
  const shown = candidates.filter((p) => (p.name ?? "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const existing = people.find((p) => p.subject === subject)?.teams.find((m) => m.team === team.id);
    try {
      await api(`${base}/teams/${team.id}/members`, { method: "PUT", body: { member: { subject, effectiveFrom: startOfDay(start), effectiveTo: null, active: true, lead, revision: existing?.revision ?? -1 }, reason } });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const title = t.addPersonTo(team.name);
  return <FocusTrapDialog label={title} onClose={onClose}>
    <h2><bdi>{title}</bdi></h2>
    <ErrorNotice error={error} locale={locale} />
    <p className="cc-meta">{t.onlyCoordinators}</p>
    {!candidates.length ? <><p className="cc-empty">{t.noCandidates}</p><div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.close}</button></div></> : (
      <form onSubmit={submit}>
        <Field label={t.findPerson}><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
        <fieldset className="cc-choices"><legend className="cc-field-label">{t.choosePerson}</legend>
          {!shown.length ? <p className="cc-meta">{t.noMatch}</p> : shown.map((p) => <label key={p.subject} className="cc-choice">
            <input type="radio" name="coordination-person" required checked={subject === p.subject} onChange={() => setSubject(p.subject)} />
            <span><strong><bdi>{p.name ?? t.unnamed}</bdi></strong><small>{t.caseload(p.workload, p.capacity?.maximum ?? null)}</small></span>
          </label>)}
        </fieldset>
        <Field label={t.startsOn} required><input type="date" required dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <label className="cc-choice"><input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} /><span>{t.asLead}</span></label>
        <ReasonField locale={locale} value={reason} onChange={setReason} />
        <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button><button disabled={busy || !subject || !reason.trim()}>{t.addPerson}</button></div>
      </form>
    )}
  </FocusTrapDialog>;
}

function RemoveDialog({ ctx, team, person, membership, onClose, onDone }: { ctx: CoordinationContext; team: Team; person: CoordinationPerson; membership: PersonTeam; onClose: () => void; onDone: () => void }) {
  const { locale, api, base } = ctx;
  const t = coordCopy[locale];
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`${base}/teams/${team.id}/members`, { method: "PUT", body: { member: { subject: person.subject, effectiveFrom: membership.effectiveFrom, effectiveTo: membership.effectiveTo, active: false, lead: membership.lead, revision: membership.revision }, reason } });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const title = t.removeTitle(person.name ?? t.unnamed, team.name);
  return <FocusTrapDialog label={title} onClose={onClose}>
    <h2><bdi>{title}</bdi></h2>
    <ErrorNotice error={error} locale={locale} />
    <ul className="cc-checklist"><li>{t.removeChanges}</li><li>{t.removeKeeps}</li><li>{t.removeNotify}</li></ul>
    <form onSubmit={submit}>
      <ReasonField locale={locale} value={reason} onChange={setReason} />
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button><button className="cc-danger-button" disabled={busy || !reason.trim()}>{t.removeFromTeam}</button></div>
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
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
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
