# Project architecture

## Central configuration

Editable settings live under `config/`. The app imports browser-safe JSON through `src/config/public.ts`;
server settings use a separate server-only module. `supabase/templates/gameplay.sql` lists the ordered
modules under `supabase/templates/gameplay/`. They are combined and rendered with validated gameplay
values into append-only migrations. Splitting the source does not change the generated SQL or revision. Root tool configuration files
are thin adapters. UI styles are generated from `config/interface.css.template`; theme tokens are direct CSS.
A public revision fingerprint and request-scoped server check prevent an app build from silently using a
different gameplay configuration than its database. Existing data, snapshots, grants and historical migrations
are preserved. See [CONFIGURATION.md](CONFIGURATION.md) for workflow and deploy constraints.

## Application

Next.js App Router, React, TypeScript and Tailwind. The accepted Caribbean harbor
artwork is served locally from `public/images/harbor.webp`. Shared CSS tokens and
React components implement the nautical navy-and-gold interface. The owner-supplied
scenery is served as public/images/harbor-background.webp on a fixed decorative
layer behind the centered game frame. The document scrolls normally; the compact
harbor banner, sidebar resources and all gameplay views share the same theme.
See [interface design](INTERFACE_DESIGN.md) for responsive behavior and asset ownership.
The backdrop follows a shared UTC day/night cycle: night starts at 21:00 and day
at 06:00. The root render reads request-time server clock data; WorldClock keeps
the body period current with monotonic elapsed time and uncached clock reads.
See [day and night](DAY_NIGHT_CYCLE.md) for recovery and future gameplay boundaries.

Server Components load the current player. Client Components handle input,
validation feedback, password visibility, pending states and the active navigation.
Server Actions perform account and character mutations. No browser storage or
mock data substitutes for the database.

Modal dialogs are centered horizontally and vertically in the viewport by the shared
CSS default, unless a specific design explicitly overrides placement. Dialogs constrain
height to the viewport and scroll internally. Use DialogCloseButton for the small upper-right
close control and o-dialog-title on the heading to reserve space for it. Inventory destruction
and admin record dialogs follow this convention; closing does not submit their forms.

Shared lifecycle helpers live in `src/hooks/` and `src/lib/`. Hospital, ship and combat timers use
`useServerCountdown`; the hospital roster and profile use `createSnapshotPoller` to serialize reads,
coalesce events, recover after failures and discard responses after unmount. `subscribeToForeground`
owns focus/online/visibility listeners. AppFrame alone refreshes shared game state on foreground events;
GameStateProvider owns resource deadlines. See [code organization and maintenance](CODE_MAINTENANCE.md).

## Navigation and loading

The game uses Next.js client-side navigation with normal URLs. The shared
`(game)/layout.tsx` keeps the character, resource bars and harbor menu mounted
while the main content changes. Deep links and browser back/forward continue
to work.

`GameNavigationProvider` and `GameLink` mirror Next.js's pending link state into
the main content area before a slow server response or loading boundary arrives.
The selected harbor destination updates immediately; menu icons stay unchanged.
`GameContent` hides and disables the previous view while keeping its components
mounted until the router commits, preserving in-flight action handling. The economy
request journal stays mounted outside this switch. Saved requests keep new mutations
blocked, but the recovery panel waits for the character's Web Lock to be released
and checks storage again. Normal in-flight actions therefore never display an
unconfirmed-action panel, including in other tabs; unresolved receipts still do.
Only the latest pending link can
clear the shared indicator. Modified clicks, keyboard navigation, history and
prefetching remain owned by Next.js.

`(game)/loading.tsx` and `harbor/loading.tsx` reuse `ContentLoading` when the router
streams the next view. Loading stays in the content area, includes a screen-reader
status and respects reduced motion. The menu remains usable while a response is
pending. Both pending links and loading boundaries hold background refreshes so a
focus or realtime update cannot override the chosen navigation.

Harbor navigation uses `Link` with `prefetch="auto"`. Next.js reuses layouts,
code and prefetched loading boundaries; private page snapshots are still checked
on the server. There is no added persistent TTL cache for resources, inventory,
listings or permissions. Realtime, mutation revalidation and resource deadlines
continue to reconcile authoritative game state without a browser document reload.

