"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";

import { intlLocale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { DoneAct, Summary, Task, instant, localInput, pick, text } from "@/components/portal/panel-parts";
import { StatusBadge } from "@/components/portal/StatusBadge";
import type { Mutate, TravelPlanView } from "@/components/portal/portal-model";

/** The stages in which Operations keeps the travel plan (the backend refuses it elsewhere). */
export const TRAVEL_STAGES: ReadonlySet<string> = new Set(["ACCEPTED", "TRAVEL_COORDINATION"]);

type TravelProps = { caseId: string; plan: TravelPlanView | null; busy: boolean; mutate: Mutate };

/** Before any reservation exists (ACCEPTED): the travel plan on its own card, the page's one act. */
export function TravelPlanPanel(props: TravelProps) {
  return <TravelPlan {...props} current heading="h3" className="card p-5"/>;
}

/**
 * UX 5-1: the travel act inside Operations' hospital file (the admission panel's acts, in order: reserve, letter, travel,
 * receipt, admission number). The file says whether travel is the current act; when it is not, its forms stay one click away
 * with no filled button.
 */
export function TravelAct(props: TravelProps & { current: boolean }) {
  return <TravelPlan {...props} heading="h4"/>;
}

/**
 * UX 5-0/5-1: Operations' travel plan (`PUT /operations/cases/{id}/travel`). The endpoint replaces the whole plan, so the form
 * reopens on everything stored and sends it all back, the hospital included: the reservation picks the hospital, and the plan
 * keeps whatever it already holds. The plan is data entry (planning, then booked); the patient's arrival is its own act behind a
 * confirmation, because recording it moves the case to ARRIVAL_CONFIRMED. Only the current act is open, with the one filled
 * button: the plan until it is booked, then the arrival.
 */
function TravelPlan({ caseId, plan, busy, mutate, current, heading: Heading, className }: TravelProps & { current: boolean; heading: "h3" | "h4"; className?: string }) {
  const copy = useWorkCopy();
  const t = copy.travelPlan;
  const id = useId();
  const arrivalField = useRef<HTMLInputElement>(null);
  const arrivedField = useRef<HTMLInputElement>(null);
  const [missingArrival, setMissingArrival] = useState(false);
  const [arrivedError, setArrivedError] = useState<string | null>(null);
  const [arrivedAt, setArrivedAt] = useState<string | null>(null);
  // Opens on what the plan holds, then follows the officer: a save that re-seeds the form never reopens what they closed.
  const [arrangementsOpen, setArrangementsOpen] = useState(() => !!(plan?.airportReception || plan?.accommodation || plan?.localTransport || plan?.companionDetails));
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(copy.locale), { dateStyle: "medium", timeStyle: "short" }), [copy.locale]);
  const booked = plan?.status === "CONFIRMED";
  const next = !current ? null : booked ? "arrival" : "plan";
  // Inside the hospital file the act is a list item, not a landmark of its own.
  const Root = Heading === "h3" ? "section" : "div";

  /** Everything the plan holds, as the request names it; a form or the arrival overrides its own fields. */
  const stored = {
    plannedArrival: plan?.plannedArrival ?? null, confirmedArrival: null, visaStatus: plan?.visaStatus ?? null, flightDetails: plan?.flightDetails ?? null,
    airportReception: plan?.airportReception ?? null, accommodation: plan?.accommodation ?? null, localTransport: plan?.localTransport ?? null,
    companionDetails: plan?.companionDetails ?? null, facilityId: plan?.facilityId ?? null, exceptions: plan?.exceptions ?? null, status: plan?.status ?? "PLANNING",
  };

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const status = String(data.get("status") ?? "PLANNING");
    const plannedArrival = instant(data.get("plannedArrival"));
    // The backend refuses a confirmed booking without an arrival (PLANNED_ARRIVAL_REQUIRED); say so at the field instead.
    if (status === "CONFIRMED" && !plannedArrival) { setMissingArrival(true); arrivalField.current?.focus(); return; }
    setMissingArrival(false);
    void mutate(`/operations/cases/${caseId}/travel`, { ...stored, plannedArrival, status,
      flightDetails: text(data.get("flightDetails")), visaStatus: text(data.get("visaStatus")), airportReception: text(data.get("airportReception")),
      accommodation: text(data.get("accommodation")), localTransport: text(data.get("localTransport")), companionDetails: text(data.get("companionDetails")) }, "PUT");
  }

  /** The arrival is checked here (empty, in the future), then confirmed with its time shown before it moves the stage. */
  function askArrival(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const at = instant(new FormData(event.currentTarget).get("arrivedAt"));
    const problem = !at ? t.arrival.missing : new Date(at).getTime() > Date.now() ? t.arrival.future : null;
    setArrivedError(problem);
    if (problem) { arrivedField.current?.focus(); return; }
    setArrivedAt(at);
  }

  function recordArrival(at: string) {
    setArrivedAt(null);
    // A refusal (readiness, a stale plan) is also said at the field, where the time still stands.
    void mutate(`/operations/cases/${caseId}/travel`, { ...stored, confirmedArrival: at, status: "ARRIVED" }, "PUT")
      .then(result => { if (!result) { setArrivedError(t.arrival.failed); arrivedField.current?.focus(); } });
  }

  // Keyed on the stored plan, so a saved plan re-seeds the fields with what the server now holds.
  const planForm = (
    <form key={plan?.updatedAt ?? "new"} id={next === "plan" ? "travel-plan-next" : undefined} className="grid gap-3 sm:grid-cols-2" onSubmit={save} noValidate>
      <div>
        <label htmlFor={`${id}-arrival`} className="block text-sm font-semibold">{t.plannedArrival}</label>
        <input ref={arrivalField} id={`${id}-arrival`} className="field" name="plannedArrival" type="datetime-local" dir="ltr" defaultValue={localInput(plan?.plannedArrival)}
               aria-invalid={missingArrival || undefined} aria-describedby={`${id}-arrival-hint${missingArrival ? ` ${id}-arrival-missing` : ""}`}
               onChange={() => missingArrival && setMissingArrival(false)}/>
        <p id={`${id}-arrival-hint`} className="mt-1 text-[0.8125rem] text-ink-600">{t.timeHint}</p>
        {missingArrival && <p id={`${id}-arrival-missing`} role="alert" className="mt-1 text-[0.8125rem] font-semibold text-alert-800">{t.arrivalRequired}</p>}
      </div>
      <TextField name="flightDetails" label={t.flight} hint={t.flightHint} value={plan?.flightDetails} maxLength={5000} id={id}/>
      <TextField name="visaStatus" label={t.visa} hint={t.visaHint} value={plan?.visaStatus} maxLength={80} id={id}/>

      <details className="group border-t border-line sm:col-span-2" open={arrangementsOpen} onToggle={event => setArrangementsOpen(event.currentTarget.open)}>
        <Summary>{t.arrangements}</Summary>
        <div className="grid gap-3 pb-1 sm:grid-cols-2">
          <Note name="airportReception" label={t.airportReception} value={plan?.airportReception}/>
          <Note name="accommodation" label={t.accommodation} value={plan?.accommodation}/>
          <Note name="localTransport" label={t.localTransport} value={plan?.localTransport}/>
          <Note name="companionDetails" label={t.companion} value={plan?.companionDetails}/>
        </div>
      </details>

      <div className="border-t border-line pt-3 sm:col-span-2"><fieldset aria-describedby={`${id}-booking-hint`}>
        <legend className="text-sm font-semibold">{t.booking}</legend>
        <div className="mt-1 flex flex-wrap gap-x-6">
          {(["PLANNING", "CONFIRMED"] as const).map(value => (
            <label key={value} className="inline-flex min-h-11 items-center gap-2 text-[0.875rem]">
              <input type="radio" name="status" value={value} defaultChecked={(booked ? "CONFIRMED" : "PLANNING") === value} className="h-4 w-4 accent-brand-700"/>
              {value === "PLANNING" ? t.planning : t.confirmed}
            </label>
          ))}
        </div>
        <p id={`${id}-booking-hint`} className="max-w-[65ch] text-[0.8125rem] text-ink-600">{t.confirmedHint}</p>
      </fieldset></div>
      <div className="sm:col-span-2"><button className={next === "plan" ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.save}</button></div>
    </form>
  );

  const planLine = !plan ? t.nothingYet : plan.plannedArrival ? fillTemplate(t.arriving, { at: `⁨${dateTime.format(new Date(plan.plannedArrival))}⁩` }) : t.noArrivalYet;
  const changeLabel = plan?.plannedArrival || booked ? t.change : t.start;

  // UX 5-4: inside the hospital file, while travel is not the act now, it is one line like the file's other acts (booked: done;
  // otherwise still waiting), its form behind the line's change.
  if (Heading === "h4" && !current) return (
    <div id="travel-panel">
      <DoneAct tone={booked ? "done" : "waiting"} fact={<>{t.title} · {plan && <>{pick(t.status, plan.status)} · </>}{planLine}</>} change={changeLabel}>{planForm}</DoneAct>
    </div>
  );

  return (
    <Root id="travel-panel" aria-labelledby={Heading === "h3" ? `${id}-title` : undefined} className={Heading === "h4" ? "py-2" : className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Heading id={`${id}-title`} className={Heading === "h3" ? "title text-base" : "text-[0.875rem] font-bold text-ink-800"}>{t.title}</Heading>
        {/* Inside the hospital file the status is said in the act's line, not as a card's chip (UX 5-4). */}
        {plan && Heading === "h3" && <StatusBadge tone={booked ? "success" : "neutral"}>{pick(t.status, plan.status)}</StatusBadge>}
      </div>

      {next === "plan" ? <div className="mt-3">{planForm}</div> : <>
        {/* Not the act now: what the plan holds, in one line, with the form behind its disclosure. */}
        <p className="mt-1 text-[0.875rem] text-ink-700">{plan && Heading === "h4" && <>{pick(t.status, plan.status)} · </>}{planLine}</p>
        <details className="group mt-1 border-t border-line">
          <Summary>{changeLabel}</Summary>
          <div className="pb-3">{planForm}</div>
        </details>
      </>}

      {/* UX 5-4: the arrival is an act once the travel is booked and travel is the act now (never beside an open letter). */}
      {booked && current && <Task title={t.arrival.title} next={next === "arrival"} anchor="travel-arrival-next">
        <form className="flex flex-wrap items-end gap-3" onSubmit={askArrival} noValidate>
          <p id={`${id}-arrived-hint`} className="w-full max-w-[65ch] text-[0.8125rem] text-ink-600">{t.arrival.hint}</p>
          <label className="block text-sm font-semibold">{t.arrival.at}
            <input ref={arrivedField} className="field" name="arrivedAt" type="datetime-local" dir="ltr" max={localInput(new Date().toISOString())}
                   aria-invalid={arrivedError ? true : undefined} aria-describedby={`${id}-arrived-hint${arrivedError ? ` ${id}-arrived-error` : ""}`}
                   onChange={() => arrivedError && setArrivedError(null)}/>
          </label>
          <button className={next === "arrival" ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.arrival.record}</button>
          {arrivedError && <p id={`${id}-arrived-error`} role="alert" className="w-full text-[0.8125rem] font-semibold text-alert-800">{arrivedError}</p>}
        </form>
      </Task>}
      {arrivedAt && <ConfirmDialog title={t.arrival.confirmTitle} body={fillTemplate(t.arrival.confirmBody, { at: `⁨${dateTime.format(new Date(arrivedAt))}⁩` })} confirm={t.arrival.record} cancel={t.arrival.cancel}
        onConfirm={() => recordArrival(arrivedAt)} onCancel={() => setArrivedAt(null)}/>}
    </Root>
  );
}

