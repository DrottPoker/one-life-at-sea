"use client";

import { useActionState, useState } from "react";
import { createCharacter } from "@/app/actions";
import { normalizeCharacterName } from "@/lib/validation";

export function CharacterForm() {
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState(createCharacter, {});
  return <form action={action} className="o-form" aria-busy={pending}>
    {state.message && <p className="o-notice o-error" role="alert">{state.message}</p>}
    <label className="o-field" htmlFor="character-name"><span className="o-field-label" id="character-name-label">Character name</span>
      <input aria-labelledby="character-name-label" id="character-name" name="name" value={name} onChange={event => setName(event.target.value)} required minLength={3} maxLength={48}
        autoComplete="off" spellCheck={false} disabled={pending} aria-invalid={!!state.errors?.name} aria-describedby="name-hint name-error" />
      <small className="o-form-hint" id="name-hint">3-24 characters. Letters, spaces, hyphens and apostrophes.</small>
      <small className="o-field-error" id="name-error" role="alert">{state.errors?.name}</small>
    </label>
    <div className="o-name-proof" aria-live="polite"><small>Your name will appear as</small><span>Captain {normalizeCharacterName(name) || "Your name"}</span></div>
    <button type="submit" className="o-primary" disabled={pending}>{pending ? "Stepping ashore..." : "Enter the harbor"}</button>
  </form>;
}
