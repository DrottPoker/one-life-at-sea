# Player mail

The profile **Send message** link opens `/messages/compose?to=<player-number>` with
that player selected. Messages now works as mail, with **Inbox**, **Compose**,
**Outbox**, **Saved** and **Ignore list** tabs. Existing conversation links redirect
to the composer. Own profiles have no Send message button.

## Player experience

- Compose a subject and a plain-text body, then select up to 10 recipients by name
  or public player number. Every recipient gets a private inbox copy. The sender
  gets one outbox entry with the complete recipient list. Recipients see **To: You**.
- A reply is a new mail addressed only to the original sender. Its subject defaults
  to `Re: <subject>`. Replies never broadcast to the other recipients. History follows
  earlier mails in that reply chain, limited to copies the viewer can still access.
- Inbox, Outbox and Saved show compact sender/recipient, subject and date rows.
  Unread incoming subjects are highlighted. Empty subjects display **No subject**.
  Numbered pages contain 20 rows; out-of-range pages clamp to the last available page.
- Search matches words in the subject, body and sender name within the selected folder.
  It never searches or exposes another recipient's name. Empty search resets the filter.
- Save, unsave or delete individual mails; check several rows or all rows on the current
  page for bulk save, delete or mark-read. These operations affect only the viewer's copy.
  Deletion removes the copy from all folders and direct reads, without deleting others' copies.
- Ignore a sender from an opened mail, or find a player on Ignore list. Ignored players
  cannot send new mail to that recipient. Removing an ignore restores receiving.
  A bulk send with any unavailable or blocking recipient fails entirely and identifies
  no particular blocking player. Existing mail remains readable.
- Opening a visible mail marks only that mail read. Server reads, prefetches and hidden
  tabs do not mark mail read. Read failures are visible and retry on focus/reopening.
- Owner game events refresh the folders and masthead unread count automatically through
  the existing refresh queue. No mail text is published through Realtime and no additional
  subscription or per-second polling is introduced.
- Mail is available in Hospital, at sea and during travel. The active-attacker battle
  navigation lock still applies. Sending mail consumes no gameplay resources.
- Bodies preserve line breaks and are escaped by React. This version uses plain text,
  without HTML editing, attachments, report submission or reply-all.

## Storage and authorization

`private.mail_messages` stores an immutable envelope with sender identity snapshots,
recipient snapshots/numbers, subject, body, timestamp, request UUID and optional reply
parent. `private.mail_boxes` stores each owner's direction, read, saved and deleted
state. `private.mail_ignored` stores directed owner/player ignore relationships.
All three tables use RLS and revoke direct client access. They are not published through
Realtime and are absent from administration resource APIs.

Public invoker RPCs call private definers with fixed empty search paths:

- `send_mail(target_numbers, mail_subject, mail_body, request_id, reply_to_id)`
- `get_mailbox(folder, query, page)`
- `get_mail(mail_id, include_history)`
- `get_mail_summary()` and `get_message_summary()`
- `update_mail(mail_ids, operation)`
- `get_mail_ignored()` and `set_mail_ignored(target_player_number, ignored)`

Each RPC resolves a registered character from `auth.uid()`. There is no caller-supplied
sender or mailbox owner. Detail/history/search queries filter ownership and deletion;
recipient lists are returned only for the sender's outbox copy. Reply parents must be
available incoming mail owned by the sender, and the reply target must match that
parent's sender. Unavailable and unrelated mail IDs return the same not-found error.
The server action also binds mutations to the displayed character, protecting old forms
after account switches.

Sending locks all participants in the existing deterministic character order. Envelope,
mailbox copies, sender Last action and owner refresh events commit atomically. Sorted,
deduplicated recipients plus unique `(sender_id, request_id)` guarantee one delivery per
recipient across concurrent sends and retries. Reusing an ID with different content,
subject, recipients or reply parent fails. Confirmed receipts remain available after an
ignore or at the rate limit. Ignore changes acquire the same ordered character locks.
Mailbox actions lock only their owner and notify only when something actually changes.

Folder, saved and unread indexes support owner reads. A GIN full-text index supports
search; it deliberately excludes recipient names. The shared game snapshot continues
using the small `get_message_summary()` unread-only query. Folder totals are loaded only
on mail pages. Mail IDs remain bigint strings across the API and browser.

Deleting a character removes their mailbox/ignore rows and anonymizes the sender FK,
while existing recipient copies retain their historical sender name, timestamp and body.
Replies to a deleted sender are disabled. Deleted mailbox copies and envelopes remain
private database records; this feature does not add a retention or purge job.

## Retry and migration behavior

An unconfirmed outgoing request is saved in character-scoped session storage, retaining
its UUID, exact subject, body, recipients and reply parent. Reloading or reopening Compose
allows explicit **Retry mail** without duplicate delivery. The form displays the pending
request and prevents editing until its result is known. A reply with a different pending
request links to Compose first. Nothing is sent automatically when a page mounts.
Typing drafts and fetched mail history are not persisted in browser storage.

The migration imports every legacy private message as a separate mail with a blank
subject, preserving body, send/read times and original request UUID. Earlier messages in
each legacy conversation become history parents. Repeated config migrations do not reset
read/save/delete state or resurrect deleted mail. Legacy tables remain a private archive;
old public and private client-callable conversation RPC privileges are revoked. The old
`pending-message:<character>:<recipient>` session draft is recognized when opening that
recipient's composer, including through the old `/messages/<player-number>` link.
Confirming a pending mail clears only its matching legacy request, preserving any other
recipient's pending send. Enter in recipient search never submits the composer.

## Configuration and verification

`gameplay.messages` configures `maxRecipients` (10), `subjectMaxLength` (120 Unicode
characters), `maxLength` (5,000), `pageSize` (20), `conversationPageSize` (50 earlier mails
in reply history, retaining the existing configuration key) and `perMinute` (30 recipient
deliveries per sender). Bulk recipients each count towards that delivery quota; replays do
not. Body/subject controls, empty bodies, invalid arrays and excessive lengths are rejected
in the action and database. Config changes use sync and append-only local migrations.

Database tests cover permissions, outsider/co-recipient privacy, atomic sends, recipient
limits, ignore behavior, per-owner save/read/delete state, bounded search/pages/history,
legacy import, preserved timestamps, retries, transaction rollback, rate limiting and
sender deletion. Browser tests cover profile entry, live bulk delivery, replies/history,
search and bulk controls, ignores, mobile layout, Hospital/travel, hidden tabs, lost
responses, concurrent retries and legacy drafts. Unit tests cover validation, bigint paths,
account binding and saved requests. Actual run results are in IMPLEMENTATION_STATUS.md.

## Future faction broadcasts

Ordinary player mail is limited to 10 recipients per new send. Faction-wide broadcasts
are a separate planned capability: a player with the appropriate faction permission
must be able to reach the entire faction, including factions with more than 100 members.
This does not grant ordinary mail a larger recipient limit, even for faction officers.

The future broadcast command must authorize the sender against the faction and resolve
the full membership on the server. It must use durable, idempotent delivery jobs with
bounded batches, rather than locking 100+ characters in one request. Broadcast quotas
must be separate from the ordinary 30-recipient-per-minute limit, so an authorized whole
faction broadcast can complete. Membership, permission rules and broadcast delivery are
not implemented yet; no client-provided faction flag or permission bypass is accepted.

Already committed ordinary mail retains its receipt when a later configuration lowers
the send limit. Parsing and request validation allow historical recipient counts up to
the existing supported configuration ceiling (50); the database still rejects every new
send above the active 10-recipient limit. Uncommitted older drafts can be edited down to
the new limit after that rejection.