The server Supabase client is memoized with React `cache` within a server render,
never shared between player requests. Existing request-scoped player/revision reads
are reused. Independent admin/character and character/revision reads run concurrently
to shorten serial server waits. Auth checks, gameplay revision checks and proxy
navigation locks still run. See [NAVIGATION.md](NAVIGATION.md) for the verification scope.

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
| `/api/world-time` | Public uncached UTC time, period and next transition. No auth, gameplay state or navigation locks. |
| `/forgot-password` | Requests a reset email with a neutral account-existence response. |
| `/auth/callback` | Exchanges a PKCE authorization code and accepts only fixed local destinations. |
| `/auth/link-error` | Recovery from expired, reused or invalid account links. |
| `/reset-password` | Sets a new password for an authenticated session. |
| `/create-character` | Compatibility path for older unfinished accounts only; all new registrations already have a character and return to the harbor. |
| `/inventory` | Owned item stacks and equipment instances, category/search filters, inline details and confirmed Trash. Readable in Hospital. |
| `/players` | Registered-player directory with name/public-number search and pagination. |
| `/players/[playerNumber]` | Identity profile, permanent public number, Attack link and own defence orders. |
| `/characters/[characterId]` | Compatibility redirect from character UUID to the public-number profile. |
| `/attack/<playerNumber>` | Shareable target URL, unchanged during preparation, start and join. Legacy UUID addresses redirect here. |
| `/combatlog/[battleId]` | Public completed combat report, readable without login. |
| `/combat/prepare/[id]`, `/combat/[id]` | Legacy redirects to the attack screen or public report. |
| `/harbor` | Saved character, harbor overview and live captain directory. |
| `/harbor/marketplace` | Most Popular, category/search grid, item details and offers expanded in batches of 20 with purchasing. |
| `/harbor/marketplace/add` | Batch listing form for owned tradable items. |
| `/harbor/marketplace/listings` | Own active offers and cancellation with inventory return. |
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
server-owned location and creation timestamp. Account and character IDs are separate.
The same row now also stores Energy, its recovery timestamp, Ship Health, Crew
Health and four stats each for the persistent ship and crew. It also holds defence
orders, health recovery anchors and incoming attack protection. Shared PvP is
implemented. Carried Gold Coins and bank balances are also stored on this row.
Training tier purchases, inventory viewing/destruction and player-to-player item trading are implemented. Other income sources, equipment effects and consumable use remain future work. Permanent character death has been removed; defeat leads to Hospital.

An `auth.users` insert trigger creates the character in the same transaction as
registration. It reads only `character_name` from user metadata, validates it via
the name-validation trigger and table constraints and assigns the owner from `new.id`. A rejected name rolls
back the account as well. Changes to Auth metadata after registration never alter
the saved character. Anonymous sign-in remains disabled; the trigger does not
create characters for anonymous Auth records.

Two constraints guarantee one character per account and case-insensitive name
uniqueness. Names are normalized to NFC. New names and administrative renames cannot
contain Unicode numbers or whitespace; symbols, emoji and one-character names
remain valid. The forms, server actions and database enforce the rule. Existing
names remain usable without forced renaming. There is no self-service rename UI.
The unique account constraint makes concurrent creation safe. See [character names](CHARACTER_NAMES.md).

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
`private.energy_tick_snapshot` function counts fixed UTC boundaries: +5 every five minutes
at harbor and every ten minutes at sea, including travel. Energy is an integer with a natural recovery cap of 100 and a storage limit of 1,000,
with no time banked at the cap. `energy_updated_at` is a settlement checkpoint, not a
player-specific timer. Offline recovery uses the same boundaries; no per-player worker or cron
is required. `energy_next_at` gives the next server boundary for UI refresh and display.
Recovery amount and base interval are configurable; the sea interval is twice the base.
See [Energy recovery](ENERGY_RECOVERY.md).

