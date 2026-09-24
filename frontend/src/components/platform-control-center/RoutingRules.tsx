"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ErrorNotice, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import { CARE_AREAS, careAreaLabel, formatDate } from "./admin-labels";
import { coordCopy } from "./coordination-copy";
import { earliestStart, plusYear, versionEnd, versionStart } from "./coordination-dates";
import { FocusTrapDialog } from "./FocusTrapDialog";
import type { CoordinationContext } from "./CareCoordinationWorkspace";
import type { Policy, PolicyConfig } from "./coordination-types";

const inEffect = (p: Policy, now: number) => new Date(p.effectiveFrom).getTime() <= now && (!p.effectiveTo || new Date(p.effectiveTo).getTime() > now);

/**
 * Rules: the versioned routing policy explained in business terms — the hard requirements, then the fixed order of
 * preference with the teams this organization configured. The order itself is the engine's (CoordinatorScoringService)
 * and is not editable; only the teams, requirements, deadline and weights are. Weights and raw configuration stay
 * under Advanced settings / Advanced.
 */
export function RoutingRules(ctx: CoordinationContext) {
  const { locale, api, base, can, teamName } = ctx;
  const t = coordCopy[locale];
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<Policy[]>(`${base}/policies`).then((next) => { if (live) { setPolicies(next); setError(null); } }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, base, attempt]);
  const [now] = useState(() => Date.now());

  const current = policies?.find((p) => inEffect(p, now)) ?? null;
  const latest = policies?.[0] ?? null;
  const scheduled = latest && !inEffect(latest, now) && new Date(latest.effectiveFrom).getTime() > now ? latest : null;
  const c = current?.configuration;
  const team = (id: string | null | undefined) => (id ? <bdi>{teamName(id)}</bdi> : <span className="cc-meta">{t.notSet}</span>);

  return <Section id="routing-rules" title={t.sections.rules} description={t.rulesIntro}
    actions={can("assignment.policy.manage") && policies ? <button type="button" onClick={() => { setNotice(""); setPublishing(true); }}>{t.publish}</button> : undefined}>
    <SuccessNotice>{notice}</SuccessNotice>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />
    {policies === null ? (!error && <p role="status">{t.loading}</p>) : <>
      <p>
        {current ? <StatusBadge tone="success">{t.rulesInEffect(current.version, formatDate(current.effectiveFrom, locale), formatDate(current.effectiveTo, locale))}</StatusBadge>
          : <StatusBadge tone="warning">{latest ? t.rulesExpired : t.rulesNone}</StatusBadge>}
        {scheduled && <>{" "}<StatusBadge tone="info">{t.rulesScheduled(scheduled.version, formatDate(scheduled.effectiveFrom, locale))}</StatusBadge></>}
      </p>
      {c && <>
        <h3 className="cc-subhead">{t.requirements}</h3>
        <p className="cc-meta">{t.requirementsIntro}</p>
        <ul className="cc-checklist">
          <li><span style={{ flex: 1 }}>{t.reqAccess}</span><StatusBadge tone="success">{t.required}</StatusBadge></li>
          <li><span style={{ flex: 1 }}>{t.reqCapacity}</span><StatusBadge tone="success">{t.required}</StatusBadge></li>
          <li><span style={{ flex: 1 }}>{t.reqCareArea}</span><StatusBadge tone="success">{t.required}</StatusBadge></li>
          <li><span style={{ flex: 1 }}>{t.reqOnDuty}</span><StatusBadge tone={c.requireOnDuty ? "success" : "neutral"}>{c.requireOnDuty ? t.required : t.notRequired}</StatusBadge></li>
          <li><span style={{ flex: 1 }}>{t.reqLanguage}</span><StatusBadge tone={c.mandatoryLanguage ? "success" : "neutral"}>{c.mandatoryLanguage ? t.required : t.notRequired}</StatusBadge></li>
        </ul>

        <h3 className="cc-subhead">{t.order}</h3>
        <p className="cc-meta">{t.orderIntro}</p>
        <ol className="cc-stepper">
          <li className="cc-step"><h4>1. {t.ruleContinuity}</h4><p className="cc-meta">{t.ruleContinuityWhy}</p></li>
          <li className="cc-step"><h4>2. {t.rulePreferred}</h4><p className="cc-meta">{t.rulePreferredWhy}</p></li>
          <li className="cc-step"><h4>3. {t.ruleTeams}</h4><p className="cc-meta">{t.ruleTeamsWhy}</p>
            <dl className="cc-facts">
              <div><dt>{t.providerTeam}</dt><dd>{team(c.providerTeam)}</dd></div>
              <div><dt>{t.careAreaTeams}</dt><dd>{Object.keys(c.careAreaTeams).length ? Object.entries(c.careAreaTeams).map(([area, id]) => <span key={area} style={{ display: "block" }}>{careAreaLabel(area, locale)}: {team(id)}</span>) : <span className="cc-meta">{t.notSet}</span>}</dd></div>
              <div><dt>{t.defaultTeam}</dt><dd>{team(c.defaultTeam)}</dd></div>
              <div><dt>{t.policyFallback}</dt><dd>{team(c.fallbackTeam)}</dd></div>
            </dl>
          </li>
          <li className="cc-step"><h4>4. {t.ruleBest}</h4><p className="cc-meta">{t.ruleBestWhy}</p></li>
          <li className="cc-step"><h4>5. {t.ruleNobody}</h4><p className="cc-meta">{t.ruleNobodyWhy(c.queueHours)}</p></li>
        </ol>
        <details className="cc-technical"><summary>{t.advancedSettings}</summary>
          <p className="cc-meta">{t.weights}: {t.capacityWeight} {c.capacityWeight} · {t.languageWeight} {c.languageWeight}</p>
        </details>
      </>}
    </>}
    {publishing && <PublishDialog ctx={ctx} latest={latest} base={current?.configuration ?? latest?.configuration ?? null}
      onClose={() => setPublishing(false)} onDone={async () => { setPublishing(false); setNotice(t.done.rules); await load(); }} />}
  </Section>;
}

