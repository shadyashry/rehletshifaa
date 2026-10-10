"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { intlLocale, type Locale } from "@/lib/i18n";
import { ErrorNotice, EmptyState, Facts, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import { coordCopy } from "./coordination-copy";
import { FocusTrapDialog } from "./FocusTrapDialog";
import type { CoordinationContext } from "./CareCoordinationWorkspace";

type Week = Record<string, string[]>;
type ServiceLevels = { businessHours: Week; timeZone: string; firstResponseMinutes: number; escalationMinutes: number; idleCloseHours: number; revision: number };
type IntakeSetting = { subject: string; name?: string | null; intakeEligible: boolean; maxIntake: number; schedule: Week; timeZone?: string | null; revision: number };
type Cover = { id: string; ownerSubject: string; ownerName?: string | null; coverSubject: string; coverName?: string | null; startsAt: string; endsAt: string; reason?: string | null; active: boolean; canRevoke: boolean };
type Dialog = { kind: "levels" } | { kind: "intake"; subject: string; name: string } | { kind: "cover" };

const DAYS = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const ZONES = ["Africa/Cairo", "Asia/Riyadh", "Asia/Dubai", "Asia/Kuwait", "Europe/London", "UTC"];

const copy = {
  en: {
    levelsTitle: "Working hours and reply times",
    levelsIntro: "When the team answers WhatsApp, and how fast a waiting patient must hear back. Reminders and escalations count working time only.",
    hours: "Working hours", zone: "Time zone", reminder: "Reminder to the coordinator after", escalation: "Alert to their lead after", idle: "Close silent conversations after",
    minutes: (n: number) => `${n} working minutes`, hoursN: (n: number) => `${n} hours`, edit: "Edit", closed: "Closed",
    intakeTitle: "Who answers new WhatsApp conversations",
    intakeIntro: "People who write before sending a case go to a coordinator switched on here, who speaks their language, is on shift and has room. Nobody available: the conversation waits in the queue.",
    on: "Takes new conversations", off: "Does not take new conversations", limit: (n: number) => `Up to ${n} open at once`, alwaysOn: "No personal schedule: follows on duty only",
    intakeEdit: "Edit", eligible: "Takes new WhatsApp conversations", maxIntake: "Open conversations at once", schedule: "Personal working week", scheduleHint: "Leave every day off to follow on-duty status only.",
    works: "Works", from: "From", to: "Until",
    coversTitle: "Covers", coversIntro: "While a coordinator is away, one colleague answers their patients; the coordinator can still read. Up to 30 days; reassign cases for longer absences.",
    noCovers: "No cover is set.", addCover: "Add a cover", owner: "Coordinator who is away", cover: "Colleague who answers", choose: "Choose…", starts: "From", ends: "Until",
    now: "Now", from_: (d: string) => `From ${d}`, until: (d: string) => `until ${d}`, answers: (c: string, o: string) => `${c} answers ${o}’s patients`, end: "End cover",
    saved: "Saved.", ended: "Cover ended.",
  },
  ar: {
    levelsTitle: "ساعات العمل ومُهل الرد",
    levelsIntro: "متى يردّ الفريق على واتساب، ومدى سرعة الرد على مريض ينتظر. تُحتسب التذكيرات والتصعيد بساعات العمل فقط.",
    hours: "ساعات العمل", zone: "المنطقة الزمنية", reminder: "تذكير المنسّق بعد", escalation: "تنبيه قائد فريقه بعد", idle: "إغلاق المحادثات الصامتة بعد",
    minutes: (n: number) => `${n} دقيقة عمل`, hoursN: (n: number) => `${n} ساعة`, edit: "تعديل", closed: "مغلق",
    intakeTitle: "من يردّ على محادثات واتساب الجديدة",
    intakeIntro: "من يكتب قبل إرسال حالته يُوجَّه إلى منسّق مُفعَّل هنا، يتحدث لغته، في مناوبته ولديه متسع. إن لم يتوفر أحد تنتظر المحادثة في قائمة الانتظار.",
    on: "يستقبل المحادثات الجديدة", off: "لا يستقبل المحادثات الجديدة", limit: (n: number) => `حتى ${n} محادثة مفتوحة في الوقت نفسه`, alwaysOn: "بلا جدول شخصي: يتبع حالة المناوبة فقط",
    intakeEdit: "تعديل", eligible: "يستقبل محادثات واتساب الجديدة", maxIntake: "عدد المحادثات المفتوحة في الوقت نفسه", schedule: "أسبوع العمل الشخصي", scheduleHint: "اترك كل الأيام عطلة ليتبع حالة المناوبة فقط.",
    works: "يعمل", from: "من", to: "حتى",
    coversTitle: "التغطية", coversIntro: "أثناء غياب المنسّق يردّ زميل واحد على مرضاه، ويبقى المنسّق قادراً على القراءة. حتى 30 يوماً؛ أعد إسناد الحالات للغياب الأطول.",
    noCovers: "لا توجد تغطية محددة.", addCover: "إضافة تغطية", owner: "المنسّق الغائب", cover: "الزميل الذي يردّ", choose: "اختر…", starts: "من", ends: "حتى",
    now: "الآن", from_: (d: string) => `من ${d}`, until: (d: string) => `حتى ${d}`, answers: (c: string, o: string) => `${c} يردّ على مرضى ${o}`, end: "إنهاء التغطية",
    saved: "تم الحفظ.", ended: "انتهت التغطية.",
  },
};
const DAY_NAMES: Record<Locale, Record<string, string>> = {
  en: { SATURDAY: "Saturday", SUNDAY: "Sunday", MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday" },
  ar: { SATURDAY: "السبت", SUNDAY: "الأحد", MONDAY: "الاثنين", TUESDAY: "الثلاثاء", WEDNESDAY: "الأربعاء", THURSDAY: "الخميس", FRIDAY: "الجمعة" },
};

/** "Sat–Thu 10:00–20:00"-style summary: one line per distinct window, days in the team's week order. */
function weekSummary(week: Week, locale: Locale, closed: string) {
  const days = DAYS.filter((d) => week[d]?.length);
  if (!days.length) return closed;
  return days.map((d) => `${DAY_NAMES[locale][d]} ${week[d].join(", ")}`).join(" · ");
}

/**
 * WhatsApp conversations: the team's working hours and reply times, who takes new conversations from people without a
 * case, and covers for coordinators who are away. Configuration needs ROUTING_CONFIGURE; covers need REPLY_COVER_MANAGE.
 */
export function ConversationSetup(ctx: CoordinationContext) {
  const { locale, api, base, can, people } = ctx;
  const t = copy[locale];
  const cc = coordCopy[locale];
  const configure = can("ROUTING_CONFIGURE");
  const manageCovers = can("REPLY_COVER_MANAGE");
  const [levels, setLevels] = useState<ServiceLevels | null>(null);
  const [intake, setIntake] = useState<IntakeSetting[]>([]);
  const [covers, setCovers] = useState<Cover[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const when = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  const load = useCallback(() => Promise.all([
    api<ServiceLevels>(`${base}/conversation-settings`), api<IntakeSetting[]>(`${base}/intake-settings`),
    manageCovers ? api<Cover[]>("/coordinator/reply-covers") : Promise.resolve([] as Cover[]),
  ]).then(([nextLevels, nextIntake, nextCovers]) => { setLevels(nextLevels); setIntake(nextIntake); setCovers(nextCovers); setError(null); }, setError), [api, base, manageCovers]);
  useEffect(() => { void load(); }, [load]);
  const done = async (message: string) => { setDialog(null); setNotice(message); await load(); };

  const coordinators = people.filter((p) => p.account === "ACTIVE");
  const settingOf = (subject: string) => intake.find((s) => s.subject === subject);
  const revoke = async (id: string) => { setNotice(""); try { await api(`/coordinator/reply-covers/${id}/revoke`, { method: "POST" }); await done(t.ended); } catch (e) { setError(e); } };

  return <>
    <SuccessNotice>{notice}</SuccessNotice>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />

    <Section id="conversation-levels" title={t.levelsTitle} description={t.levelsIntro}
      actions={configure && levels ? <button type="button" className="cc-secondary" onClick={() => { setNotice(""); setDialog({ kind: "levels" }); }}>{t.edit}</button> : undefined}>
      {levels && <Facts items={[[t.hours, weekSummary(levels.businessHours, locale, t.closed)], [t.zone, <bdi key="zone" dir="ltr">{levels.timeZone}</bdi>],
        [t.reminder, t.minutes(levels.firstResponseMinutes)], [t.escalation, t.minutes(levels.escalationMinutes)], [t.idle, t.hoursN(levels.idleCloseHours)]]} />}
    </Section>

    <Section id="conversation-intake" title={t.intakeTitle} description={t.intakeIntro}>
      {!coordinators.length ? <EmptyState title={cc.noPeople} /> : <ul className="cc-cards">
        {coordinators.map((person) => {
          const s = settingOf(person.subject);
          const name = person.name ?? cc.unnamed;
          return <li className="cc-card" key={person.subject}>
            <h3><bdi>{name}</bdi></h3>
            <p><StatusBadge tone={s?.intakeEligible ? "success" : "neutral"}>{s?.intakeEligible ? t.on : t.off}</StatusBadge></p>
            {s?.intakeEligible && <p className="cc-meta">{t.limit(s.maxIntake)}</p>}
            {s?.intakeEligible && <p className="cc-meta">{Object.keys(s.schedule ?? {}).length ? `${weekSummary(s.schedule, locale, t.closed)} (${s.timeZone ?? "Africa/Cairo"})` : t.alwaysOn}</p>}
            {configure && <div className="cc-step-actions"><button type="button" className="cc-secondary" onClick={() => { setNotice(""); setDialog({ kind: "intake", subject: person.subject, name }); }}>{t.intakeEdit}</button></div>}
          </li>;
        })}
      </ul>}
    </Section>

    {manageCovers && <Section id="conversation-covers" title={t.coversTitle} description={t.coversIntro}
      actions={<button type="button" className="cc-secondary" onClick={() => { setNotice(""); setDialog({ kind: "cover" }); }}>{t.addCover}</button>}>
      {!covers.length ? <p className="cc-meta">{t.noCovers}</p> : <ul className="cc-checklist">
        {covers.map((c) => <li key={c.id}>
          <span style={{ flex: 1 }}><bdi>{t.answers(c.coverName ?? cc.unnamed, c.ownerName ?? cc.unnamed)}</bdi>{" · "}{c.active ? t.now : t.from_(when(c.startsAt))}, {t.until(when(c.endsAt))}</span>
          {c.canRevoke && <button type="button" className="cc-secondary" onClick={() => void revoke(c.id)}>{t.end}</button>}
        </li>)}
      </ul>}
    </Section>}

    {dialog?.kind === "levels" && levels && <LevelsDialog ctx={ctx} levels={levels} onClose={() => setDialog(null)} onDone={() => void done(t.saved)} />}
    {dialog?.kind === "intake" && <IntakeDialog ctx={ctx} subject={dialog.subject} name={dialog.name} current={settingOf(dialog.subject)} onClose={() => setDialog(null)} onDone={() => void done(t.saved)} />}
    {dialog?.kind === "cover" && <CoverDialog ctx={ctx} onClose={() => setDialog(null)} onDone={() => void done(t.saved)} />}
  </>;
}

/** One working window per day: a checkbox for working, then from/until. */
function WeekEditor({ locale, value, onChange }: { locale: Locale; value: Week; onChange: (next: Week) => void }) {
  const t = copy[locale];
  const set = (day: string, window: string[] | null) => { const next = { ...value }; if (window) next[day] = window; else delete next[day]; onChange(next); };
  return <fieldset className="cc-choices"><legend className="cc-field-label">{t.hours}</legend>
    {DAYS.map((day) => {
      const [from, to] = (value[day]?.[0] ?? "10:00-20:00").split("-");
      const works = !!value[day]?.length;
      return <div key={day} className="cc-choice" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <label className="cc-choice"><input type="checkbox" checked={works} onChange={(e) => set(day, e.target.checked ? [`${from}-${to}`] : null)} /><span>{DAY_NAMES[locale][day]}</span></label>
        {works && <>
          <label>{t.from} <input type="time" dir="ltr" required value={from} onChange={(e) => set(day, [`${e.target.value}-${to}`])} /></label>
          <label>{t.to} <input type="time" dir="ltr" required value={to === "24:00" ? "23:59" : to} onChange={(e) => set(day, [`${from}-${e.target.value}`])} /></label>
        </>}
      </div>;
    })}
  </fieldset>;
}

function ZoneSelect({ locale, value, onChange }: { locale: Locale; value: string; onChange: (v: string) => void }) {
  const zones = ZONES.includes(value) ? ZONES : [value, ...ZONES];
  return <Field label={copy[locale].zone}><select dir="ltr" value={value} onChange={(e) => onChange(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select></Field>;
}

function ReasonField({ locale, value, onChange }: { locale: Locale; value: string; onChange: (v: string) => void }) {
  const t = coordCopy[locale];
  return <Field label={t.reason} hint={t.reasonHint} required><textarea required maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (e: FormEvent, call: () => Promise<unknown>) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await call(); onDone(); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function LevelsDialog({ ctx, levels, onClose, onDone }: { ctx: CoordinationContext; levels: ServiceLevels; onClose: () => void; onDone: () => void }) {
  const { locale, api, base } = ctx;
  const t = copy[locale]; const cc = coordCopy[locale];
  const [hours, setHours] = useState<Week>(levels.businessHours);
  const [zone, setZone] = useState(levels.timeZone);
  const [first, setFirst] = useState(String(levels.firstResponseMinutes));
  const [escalation, setEscalation] = useState(String(levels.escalationMinutes));
  const [idle, setIdle] = useState(String(levels.idleCloseHours));
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  return <FocusTrapDialog label={t.levelsTitle} onClose={onClose}>
    <h2>{t.levelsTitle}</h2>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={(e) => void run(e, () => api(`${base}/conversation-settings`, { method: "PUT", body: { businessHours: hours, timeZone: zone,
      firstResponseMinutes: Number(first), escalationMinutes: Number(escalation), idleCloseHours: Number(idle), reason } }))}>
      <WeekEditor locale={locale} value={hours} onChange={setHours} />
      <ZoneSelect locale={locale} value={zone} onChange={setZone} />
      <Field label={t.reminder} required><input type="number" dir="ltr" required min={1} max={10079} value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
      <Field label={t.escalation} required><input type="number" dir="ltr" required min={2} max={10080} value={escalation} onChange={(e) => setEscalation(e.target.value)} /></Field>
      <Field label={t.idle} required><input type="number" dir="ltr" required min={1} max={720} value={idle} onChange={(e) => setIdle(e.target.value)} /></Field>
      <ReasonField locale={locale} value={reason} onChange={setReason} />
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{cc.cancel}</button><button disabled={busy || !reason.trim() || !Object.keys(hours).length}>{cc.save}</button></div>
    </form>
  </FocusTrapDialog>;
}

function IntakeDialog({ ctx, subject, name, current, onClose, onDone }: { ctx: CoordinationContext; subject: string; name: string; current?: IntakeSetting; onClose: () => void; onDone: () => void }) {
  const { locale, api, base } = ctx;
  const t = copy[locale]; const cc = coordCopy[locale];
  const [eligible, setEligible] = useState(current?.intakeEligible ?? true);
  const [max, setMax] = useState(String(current?.maxIntake ?? 10));
  const [week, setWeek] = useState<Week>(current?.schedule ?? {});
  const [zone, setZone] = useState(current?.timeZone ?? "Africa/Cairo");
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  return <FocusTrapDialog label={name} onClose={onClose}>
    <h2><bdi>{name}</bdi></h2>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={(e) => void run(e, () => api(`${base}/intake-settings/${encodeURIComponent(subject)}`, { method: "PUT", body: {
      intakeEligible: eligible, maxIntake: Number(max), schedule: Object.keys(week).length ? week : null, timeZone: zone, reason } }))}>
      <label className="cc-choice"><input type="checkbox" checked={eligible} onChange={(e) => setEligible(e.target.checked)} /><span>{t.eligible}</span></label>
      <Field label={t.maxIntake} required><input type="number" dir="ltr" required min={0} max={1000} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
      <p className="cc-field-hint">{t.scheduleHint}</p>
      <WeekEditor locale={locale} value={week} onChange={setWeek} />
      <ZoneSelect locale={locale} value={zone} onChange={setZone} />
      <ReasonField locale={locale} value={reason} onChange={setReason} />
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{cc.cancel}</button><button disabled={busy || !reason.trim()}>{cc.save}</button></div>
    </form>
  </FocusTrapDialog>;
}

function CoverDialog({ ctx, onClose, onDone }: { ctx: CoordinationContext; onClose: () => void; onDone: () => void }) {
  const { locale, api, people } = ctx;
  const t = copy[locale]; const cc = coordCopy[locale];
  const coordinators = people.filter((p) => p.account === "ACTIVE");
  const [owner, setOwner] = useState("");
  const [cover, setCover] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  return <FocusTrapDialog label={t.addCover} onClose={onClose}>
    <h2>{t.addCover}</h2>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={(e) => void run(e, () => api("/coordinator/reply-covers", { method: "POST", body: {
      ownerSubject: owner, coverSubject: cover, startsAt: new Date(from).toISOString(), endsAt: new Date(to).toISOString(), reason } }))}>
      <Field label={t.owner} required><select required value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">{t.choose}</option>{coordinators.map((p) => <option key={p.subject} value={p.subject}>{p.name ?? cc.unnamed}</option>)}</select></Field>
      <Field label={t.cover} required><select required value={cover} onChange={(e) => setCover(e.target.value)}><option value="">{t.choose}</option>{coordinators.filter((p) => p.subject !== owner).map((p) => <option key={p.subject} value={p.subject}>{p.name ?? cc.unnamed}</option>)}</select></Field>
      <Field label={t.starts} required><input type="datetime-local" required value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label={t.ends} required><input type="datetime-local" required min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <ReasonField locale={locale} value={reason} onChange={setReason} />
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{cc.cancel}</button><button disabled={busy || !owner || !cover || !from || !to || !reason.trim()}>{cc.save}</button></div>
    </form>
  </FocusTrapDialog>;
}