/** After the travel stages: the arrival as one done act of the hospital file ("Arrived · 2 Nov 2026, 10:30"). */
export function TravelDone({ plan }: { plan: TravelPlanView | null }) {
  const copy = useWorkCopy();
  if (!plan?.confirmedArrival) return null;
  const at = new Intl.DateTimeFormat(intlLocale(copy.locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(plan.confirmedArrival));
  return <>{fillTemplate(copy.travelPlan.arrived, { at: `⁨${at}⁩` })}</>;
}

function TextField({ name, label, hint, value, maxLength, id }: { name: string; label: string; hint: string; value?: string | null; maxLength: number; id: string }) {
  return (
    <div>
      <label htmlFor={`${id}-${name}`} className="block text-sm font-semibold">{label}</label>
      <input id={`${id}-${name}`} className="field" name={name} defaultValue={value ?? ""} maxLength={maxLength} autoComplete="off" dir="auto" aria-describedby={`${id}-${name}-hint`}/>
      <p id={`${id}-${name}-hint`} className="mt-1 text-[0.8125rem] text-ink-600">{hint}</p>
    </div>
  );
}

function Note({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return <label className="block text-sm font-semibold">{label}<textarea className="field" name={name} rows={2} maxLength={5000} dir="auto" defaultValue={value ?? ""}/></label>;
}
