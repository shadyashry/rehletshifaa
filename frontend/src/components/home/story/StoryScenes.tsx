import { Camera, Check, FileText, House, Images, Lock, MessageCircle, Stethoscope } from "lucide-react";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

import { CaseStamp } from "@/components/brand/CaseStamp";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { StoryScans } from "./StoryScans";

type Story = Dictionary["home"]["story"];
type Dir = "ltr" | "rtl";

/** A scene's motion starts this many seconds after the scene is shown (see `.case-story-scene` in globals.css). */
const at = (seconds: number, extra: CSSProperties = {}) => ({ "--at": `${seconds}s`, ...extra }) as CSSProperties;

/* ---------- shared pieces ---------- */

/**
 * The scene's photograph, from the patient film, slowly settling (Ken Burns). The band is laid out left-to-right in
 * both languages: the tags point at people in the picture, and a photograph has no reading direction, so mirroring the
 * band would point them at the wrong person. Each tag sets its own text direction.
 */
function PhotoBand({ src, alt, position, priority = false, children }: {
  src: string;
  alt: string;
  position: string;
  priority?: boolean;
  children?: ReactNode;
}) {
  return (
    <div dir="ltr" className="relative h-[11.5rem] overflow-hidden bg-brand-950 sm:h-[13.5rem]">
      <div className="s-ken absolute inset-0" style={{ transformOrigin: position }}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 38rem, (min-width: 640px) 90vw, 100vw"
          className="object-cover"
          style={{ objectPosition: position }}
        />
      </div>
      {children}
    </div>
  );
}

function Tag({ dir, place, start, icon, tone = "brand", children }: {
  dir: Dir;
  place: CSSProperties;
  start: number;
  icon: ReactNode;
  tone?: "brand" | "coral";
  children: ReactNode;
}) {
  return (
    // Placed in the photograph's left-to-right space (logical offsets follow the element's own direction), worded in
    // the page's direction inside.
    <span className="s-tag absolute" style={at(start, place)}>
      <span dir={dir} className="story-tag">
        <span aria-hidden className={`story-tag-icon ${tone === "coral" ? "story-tag-icon-coral" : ""}`}>{icon}</span>
        {children}
      </span>
    </span>
  );
}

function Bubble({ dir, place, start, name, children }: { dir: Dir; place: CSSProperties; start: number; name?: string; children: ReactNode }) {
  return (
    <span className="s-tag absolute" style={at(start, place)}>
      <span dir={dir} className="flex items-end gap-2">
      <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand-600 text-white ring-2 ring-white">
        <MessageCircle size={14} />
      </span>
      <span className="story-bubble">
        {name ? <strong className="font-bold">{name} · </strong> : null}
        {children}
      </span>
      </span>
    </span>
  );
}

function SceneCaption({ title, body }: { title: string; body: string }) {
  return (
    <div className="s-rise mt-auto border-t border-line px-4 pb-4 pt-3.5 sm:px-5" style={at(0.2)}>
      <p className="font-[family-name:var(--font-brand-latin)] text-[1.0625rem] font-semibold leading-6 text-brand-900 rtl:font-[family-name:var(--font-brand-arabic)] sm:text-[1.125rem]">{title}</p>
      <p className="mt-0.5 text-[0.875rem] leading-6 text-ink-500">{body}</p>
    </div>
  );
}

function SceneBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`px-4 py-4 sm:px-5 ${className}`}>{children}</div>;
}

function Tick({ start, size = 20 }: { start: number; size?: number }) {
  return (
    <span aria-hidden className="s-pop grid flex-none place-items-center rounded-full bg-brand-600 text-white" style={at(start, { width: size, height: size })}>
      <Check size={size * 0.55} strokeWidth={3.2} />
    </span>
  );
}

/* ---------- ① Send your case ---------- */

