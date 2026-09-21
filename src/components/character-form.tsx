"use client";

import { useActionState, useState } from "react";
import { createCharacter } from "@/app/actions";
import { normalizeCharacterName, validateCharacterName } from "@/lib/validation";

export function CharacterForm() {
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState(createCharacter, {});
  const nameError = (name ? validateCharacterName(name) : undefined) ?? (name === state.name ? state.errors?.name : undefined);
  return <form action={action} className="o-form" aria-busy={pending}>
    {state.message && <p className="o-notice o-error" role="alert">{state.message}</p>}
    <label className="o-field" htmlFor="character-name"><span className="o-field-label" id="character-name-label">Character name</span>
      <input aria-labelledby="character-name-label" id="character-name" name="name" value={name} onChange={event => { setName(event.target.value); event.currentTarget.setCustomValidity(validateCharacterName(event.target.value) ?? ""); }} required
        autoComplete="off" spellCheck={false} disabled={pending} aria-invalid={!!nameError} aria-describedby="name-hint name-error" />
      <small className="o-form-hint" id="name-hint">No numbers or spaces. Choose an available name.</small>
      <small className="o-field-error" id="name-error" role="alert">{nameError}</small>
    </label>
    <div className="o-name-proof" aria-live="polite"><small>Your name will appear as</small><span>Captain {normalizeCharacterName(name) || "Your name"}</span></div>
    <button type="submit" className="o-primary" disabled={pending}>{pending ? "Stepping ashore..." : "Enter the harbor"}</button>
  </form>;
}
