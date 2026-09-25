"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { choosePortrait, type PortraitResult } from "@/app/profile-actions";
import { CaptainPortrait } from "@/components/captain-portrait";
import { GameDialog } from "@/components/game-dialog";
import { useNavigationActivity } from "@/components/game-refresh";
import { PORTRAITS } from "@/lib/portraits";

// The owner's pencil button on the profile portrait opens the gallery; a saved choice closes it.
export function PortraitPicker({ current }: { current: string }) {
  const [open, setOpen] = useState(false), [choice, setChoice] = useState(current), [announcement, setAnnouncement] = useState(""), [error, setError] = useState("");
  const [, action, pending] = useActionState(async (previous: PortraitResult, form: FormData) => {
    const next = await choosePortrait(previous, form);
    setError(next.message ?? "");
    if (next.saved) { setOpen(false); setAnnouncement("Portrait saved."); }
    return next;
  }, {});
  useNavigationActivity(pending);
  return <>
    <button type="button" className="o-portrait-edit" aria-label="Change portrait" title="Change portrait"
      onClick={() => { setChoice(current); setAnnouncement(""); setError(""); setOpen(true); }}><Pencil aria-hidden="true" /></button>
    <span className="o-sr-only" role="status">{announcement}</span>
    <GameDialog open={open} title="Choose your portrait" busy={pending} onClose={() => setOpen(false)} className="o-portrait-dialog">
      <form action={action}>
        <fieldset className="o-portrait-options" disabled={pending}>
          <legend className="o-sr-only">Portrait</legend>
          {PORTRAITS.map(portrait => <label key={portrait.id} className="o-portrait-option">
            <input type="radio" name="portrait" value={portrait.id} checked={choice === portrait.id} onChange={() => setChoice(portrait.id)} />
            <CaptainPortrait portraitId={portrait.id} sizes="150px" />
            <span>{portrait.name} {portrait.id === current && <small>Current</small>}</span>
          </label>)}
        </fieldset>
        <div className="o-item-dialog-actions">
          <button type="button" className="o-text-button" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          <button className="o-primary" disabled={pending || choice === current}>{pending ? "Saving..." : "Save portrait"}</button>
        </div>
        {error && <p role="alert" className="o-field-error">{error}</p>}
      </form>
    </GameDialog>
  </>;
}
