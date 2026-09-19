# First foundation architecture

## Central configuration

Editable settings live under `config/`. The app imports browser-safe JSON through `src/config/public.ts`;
server settings use a separate server-only module. `supabase/templates/gameplay.sql` is the maintained SQL
source, rendered with validated gameplay values into append-only migrations. Root tool configuration files
are thin adapters. UI styles are generated from `config/interface.css.template`; theme tokens are direct CSS.
A public revision fingerprint and request-scoped server check prevent an app build from silently using a
different gameplay configuration than its database. Existing data, snapshots, grants and historical migrations
are preserved. See [CONFIGURATION.md](CONFIGURATION.md) for workflow and deploy constraints.

## Application

Next.js App Router, React, TypeScript and Tailwind. The accepted Caribbean harbor
artwork is served locally from `public/images/harbor.webp`. Shared CSS tokens and
React components implement the compact left navigation and blue panel design.

Server Components load the current player. Client Components handle input,
validation feedback, password visibility, pending states and the active navigation.
Server Actions perform account and character mutations. No browser storage or
mock data substitutes for the database.

## Navigation and loading

The game uses Next.js client-side navigation with normal URLs. The shared
`(game)/layout.tsx` keeps the character, resource bars and harbor menu mounted
while the main content changes. Deep links and browser back/forward continue
to work.

`(game)/loading.tsx` puts the loading boundary inside that layout. The harbor
reuses it in `harbor/loading.tsx` so transitions between its child routes have
their own boundary. A small spinner and a screen-reader status replace only
the pending content. The menu
remains usable, including choosing another destination while a response is
pending. The clicked menu icon also shows pending feedback if the route's
loading UI has not yet arrived. Both indicators respect reduced-motion settings.

Harbor navigation uses `Link` with `prefetch="auto"`. Next.js preloads what it
can, including the loading boundary for dynamic views; current private data
still comes from the authenticated server. This uses the router's cache, with
no custom long-lived cache for resources, stats or account data. Existing
training revalidation and resource refreshes merge server updates into the
current UI without a browser document reload.

Automatic prefetching runs in production mode. Use `npm run build` and
`npm run start` to assess it locally; `npm run dev` also has compilation
overhead and does not represent production navigation speed.

The root scroll container reserves a stable scrollbar gutter. Long views such
as the harbor roster and shorter training/loading views therefore keep the same
frame width and horizontal position when a classic scrollbar appears or disappears.
Browser layout checks must include visible classic scrollbars; headless Chromium
hides them by default and can conceal this type of layout shift.

## Routes

| Route | Behavior |
| --- | --- |
| `/` | Routes to login or the harbor; incomplete older accounts can finish their name choice. |
| `/register` | Character name, email and password, password confirmation; creates account and character together and opens the harbor. |
| `/login` | Email/password login. |
| `/forgot-password` | Requests a reset email with a neutral account-existence response. |
| `/auth/callback` | Exchanges a PKCE authorization code and accepts only fixed local destinations. |
| `/auth/link-error` | Recovery from expired, reused or invalid account links. |
| `/reset-password` | Sets a new password for an authenticated session. |
| `/create-character` | Compatibility path for older unfinished accounts only; all new registrations already have a character and return to the harbor. |
| `/inventory` | Owned item stacks and equipment instances, category/search filters, inline details and confirmed Trash. Readable in Hospital. |
| `/characters/[characterId]` | Identity profile, Attack link, own defence orders and latest combat report. |
| `/attack/<characterId>` | Shareable target URL, unchanged during preparation, start and join. |
| `/combatlog/[battleId]` | Public completed combat report, readable without login. |
| `/combat/prepare/[id]`, `/combat/[id]` | Legacy redirects to the attack screen or public report. |
| `/harbor` | Saved character, harbor overview and live captain directory. |
| `/harbor/marketplace` | Placeholder view. |
| `/harbor/shipyard` | Placeholder view. |
| `/harbor/crew-training` | Immediate drills, training XP, purchased exercises and Perfect Drill. |
| `/harbor/ship-upgrades` | Timed work, automatic offline completion, XP and purchased workshops. |

## Authentication