Crew Morale is stored as exact numeric with a one-decimal constraint, starting at 0
within -100..100. Its separate timestamp counts fixed five-minute boundaries in
every location: each tick moves 5 towards zero, including offline and combat.
Game state derives morale and its next deadline without writing on reads.

Crew drills apply the pre-action morale multiplier once to the permanent-stat
base gain, round to six decimals, apply Perfect Drill, and spend 0.5 morale per
Energy atomically. Combat snapshots multiply all four Crew stats by the captured
morale factor at entry; permanent stats, Ship stats and health are unchanged.
Existing combat snapshots remain valid. The client uses integer arithmetic for
the final morale multiplication to match PostgreSQL's positive half-up rounding.

The Tavern offers a +25 Crew Morale meal for 1,000 carried Gold Coins, with no
Energy cost. The authenticated public buy_tavern_meal wrapper delegates to a
private mutator with character/combat locks, expected-offer checks, and durable
per-character receipts. Meals share the browser journal used by the other economy
actions. See [Crew Morale](CREW_MORALE.md).

Training uses public train_crew, purchase_training_tier and start_ship_upgrade RPCs.
A private authenticated mutator owns validation, RNG, Energy, carried-gold debits and XP.
The old public/private train_stat functions are removed. XP stays bigint; both groups'
stats, tier efficiency and job stat_gain use numeric to retain fractional improvements. Their existing
safe-integer ceiling is preserved. Character row types are separate from derived game state.
The ship RPC accepts energy_amount instead of a size ID. A whole amount from the configured
minimum (5) through recovered current Energy determines cost, duration (6 seconds per Energy)
and stat-dependent rewards. private.training_gain rounds each Energy unit to six decimals
using (efficiency / energyPerUnit) * (1 + virtualStat / statScale)^statExponent, then
advances virtualStat before the next unit. Crew uses the same helper for five Energy,
followed by the captured morale multiplier and one Perfect Drill roll that can double the full normal gain. Sequential ship
jobs on the same stat and tier therefore preserve the exact gain regardless of job sizes.
New receipts preserve the starting stat, normal gain, efficiency and configuration revision. Old jobs retain their snapshots;
the nullable size_id and old size catalog remain historical metadata only.

Private catalogs, per-character progression, idempotency receipts and ship jobs are protected by
RLS and revoked client table access. Stable tier IDs and positions are guarded during config sync.
The highest purchased tier applies automatically. Same-request retries return the stored receipt
without rerolling, debiting or awarding twice; payload mismatches are rejected.

Ship jobs snapshot their workshop, cost, gain, XP, revision and timestamps at start. A partial
unique index permits one unapplied job per captain. Internal settlement runs under combat locks
before game-state reads and new actions. Combat preview and actual start settle both captains
using the same observed_at as the fresh snapshots. Completion during an encounter only updates
durable character stats; existing participant and defender snapshots remain frozen.

The client shows separate crew and ship panels. Owned stats show at most two decimals
below 10000 and rounded whole numbers from 10000; gains always show at most two
decimals, including large gains. Formatting never changes stored precision or calculations. Actions revalidate the shared layout, while
owner-only revision events update other tabs. The game context refreshes at ship deadlines,
resource recovery, protection/combat deadlines and focus/reconnection. Its clock never grants
rewards. Pending work completes logically offline and is materialized on server access without
a worker. Both active attackers and defenders are blocked from new manual training and purchases.

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

