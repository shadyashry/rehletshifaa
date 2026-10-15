"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { ChangeOrderDecision, TreatmentStory } from "@/components/portal/TreatmentStory";
import type { Mutate, PatientTreatmentView } from "@/components/portal/portal-model";

/**
 * P1-16, inside My Care's current step while the patient is in treatment: the treatment timeline and decided changes, and on
 * REVIEW_CHANGE_ORDER the change awaiting their decision as the step's one action (accept or decline, with a fresh sign-in
 * that the portal asks for and replays). Read from `GET /patient/cases/{id}/treatment`; nothing is recomputed here.
 */
export function PatientTreatment({ locale, caseId, code, busy, mutate, load }: {
  locale: Locale; caseId: string; code: string; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const t = useWorkCopy().myCare.treatment;
  // undefined while loading; null when the read failed (the step's own words still stand).
  const [view, setView] = useState<PatientTreatmentView | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    load<PatientTreatmentView>(`/patient/cases/${caseId}/treatment`).then(value => { if (live) setView(value ?? null); }, () => { if (live) setView(null); });
    return () => { live = false; };
  }, [load, caseId, code]);

  if (!view) return null;
  const awaiting = code === "REVIEW_CHANGE_ORDER" ? view.changeOrders.find(order => order.id === view.awaitingDecisionId) ?? null : null;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <TreatmentStory locale={locale} copy={t} view={view} decision={awaiting && (
        <ChangeOrderDecision key={awaiting.id} locale={locale} copy={t} order={awaiting} busy={busy} hint={t.change.freshSignIn}
          onDecide={async (decision, note) => {
            const result: unknown = await mutate(`/patient/cases/${caseId}/change-orders/${awaiting.id}/decision`, { decision, note });
            if (result && typeof result === "object" && "timeline" in result) setView(result as PatientTreatmentView);
          }}/>
      )}/>
    </div>
  );
}
