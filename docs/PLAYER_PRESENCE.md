# Profile presence and last action

Profiles show a 12px green, gold or grey status dot before `Name [ID]` in the heading.
The dot displays Online, Idle or Offline through its tooltip and accessible label;
there is no separate Player status detail row. The same live snapshot supplies
**Last action** as elapsed time. The hospital status remains a separate field.
This applies to the owner's profile and other registered players' profiles.

## Meaning and timing

- Online: at least one connected game tab has not reached either idle deadline.
  Pointer, keyboard, scroll and returning to the tab maintain presence without counting
  as a game action. Input received outside a focused, visible tab does not reset inactivity.
- Idle: no input for `gameplay.presence.idleSeconds` (300 seconds by default), or the
  tab/window has continuously been hidden or unfocused for `gameplay.presence.unfocusedSeconds`
  (120 seconds). Whichever deadline comes first applies. Brief focus losses keep Online.
  Returning to focus resets both timers; repeated blur/visibility events do not extend
  the ongoing absence. An already idle tab stays Idle when it loses focus.
- Offline: no unexpired tab lease belongs to a live Auth session. A tab sends a heartbeat
  every third of `gameplay.presence.leaseSeconds` (30 seconds with the default 90-second
  lease). Hidden tabs keep reporting, becoming Idle after their grace period. Suspended tabs and lost connections
  eventually expire. A close event is best effort; closing a browser may take up to
  90 seconds to expire, plus the profile's next refresh. Revoked sessions stop counting
  immediately on the next profile read, regardless of remaining lease time.
- Last action: entering/navigating game pages, or committing a game command. Training,
  activities (including a failed catch that spends Stamina), bank transfers, tavern,
  inventory trash, market listing/purchase/cancellation, travel, scouting, joining an
  attack, manual combat rounds and saving defence orders all count. Replaying an existing
  receipt, rejected commands, mouse movement, focus, heartbeats, automatic resource
  recovery, travel arrival, passive defence and combat timeouts do not count.

Status is independent of last action. Someone can remain Idle for hours with an old
last action. Focusing a tab makes it Online without resetting last action. Browsing
someone else's profile only records the viewer's page action.

Profile snapshots reuse `get_character_status` and the existing 15-second poller.
Focus and reconnect trigger a fresh read. Last action shows Just now for the first
minute, followed by whole minutes, hours or days. Its display timer wakes at minute
boundaries instead of every second. Presence leases still expire at their exact
individual deadlines. Both use server observation time plus a monotonic browser
clock. The client never submits timestamps. Errors retain the last known action, label it as such, and show
Unavailable for status with the existing retry control.

## Storage and access

`private.player_presence` stores a lease per live Auth session and random mounted-tab ID.
Independent tab rows mean an idle/closed tab cannot override a different active tab.
Expired rows are pruned on the account's next report; session deletion cascades its rows.
`private.character_actions` stores one timestamp per character. Character deletion
removes both kinds of record. Both tables have RLS and no client table grants.

The presence RPC validates the calling account and its matching, unexpired Auth session.
It accepts only tab identity and activity flags; it cannot target another player or set
arbitrary dates. Heartbeat writes are throttled to ten seconds except for state changes.
The profile exposes only aggregate connection deadlines and the latest action, never
account IDs, session IDs, tab IDs or command details. Registered-player access remains
required. Action receipts update timestamps atomically through private triggers;
manual combat rounds and defence changes record them inside the command transaction.

Existing characters show Not recorded yet until their first tracked action. Neither
creation dates nor earlier account-statistics heartbeats are treated as historical
character actions. Configuration regeneration preserves all recorded timestamps.

Account analytics retain their separate daily activity definition; see
[Player statistics](PLAYER_STATISTICS.md). A presence heartbeat does not fabricate
another login or replace the analytics collection.

## Verification

- Unit tests: relative time boundaries, missing history, independent online/idle leases
  and expiry using elapsed server time.
- Database tests: live/expired/revoked/foreign sessions, private storage, registered
  profile reads, multiple tabs, heartbeat and passive refresh exclusion, receipt replay,
  rejected commands, expired-row cleanup and deletion.
- Browser tests: own/other profiles, automatic status and action updates, idle timeout,
  returning to play, multiple tabs, logout, failed refresh/retry and responsive layouts.

Canonical SQL: `supabase/templates/gameplay/presence.sql` and `profile.sql`.
Presence settings live in `config/gameplay.json`; regenerate with `npm run config:sync`
and apply locally with `npm run db:migrate`.

Crafting receipts also record Last action in the same transaction as the inventory
change. Replaying a saved craft or rejecting insufficient materials does not move
the timestamp. See [Crafting](CRAFTING.md).