/attack/<playerNumber> is the full-width preparation and attack screen. The URL always identifies the target;
opening another attacker\'s copied URL shows the current viewer\'s preparation and Join battle. The server resolves
the viewer\'s own encounter from game state, never from a shared attacker-specific URL. AttackSession remembers the
encounter during this visit and opens its public report on completion if the captain survives. Hospital takes precedence for a defeated captain. Fresh visits show preparation again.
Legacy target/battle query URLs redirect to the target path. The root AppFrame removes regular game chrome. Active attackers have a persistent
database reservation; Proxy checks get_navigation_lock for page requests and AppFrame also guards cached
client navigation. Ordinary mutations independently enforce their own permissions. Attack Server Actions
revalidate the root layout. Defenders have no navigation lock, but all character-changing actions
are locked while engaged. Inventory inspection, profiles, bank balances, training pages and saved
scouting lists remain readable. The shared assert_can_act guard rejects combat engagement for
training, banking, item destruction, market mutations and defence orders under the same locks as attack start.
Travel and scouting enforce engagement checks in their location-specific mutators. Existing
receipt replays remain readable without performing new actions. Clients use active_combat_id,
not the attacker-only route lock, and refresh disabled controls on owner revision events.
A defender remains locked until the encounter ends, including when one of several attackers leaves.

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
`character_id`, `display_name` and a nullable `arrives_at` for docked captains
and scheduled returns. RLS hides returns until their database deadline. Authenticated,
registered accounts may read it through RLS. Client writes are revoked. The
private character table remains owner-only and is not in the Realtime publication.

A private trigger synchronizes character insertion and name/location changes;
a cascading foreign key handles removal. Training does not touch the projection.
`list_harbor_players` is a security-invoker RPC returning an ordered page of up
to 20 names plus count, clamped page index, observation time and next arrival
from one database snapshot. Due returns appear even without owner login.

The Harbor server component renders the initial page. A cookie-aware Supabase
browser client resolves cookie-backed Realtime authentication before subscribing,
waits for replication readiness, and subscribes to Postgres Changes on the projection. It reloads the
current page on changes, initial subscription, reconnection, next arrival and a
fallback timer. Minimal profile events also announce scheduled returns. Snapshot requests
are serialized, coalesced and cancelled on unmount. Connection problems retain
the last snapshot with an explicit stale-state message and retry control.
Realtime is enabled locally; only the projection is published. No Presence or
online-only semantics are used. See [the roster specification](HARBOR_ROSTER.md).

## Character profiles

Authenticated character profiles at `/players/[playerNumber]` load only
`character_id`, `player_number`, `display_name`, `location` and `created_at` from
`public.character_profiles`. The table also holds `arrives_at` and
`arrival_location`, `max_sea_distance` and optional `arrival_max_sea_distance`.
`get_character_status` resolves coarse location and the reached distance record
against database time and combines them with Hospital status. These public fields are
published to Realtime; private character and route fields are not. The table uses the existing registered-player
RLS guard and grants authenticated SELECT only. A private trigger synchronizes
identity fields from `characters`; the sixth migration backfills existing rows,
and the foreign key cascades deletions. Private stats are not exposed or published.

The server page validates the public number and requires the viewer's own character.
Legacy UUID profile paths redirect to the number address. The `/players` directory searches
this same public projection by name or number, respecting its RLS. See [player IDs](PLAYER_IDS.md).
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

A targeted admin browser test on 2026-09-20 also reproduced the existing
`MaxListenersExceededWarning` for Gzip with `NODE_OPTIONS=--trace-warnings`.
The stack points to `next/dist/compiled/compression/index.js` forwarding drain
listeners from `next/dist/compiled/next-server/app-page-turbo.runtime.prod.js`.
The scenario passes. Track this with the framework stream diagnostics; do not
suppress listener warnings or patch installed dependencies to conceal it.

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
`get_character_status` reads the RLS-protected patient and profile projections,
returning coarse location, arrival, Hospital deadline and observation time.
The older `get_hospital_status` remains for compatibility. ProfileDetails subscribes to both event streams,
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
payload fails. New destruction is blocked in Hospital, at sea and for all active combat participants.
Owned entries remain private, and owner-only game revision events refresh other tabs.
Circulation exposes only world totals and timestamps, without owner identities.

Inventory joins profiles and Hospital in the shared hospital read-route exception.
It does not bypass other gameplay restrictions. Future medical use will receive
a specific action exception when actual consumable effects are implemented.

New and existing characters have no automatic item grants. A local-only fixture
command is available for an explicitly chosen test character. The admin panel has a membership-protected item grant RPC. There is no player-accessible
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

## Marketplace