Supabase Auth owns passwords and sessions. Registration requires no email
confirmation in this development release, as requested by the owner.
Anonymous sign-in is disabled. The development password minimum is six characters, matching local Supabase Auth.
There are no uppercase, number or symbol requirements. The app retains its 128-character input cap.

`src/proxy.ts` refreshes and validates sessions with `getClaims()`, propagates
updated cookies and sets private, non-cacheable response headers. Server-side
authorization additionally calls `getUser()` for a fresh account lookup.
All private pages and mutations require an authenticated account; a layout alone
does not authorize a Server Action.

The app needs only the publishable key. It does not use a service-role key.
Authorization does not trust user-editable metadata. Cookie-based Server Actions
use Next.js origin checks. The callback destination is restricted to `/` and
`/reset-password`; `SITE_URL` supplies the trusted origin.

Auth request limits are enforced by Supabase, including direct Auth API calls.
Password reset also has a visible resend cooldown. Local rate limits are explicitly
for development. Public operation needs an email provider and suitable abuse controls.
Query logging is disabled so callback codes are not written to Next.js access logs.
Password reset ends existing refresh sessions and asks the player to log in again.
Existing access tokens retain their normal expiry under Supabase's session model.

## Character persistence

`public.characters` stores ID, owning account ID, display name, generated name key,
fixed start location and creation timestamp. Account and character IDs are separate.
The same row now also stores Energy, its recovery timestamp, Ship Health, Crew
Health and four stats each for the persistent ship and crew. It also holds defence
orders, health recovery anchors and incoming attack protection. Shared PvP is
implemented. Carried Gold Coins and bank balances are also stored on this row.
Training tier purchases and inventory viewing/destruction are implemented. Income, equipment effects and consumable use remain future work. Permanent character death has been removed; defeat leads to Hospital.

An `auth.users` insert trigger creates the character in the same transaction as
registration. It reads only `character_name` from user metadata, validates it via
the table constraints and assigns the owner from `new.id`. A rejected name rolls
back the account as well. Changes to Auth metadata after registration never alter
the saved character. Anonymous sign-in remains disabled; the trigger does not
create characters for anonymous Auth records.

Two constraints guarantee one character per account and case-insensitive name
uniqueness. Names are normalized to NFC with single internal spaces. Names may contain numbers, symbols and emoji, including one-character names.
The previous 3-24 character and letter-only rules have been removed. SQL checks
still reject empty or unnormalized direct API input. Future name changes are not
available. The unique account constraint makes concurrent creation safe.

`is_character_name_available` exposes only a boolean for a proposed name. It is a
public registration hint, not authorization or a reservation. Character rows,
account IDs and email addresses remain private. The registration action checks
availability before signup and again after a rejected signup to explain name
conflicts. Database constraints decide simultaneous requests.

The authenticated database role can select its own row and insert **only the
display_name column**. IDs, owner, location and timestamps are database defaults.
This insert permission is retained for older unfinished development accounts.
It cannot update or delete characters, and the unique owner constraint prevents
any existing player from creating a second character. RLS policies restrict reads and inserts to
the current account, including direct requests to Supabase's Data API.

`private.is_registered_player()` is a narrowly scoped security-definer helper. It
reads only the caller's server-owned Auth record to reject anonymous or deleted
accounts. It has a fixed empty search path, is outside the exposed API schema,
and is executable only by authenticated callers. The application cannot supply
another account ID to it.

The first migration created verification checks. The second records the owner's
decision to allow development signup without email confirmation. The third adds
atomic character creation during signup and the availability function. Apply all
three in order; do not edit applied migration history. A fourth migration adds
resources and training; its timestamp follows the existing migration history. Existing characters are
preserved, and unfinished older accounts are not assigned invented names.

