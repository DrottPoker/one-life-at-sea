"use client";

import { useActionState, useRef, type ReactNode } from "react";
import { useEconomyRequests } from "@/components/economy-requests";
import { useGameState } from "@/components/game-state";
import type { TrainingResult } from "@/lib/training";

export function TrainingActionForm({ label, fields, children }: {
  label: string; fields: Record<string, string>; children: (blocked: boolean) => ReactNode;
}) {
  const state = useGameState(), journal = useEconomyRequests();
  const locked = !!state.active_combat_id || !!state.hospital_until || state.sea.state !== "in_harbor";
  const request = useRef<FormData | null>(null);
  const [result, action, pending] = useActionState<TrainingResult, FormData>(async (_previous, form) => {
    if (!request.current) {
      form.set("request_id", crypto.randomUUID());
      request.current = form;
    }
    let response: TrainingResult;
    try { response = await journal.training(request.current); }
    catch { response = { error: true, retry: true, message: "The action could not be confirmed. Retry it safely below." }; }
    if (!response.retry) request.current = null;
    return response;
  }, {});
  return <form action={action} aria-label={label} aria-busy={pending}>
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {children(locked || pending || !!result.retry || journal.unconfirmed)}
    {result.retry && <div className="o-training-feedback"><button className="o-training-button" type="submit" disabled={locked || pending}>Retry action</button></div>}
    <div className="o-training-feedback" role="status" aria-atomic="true">
      {pending ? <p>Saving your progress...</p> : result.message && <p className={result.error ? "o-field-error" : ""}>{result.message}</p>}
    </div>
  </form>;
}
