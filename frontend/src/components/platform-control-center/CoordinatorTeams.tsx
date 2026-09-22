"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { coordCopy } from "./coordination-copy";
import type { Capacity, CoordinationApi, Member, Team, TeamConfig } from "./coordination-types";

const emptyTeamForm = { name: "", purpose: "", careAreas: "", languages: "", timeZone: "Asia/Dubai", fallbackTeam: "", active: true };
const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

export function CoordinatorTeams({ locale, api, allowed, teams, onChanged }: {
  locale: Locale; api: CoordinationApi; allowed: (k: string) => boolean; teams: Team[]; onChanged: () => void;
}) {
  const t = coordCopy[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [form, setForm] = useState(emptyTeamForm);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [capacity, setCapacity] = useState<Capacity[]>([]);
  const [memberForm, setMemberForm] = useState({ subject: "", effectiveFrom: "", lead: false });
  const [capForm, setCapForm] = useState({ subject: "", maximum: "10", onDuty: true, languages: "", careAreas: "" });

  const loadCapacity = useCallback(() => { void api("/capacity").then((r) => setCapacity(r as Capacity[])).catch(() => {}); }, [api]);
  useEffect(() => { if (allowed("assignment.team.view")) loadCapacity(); }, [allowed, loadCapacity]);

  const loadMembers = async (teamId: string) => { try { const rows = await api(`/teams/${teamId}/members`) as Member[]; setMembers((m) => ({ ...m, [teamId]: rows })); } catch (e) { setError(e instanceof Error ? e.message : t.error); } };
  const toggleExpand = (teamId: string) => { const next = expanded === teamId ? null : teamId; setExpanded(next); if (next) void loadMembers(next); };

  const openCreate = () => { setForm(emptyTeamForm); setEditingTeam(null); setCreating(true); };
  const openEdit = (team: Team) => { setForm({ name: team.name, purpose: team.configuration.purpose, careAreas: team.configuration.careAreas.join(", "), languages: team.configuration.languages.join(", "), timeZone: team.configuration.timeZone, fallbackTeam: team.configuration.fallbackTeam ?? "", active: team.configuration.active }); setEditingTeam(team); setCreating(true); };

  const submitTeam = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const configuration: TeamConfig = { active: form.active, purpose: form.purpose, careAreas: csv(form.careAreas), languages: csv(form.languages), timeZone: form.timeZone, fallbackTeam: form.fallbackTeam || null };
      if (editingTeam) await api(`/teams/${editingTeam.id}`, "PUT", { name: form.name, configuration, revision: editingTeam.revision, reason: t.editTeam });
      else await api("/teams", "POST", { name: form.name, configuration, revision: 0, reason: t.newTeam });
      setCreating(false); setEditingTeam(null); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const submitMember = async (teamId: string, e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const existing = members[teamId]?.find((m) => m.subject === memberForm.subject);
      await api(`/teams/${teamId}/members`, "PUT", { member: { subject: memberForm.subject, effectiveFrom: new Date(memberForm.effectiveFrom || Date.now()).toISOString(), effectiveTo: null, active: true, lead: memberForm.lead, revision: existing?.revision ?? -1 }, reason: t.addMember });
      setMemberForm({ subject: "", effectiveFrom: "", lead: false }); await loadMembers(teamId); loadCapacity();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const setMemberActive = async (teamId: string, m: Member, active: boolean) => {
    setBusy(true); setError("");
    try { await api(`/teams/${teamId}/members`, "PUT", { member: { ...m, active }, reason: active ? t.activateMember : t.deactivateMember }); await loadMembers(teamId); }
    catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const submitCapacity = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const existing = capacity.find((c) => c.subject === capForm.subject);
      await api("/capacity", "PUT", { capacity: { subject: capForm.subject, maximum: Number(capForm.maximum), onDuty: capForm.onDuty, languages: csv(capForm.languages), careAreas: csv(capForm.careAreas), revision: existing?.revision ?? -1 }, reason: t.setCapacity });
      setCapForm({ subject: "", maximum: "10", onDuty: true, languages: "", careAreas: "" }); loadCapacity();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  return (
    <section>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {allowed("assignment.team.manage") && !creating && <button type="button" onClick={openCreate}><Plus size={16} aria-hidden />{t.newTeam}</button>}

      {creating && (
        <form className="cc-card" onSubmit={submitTeam} style={{ margin: "16px 0" }} aria-label={t.newTeam}>
          <label>{t.teamName}<input required maxLength={150} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
          <label>{t.teamPurpose}<input required maxLength={500} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} /></label>
          <div className="cc-toolbar">
            <label>{t.careAreas}<input dir="ltr" placeholder={t.commaSeparated} value={form.careAreas} onChange={(e) => setForm((f) => ({ ...f, careAreas: e.target.value }))} /></label>
            <label>{t.languages}<input dir="ltr" placeholder={t.commaSeparated} value={form.languages} onChange={(e) => setForm((f) => ({ ...f, languages: e.target.value }))} /></label>
          </div>
          <div className="cc-toolbar">
            <label>{t.timeZone}<input required dir="ltr" value={form.timeZone} onChange={(e) => setForm((f) => ({ ...f, timeZone: e.target.value }))} /></label>
            <label>{t.fallbackTeam}
              <select value={form.fallbackTeam} onChange={(e) => setForm((f) => ({ ...f, fallbackTeam: e.target.value }))}>
                <option value="">{t.none}</option>
                {teams.filter((x) => x.id !== editingTeam?.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />{t.teamActive}</label>
          <div className="cc-toolbar">
            <button type="button" className="cc-secondary" onClick={() => { setCreating(false); setEditingTeam(null); }}>{t.cancel}</button>
            <button disabled={busy}>{t.save}</button>
          </div>
        </form>
      )}

      {!teams.length ? <p className="cc-empty">{t.noTeams}</p> : (
        <ul className="cc-stepper">
          {teams.map((team) => (
            <li className="cc-step" key={team.id}>
              <div className="cc-step-head">
                <h3>{team.name}</h3>
                <span className={"cc-badge" + (team.configuration.active ? " cc-ready" : "")}>{team.configuration.active ? t.teamActive : t.teamInactive}</span>
              </div>
              <p className="cc-meta">{team.configuration.purpose}</p>
              <p className="cc-meta">{t.careAreas}: {team.configuration.careAreas.join(", ") || t.none} · {t.languages}: {team.configuration.languages.join(", ") || t.none} · {t.timeZone}: {team.configuration.timeZone}</p>
              <div className="cc-step-actions">
                {allowed("assignment.team.manage") && <button type="button" className="cc-secondary" onClick={() => openEdit(team)}>{t.editTeam}</button>}
                <button type="button" className="cc-secondary" onClick={() => toggleExpand(team.id)}>{t.members} ({team.id === expanded ? (members[team.id]?.length ?? 0) : "…"})</button>
              </div>

              {expanded === team.id && (
                <div style={{ marginTop: 12 }}>
                  {!members[team.id]?.length ? <p className="cc-empty">{t.noMembers}</p> : (
                    <ul className="cc-table">
                      {members[team.id].map((m) => (
                        <li key={m.subject}>
                          <span dir="ltr">{m.subject}{m.lead ? ` · ${t.teamLead}` : ""}</span>
                          <span className="cc-meta">{new Date(m.effectiveFrom).toLocaleDateString(locale)}{m.effectiveTo ? ` – ${new Date(m.effectiveTo).toLocaleDateString(locale)}` : ""}</span>
                          <span className={"cc-badge" + (m.active ? " cc-ready" : "")}>{m.active ? t.memberActive : t.teamInactive}</span>
                          {allowed("assignment.team.manage") && (
                            <button type="button" className="cc-secondary" disabled={busy} onClick={() => void setMemberActive(team.id, m, !m.active)}>{m.active ? t.deactivateMember : t.activateMember}</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {allowed("assignment.team.manage") && (
                    <form className="cc-toolbar" onSubmit={(e) => void submitMember(team.id, e)} aria-label={t.addMember}>
                      <label>{t.subject}<input required dir="ltr" value={memberForm.subject} onChange={(e) => setMemberForm((f) => ({ ...f, subject: e.target.value }))} /></label>
                      <label>{t.effectiveFrom}<input required type="date" dir="ltr" value={memberForm.effectiveFrom} onChange={(e) => setMemberForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: "auto" }}><input type="checkbox" checked={memberForm.lead} onChange={(e) => setMemberForm((f) => ({ ...f, lead: e.target.checked }))} />{t.teamLead}</label>
                      <button disabled={busy}>{t.addMember}</button>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: 28 }}>{t.capacity}</h2>
      {!capacity.length ? <p className="cc-empty">{t.noCapacity}</p> : (
        <ul className="cc-table">
          {capacity.map((c) => (
            <li key={c.subject}>
              <span dir="ltr">{c.subject}</span>
              <span className="cc-meta">{t.maximum}: {c.maximum}</span>
              <span className={"cc-badge" + (c.onDuty ? " cc-ready" : "")}>{c.onDuty ? t.onDuty : t.teamInactive}</span>
              <span className="cc-meta">{c.languages.join(", ") || t.none}</span>
            </li>
          ))}
        </ul>
      )}
      {allowed("assignment.team.manage") && (
        <form className="cc-card" onSubmit={submitCapacity} style={{ marginTop: 12 }} aria-label={t.setCapacity}>
          <div className="cc-toolbar">
            <label>{t.subject}<input required dir="ltr" value={capForm.subject} onChange={(e) => setCapForm((f) => ({ ...f, subject: e.target.value }))} /></label>
            <label>{t.maximum}<input required type="number" min="0" max="10000" dir="ltr" value={capForm.maximum} onChange={(e) => setCapForm((f) => ({ ...f, maximum: e.target.value }))} /></label>
          </div>
          <div className="cc-toolbar">
            <label>{t.languages}<input dir="ltr" placeholder={t.commaSeparated} value={capForm.languages} onChange={(e) => setCapForm((f) => ({ ...f, languages: e.target.value }))} /></label>
            <label>{t.careAreas}<input dir="ltr" placeholder={t.commaSeparated} value={capForm.careAreas} onChange={(e) => setCapForm((f) => ({ ...f, careAreas: e.target.value }))} /></label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={capForm.onDuty} onChange={(e) => setCapForm((f) => ({ ...f, onDuty: e.target.checked }))} />{t.onDuty}</label>
          <button disabled={busy}>{t.setCapacity}</button>
        </form>
      )}
    </section>
  );
}