function PublishDialog({ ctx, latest, base: seed, onClose, onDone }: { ctx: CoordinationContext; latest: Policy | null; base: PolicyConfig | null; onClose: () => void; onDone: () => void }) {
  const { locale, api, base, teams } = ctx;
  const t = coordCopy[locale];
  const [earliest] = useState(() => earliestStart(latest?.effectiveTo));
  const [now] = useState(() => Date.now());
  const [from, setFrom] = useState(earliest);
  const [to, setTo] = useState(plusYear(earliest));
  const [providerTeam, setProviderTeam] = useState(seed?.providerTeam ?? "");
  const [careAreaTeams, setCareAreaTeams] = useState<Record<string, string>>(seed?.careAreaTeams ?? {});
  const [defaultTeam, setDefaultTeam] = useState(seed?.defaultTeam ?? "");
  const [fallbackTeam, setFallbackTeam] = useState(seed?.fallbackTeam ?? "");
  const [requireOnDuty, setRequireOnDuty] = useState(seed?.requireOnDuty ?? true);
  const [mandatoryLanguage, setMandatoryLanguage] = useState(seed?.mandatoryLanguage ?? false);
  const [queueHours, setQueueHours] = useState(String(seed?.queueHours ?? 24));
  const [capacityWeight, setCapacityWeight] = useState(String(seed?.capacityWeight ?? 80));
  const [languageWeight, setLanguageWeight] = useState(String(seed?.languageWeight ?? 20));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const weightsValid = Number(capacityWeight) + Number(languageWeight) === 100;
  const teamSelect = (value: string, set: (v: string) => void) => <select value={value} onChange={(e) => set(e.target.value)}><option value="">{t.notSet}</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!weightsValid) return; setBusy(true); setError(null);
    const mapping = Object.fromEntries(Object.entries(careAreaTeams).filter(([, id]) => !!id));
    try {
      await api(`${base}/policies`, { method: "POST", body: {
        expectedVersion: latest?.version ?? 0, from: versionStart(from, latest?.effectiveTo), to: versionEnd(to), reason,
        configuration: { capacityWeight: Number(capacityWeight), languageWeight: Number(languageWeight), requireOnDuty, mandatoryLanguage, providerTeam: providerTeam || null, careAreaTeams: mapping, defaultTeam: defaultTeam || null, fallbackTeam: fallbackTeam || null, queueHours: Number(queueHours) },
      } });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return <FocusTrapDialog label={t.publishTitle} onClose={onClose}>
    <h2>{t.publishTitle}</h2>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={submit}>
      <p className="cc-meta">{t.versionedHint}{latest?.effectiveTo && new Date(latest.effectiveTo).getTime() > now ? ` ${t.nextStartsAfter(formatDate(latest.effectiveTo, locale))}` : ""}</p>
      <div className="cc-form-grid">
        <Field label={t.effectiveFrom} required><input type="date" required dir="ltr" min={earliest} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t.effectiveTo} required><input type="date" required dir="ltr" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <fieldset className="cc-choices"><legend className="cc-field-label">{t.requirements}</legend>
        <label className="cc-choice"><input type="checkbox" checked={requireOnDuty} onChange={(e) => setRequireOnDuty(e.target.checked)} /><span>{t.reqOnDuty}</span></label>
        <label className="cc-choice"><input type="checkbox" checked={mandatoryLanguage} onChange={(e) => setMandatoryLanguage(e.target.checked)} /><span>{t.reqLanguage}</span></label>
      </fieldset>
      <Field label={t.providerTeam}>{teamSelect(providerTeam, setProviderTeam)}</Field>
      <fieldset className="cc-choices"><legend className="cc-field-label">{t.careAreaTeams}</legend>
        {CARE_AREAS.map((area) => <Field key={area} label={careAreaLabel(area, locale)}>{teamSelect(careAreaTeams[area] ?? "", (v) => setCareAreaTeams((m) => ({ ...m, [area]: v })))}</Field>)}
      </fieldset>
      <Field label={t.defaultTeam}>{teamSelect(defaultTeam, setDefaultTeam)}</Field>
      <Field label={t.policyFallback}>{teamSelect(fallbackTeam, setFallbackTeam)}</Field>
      <Field label={t.queueHours} required><input type="number" required min={1} max={720} dir="ltr" value={queueHours} onChange={(e) => setQueueHours(e.target.value)} /></Field>
      <details className="cc-technical"><summary>{t.advancedSettings}</summary>
        <p className="cc-meta">{t.weights} — {t.weightsHint}</p>
        <div className="cc-form-grid">
          <Field label={t.capacityWeight} required><input type="number" required min={0} max={100} dir="ltr" value={capacityWeight} onChange={(e) => setCapacityWeight(e.target.value)} /></Field>
          <Field label={t.languageWeight} required><input type="number" required min={0} max={100} dir="ltr" value={languageWeight} onChange={(e) => setLanguageWeight(e.target.value)} /></Field>
        </div>
      </details>
      {!weightsValid && <p role="alert" className="cc-field-error">{t.weightsInvalid}</p>}
      <Field label={t.reason} hint={t.reasonHint} required><textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button><button disabled={busy || !reason.trim() || !weightsValid || to <= from}>{t.publish}</button></div>
    </form>
  </FocusTrapDialog>;
}
