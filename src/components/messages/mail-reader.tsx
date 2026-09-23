"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bookmark, Clock3, History, Mail, Reply, Trash2, UserRoundX } from "lucide-react";
import { useNavigationActivity } from "@/components/game-refresh";
import { MessageTime } from "@/components/messages/message-time";
import { MailComposer } from "@/components/messages/mail-composer";
import { updateMail, setMailIgnored } from "@/app/message-actions";
import { gameplay } from "@/config/public";
import { subscribeToForeground } from "@/lib/browser-events";
import { mailDetailUrl, mailUrl, replySubject, type MailDetail, type MailFolder, type MailOperation } from "@/lib/messages";

export function MailReader({ characterId, playerNumber, mail, showHistory, folder, query, page, sent }: {
  characterId: string; playerNumber: number; mail: MailDetail; showHistory: boolean; folder: MailFolder; query: string; page: number; sent: boolean;
}) {
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [busy, start] = useTransition(), [reading, startReading] = useTransition(), [replying, setReplying] = useState(false);
  const preventAutoRead = useRef(false), replyPanel = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const backUrl = mailUrl(folder, query, page);
  const historyUrl = mailDetailUrl(mail.id, folder, query, page, !showHistory);
  useNavigationActivity(busy || reading);
  useEffect(() => {
    if (replying) replyPanel.current?.querySelector("textarea")?.focus();
  }, [replying]);
  useEffect(() => {
    if (mail.direction !== "inbox" || mail.read_at) return;
    let disposed = false, inFlight = false, completed = false;
    const mark = () => {
      if (document.visibilityState !== "visible" || inFlight || disposed || completed || preventAutoRead.current) return;
      inFlight = true;
      startReading(async () => {
        try { const result = await updateMail(characterId, [mail.id], "read"); if (!disposed) { setError(result); completed = !result; } }
        catch { if (!disposed) setError("Mail could not be marked as read. Reopen the mail to retry."); }
        finally { inFlight = false; }
      });
    };
    const unsubscribe = subscribeToForeground(mark); mark();
    return () => { disposed = true; unsubscribe(); };
  }, [characterId, mail.id, mail.direction, mail.read_at]);
  function act(operation: MailOperation) {
    if (busy || reading) return;
    if (operation === "unread") preventAutoRead.current = true;
    start(async () => {
      try {
        const result = await updateMail(characterId, [mail.id], operation); setError(result);
        if (result && operation === "unread") preventAutoRead.current = false;
        if (!result && (operation === "delete" || operation === "unread" || (operation === "unsave" && folder === "saved"))) router.push(backUrl, { scroll: false });
      } catch { preventAutoRead.current = false; setError("Mail could not be updated. Please try again."); }
    });
  }
  function ignore() {
    if (busy) return;
    start(async () => {
      try { const result = await setMailIgnored(characterId, mail.sender.player_number, true); setError(result); if (!result) setNotice(mail.sender.display_name + " was added to your ignore list."); }
      catch { setError("Your ignore list could not be updated. Please try again."); }
    });
  }
  return <>
    <Link className="o-mail-back" href={backUrl} scroll={false}><ArrowLeft size={16} aria-hidden="true" />Back to {folder === "outbox" ? "outbox" : folder === "saved" ? "saved mail" : "inbox"}</Link>
    {sent && mail.direction === "outbox" && <p className="o-panel-body o-mail-notice" role="status">Mail sent to {mail.recipients.length} {mail.recipients.length === 1 ? "recipient" : "recipients"}.</p>}
    <article className="o-mail-reader" aria-label="Opened mail" aria-busy={busy || reading}>
      <div className="o-mail-paper"><header>
        <div className="o-mail-paper-title"><Mail size={36} strokeWidth={1.4} aria-hidden="true" /><h2>{mail.subject || "No subject"}</h2></div>
        <div className="o-mail-address">From: <Link href={"/players/" + mail.sender.player_number}>{mail.sender.display_name}</Link></div>
        <div className="o-mail-address">To: {mail.direction === "inbox" ? "You" : mail.recipients.map((person, index) => <span key={person.player_number}>{index > 0 && ", "}<Link href={"/players/" + person.player_number}>{person.display_name}</Link></span>)}</div>
        <div className="o-mail-date"><Clock3 size={16} aria-hidden="true" /><MessageTime value={mail.sent_at} /></div>
      </header><p className="o-message-body">{mail.body || "No message content."}</p></div>
      <footer className="o-mail-reader-actions">
        <button className="o-mail-delete" type="button" disabled={busy || reading} onClick={() => act("delete")}><Trash2 size={16} aria-hidden="true" />Delete</button>
        {mail.can_reply && <button type="button" disabled={busy} aria-label="Ignore sender" onClick={ignore}><UserRoundX size={16} aria-hidden="true" />Ignore</button>}
        <button type="button" disabled={busy || reading} aria-pressed={mail.saved} onClick={() => act(mail.saved ? "unsave" : "save")}><Bookmark size={16} aria-hidden="true" fill={mail.saved ? "currentColor" : "none"} />{mail.saved ? "Unsave" : "Save"}</button>
        {mail.direction === "inbox" && <button type="button" disabled={busy || reading} onClick={() => act("unread")}><Mail size={16} aria-hidden="true" />Mark unread</button>}
        {mail.can_reply && <button className="o-mail-reply" type="button" aria-expanded={replying} aria-controls={"reply-" + mail.id} onClick={() => setReplying(!replying)}><Reply size={16} aria-hidden="true" />{replying ? "Close reply" : "Reply"}</button>}
      </footer>
    </article>
    <div className="o-mail-history-toggle"><Link href={historyUrl} scroll={false}><History size={14} aria-hidden="true" />{showHistory ? "Hide history" : "History"}</Link></div>
    {error && <p className="o-panel-body" role="alert">{error}</p>}{notice && <p className="o-panel-body" role="status">{notice}</p>}
    {showHistory && <section className="o-mail-history" aria-label="Mail history"><h3>History</h3>
      {!mail.history.length && <p className="o-copy">No earlier mail is available.</p>}
      {mail.history.map(item => <article key={item.id}><div className="o-message-meta"><Link href={mailDetailUrl(item.id, item.direction)}>{item.subject || "No subject"}</Link><MessageTime value={item.sent_at} /></div><strong>{item.sender.display_name}</strong><p className="o-message-body">{item.body}</p></article>)}
      <small className="o-copy">Up to {gameplay.messages.conversationPageSize} earlier mails in this reply chain. Only your available copies are shown.</small>
    </section>}
    {mail.can_reply && <div id={"reply-" + mail.id} ref={replyPanel} hidden={!replying}>
      <MailComposer characterId={characterId} playerNumber={playerNumber} initialRecipients={[mail.sender]} initialSubject={replySubject(mail.subject)} replyTo={mail.id} />
    </div>}
  </>;
}