The harbor market reuses inventory art, descriptions and circulation, with a
responsive grid and full-row expansion for details or offers. Most Popular orders
by actual units sold in a rolling 12-hour window; category views order by cheapest
available unit price. Cards show price and available quantity on one line. Offers
start with 20 compact rows and expand by 20 through Show more listings. Each refresh
returns one ordered snapshot of the expanded prefix, avoiding gaps or duplicates
when stock changes between requests. Add Listings supports a bounded batch with selections kept
across filters. Own listings can be cancelled for their remaining stock.

Private listings hold escrow outside inventory. Equipment retains its original
instance ID, stats and creation time; stacks merge on transfer. Escrow uses the
same circulation triggers, so listing, purchasing and cancellation conserve world
totals. Sales history retains quantities and timestamps if a referenced account is
later removed, without retaining the deleted identity.

Buy/create/cancel RPCs enforce the registered actor, harbor access, combat and
hospital restrictions. Existing offers can sell while their owner is away.
Ordered participant locks precede listing and circulation locks; batch circulation
locks use item ID order. Inventory, stock, carried balances, sales and receipts
commit atomically. Bank balances never fund purchases. A captured fee in basis
points is applied to cumulative listing revenue, rounded down, with the difference
charged on each purchase so splitting a purchase cannot evade the fee.

Clients cannot access private tables directly. Public item revision events carry
no account or balance data; owner-only game events refresh inventory and proceeds.
Retries keep the request UUID and replay a stored receipt, including when an offer
has disappeared after a lost success response. See [Marketplace](MARKETPLACE.md)
for rules, configuration and source files.

## Administration

The separate /admin route provides player tools, a 25-table database browser and
audit history. Database-owned membership is rechecked on every RPC; immutable
request receipts commit with writes. Public wrappers are invokers and private
definers use fixed search paths and explicit authorization. No service credential
is needed. Row editing uses ordered combat locks and optimistic row fingerprints.
Inventory changes retain existing circulation triggers and owner notifications.

Admin navigation bypasses gameplay navigation locks only for verified admins.
Player resource edits require combat to be ended first. Administrative combat
interruption records a public admin_end event, completes active participants as
draws and releases engagement locks without resolving a damage round. The browser
retains unconfirmed request IDs in per-account session storage for safe replay.
Config catalogs, projections and historical receipts remain read-only.
See [ADMIN_PANEL.md](ADMIN_PANEL.md) for operations and boundaries.

## Sea travel

The private travel catalog, persisted route options and request receipts accompany
owner-only character fields for location, sea distance, its record, visit, version, journey and Energy settlement time.
`sea-travel.sql` is the canonical implementation. Departure, route choice and return
use the combat system's ordered locks; neither participant can depart mid-battle.
PvP requires both captains at harbor, or an attacker who discovered the target
at the same sea distance and target visit through a paid scout. Shared settlement applies due
journeys before eligibility checks. Server clocks and saved arrival times determine
progress even while the owner is offline. Max sea distance increases only on arrival
and never decreases on return, a shorter voyage or hospital admission. A public
scheduled record resolves offline arrivals without locking or writing owner state.

Energy uses ten-minute boundaries for every away state, including return. Offline
return splits recovery at the saved arrival, counting a boundary exactly at arrival
with the harbor rate once. Hospital admission settles earned Energy and changes to
the harbor rate. Scouting and other costs settle recovery before checking affordability.
The cutover migration settles the old model once and removes `energy_paused_at`.
New character fields are not generically editable by admins.

`src/lib/game-navigation.ts` shares hospital/combat/travel redirect policy between
Proxy and AppFrame. Read-only inventory, profiles, attack preparation and combat reports are allowed at a sea stop;
traveling allows the waiting screen and account flows. SQL still enforces every
mutation guard. The sea page uses server deadlines and the shared countdown.

Public projections store coarse planned arrivals; invoker RPCs and RLS compute
effective location without locking or settling every owner. The roster and profiles
refresh at deadlines, on public events and through fallback/focus/reconnect polling.
See [sea travel](SEA_TRAVEL.md) for the complete contract and configuration.

