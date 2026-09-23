"use client";
import { useState, useTransition } from "react";
import { GameLink as Link } from "@/components/game-navigation";
import { MailRecipientPicker } from "@/components/messages/mail-recipient-picker";
import { useNavigationActivity } from "@/components/game-refresh";
import { setMailIgnored } from "@/app/message-actions";
import type { MailPerson } from "@/lib/messages";

export function MailIgnoreList({ characterId, playerNumber, people }: { characterId: string; playerNumber: number; people: MailPerson[] }) {
  const [selected, setSelected] = useState<MailPerson[]>([]), [error, setError] = useState<string | null>(null), [busy, start] = useTransition();
  useNavigationActivity(busy);
  function update(target: number, ignored: boolean) {
    start(async () => {
      try { const result = await setMailIgnored(characterId, target, ignored); setError(result); if (!result) setSelected([]); }
      catch { setError("Your ignore list could not be updated. Please try again."); }
    });
  }
  return <section className="o-panel-body o-mail-ignore"><h3>Ignore list</h3><p className="o-copy">Players on this list cannot send you mail. Existing mail stays in your inbox.</p>
    <div className="o-mail-compose"><MailRecipientPicker recipients={selected} onChange={setSelected} playerNumber={playerNumber} limit={1} disabled={busy} /><button className="o-training-button" type="button" disabled={busy || !selected.length} onClick={() => update(selected[0].player_number, true)}>Ignore player</button></div>
    <ul aria-label="Ignored players">{people.map(person => <li key={person.player_number}><Link href={"/players/" + person.player_number}>{person.display_name}</Link><button type="button" disabled={busy} onClick={() => update(person.player_number, false)}>Remove {person.display_name}</button></li>)}</ul>
    {!people.length && <p className="o-copy">Your ignore list is empty.</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