export function SendScene({ s, step, dir, locale, receivedOn }: { s: Story; step: Story["steps"][number]; dir: Dir; locale: Locale; receivedOn: string }) {
  const t = s.send;
  const timings = [[0.2, 0.4, 0.9, 1.3], [0.5, 0.7, 1.3, 2], [0.8, 1, 0.7, 1.8], [1.1, 1.3, 0.8, 2.2]] as const;
  return (
    <div className="flex h-full flex-col">
      <PhotoBand src="/media/story/story-send.jpg" alt={t.photoAlt} position="58% 52%" priority>
        <Tag dir={dir} place={{ insetInlineStart: 14, bottom: 14 }} start={0.6} icon={<House size={12} strokeWidth={2.4} />}>{t.tag}</Tag>
        <Bubble dir={dir} place={{ insetInlineEnd: 14, top: 14, maxWidth: "58%" }} start={3.6} name={t.coordinator}>{t.coordinatorMessage}</Bubble>
      </PhotoBand>
      <SceneBody className="relative grid gap-4 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ul className="flex flex-col gap-1.5">
          {t.files.map((file, index) => {
            const [slide, fillAt, fillFor, tick] = timings[index];
            return (
              <li key={file.name} className="s-slide flex items-center gap-2.5 rounded-[0.5625rem] border border-line px-2.5 py-1.5" style={at(slide)}>
                <FileBadge kind={file.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-semibold text-brand-900">{file.name}</span>
                  <span aria-hidden className="mt-1 block h-[3px] rounded-full bg-line">
                    <span className="s-fill block h-[3px] rounded-full bg-brand-600" style={at(fillAt, { "--dur": `${fillFor}s` } as CSSProperties)} />
                  </span>
                </span>
                <Tick start={tick} />
              </li>
            );
          })}
        </ul>
        {/* Pages leave the list for the file. */}
        {[0.3, 1.4, 1.2, 1.7].map((delay, index) => (
          <span key={index} aria-hidden className="s-fly story-page-chip hidden sm:block" style={at(delay + 0.4, { insetInlineStart: "54%", top: 24 + index * 42 })} />
        ))}
        <div className="s-rise relative hidden rounded-[0.75rem] border border-line border-t-[3px] border-t-brand-600 bg-white p-3.5 shadow-[var(--shadow-raised)] sm:block" style={at(0.2)}>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-500 rtl:text-[0.75rem] rtl:normal-case rtl:tracking-normal">{t.caseFile}</p>
          <p className="mt-0.5 whitespace-nowrap text-[1.0625rem] font-bold tabular-nums text-brand-900"><span dir="ltr">RS-2026-000421</span></p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[0.8125rem] text-ink-600"><Lock aria-hidden size={13} className="text-brand-600" />{t.private}</p>
          <p className="s-rise mt-2.5 flex items-center gap-2 border-t border-dashed border-line-strong pt-2 text-[0.75rem] font-semibold text-brand-900" style={at(3.1)}>
            <span aria-hidden className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-brand-50 text-brand-600"><Check size={10} strokeWidth={3} /></span>
            {t.check}
          </p>
          <CaseStamp label={t.stamp} date={receivedOn} locale={locale} className="s-stamp absolute -end-2 -top-4 scale-[0.85]" />
        </div>
      </SceneBody>
      <SceneCaption title={step.title} body={step.body} />
    </div>
  );
}

/** What kind of file it is, as a picture only: no format words to translate. */
function FileBadge({ kind }: { kind: string }) {
  const Icon = kind === "photo" ? Camera : kind === "scan" ? Images : FileText;
  const dark = kind === "scan";
  return (
    <span aria-hidden className={`grid h-[1.875rem] w-[1.625rem] flex-none place-items-center rounded-[0.25rem] ${dark ? "bg-brand-900 text-brand-100" : kind === "photo" ? "border border-line bg-surface-pearl text-ink-500" : "bg-brand-50 text-brand-600"}`}>
      <Icon size={14} />
    </span>
  );
}

/* ---------- ② Consultant review ---------- */

export function ReviewScene({ s, step, dir }: { s: Story; step: Story["steps"][number]; dir: Dir }) {
  const t = s.review;
  return (
    <div className="flex h-full flex-col">
      <PhotoBand src="/media/story/story-review.jpg" alt={t.photoAlt} position="50% 42%">
        <Tag dir={dir} place={{ insetInlineStart: "4%", top: "56%" }} start={0.9} icon={<Stethoscope size={11} strokeWidth={2.2} />}>{t.consultantTag}</Tag>
        <Tag dir={dir} place={{ insetInlineEnd: "4%", top: "30%" }} start={1.3} tone="coral" icon={<MessageCircle size={11} strokeWidth={2.2} />}>{t.coordinatorTag}</Tag>
      </PhotoBand>
      <SceneBody className="flex flex-col gap-2.5">
        {/* Phones: the photograph's tag already names the Consultant; the chips would only make this the tallest scene. */}
        <ul className="hidden flex-wrap gap-1.5 sm:flex">
          {t.chips.map((chip, index) => (
            <li key={chip} className="s-rise flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[0.75rem] font-semibold text-brand-700" style={at(0.4 + index * 0.2)}>
              <Check aria-hidden size={12} strokeWidth={2.8} className="text-brand-600" />
              {chip}
            </li>
          ))}
        </ul>
        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <StoryScans title={t.scansTitle} readLabel={t.scansRead} labels={t.scans} />
          <div className="hidden rounded-[0.625rem] border border-line px-3 py-2.5 sm:block">
            <p className="text-[0.75rem] leading-6 text-ink-600">
              {t.reportBefore}
              <Mark start={1.4}>{t.reportMark1}</Mark>
              {t.reportMiddle}
              <Mark start={1.9}>{t.reportMark2}</Mark>
              {t.reportAfter}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {t.notes.map((note, index) => (
                <li key={note} className="s-slide flex items-center gap-2 text-[0.75rem] font-semibold text-brand-900" style={at(2.4 + index * 0.4)}>
                  <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-[var(--color-coral)]" />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SceneBody>
      <SceneCaption title={step.title} body={step.body} />
    </div>
  );
}

function Mark({ start, children }: { start: number; children: ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      <span aria-hidden className="s-mark absolute -inset-x-[3px] -inset-y-px rounded-[3px] bg-[color-mix(in_srgb,var(--color-coral)_30%,white)]" style={at(start)} />
      <span className="relative">{children}</span>
    </span>
  );
}

/* ---------- ③ Recommendation & proposal ---------- */

export function RecommendationScene({ s, step, dir, validUntil }: { s: Story; step: Story["steps"][number]; dir: Dir; validUntil: string }) {
  const t = s.recommendation;
  const segments = [
    { flex: 4, className: "bg-brand-700" },
    { flex: 3, className: "bg-brand-500" },
    { flex: 1.4, className: "bg-brand-400" },
    { flex: 1, className: "bg-[var(--color-coral)]" },
  ];
  return (
    <div className="flex h-full flex-col">
      <PhotoBand src="/media/story/story-recommendation.jpg" alt={t.photoAlt} position="46% 62%">
        <span className="s-tag absolute" style={at(0.8, { insetInlineEnd: "5%", top: "22%" })}>
          <span dir={dir} className="flex flex-col items-start gap-1.5">
          <span className="story-tag">
            <span aria-hidden className="s-pulse h-2.5 w-2.5 rounded-full bg-[var(--color-coral)]" style={at(1.2)} />
            {t.ready}
          </span>
          <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-ink-500">{validUntil}</span>
          </span>
        </span>
      </PhotoBand>
      <SceneBody className="flex flex-col gap-2.5">
        <div className="s-rise flex items-start gap-3" style={at(0.3)}>
          <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-200"><Stethoscope size={17} /></span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[1rem] font-bold text-brand-900">{t.title}</span>
              <span className="s-pop rounded-full bg-[var(--color-coral)] px-2.5 py-0.5 text-[0.6875rem] font-bold text-brand-900" style={at(0.9)}>{t.recommended}</span>
            </span>
            <span className="mt-0.5 block text-[0.8125rem] leading-5 text-ink-500">{t.why}</span>
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-1.5">
          {t.facts.map((fact, index) => (
            <div key={fact.label} className={`s-rise rounded-[0.5rem] px-2.5 py-1.5 ${index === 2 ? "bg-[color-mix(in_srgb,var(--color-coral)_14%,white)]" : "bg-surface-pearl"}`} style={at(1.1 + index * 0.15)}>
              <dt className={`text-[0.625rem] font-bold uppercase leading-4 rtl:text-[0.6875rem] rtl:normal-case ${index === 2 ? "text-alert-700" : "text-ink-500"}`}>{fact.label}</dt>
              <dd className="text-[0.8125rem] font-bold leading-5 text-brand-900">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div className="s-rise border-t border-line pt-2" style={at(1.7)}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[0.6875rem] font-bold uppercase text-ink-500 rtl:text-[0.75rem] rtl:normal-case">{t.estimate}</span>
            <span className="flex items-baseline gap-1.5 text-[0.8125rem] font-bold text-brand-900">
              {t.estimateValue}
              <span className="sr-only">{t.currencyLabel}</span>
              <span aria-hidden className="inline-grid text-[0.6875rem] text-brand-600">
                {t.currencies.map((code, index) => (
                  <span key={code} className={`s-currency s-currency-${index} rounded-[0.3rem] bg-brand-50 px-1.5 [grid-area:1/1]`} style={at(2)}>{code}</span>
                ))}
              </span>
            </span>
          </div>
          <div aria-hidden className="mt-1.5 flex h-[9px] gap-[2px] overflow-hidden rounded-full">
            {segments.map((segment, index) => (
              <span key={index} className={`s-seg ${segment.className}`} style={at(2.1 + index * 0.15, { flex: `${segment.flex} 1 0` })} />
            ))}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] font-semibold text-ink-600">
            {t.includes.map((item, index) => (
              <li key={item} className="flex items-center gap-1.5">
                <span aria-hidden className={`h-2 w-2 rounded-[2px] ${segments[index].className}`} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </SceneBody>
      <SceneCaption title={step.title} body={step.body} />
    </div>
  );
}

/* ---------- ④ You decide ---------- */

export function DecideScene({ s, step, dir }: { s: Story; step: Story["steps"][number]; dir: Dir }) {
  const t = s.decide;
  return (
    <div className="flex h-full flex-col">
      <PhotoBand src="/media/story/story-cairo.jpg" alt={t.photoAlt} position="60% 40%">
        <Bubble dir={dir} place={{ insetInlineStart: 14, top: 14, maxWidth: "46%" }} start={1.8}>{t.coordinatorMessage}</Bubble>
        <Tag dir={dir} place={{ insetInlineStart: 14, bottom: 14 }} start={0.6} tone="coral" icon={<Check size={12} strokeWidth={2.6} />}>{t.landTag}</Tag>
      </PhotoBand>
      <SceneBody className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-2.5 sm:gap-3">
        <div className="s-rise relative rounded-[0.75rem] bg-brand-600 p-3.5 text-white" style={at(0.4)}>
          <span aria-hidden className="s-pop s-pulse absolute -top-2.5 end-3 grid h-7 w-7 place-items-center rounded-full bg-[var(--color-coral)] text-brand-900" style={at(2.2)}>
            <Check size={14} strokeWidth={3} />
          </span>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-brand-200 rtl:text-[0.75rem] rtl:normal-case rtl:tracking-normal">{t.continueKicker}</p>
          <p className="mt-0.5 text-[0.9375rem] font-semibold">{t.continueTitle}</p>
          <ol className="mt-2.5 flex flex-col gap-2 text-[0.75rem] leading-snug text-brand-100 sm:text-[0.8125rem]">
            {t.continueSteps.map((item, index) => (
              <li key={item} className="s-slide flex items-center gap-2.5" style={at(0.8 + index * 0.3)}>
                <span aria-hidden className="grid h-5 w-5 flex-none place-items-center rounded-full text-[0.6875rem] font-bold text-white ring-[1.5px] ring-brand-300">{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
        <div className="s-rise rounded-[0.75rem] border border-line-strong p-3.5" style={at(0.7)}>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-500 rtl:text-[0.75rem] rtl:normal-case rtl:tracking-normal">{t.stopKicker}</p>
          <p className="mt-0.5 text-[0.9375rem] font-semibold text-brand-900">{t.stopTitle}</p>
          <p className="mt-1.5 text-[0.8125rem] leading-5 text-ink-600">{t.stopBody}</p>
        </div>
      </SceneBody>
      <SceneCaption title={step.title} body={step.body} />
    </div>
  );
}

/* ---------- ⑤ Treatment & follow-up ---------- */

export function CareScene({ s, step, dir }: { s: Story; step: Story["steps"][number]; dir: Dir }) {
  const t = s.care;
  const nodeAt = [0.4, 1.3, 2.2, 3, 4];
  return (
    <div className="flex h-full flex-col">
      <PhotoBand src="/media/rehletshifaa-hero-consultation.jpg" alt={t.photoAlt} position="50% 22%">
        <Tag dir={dir} place={{ insetInlineStart: "5%", top: "72%" }} start={0.9} tone="coral" icon={<span className="text-[0.5625rem] font-extrabold">{t.youTag}</span>}>{t.youLabel}</Tag>
        <Tag dir={dir} place={{ insetInlineEnd: "4%", top: "56%" }} start={1.3} icon={<Stethoscope size={11} strokeWidth={2.2} />}>{t.consultantTag}</Tag>
      </PhotoBand>
      <SceneBody className="flex flex-col gap-3">
        <div className="rounded-[0.625rem] border border-line px-3 pb-2.5 pt-3">
          <div className="relative mx-2">
            <span aria-hidden className="absolute inset-x-0 top-[9px] h-0.5 bg-line" />
            <span aria-hidden className="s-fill absolute inset-x-0 top-[9px] h-0.5 bg-brand-600" style={at(0.4, { "--dur": "3.6s", "--ease": "linear" } as CSSProperties)} />
            <span aria-hidden className="s-walk absolute top-[3px] -ms-[7px] h-3.5 w-3.5 rounded-full bg-[var(--color-coral)] ring-4 ring-white" style={at(0.4)} />
            <ol className="relative grid grid-cols-5">
              {t.days.map((day, index) => (
                <li key={day.day} className="flex flex-col items-center gap-1 text-center first:-ms-[10%] last:-me-[10%]">
                  <span aria-hidden className="s-node h-5 w-5 rounded-full bg-brand-600" style={at(nodeAt[index])} />
                  <span className="text-[0.6875rem] font-bold text-brand-900">{day.day}</span>
                  <span className="text-[0.6875rem] leading-tight text-ink-500">{day.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="s-rise flex items-center gap-3 rounded-[0.75rem] bg-brand-600 py-2.5 pe-3.5 ps-2.5 text-white" style={at(4.2)}>
          <Image src="/media/story/story-follow-up.jpg" alt={t.followAlt} width={64} height={64} className="h-14 w-14 flex-none rounded-[0.625rem] object-cover ring-2 ring-[var(--color-coral)]" style={{ objectPosition: "58% 30%" }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.875rem] font-semibold">{t.followTitle}</span>
            <span className="mt-0.5 block text-[0.75rem] text-brand-100">{t.followBody}</span>
          </span>
          <svg aria-hidden focusable="false" viewBox="0 0 64 30" className="hidden h-[26px] w-14 flex-none sm:block">
            <path className="s-draw stroke-[var(--color-coral)]" style={at(4.6)} d="M0 16h14l3-8 4 16 3-10 3 2h13l2-3 2 3h20" pathLength={1} fill="none" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
      </SceneBody>
      <SceneCaption title={step.title} body={step.body} />
    </div>
  );
}
