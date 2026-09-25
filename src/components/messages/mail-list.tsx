"use client";

import { useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, LoaderCircle, Mail, MailOpen, Trash2 } from "lucide-react";
import { useNavigationActivity } from "@/components/game-refresh";
import { MessageTime } from "@/components/messages/message-time";
import { Pagination } from "@/components/pagination";
import { updateMail } from "@/app/message-actions";
import { mailDetailUrl, mailUrl, type MailFolder, type MailOperation, type MailPage } from "@/lib/messages";

function Envelope({ unread }: { unread: boolean }) {
  const { pending } = useLinkStatus();
  useNavigationActivity(pending);
  return <span className="o-mail-envelope" data-pending={pending}>{pending ? <><LoaderCircle aria-hidden="true" /><span className="sr-only">Opening mail</span></> : unread ? <Mail aria-hidden="true" /> : <MailOpen aria-hidden="true" />}</span>;
}

export function MailList({ characterId, data, folder, query, openedId }: { characterId: string; data: MailPage; folder: MailFolder; query: string; openedId?: string }) {
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition(), router = useRouter();
  useNavigationActivity(busy);
  const visibleSelected = selected.filter(id => data.items.some(item => item.id === id));
  function act(operation: MailOperation) {
    if (busy || !visibleSelected.length) return;
    start(async () => {
      try {
        const result = await updateMail(characterId, visibleSelected, operation); setError(result);
        if (!result) {
          setSelected([]);
          if (openedId && visibleSelected.includes(openedId) && (operation === "delete" || (operation === "unsave" && folder === "saved"))) router.push(mailUrl(folder, query, data.page));
        }
      } catch { setError("Mail could not be updated. Please try again."); }
    });
  }
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return <section className="o-mail-list" aria-label={folder === "outbox" ? "Sent mail" : folder === "saved" ? "Saved mail" : "Inbox"} aria-busy={busy}>
    <div className="o-mail-selection"><span>{visibleSelected.length ? `${visibleSelected.length} selected` : folder === "outbox" ? "Sent letters" : folder === "saved" ? "Saved letters" : "Received letters"}</span>
      <button type="button" disabled={busy || !data.items.length} onClick={() => setSelected(visibleSelected.length === data.items.length ? [] : data.items.map(item => item.id))}>{visibleSelected.length === data.items.length && data.items.length ? "Uncheck all" : "Check all"}</button>
    </div>
    {visibleSelected.length > 0 && <div className="o-mail-controls o-mail-actions">
      <button type="button" disabled={busy} onClick={() => act("delete")}><Trash2 size={14} aria-hidden="true" />Delete selected</button>
      <button type="button" disabled={busy} onClick={() => act(folder === "saved" ? "unsave" : "save")}>{folder === "saved" ? "Unsave selected" : "Save selected"}</button>
      {folder !== "outbox" && <button type="button" disabled={busy} onClick={() => act("read")}>Mark read</button>}
    </div>}
    {error && <p className="o-panel-body" role="alert">{error}</p>}
    <ul className="o-mail-letters">{data.items.map(item => {
      const unread = item.direction === "inbox" && !item.read_at;
      const person = item.direction === "outbox" ? item.recipients[0]?.display_name ?? "Deleted player" : item.sender.display_name;
      return <li className="o-mail-letter" key={item.id} data-unread={unread} data-opened={item.id === openedId}>
        <Link className="o-mail-letter-link" prefetch={false} scroll={false} href={mailDetailUrl(item.id, folder, query, data.page)} aria-current={item.id === openedId ? "page" : undefined}>
          <Envelope unread={unread} /><span className="o-mail-letter-content"><span className="o-mail-people" title={person}>{item.direction === "outbox" && "To: "}{person}{item.direction === "outbox" && item.recipients.length > 1 && <small> +{item.recipients.length - 1} more</small>}</span>
            <span className="o-mail-letter-preview"><span className="o-mail-subject" title={item.subject || "No subject"}>{item.subject || "No subject"}</span><MessageTime value={item.sent_at} compact /></span>
          </span>{item.saved && <Bookmark className="o-mail-saved-marker" size={12} aria-label="Saved" />}{unread && <span className="sr-only">Unread</span>}
        </Link>
        <input type="checkbox" aria-label={"Select " + (item.subject || "No subject")} disabled={busy} checked={visibleSelected.includes(item.id)} onChange={event => setSelected(event.target.checked ? [...visibleSelected, item.id] : visibleSelected.filter(id => id !== item.id))} />
      </li>;
    })}</ul>
    {!data.items.length && <p className="o-panel-body o-copy">{query ? "No mail matches your search." : "No mail in this folder."} {folder === "inbox" && !query && <Link href="/messages/compose">Compose a mail</Link>}</p>}
    <div className="o-mail-list-foot"><span>{data.total ? `${data.page * data.page_size + 1}-${Math.min((data.page + 1) * data.page_size, data.total)} of ${data.total}` : "0 mails"}</span>
      <Pagination page={data.page} pages={pages} href={value => mailUrl(folder, query, value)} label="Mail pages" scroll={false} />
    </div>
  </section>;
}
