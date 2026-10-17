"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConsultantPortrait } from "@/components/ConsultantProfileCard";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import { careAreaMeta } from "@/lib/care-area-catalog";
import { consultantUi, type ConsultantProfile, type ConsultantProfileContent } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { careAreaLabel } from "./admin-labels";
import type { AdminApi } from "./admin-api";
import { ErrorNotice, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";

export type StaffConsultantProfile = {
  practitionerId: string;
  slug: string;
  published: boolean;
  everPublished: boolean;
  sortOrder: number;
  version: number;
  careArea: string;
  contentEn: ConsultantProfileContent | null;
  contentAr: ConsultantProfileContent | null;
};

type Copy = ReturnType<typeof copyOf>;
type ListKey = "achievementBadges" | "signals" | "focusAreas" | "qualifications" | "appointments" | "professionalStanding" | "achievements";
type ScalarKey = "initials" | "name" | "specialty" | "role" | "summary" | "cardSummary" | "credentials" | "location" | "distinction" | "verification";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INVALID_TEXT = /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LIMITS = {
  initials: 12, name: 160, specialty: 300, role: 500, summary: 4000, cardSummary: 600,
  credentials: 500, location: 200, distinction: 500, verification: 1000, anchor: 300,
} as const;
const LIST_LIMITS: Record<ListKey, { count: number; length: number }> = {
  achievementBadges: { count: 12, length: 160 }, signals: { count: 12, length: 160 },
  focusAreas: { count: 30, length: 1000 }, qualifications: { count: 30, length: 1000 },
  appointments: { count: 30, length: 1000 }, professionalStanding: { count: 30, length: 1000 },
  achievements: { count: 30, length: 1000 },
};

const blankContent = (): ConsultantProfileContent => ({
  initials: "", name: "", credentials: "", achievementBadges: [], specialty: "", role: "", location: "",
  summary: "", cardSummary: "", expertise: { anchor: "", areas: [] }, signals: [], focusAreas: [],
  qualifications: [], appointments: [], professionalStanding: [], verification: "", achievements: [], externalLinks: [],
});

function editable(content: ConsultantProfileContent | null): ConsultantProfileContent {
  const empty = blankContent();
  if (!content) return empty;
  return {
    ...empty, ...content,
    expertise: { anchor: content.expertise?.anchor ?? "", areas: [...(content.expertise?.areas ?? [])] },
    achievementBadges: [...(content.achievementBadges ?? [])], signals: [...(content.signals ?? [])],
    focusAreas: [...(content.focusAreas ?? [])], qualifications: [...(content.qualifications ?? [])],
    appointments: [...(content.appointments ?? [])], professionalStanding: [...(content.professionalStanding ?? [])],
    achievements: [...(content.achievements ?? [])], externalLinks: [...(content.externalLinks ?? [])],
  };
}

function copyOf(locale: Locale) { return getDictionary(locale).controlCenterConsultantProfiles; }
const fill = (value: string, values: Record<string, string | number>) => value.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

function contentProblems(value: ConsultantProfileContent) {
  const problems = new Set<string>();
  const required: ScalarKey[] = ["initials", "name", "specialty", "role", "summary", "cardSummary"];
  const scalarKeys: ScalarKey[] = ["initials", "name", "specialty", "role", "summary", "cardSummary", "credentials", "location", "distinction", "verification"];
  for (const key of scalarKeys) {
    const text = value[key] ?? "";
    if (required.includes(key) && !text.trim()) problems.add(key);
    if (text.length > LIMITS[key]) problems.add(key);
    if (INVALID_TEXT.test(text)) problems.add(key);
  }
  if (!value.expertise.anchor.trim() || value.expertise.anchor.length > LIMITS.anchor || INVALID_TEXT.test(value.expertise.anchor)) problems.add("anchor");
  if (value.expertise.areas.length > 20 || value.expertise.areas.some((item) => !item.trim() || item.length > 300 || INVALID_TEXT.test(item))) problems.add("expertiseAreas");
  for (const key of Object.keys(LIST_LIMITS) as ListKey[]) {
    const bound = LIST_LIMITS[key]; const values = value[key] ?? [];
    if (values.length > bound.count || values.some((item) => !item.trim() || item.length > bound.length || INVALID_TEXT.test(item))) problems.add(key);
  }
  if ((value.externalLinks ?? []).length > 10 || (value.externalLinks ?? []).some((link) => {
    try { const url = new URL(link.href); return !link.label.trim() || link.label.length > 160 || url.protocol !== "https:" || !url.host || !!url.username || !!url.password; }
    catch { return true; }
  })) problems.add("externalLinks");
  return problems;
}

export function ConsultantPublicProfile({ locale, api, practitionerId, careArea, editableByUser, onDirtyChange }: {
  locale: Locale; api: AdminApi; practitionerId: string; careArea: string; editableByUser: boolean; onDirtyChange?: (dirty: boolean) => void;
}) {
  const copy = copyOf(locale); const ar = locale === "ar";
  const [stored, setStored] = useState<StaffConsultantProfile | null>(null);
  const [slug, setSlug] = useState("");
  const [contentEn, setContentEn] = useState<ConsultantProfileContent>(blankContent);
  const [contentAr, setContentAr] = useState<ConsultantProfileContent>(blankContent);
  const [dirty, setDirty] = useState(false); const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState("");

  const apply = useCallback((profile: StaffConsultantProfile) => {
    setStored(profile); setSlug(profile.slug); setContentEn(editable(profile.contentEn)); setContentAr(editable(profile.contentAr));
    setDirty(false); setAttempted(false); onDirtyChange?.(false);
  }, [onDirtyChange]);
  const load = useCallback(async () => {
    setError(null);
    try { apply(await api<StaffConsultantProfile>(`/control-center/consultants/${practitionerId}/public-profile`)); }
    catch (cause) { setError(cause); }
  }, [api, practitionerId, apply]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const changed = () => { setDirty(true); onDirtyChange?.(true); setNotice(""); };
  const update = (language: "en" | "ar", next: ConsultantProfileContent) => { changed(); (language === "en" ? setContentEn : setContentAr)(next); };
  const enProblems = useMemo(() => contentProblems(contentEn), [contentEn]);
  const arProblems = useMemo(() => contentProblems(contentAr), [contentAr]);
  const slugError = !slug.trim() ? copy.required : !SLUG.test(slug) || slug.length > 80 ? copy.invalidSlug : undefined;

  const save = async (): Promise<StaffConsultantProfile | null> => {
    setAttempted(true); setError(null); setNotice("");
    if (slugError || enProblems.size || arProblems.size || !stored) return null;
    setBusy(true);
    try {
      const profile = await api<StaffConsultantProfile>(`/control-center/consultants/${practitionerId}/public-profile`, {
        method: "PUT", body: { version: stored.version, slug, contentEn, contentAr },
      });
      apply(profile); setNotice(copy.saved); return profile;
    } catch (cause) { setError(cause); return null; } finally { setBusy(false); }
  };
  const publication = async (publish: boolean) => {
    let profile = stored;
    if (publish && dirty) profile = await save();
    if (!profile || (publish && (slugError || enProblems.size || arProblems.size))) { setAttempted(true); return; }
    setBusy(true); setError(null); setNotice("");
    try {
      const next = await api<StaffConsultantProfile>(`/control-center/consultants/${practitionerId}/public-profile/${publish ? "publish" : "unpublish"}`, { method: "POST", body: { version: profile.version } });
      apply(next); setNotice(publish ? copy.publishedNotice : copy.unpublishedNotice);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };

  if (!stored && !error) return <p role="status">{ar ? "جارٍ تحميل الملف العام…" : "Loading public profile…"}</p>;
  if (error && !stored) return <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />;
  if (!stored) return null;
  const status = stored.published ? copy.published : stored.version < 0 ? copy.notStarted : copy.draft;
  return (
    <Section title={copy.title} description={copy.intro} id="public-profile" actions={<StatusBadge tone={stored.published ? "success" : "warning"}>{status}</StatusBadge>}>
      <SuccessNotice>{notice}</SuccessNotice><ErrorNotice error={error} locale={locale} />
      <div className="cc-profile-slug">
        <Field label={copy.slug} hint={stored.everPublished ? copy.slugLocked : copy.slugHint} required error={attempted ? slugError : undefined}>
          <input dir="ltr" value={slug} readOnly={stored.everPublished || !editableByUser} maxLength={80} onChange={(event) => { setSlug(event.target.value); changed(); }} aria-required />
        </Field>
      </div>
      <div className="cc-profile-languages">
        <LanguageEditor language="en" title={copy.english} copy={copy} content={contentEn} problems={attempted ? enProblems : new Set<string>()} disabled={!editableByUser || busy} onChange={(next) => update("en", next)} />
        <LanguageEditor language="ar" title={copy.arabic} copy={copy} content={contentAr} problems={attempted ? arProblems : new Set<string>()} disabled={!editableByUser || busy} onChange={(next) => update("ar", next)} />
      </div>
      {attempted && (slugError || enProblems.size || arProblems.size) ? <p role="alert" className="cc-notice cc-notice-error">{copy.fixErrors}</p> : null}
      {editableByUser ? <div className="cc-form-actions cc-profile-actions">
        <button type="button" disabled={busy || !dirty} onClick={() => void save()}>{busy ? copy.saving : copy.save}</button>
        {stored.published
          ? <button type="button" className="cc-secondary" disabled={busy} onClick={() => void publication(false)}>{copy.unpublish}</button>
          : <button type="button" className="cc-secondary" disabled={busy} onClick={() => void publication(true)}>{copy.publish}</button>}
      </div> : null}
      <ProfilePreview copy={copy} careArea={careArea} slug={slug} contentEn={contentEn} contentAr={contentAr} />
    </Section>
  );
}

function LanguageEditor({ language, title, copy, content, problems, disabled, onChange }: {
  language: Locale; title: string; copy: Copy; content: ConsultantProfileContent; problems: Set<string>; disabled: boolean; onChange: (content: ConsultantProfileContent) => void;
}) {
  const set = (key: ScalarKey) => (value: string) => onChange({ ...content, [key]: value });
  const error = (key: ScalarKey, required = false) => {
    if (!problems.has(key)) return undefined; const value = content[key] ?? "";
    if (required && !value.trim()) return copy.required;
    if (INVALID_TEXT.test(value)) return copy.invalidCharacters;
    return fill(copy.tooLong, { max: LIMITS[key] });
  };
  return <fieldset className="cc-profile-language" dir={language === "ar" ? "rtl" : "ltr"} disabled={disabled}>
    <legend>{title}</legend>
    <div className="cc-profile-short-grid">
      <TextField label={copy.fields.name} value={content.name} max={LIMITS.name} copy={copy} required error={error("name", true)} onChange={set("name")} />
      <TextField label={copy.fields.initials} value={content.initials} max={LIMITS.initials} copy={copy} required error={error("initials", true)} onChange={set("initials")} />
    </div>
    <TextField label={copy.fields.credentials} value={content.credentials} max={LIMITS.credentials} copy={copy} error={error("credentials")} onChange={set("credentials")} />
    <TextField label={copy.fields.specialty} value={content.specialty} max={LIMITS.specialty} copy={copy} required error={error("specialty", true)} onChange={set("specialty")} />
    <TextField label={copy.fields.role} value={content.role} max={LIMITS.role} copy={copy} required error={error("role", true)} onChange={set("role")} />
    <TextField label={copy.fields.location} value={content.location} max={LIMITS.location} copy={copy} error={error("location")} onChange={set("location")} />
    <TextField area label={copy.fields.summary} value={content.summary} max={LIMITS.summary} copy={copy} required error={error("summary", true)} onChange={set("summary")} />
    <TextField area label={copy.fields.cardSummary} value={content.cardSummary} max={LIMITS.cardSummary} copy={copy} required error={error("cardSummary", true)} onChange={set("cardSummary")} />
    <TextField label={copy.fields.anchor} value={content.expertise.anchor} max={LIMITS.anchor} copy={copy} required error={problems.has("anchor") ? (!content.expertise.anchor.trim() ? copy.required : INVALID_TEXT.test(content.expertise.anchor) ? copy.invalidCharacters : fill(copy.tooLong, { max: LIMITS.anchor })) : undefined} onChange={(anchor) => onChange({ ...content, expertise: { ...content.expertise, anchor } })} />
    <ListField label={copy.fields.expertiseAreas} values={content.expertise.areas} count={20} length={300} copy={copy} error={problems.has("expertiseAreas")} onChange={(areas) => onChange({ ...content, expertise: { ...content.expertise, areas } })} />
    <TextField label={copy.fields.distinction} value={content.distinction ?? ""} max={LIMITS.distinction} copy={copy} error={error("distinction")} onChange={set("distinction")} />
    {(Object.keys(LIST_LIMITS) as ListKey[]).map((key) => <ListField key={key} label={copy.fields[key]} values={content[key] ?? []} count={LIST_LIMITS[key].count} length={LIST_LIMITS[key].length} copy={copy} error={problems.has(key)} onChange={(values) => onChange({ ...content, [key]: values })} />)}
    <TextField area label={copy.fields.verification} value={content.verification} max={LIMITS.verification} copy={copy} error={error("verification")} onChange={set("verification")} />
    <LinkListField copy={copy} values={content.externalLinks ?? []} error={problems.has("externalLinks")} onChange={(externalLinks) => onChange({ ...content, externalLinks })} />
  </fieldset>;
}

function TextField({ label, value, max, copy, required, error, area, onChange }: { label: string; value: string; max: number; copy: Copy; required?: boolean; error?: string; area?: boolean; onChange: (value: string) => void }) {
  const control = area ? <textarea value={value} maxLength={max} onChange={(event) => onChange(event.target.value)} aria-required={required} /> : <input value={value} maxLength={max} onChange={(event) => onChange(event.target.value)} aria-required={required} />;
  return <Field label={label} required={required} hint={fill(copy.characters, { count: value.length, max })} error={error}>{control}</Field>;
}

function ListField({ label, values, count, length, copy, error, onChange }: { label: string; values: readonly string[]; count: number; length: number; copy: Copy; error: boolean; onChange: (values: string[]) => void }) {
  return <div className="cc-profile-list-field"><p className="cc-field-label">{label}</p>{error ? <p className="cc-field-error" role="alert">{values.length > count ? fill(copy.tooMany, { max: count }) : copy.invalidCharacters}</p> : null}
    <div className="cc-profile-list-rows">{values.map((value, index) => <div className="cc-profile-list-row" key={index}><input aria-label={`${label} ${index + 1}`} value={value} maxLength={length} onChange={(event) => onChange(values.map((item, i) => i === index ? event.target.value : item))} /><button type="button" className="cc-secondary cc-icon-button" aria-label={`${copy.removeItem}: ${label} ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}><Trash2 size={16} aria-hidden /></button></div>)}</div>
    <button type="button" className="cc-secondary cc-small" disabled={values.length >= count} onClick={() => onChange([...values, ""])}><Plus size={15} aria-hidden />{copy.addItem}</button>
  </div>;
}

function LinkListField({ copy, values, error, onChange }: { copy: Copy; values: readonly { label: string; href: string }[]; error: boolean; onChange: (values: { label: string; href: string }[]) => void }) {
  return <div className="cc-profile-list-field"><p className="cc-field-label">{copy.fields.externalLinks ?? "Professional links"}</p>{error ? <p className="cc-field-error" role="alert">{copy.invalidLink}</p> : null}
    {values.map((value, index) => <div className="cc-profile-link-row" key={index}><input aria-label={`${copy.fields.externalLinks} ${index + 1}`} value={value.label} maxLength={160} onChange={(event) => onChange(values.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /><input dir="ltr" aria-label={`${copy.url} ${index + 1}`} value={value.href} maxLength={2048} onChange={(event) => onChange(values.map((item, i) => i === index ? { ...item, href: event.target.value } : item))} /><button type="button" className="cc-secondary cc-icon-button" aria-label={`${copy.removeItem} ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}><Trash2 size={16} aria-hidden /></button></div>)}
    <button type="button" className="cc-secondary cc-small" disabled={values.length >= 10} onClick={() => onChange([...values, { label: "", href: "" }])}><Plus size={15} aria-hidden />{copy.addItem}</button>
  </div>;
}

function ProfilePreview({ copy, careArea, slug, contentEn, contentAr }: { copy: Copy; careArea: string; slug: string; contentEn: ConsultantProfileContent; contentAr: ConsultantProfileContent }) {
  const meta = careAreaMeta(careArea); if (!meta) return null;
  return <Section title={copy.preview} description={copy.previewHint} id="public-preview"><div className="cc-profile-previews">
    {(["en", "ar"] as const).map((language) => {
      const content = language === "en" ? contentEn : contentAr;
      const profile: ConsultantProfile = { ...content, slug: slug || "consultant-preview", careAreaHref: careArea, careAreaLabel: careAreaLabel(careArea, language) };
      const ui = consultantUi[language];
      return <div key={language} dir={language === "ar" ? "rtl" : "ltr"} className="cc-profile-preview-language"><p className="cc-profile-preview-label">{language === "ar" ? copy.arabic : copy.english}</p>
        <ConsultantCard profile={profile} system={meta.system} icon={meta.icon} href="#public-profile" labels={{ view: ui.viewProfile, viewOf: ui.viewProfileOf(profile.name), distinction: ui.verifiedRole, focus: ui.focus }} />
        <div className="cc-profile-header-preview"><ConsultantPortrait profile={profile} size="lg" /><div><h3>{profile.name || "—"}</h3><p>{profile.role || "—"}</p><p>{profile.specialty || "—"}</p></div></div>
      </div>;
    })}
  </div></Section>;
}