The trigger follows [Supabase's documented user-data pattern](https://supabase.com/docs/guides/auth/managing-user-data).
Both new functions use fixed empty search paths. The trigger function is private
and cannot be called directly by clients.

## Resources and training

The character row owns one ship and crew's stats for that character's life.
`get_game_state()` is a security-invoker RPC calling an authenticated private
function. It locks the caller and any combat peer, settles an expired encounter,
and reads health alongside the current engagement. Ordinary Energy and health
recovery are computed from database time, capped at 100. The shared
`private.energy_snapshot` function preserves incomplete five-minute intervals
and discards banked time at the cap. Energy recovers five points per complete five-minute interval,
clamped to capacity; recovery amount and interval are independently configurable.

Training uses public train_crew, purchase_training_tier and start_ship_upgrade RPCs.
A private authenticated mutator owns validation, RNG, Energy, carried-gold debits and XP.
The old public/private train_stat functions are removed. All eight stats and XP use bigint
within JavaScript's safe integer range. Character row types are separate from derived game state.

Private catalogs, per-character progression, idempotency receipts and ship jobs are protected by
RLS and revoked client table access. Stable tier IDs and positions are guarded during config sync.
The highest purchased tier applies automatically. Same-request retries return the stored receipt
without rerolling, debiting or awarding twice; payload mismatches are rejected.

Ship jobs snapshot their workshop, cost, gain, XP, revision and timestamps at start. A partial
unique index permits one unapplied job per captain. Internal settlement runs under combat locks
before game-state reads and new actions. Combat preview and actual start settle both captains
using the same observed_at as the fresh snapshots. Completion during an encounter only updates
durable character stats; existing participant and defender snapshots remain frozen.

The client shows separate crew and ship panels. Actions revalidate the shared layout, while
owner-only revision events update other tabs. The game context refreshes at ship deadlines,
resource recovery, protection/combat deadlines and focus/reconnection. Its clock never grants
rewards. Pending work completes logically offline and is materialized on server access without
a worker. Only active attackers are blocked from new manual training and purchases.

See [the implemented training scope and balance](TRAINING_FOUNDATION.md).

## Gold Coins and banking

Carried Gold Coins and bank balances are separate nonnegative bigint fields on the
owner-only character row. Only carried gold may fund purchases; bank funds
must be explicitly withdrawn. Both start at zero. Values remain within the configured
safe JavaScript integer range. See [the bank specification](GOLD_COINS_AND_BANK.md).

The authenticated transfer_gold RPC calls a private mutator with fixed search_path.
It uses the existing ordered combat locks, validates the amount and destination limit,
and changes both balances atomically. A private transfer receipt keyed by character
and request ID makes retries idempotent. Direct client writes remain revoked.
Only the owner's revision signal is broadcast through player_game_events.
The shared game state and resource sidebar reflect successful transfers across tabs.

## Shared PvP encounters

/attack/<characterId> is the full-width preparation and attack screen. The URL always identifies the target;
opening another attacker\'s copied URL shows the current viewer\'s preparation and Join battle. The server resolves
the viewer\'s own encounter from game state, never from a shared attacker-specific URL. AttackSession remembers the
encounter during this visit and opens its public report on completion if the captain survives. Hospital takes precedence for a defeated captain. Fresh visits show preparation again.
Legacy target/battle query URLs redirect to the target path. The root AppFrame removes regular game chrome. Active attackers have a persistent
database reservation; Proxy checks get_navigation_lock for page requests and AppFrame also guards cached
client navigation. Ordinary mutations independently enforce their own permissions. Attack Server Actions
revalidate the root layout. Defenders have no navigation lock.

Private combat_participants stores per-attacker snapshots, rounds, phases, ammunition, deadlines and contribution.
combats stores the shared defender and outcome. Ordered participant locks serialize each encounter, while unrelated
encounters remain independent. Final blow and assists are saved atomically with health and the event log.
The first terminal action wins; later queued orders cannot change the result.

Private immutable combat_hit_chance, combat_damage_reduction and combat_damage functions own combat math.
Accuracy versus enemy Speed uses a Torn-inspired ratio curve with true 0% and 100% hit chances at 1:64 and 64:1.
Attack versus Defense uses logarithmic mitigation, with the owner-selected full block at 25x Defense.
Damage retains at least one HP below that threshold, then reaches zero at full mitigation. Base damage grows
logarithmically with absolute Attack, with 32 damage at the starting stats of 10. New character defaults are 10 for all eight stats;
existing progression is preserved. Both ship and crew resolvers
use these functions for attacks and counters. Clients cannot invoke the helpers or supply outcomes; UI only
renders the server result, distinguishing misses from blocked hits. Snapshots and historical events are preserved.

public.player_game_events publishes only an owner-readable revision through Supabase Realtime. The app revalidates
server data after signals, reconnect and focus, with a 15-second fallback. Raw combat state remains private.
Defenders see live health in their normal game pages and may train; snapshot stats do not change mid-encounter.

get_combat_log is a deliberately public, read-only, fixed-search-path security-definer entrypoint. It returns
an explicit projection of completed encounters only, with no account identifiers, hidden stats, ammunition or presets.
The /combatlog/[battleId] page requires no login. Other combat RPCs require registered accounts and participant checks.
Combat event timestamps are displayed as server time in UTC; local round counters remain internal to event ordering
and command validation. The combat_people projection aggregates ship_damage and crew_damage by event phase for each
attacker and all defender counters, using the existing combat_id index. Historical events remain unchanged.
All displayed captain names in combat and reports link to character profiles.

Migration ten, 20260916022241_shared_attack_encounters.sql, preserves existing history and adds the shared model.
See [COMBAT_SYSTEM.md](COMBAT_SYSTEM.md) for authoritative current rules, bounds and recovery behavior.


## Harbor roster and Realtime

`public.harbor_players` is a server-maintained projection containing only
`character_id` and `display_name` for characters in The Harbor. Authenticated,
registered accounts may read it through RLS. Client writes are revoked. The
private character table remains owner-only and is not in the Realtime publication.

A private trigger synchronizes character insertion and name/location changes;
a cascading foreign key handles removal. Training does not touch the projection.
`list_harbor_players` is a security-invoker RPC returning an ordered page of up
to 20 names plus count and a clamped page index from one database snapshot.

The Harbor server component renders the initial page. A cookie-aware Supabase
browser client resolves cookie-backed Realtime authentication before subscribing,
waits for replication readiness, and subscribes to Postgres Changes on the projection. It reloads the
current page on changes, initial subscription and reconnection. Snapshot requests
are serialized, coalesced and cancelled on unmount. Connection problems retain
the last snapshot with an explicit stale-state message and retry control.
Realtime is enabled locally; only the projection is published. No Presence or
online-only semantics are used. See [the roster specification](HARBOR_ROSTER.md).

## Character profiles

Authenticated character profiles at `/characters/[characterId]` load only
`character_id`, `display_name`, `location` and `created_at` from
`public.character_profiles`. The table uses the existing registered-player
RLS guard and grants authenticated SELECT only. A private trigger synchronizes
identity fields from `characters`; the sixth migration backfills existing rows,
and the foreign key cascades deletions. Private stats are not exposed or published.

The server page validates the UUID and requires the viewer's own character.
The persistent sidebar always belongs to the viewer. The character panel links
to the viewer's profile, and the harbor list links to other profiles.
Profile loading, missing records and page errors stay inside the game layout.
See [the implemented profile scope](CHARACTER_PROFILES.md).

## Local environment and cloud handoff

Supabase runs as the isolated Docker project `one-life-at-sea`. PostgreSQL and Auth
data survive `supabase stop` and subsequent starts. Never use `--no-backup` or
`db reset` to restart ordinary development.

The requested hosted project in Auxron could not be created because the owner's
two active Free project slots are occupied. No existing hosted projects were
paused or changed. All database mutations and browser tests use the local project.

When a hosted slot is available, create the project, apply the recorded migrations,
set the development Auth settings and redirect allowlist, then replace the local
URL and publishable key in the ignored `.env.local`. Rebuild after changing
`NEXT_PUBLIC_` variables. Production email delivery remains a separate setup step.

## Dependencies

Versions and the npm lockfile are pinned. TypeScript 6.0.3 and ESLint 9.39.5 match
the current Next.js ESLint integration: TypeScript 7 and ESLint 10 caused concrete
plugin failures during setup. ESLint 9 is past upstream support; track the Next.js
plugin updates before the first public release rather than silently removing lint.

### Next.js stream cancellation diagnostic

The rapid invalid-profile navigation check can produce
`The destination stream closed early.` in the Next.js 16.3.5 server log.
Browser instrumentation observed cancelled prefetch/navigation requests around
these transitions. Profiles, local not-found handling, login redirects and
browser history all passed, with no browser JavaScript errors. This matches the
[upstream client-aborted RSC stream report](https://github.com/vercel/next.js/issues/96704).
The diagnostic is retained; no log filter or dependency patch hides it. Recheck
it when adopting an upstream fix.

## Hospital and persistent characters

Hospital at `/harbor/hospital` replaces permanent death for every damage source. A private
health trigger admits a character at zero Crew Health and also zeros Crew Health when the
ship sinks. The stay is stored as server timestamps and lasts `hospital.durationSeconds`
(default 300). Discharge restores both health resources to their configured maximum while
preserving identity, stats, progression and gold. Passive Energy and existing ship jobs continue.

The common combat-context settlement acquires ordered participant locks, ends encounters
interrupted by external lethal damage and discharges expired patients. Manual mutations assert
that the owner is not hospitalized; target eligibility also rejects patients. `get_navigation_lock`
combines hospital and attack state, with hospital taking precedence in proxy and root layout.
Server page guards and client updates cover cached navigation and direct routes.

`public.hospital_patients` exposes only character ID, name and expiry to registered users,
with read-only RLS and Realtime. The paged RPC filters expiry using database time, so offline
patients disappear without a worker. Deadline refresh and focus/reconnect polling reconcile
missing events. Character HP is persisted at next server access. See [HOSPITAL.md](HOSPITAL.md).

Profile reading is permitted during hospital stays in both proxy and cached client navigation.
`get_hospital_status` reads the existing RLS-protected patient projection and returns only
an active deadline and database observation time. ProfileDetails subscribes to patient events,
refreshes at expiry/focus/reconnection and shows the same countdown component as Hospital.
All registered players see the status; anonymous profile access remains disabled. Defence
editing and attacks remain blocked while hospitalized.

## Inventory

Inventory at /inventory has owner-only, database-backed item stacks and individual
equipment instances. Category filters and literal name search apply before stable
server pagination. Expanding a row shows its description, effect text, large image
and saved stats. Equipment and consumable controls are present but disabled in
this phase; Trash is functional.

The catalog is validated under gameplay.inventory and synchronized through the
canonical SQL template. Category/item IDs are durable; config sync rejects removal
or changing an item's kind/slot, and preserves owned quantities and instance stats.
All five tables live in private with RLS and no direct client grants. Invoker RPC
wrappers delegate to private functions that verify the registered owner.

Trash uses existing ordered combat/character locks followed by the inventory row
lock. An owner-scoped request receipt and the mutation commit together. Replays
return the previous result even after an item row has been removed; a changed
payload fails. New destruction is blocked in Hospital and for active attackers.
Owned entries remain private, and owner-only game revision events refresh other tabs.
Circulation exposes only world totals and timestamps, without owner identities.

Inventory joins profiles and Hospital in the shared hospital read-route exception.
It does not bypass other gameplay restrictions. Future medical use will receive
a specific action exception when actual consumable effects are implemented.

New and existing characters have no automatic item grants. A local-only fixture
command is available for an explicitly chosen test character. There is no public
grant endpoint, shop, equipment effect or consumable effect yet.
See [INVENTORY.md](INVENTORY.md) for schema, migration and local fixture details.


### Item circulation

World totals and transaction history are stored in two additional private tables
with RLS and no direct client access. Statement triggers aggregate item ownership
deltas and update counters/history atomically, including character-delete cascades.
Owner/stat-only updates do not change circulation. Numeric totals cross JSON as
decimal strings to preserve exact counts beyond JavaScript's safe integer range.

The registered-player RPC exposes a bounded time series. A baseline carries the
last known count into each requested range; no data is invented before tracking.
Short histories return changes, while long histories use bounded indexed lookups.
The full history remains durable. Inventory refreshes update counts; the chart is
loaded only when expanded and refreshes through the existing visible-page cadence.
See [ITEM_CIRCULATION.md](ITEM_CIRCULATION.md).
