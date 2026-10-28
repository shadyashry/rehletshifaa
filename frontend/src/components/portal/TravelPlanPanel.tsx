"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";

import { intlLocale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { Summary, Task, instant, pick, text } from "@/components/portal/panel-parts";
import { StatusBadge } from "@/components/portal/StatusBadge";
import type { DirectoryFacility, Mutate, TravelPlanView } from "@/components/portal/portal-model";

/** The stages in which Operations keeps the travel plan (the backend refuses it elsewhere). */
export const TRAVEL_STAGES: ReadonlySet<string> = new Set(["ACCEPTED", "TRAVEL_COORDINATION"]);

/**
 * UX 5-0: Operations' travel plan (`PUT /operations/cases/{id}/travel`). The endpoint replaces the whole plan, so the form
 * reopens on everything stored and sends it all back: a second save never clears what the first one recorded. The plan is
 * data entry (planning, then booked and confirmed); the patient's arrival is its own act behind a confirmation, because
 * recording it moves the case to ARRIVAL_CONFIRMED. One filled button: Save until the booking is confirmed, then the arrival.
 */
export function TravelPlanPanel({ caseId, plan, facilities = [], busy, mutate }: {
  caseId: string; plan: TravelPlanView | null; facilities?: DirectoryFacility[]; busy: boolean; mutate: Mutate;
}) {
  const copy = useWorkCopy();
  const t = copy.travelPlan;
  const id = useId();
  const arrivalField = useRef<HTMLInputElement>(null);
  const arrivedField = useRef<HTMLInputElement>(null);
  const [missingArrival, setMissingArrival] = useState(false);
  const [arrivedError, setArrivedError] = useState<string | null>(null);
  const [arrivedAt, setArrivedAt] = useState<string | null>(null);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(copy.locale), { dateStyle: "medium", timeStyle: "short" }), [copy.locale]);
  // A stored hospital the directory no longer lists (or has not loaded yet) stays selectable, so a save never clears it.
  const unlisted = plan?.facilityId && !facilities.some(f => f.id === plan.facilityId) ? plan.facilityId : null;
  const booked = plan?.status === "CONFIRMED";
  const next = booked ? "arrival" : "plan";

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
    void mutate(`/operations/cases/${caseId}/travel`, { ...stored, plannedArrival, status, facilityId: text(data.get("facilityId")),
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

  return (
    <section id="travel-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={`${id}-title`} className="title text-base">{t.title}</h3>
        {plan && <StatusBadge tone={booked ? "success" : "neutral"}>{pick(t.status, plan.status)}</StatusBadge>}
      </div>

      {/* Keyed on the stored plan, so a saved plan re-seeds the fields with what the server now holds. */}
      <form key={`${plan?.updatedAt ?? "new"}:${facilities.length > 0}`} id={next === "plan" ? "travel-next" : undefined} className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={save} noValidate>
        <div>
          <label htmlFor={`${id}-hospital`} className="block text-sm font-semibold">{t.hospital}</label>
          <select id={`${id}-hospital`} className="field" name="facilityId" defaultValue={plan?.facilityId ?? ""} aria-describedby={facilities.length === 0 ? `${id}-no-hospitals` : undefined}>
            <option value="">{t.chooseHospital}</option>
            {unlisted && <option value={unlisted}>{plan?.facilityName ?? t.hospital}</option>}
            {facilities.map(f => <option key={f.id} value={f.id}>{fillTemplate(t.hospitalOption, { name: `\u2068${f.name}\u2069`, city: `\u2068${f.city}\u2069` })}</option>)}
          </select>
          {facilities.length === 0 && <p id={`${id}-no-hospitals`} className="mt-1 text-[0.8125rem] text-ink-600">{t.noHospitals}</p>}
        </div>
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

        <details className="group border-t border-line sm:col-span-2" open={!!(plan?.airportReception || plan?.accommodation || plan?.localTransport || plan?.companionDetails) || undefined}>
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
                <input type="radio" name="status" value={value} defaultChecked={(plan?.status === "CONFIRMED" ? "CONFIRMED" : "PLANNING") === value} className="h-4 w-4 accent-brand-700"/>
                {value === "PLANNING" ? t.planning : t.confirmed}
              </label>
            ))}
          </div>
          <p id={`${id}-booking-hint`} className="max-w-[65ch] text-[0.8125rem] text-ink-600">{t.confirmedHint}</p>
        </fieldset></div>
        <div className="sm:col-span-2"><button className={next === "plan" ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.save}</button></div>
      </form>

      <div className="mt-3">
        <Task title={t.arrival.title} next={next === "arrival"} anchor="travel-next">
          {plan ? (
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
          ) : <p className="text-[0.8125rem] text-ink-600">{t.arrival.needsPlan}</p>}
        </Task>
      </div>
      {arrivedAt && <ConfirmDialog title={t.arrival.confirmTitle} body={fillTemplate(t.arrival.confirmBody, { at: `\u2068${dateTime.format(new Date(arrivedAt))}\u2069` })} confirm={t.arrival.record} cancel={t.arrival.cancel}
        onConfirm={() => { setArrivedAt(null); void mutate(`/operations/cases/${caseId}/travel`, { ...stored, confirmedArrival: arrivedAt, status: "ARRIVED" }, "PUT"); }}
        onCancel={() => setArrivedAt(null)}/>}
    </section>
  );
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

/** An instant as a `datetime-local` value on this device's clock (the field has no zone; `instant()` reads it back the same way). */
function localInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