Paid scouting stores private receipts and a paged snapshot of every ship at the same
sea distance, including due offline arrivals. Only the latest result membership is
retained per captain; receipts remain durable. Profile status exposes a viewer-specific
attack-location boolean without exposing other captains' distances or visit IDs.
Sightings reference stable profile identities, so simultaneous scouts do not acquire
crosswise locks on mutable character rows. See [scouting](SEA_SCOUTING.md).

Background game refreshes share a navigation hold through `game-refresh.tsx`.
Link pending state and the game loading boundary defer refresh until navigation
completes. Resource and journey deadlines request the same serialized refresh.
The navigation test explicitly requests a focus refresh while a route is held
and verifies that a second destination remains reachable.

### Item market value

Item details share one history renderer for Circ and Value. Value is the floored,
quantity-weighted gross unit price of executed purchases in the trailing 12 hours.
An empty window retains the last nonempty rolling value, including in history.
Only an item with no purchases at or before the observation time returns N/A. Read-only access follows
the circulation authentication rules.

Private sale triggers maintain a cumulative quantity/gross projection in the
purchase transaction using the existing item circulation locks. Indexed prefix
differences provide historical rolling values without scheduled snapshots.
Backfill and trigger installation are atomic. Identity-only anonymization leaves
the projection intact; corrected/deleted sale fixtures rebuild their affected
suffix. Public responses never include sale or participant identifiers.
See [Item Market Value](ITEM_MARKET_VALUE.md).

## Stamina

Stamina is a separate integer resource for profession activities: recovery cap 50, storage limit 200, +1 per fixed UTC
five-minute tick and 1 per activity. Private SQL settles recovery and serializes spending; the shared
game state exposes server deadlines for the sidebar. See [Stamina](STAMINA.md) for integration rules.

## Skills and Character Level

Seven independent skill XP balances live in private.character_skills. A server-only award
helper serializes updates per character; triggers project only their summed level into
character_profiles. The owner-only get_own_skills RPC powers the profile Skills section.
See [Skills](SKILLS.md) for privacy, XP thresholds and future activity integration.

## Activities

The /activities page uses owner-only skill progress and the shared resource state. The
perform_activity RPC serializes a durable receipt, Stamina deduction and skill XP award
inside one transaction. Server eligibility restricts the first three activities to the harbor
outside combat/hospital. The existing economy journal handles uncertain responses and tabs.
See [Activities](ACTIVITIES.md).

Admin content uses private loot_tables, loot_entries and activity_loot, with foreign keys and RLS. Dedicated save actions participate in admin_audit transactions and version checks. perform_activity locks character, activity binding, table and selected item, then atomically commits loot/XP/Stamina/circulation/receipt. Public RPCs never accept random rolls or a reward item. Uploaded public item artwork uses a separate admin-write Storage bucket.

## Economy monitoring

Private economy aggregation reuses the canonical market-value function and counts inventory plus marketplace escrow once. The admin-only RPC returns current totals, paginated items, wealth rankings and bounded history from one statement snapshot. A named pg_cron job stores world observations every five minutes in an RLS-protected private table. No player endpoint exposes economy intelligence. See [Economy monitoring](ECONOMY_MONITORING.md).

## Player statistics

Auth registration, sign-in and removal triggers maintain private timestamp-only account analytics. A session-validated activity RPC also records continuing sessions, with throttled writes and one row per account per UTC day. Admin RPCs return last-month, 12-month or all-time history, deduplicated active accounts and a paginated directory. Histories use at most 500 explicitly labelled intervals. Full activity coverage begins when session tracking is installed; imported latest sign-ins contribute only to partial historical period totals, never invented daily history. Hard deletion removes the Auth identifier while retaining aggregate history. See [Player statistics](PLAYER_STATISTICS.md).

## Activity result presentation

The Activities client renders confirmed receipts as inline Success/Failure panels with
wrapping item thumbnails, quantities and name tooltips. A shared reward adapter supports
legacy loot and future item arrays plus Gold Coins. Rewards remain server-authoritative;
this presentation support adds no loot rolls or payouts. Network uncertainty remains
separate from an actual failed activity. See [Activities](ACTIVITIES.md).
