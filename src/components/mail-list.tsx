"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Trash2 } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { useNavigationActivity } from "@/components/game-refresh";
import { MessageTime } from "@/components/message-time";
import { updateMail } from "@/app/message-actions";
import { mailUrl, type MailFolder, type MailOperation, type MailPage } from "@/lib/messages";

export function MailList({ characterId, data, folder, query }: { characterId: string; data: MailPage; folder: MailFolder; query: string }) {
  const [selected, setSelected] = useState<string[]>([]), [search, setSearch] = useState(query), [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition(), router = useRouter();
  useNavigationActivity(busy);
  const visibleSelected = selected.filter(id => data.items.some(item => item.id === id));
  function act(operation: MailOperation, ids = visibleSelected) {
    if (busy || !ids.length) return;
    start(async () => {
      try { const result = await updateMail(characterId, ids, operation); setError(result); if (!result) setSelected([]); }
      catch { setError("Mail could not be updated. Please try again."); }
    });
  }
  function find(event: FormEvent<HTMLFormElement>) { event.preventDefault(); router.push(mailUrl(folder, search.trim())); }
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  const pageNumbers = Array.from(new Set([0, ...Array.from({ length: 5 }, (_, index) => data.page - 2 + index), pages - 1])).filter(value => value >= 0 && value < pages).sort((a, b) => a - b);
  const pagination = <nav className="o-mail-pagination" aria-label="Mail pages">
    {data.page > 0 && <Link href={mailUrl(folder, query, data.page - 1)} aria-label="Previous page">‹</Link>}
    {pageNumbers.map((value, index) => <span key={value}>{index > 0 && value > pageNumbers[index - 1] + 1 && <span className="o-mail-ellipsis">…</span>}<Link href={mailUrl(folder, query, value)} aria-label={"Page " + (value + 1)} aria-current={value === data.page ? "page" : undefined}>{value + 1}</Link></span>)}
    {data.page + 1 < pages && <Link href={mailUrl(folder, query, data.page + 1)} aria-label="Next page">›</Link>}
  </nav>;
  return <div className="o-mail-list" aria-busy={busy}>
    <div className="o-mail-controls"><div className="o-mail-actions">
      <button type="button" disabled={!visibleSelected.length || busy} onClick={() => act("delete")}><Trash2 size={14} aria-hidden="true" />Delete selected</button>
      <button type="button" disabled={!visibleSelected.length || busy} onClick={() => act(folder === "saved" ? "unsave" : "save")}>{folder === "saved" ? "Unsave selected" : "Save selected"}</button>
      <button type="button" disabled={!visibleSelected.length || busy || folder === "outbox"} onClick={() => act("read")}>Mark read</button>
      <button type="button" disabled={busy || !data.items.length} onClick={() => setSelected(visibleSelected.length === data.items.length ? [] : data.items.map(item => item.id))}>{visibleSelected.length === data.items.length && data.items.length ? "Uncheck all" : "Check all"}</button>
    </div>
    <form className="o-mail-search" onSubmit={find} role="search"><input aria-label="Search mail" placeholder="Search mail" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} /><button type="submit">Go</button>{query && <Link href={mailUrl(folder)}>Clear</Link>}</form></div>
    {error && <p className="o-panel-body" role="alert">{error}</p>}
    {pagination}
    <div className="o-mail-table-scroll"><table className="o-mail-table"><caption className="sr-only">{folder === "outbox" ? "Sent mail" : folder === "saved" ? "Saved mail" : "Inbox"}</caption>
      <thead><tr><th scope="col">{folder === "outbox" ? "To" : folder === "saved" ? "From / To" : "From"}</th><th scope="col">Subject</th><th scope="col">Date</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{data.items.map(item => <tr key={item.id} data-unread={item.direction === "inbox" && !item.read_at}>
        <td><div className="o-mail-people">{item.direction === "outbox" ? <><span className="o-copy">To: </span>{item.recipients.slice(0, 1).map((person, index) => <span key={person.player_number}>{index > 0 && ", "}<Link href={"/players/" + person.player_number}>{person.display_name}</Link></span>)}{item.recipients.length > 1 && <span className="o-copy"> +{item.recipients.length - 1} more</span>}</> : <Link href={"/players/" + item.sender.player_number}>{item.sender.display_name}</Link>}</div></td>
        <td><Link className="o-mail-subject" prefetch={false} href={"/messages/mail/" + item.id + (folder !== "inbox" ? "?folder=" + folder : "")}>{item.subject || "No subject"}</Link>{item.direction === "inbox" && !item.read_at && <span className="sr-only">Unread</span>}</td>
        <td><MessageTime value={item.sent_at} /></td>
        <td><div className="o-mail-row-actions"><button type="button" disabled={busy} aria-label={(item.saved ? "Unsave " : "Save ") + (item.subject || "No subject")} aria-pressed={item.saved} onClick={() => act(item.saved ? "unsave" : "save", [item.id])}><Bookmark size={14} aria-hidden="true" fill={item.saved ? "currentColor" : "none"} /></button>
          <button type="button" disabled={busy} aria-label={"Delete " + (item.subject || "No subject")} onClick={() => act("delete", [item.id])}><Trash2 size={14} aria-hidden="true" /></button>
          <input type="checkbox" aria-label={"Select " + (item.subject || "No subject")} disabled={busy} checked={visibleSelected.includes(item.id)} onChange={event => setSelected(event.target.checked ? [...visibleSelected, item.id] : visibleSelected.filter(id => id !== item.id))} />
        </div></td>
      </tr>)}</tbody>
    </table></div>
    {!data.items.length && <p className="o-panel-body o-copy">{query ? "No mail matches your search." : "No mail in this folder."} {folder === "inbox" && !query && <Link href="/messages/compose">Compose a mail</Link>}</p>}
    <div className="o-panel-foot o-message-toolbar"><span>{data.total ? `${data.page * data.page_size + 1}-${Math.min((data.page + 1) * data.page_size, data.total)} of ${data.total}` : "0 mails"}</span>{pages > 1 && pagination}</div>
  </div>;
}
