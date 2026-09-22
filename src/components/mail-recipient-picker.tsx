"use client";
import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import type { MailPerson } from "@/lib/messages";

export function MailRecipientPicker({ recipients, onChange, playerNumber, limit, disabled = false }: {
  recipients: MailPerson[]; onChange: (people: MailPerson[]) => void; playerNumber: number; limit: number; disabled?: boolean;
}) {
  const id = useId(), [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; people: MailPerson[]; more: boolean; error: boolean } | null>(null);
  useEffect(() => {
    if (!query.trim() || disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const client = createClient();
        const { data, error } = await client.rpc("search_players", { search_term: query.trim() }).abortSignal(controller.signal);
        if (!controller.signal.aborted) setResult({ query, people: data?.players ?? [], more: (data?.total ?? 0) > (data?.players.length ?? 0), error: !!error });
      } catch { if (!controller.signal.aborted) setResult({ query, people: [], more: false, error: true }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, disabled]);
  const results = result?.query === query ? result : null;
  const available = results?.people.filter(person => person.player_number !== playerNumber && !recipients.some(selected => selected.player_number === person.player_number)) ?? [];
  return <div className="o-mail-recipients">
    <ul className="o-mail-chips" aria-label="Selected recipients">{recipients.map(person => <li key={person.player_number}>
      <span>{person.display_name} [{person.player_number}]</span><button type="button" disabled={disabled} aria-label={"Remove " + person.display_name} onClick={() => onChange(recipients.filter(item => item.player_number !== person.player_number))}><X size={13} aria-hidden="true" /></button>
    </li>)}</ul>
    {recipients.length < limit && <><label htmlFor={id}>Find player by name or ID</label>
      <input id={id} value={query} maxLength={100} autoComplete="off" disabled={disabled} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Player name or ID" />
      {query.trim() && !disabled && <div className="o-mail-recipient-results" aria-live="polite">
        {!results ? <p>Searching...</p> : results.error ? <p role="alert">Players could not be loaded. Change your search to retry.</p> : <>
          {available.map(person => <button type="button" key={person.player_number} onClick={() => { onChange([...recipients, person]); setQuery(""); }}>Add {person.display_name} [{person.player_number}]</button>)}
          {!available.length && <p>No matching players.</p>}{results.more && <p>Refine your search to find more players.</p>}
        </>}
      </div>}
    </>}
  </div>;
}
