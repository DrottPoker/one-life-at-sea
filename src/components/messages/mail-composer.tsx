"use client";

import { useId, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Feather, Send } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { useGameRefresh, useNavigationActivity } from "@/components/game-refresh";
import { MailRecipientPicker } from "@/components/messages/mail-recipient-picker";
import { sendMail } from "@/app/message-actions";
import { gameplay } from "@/config/public";
import { MAX_MAIL_REQUEST_RECIPIENTS, mailDraftKey, messageDraftKey, normalizeMessage, parsePendingMail, parsePendingMessage, validMessage, validSubject, validRecipients, type MailPerson, type PendingMail } from "@/lib/messages";

const draftEvent = "pending-mail-changed";
function subscribe(listener: () => void) {
  window.addEventListener(draftEvent, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(draftEvent, listener); window.removeEventListener("storage", listener); };
}
function readDraft(key: string) { try { return sessionStorage.getItem(key); } catch { return "unavailable"; } }
function changed() { window.dispatchEvent(new Event(draftEvent)); }

export function MailComposer({ characterId, playerNumber, initialRecipients = [], initialSubject = "", replyTo = null }: {
  characterId: string; playerNumber: number; initialRecipients?: MailPerson[]; initialSubject?: string; replyTo?: string | null;
}) {
  const [recipients, setRecipients] = useState(initialRecipients), [subject, setSubject] = useState(initialSubject), [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null), [sending, startSending] = useTransition();
  const inFlight = useRef(false), id = useId(), router = useRouter(), refresh = useGameRefresh();
  const key = mailDraftKey(characterId);
  const legacyKey = !replyTo && initialRecipients.length === 1 ? messageDraftKey(characterId, initialRecipients[0].player_number) : null;
  const raw = useSyncExternalStore(subscribe, () => readDraft(key), () => null);
  const legacyRaw = useSyncExternalStore(subscribe, () => legacyKey ? readDraft(legacyKey) : null, () => null);
  let saved: PendingMail | null = null, unreadable = false;
  try {
    saved = parsePendingMail(raw);
    if (!saved && legacyRaw) {
      const legacy = parsePendingMessage(legacyRaw);
      if (legacy) saved = { ...legacy, recipients: initialRecipients, subject: "", replyTo: null };
    }
  } catch { unreadable = true; }
  useNavigationActivity(sending);
  const otherReply = !!replyTo && !!saved && saved.replyTo !== replyTo;
  const displayedRecipients = saved?.recipients ?? recipients, displayedSubject = saved?.subject ?? subject, displayedBody = saved?.body ?? body;
  const locked = sending || !!saved || unreadable;
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || unreadable || otherReply) return;
    const attempt = saved ?? { id: crypto.randomUUID(), recipients, subject: subject.trim(), body: normalizeMessage(body), replyTo };
    if (!validRecipients(attempt.recipients, saved ? MAX_MAIL_REQUEST_RECIPIENTS : gameplay.messages.maxRecipients) || !validSubject(attempt.subject) || !validMessage(attempt.body)) { setError("Choose recipients and enter a message within the limits."); return; }
    inFlight.current = true;
    startSending(async () => {
      const release = refresh.hold();
      try {
        sessionStorage.setItem(key, JSON.stringify(attempt)); changed(); setError(null);
        const result = await sendMail(characterId, attempt);
        if (!result.retry) {
          sessionStorage.removeItem(key);
          if (attempt.recipients.length === 1) {
            const migratedKey = messageDraftKey(characterId, attempt.recipients[0].player_number);
            try {
              if (parsePendingMessage(sessionStorage.getItem(migratedKey))?.id === attempt.id) sessionStorage.removeItem(migratedKey);
            } catch { /* Preserve unrelated or unreadable legacy drafts. */ }
          }
          changed();
        }
        if (result.error) { setError(result.error); setRecipients(attempt.recipients); setSubject(attempt.subject); setBody(attempt.body); }
        else if (result.receipt) router.push("/messages/mail/" + result.receipt.mail_id + "?folder=outbox&sent=1");
      } catch { setError("Sending could not be confirmed. Retry to check the same mail."); }
      finally { inFlight.current = false; release(); }
    });
  }
  if (otherReply) return <div className="o-panel-body o-copy">A previous mail is awaiting confirmation. <Link href="/messages/compose">Open Compose to retry it</Link> before sending a reply.</div>;
  return <form className="o-mail-compose" data-reply={!!replyTo} aria-label={replyTo ? "Reply" : "Compose mail"} aria-busy={sending} onSubmit={send}>
    <div className="o-mail-paper o-mail-compose-paper">
      <header><div className="o-mail-paper-title"><Feather size={32} strokeWidth={1.4} aria-hidden="true" /><h2>{replyTo ? "Reply" : "Compose mail"}</h2></div>
        <p className="o-mail-compose-hint">{replyTo ? "Your reply goes only to the sender." : "Choose your recipients and write your letter."}</p>
      </header>
      <div className="o-mail-compose-address">
        <div className="o-message-toolbar"><strong>To</strong><small>{replyTo ? "Reply to sender" : saved && displayedRecipients.length > gameplay.messages.maxRecipients ? `Previously submitted to ${displayedRecipients.length} recipients` : `${displayedRecipients.length} / ${gameplay.messages.maxRecipients} recipients`}</small></div>
        <MailRecipientPicker recipients={displayedRecipients} onChange={setRecipients} playerNumber={playerNumber} limit={replyTo ? 1 : gameplay.messages.maxRecipients} disabled={locked || !!replyTo} />
        {!replyTo && <small className="o-mail-compose-hint">Each recipient receives a private copy. Replies go only to the sender.</small>}
      </div>
      <div className="o-mail-compose-field"><label htmlFor={id + "-subject"}>Subject</label>
        <input id={id + "-subject"} name="subject" maxLength={gameplay.messages.subjectMaxLength * 2} value={displayedSubject} readOnly={locked} onChange={event => setSubject(event.target.value)} placeholder="No subject" />
      </div>
      <div className="o-mail-compose-field"><label htmlFor={id + "-body"}>Message</label>
        <textarea id={id + "-body"} name="body" rows={8} maxLength={gameplay.messages.maxLength * 2} value={displayedBody} readOnly={locked} onChange={event => setBody(event.target.value)} required aria-describedby={id + "-limit"} placeholder="Write your letter here..." />
      </div>
    </div>
    <footer className="o-mail-compose-footer"><small id={id + "-limit"}>{Array.from(displayedBody).length} / {gameplay.messages.maxLength} characters</small>
      <button className="o-training-button o-mail-send" type="submit" disabled={sending || unreadable || !validRecipients(displayedRecipients, saved ? MAX_MAIL_REQUEST_RECIPIENTS : gameplay.messages.maxRecipients) || !validSubject(displayedSubject) || !validMessage(normalizeMessage(displayedBody))}>
        <Send size={16} aria-hidden="true" />{sending ? "Sending..." : saved ? "Retry mail" : "Send mail"}
      </button>
    </footer>
    {saved && !sending && <p className="o-copy">This mail has not been confirmed. Retry to check whether it was sent.</p>}
    {unreadable && <p role="alert">The saved mail is unavailable. Allow browser storage and reload this page.</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
