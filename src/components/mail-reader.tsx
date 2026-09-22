"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, History, Trash2, UserRoundX } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { useNavigationActivity } from "@/components/game-refresh";
import { MessageTime } from "@/components/message-time";
import { MailComposer } from "@/components/mail-composer";
import { updateMail, setMailIgnored } from "@/app/message-actions";
import { gameplay } from "@/config/public";
import { subscribeToForeground } from "@/lib/browser-events";
import { mailUrl, replySubject, type MailDetail, type MailOperation } from "@/lib/messages";

export function MailReader({ characterId, playerNumber, mail, showHistory }: { characterId: string; playerNumber: number; mail: MailDetail; showHistory: boolean }) {
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [busy, start] = useTransition(), [reading, startReading] = useTransition();
  const router = useRouter(), params = useSearchParams();
  const folder = params.get("folder") === "saved" ? "saved" : mail.direction;
  const historyUrl = "/messages/mail/" + mail.id + "?folder=" + folder + (showHistory ? "" : "&history=1");
  useNavigationActivity(busy || reading);
  useEffect(() => {
    if (mail.direction !== "inbox" || mail.read_at) return;
    let disposed = false, inFlight = false, completed = false;
    const mark = () => {
      if (document.visibilityState !== "visible" || inFlight || disposed || completed) return;
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
    if (busy) return;
    start(async () => {
      try {
        const result = await updateMail(characterId, [mail.id], operation); setError(result);
        if (!result && operation === "delete") router.push(mailUrl(folder));
      } catch { setError("Mail could not be updated. Please try again."); }
    });
  }
  function ignore() {
    start(async () => {
      try { const result = await setMailIgnored(characterId, mail.sender.player_number, true); setError(result); if (!result) setNotice(mail.sender.display_name + " was added to your ignore list."); }
      catch { setError("Your ignore list could not be updated. Please try again."); }
    });
  }
  return <>
    {params.get("sent") === "1" && mail.direction === "outbox" && <p className="o-panel-body o-mail-notice" role="status">Mail sent to {mail.recipients.length} {mail.recipients.length === 1 ? "recipient" : "recipients"}.</p>}
    {showHistory && <section className="o-mail-history" aria-label="Mail history"><h3>History</h3>
      {!mail.history.length && <p className="o-copy">No earlier mail is available.</p>}
      {mail.history.map(item => <article key={item.id}><div className="o-message-meta"><Link href={"/messages/mail/" + item.id + "?folder=" + item.direction}>{item.subject || "No subject"}</Link><MessageTime value={item.sent_at} /></div><strong>{item.sender.display_name}</strong><p className="o-message-body">{item.body}</p></article>)}
      <small className="o-copy">Up to {gameplay.messages.conversationPageSize} earlier mails in this reply chain. Only your available copies are shown.</small>
    </section>}
    <article className="o-mail-reader" aria-label="Opened mail"><header><h3>{mail.subject || "No subject"}</h3><MessageTime value={mail.sent_at} /></header>
      <div className="o-panel-body"><div className="o-mail-address">From: <Link href={"/players/" + mail.sender.player_number}>{mail.sender.display_name}</Link></div>
        <div className="o-mail-address">To: {mail.direction === "inbox" ? "You" : mail.recipients.map((person, index) => <span key={person.player_number}>{index > 0 && ", "}<Link href={"/players/" + person.player_number}>{person.display_name}</Link></span>)}</div>
        <p className="o-message-body">{mail.body}</p>
      </div>
      <footer className="o-mail-actions"><button type="button" disabled={busy} onClick={() => act("delete")}><Trash2 size={15} aria-hidden="true" />Delete</button>
        {mail.can_reply && <button type="button" disabled={busy} onClick={ignore}><UserRoundX size={15} aria-hidden="true" />Ignore sender</button>}
        <button type="button" disabled={busy} aria-pressed={mail.saved} onClick={() => act(mail.saved ? "unsave" : "save")}><Bookmark size={15} aria-hidden="true" fill={mail.saved ? "currentColor" : "none"} />{mail.saved ? "Unsave" : "Save"}</button>
        <Link href={historyUrl}><History size={15} aria-hidden="true" />{showHistory ? "Hide history" : "History"}</Link>
      </footer>
    </article>
    {error && <p className="o-panel-body" role="alert">{error}</p>}{notice && <p className="o-panel-body" role="status">{notice}</p>}
    {mail.can_reply && <MailComposer characterId={characterId} playerNumber={playerNumber} initialRecipients={[mail.sender]} initialSubject={replySubject(mail.subject)} replyTo={mail.id} />}
  </>;
}
