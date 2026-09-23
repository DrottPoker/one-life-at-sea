# Player notifications

Players have a persistent private inbox at `/notifications`. The masthead bell shows
an unread badge and links to the inbox. Notifications does not appear in the location sidebar. The inbox uses compact
rows with linked names, an event description, `[view]`, a UTC timestamp and read state.
It is available in Hospital and at sea, including during travel. Combat reports are
also readable in Hospital and during travel. An active attacker retains the existing
navigation lock until their participation ends.

## First event: incoming attack

One `combat.attacked` notification is created for the defender when an encounter
changes from active to completed. It lists every attacker in join order, including
participants who already retreated or were defeated, with their public profile links.
The message says `attacked you but lost` when the defender wins, `attacked and
hospitalized you` when the defender is hospitalized, and otherwise `attacked you`.
Retreats and draws are not described as defeats. The text uses the final
saved health rather than the character's later recovered state. `[view]` opens the
completed `/combatlog/<battle-id>` and marks the notification read on a normal click.
Names and player numbers are snapshots, so later renaming does not rewrite history.

Completion includes victory, defended attacks, retreat, timeout, round limits and
administrative interruption. Active encounters do not link to unavailable reports.
Existing completed encounters are not added to the inbox. Existing attack notifications
missing an outcome are enriched from their saved battle without changing read state. Encounters active when the migration
is applied produce a notification when they subsequently finish. Offline players see
saved notifications when they return; expired combats settle through existing gameplay
reads, after which the same completion trigger creates the notification.

## Storage, delivery and privacy

- `private.player_notifications` owns the recipient, kind, stable event key, versioned
  JSON payload, event timestamp and read timestamp. IDs are bigint internally and
  strings in JSON/TypeScript to preserve precision.
- `private.emit_notification(recipient_id, event_kind, event_key, event_payload,
  event_at)` is the shared internal entry point. Call it inside the source transaction.
  `(character_id, kind, event_key)` deduplicates replays, preserving the original
  payload and read state. Rollback removes the notification with the source action.
- The combat completion trigger calls this helper once per encounter, not once per
  attacker. Notification payloads contain only public names/numbers, the battle ID
  and combat/Hospital outcome; account IDs, email, private stats and combat snapshots stay private.
- RLS is enabled, raw table and sequence access is revoked, and the table is not
  in Realtime. Public invoker RPCs delegate to private definers with an empty search
  path and a registered-character check. Players cannot emit or edit payloads.
- `get_notification_summary`, `get_notifications`, `mark_notification_read` and
  `mark_all_notifications_read` always resolve the recipient from `auth.uid()`.
  There is no caller-controlled recipient parameter.
- Inserts and read changes signal the existing owner-only `player_game_events`.
  AppFrame refreshes server snapshots on Realtime, reconnect, focus and its existing
  15-second fallback. No extra subscription, per-second timer or browser inbox cache.
- Indexed descending IDs provide cursor pagination without shifts when new rows arrive.
  Page size is configured by `gameplay.notifications.pageSize`, initially 20.
  Mark all read applies through the latest loaded ID; newer entries remain unread.
  Account deletion cascades to its inbox. No automatic retention deletion is enabled.

## Adding an event type

1. Define a stable kind such as `market.sale` and a versioned payload with only fields
   the recipient may see. Use a stable source ID as the event key.
2. Call `private.emit_notification` inside the successful authoritative transaction.
   Do not grant it to browsers or send from UI callbacks. A source-specific trigger
   can be used when several code paths must share the same event transition.
3. Add a payload renderer to `src/lib/notifications.ts`. Build links from validated
   IDs and known routes; never accept arbitrary URLs or HTML from payloads.
4. Add producer tests for recipient, rollback, retries and privacy, plus renderer tests.
   Unknown types or unsupported payload versions show a safe generic message.
5. Run config sync to generate the append-only SQL migration and apply it locally.

## Verification

Database tests cover grouped attacks, a retreated participant, exact report links,
Hospital results, role/owner isolation, deduplication, read persistence, realtime
signals, pagination, read-all boundaries, rollback and account cleanup. Unit tests
cover group rendering, unsafe links, unknown kinds, bigint IDs and navigation access.
Browser tests cover live group attacks, offline persistence, Hospital report access,
read synchronization between tabs, pagination, reload and mobile widths.
