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
| `/characters/[characterId]` | Identity profile, Attack link, own defence orders and latest combat report. |
| `/attack/<characterId>` | Shareable target URL, unchanged during preparation, start and join. |
| `/combatlog/[battleId]` | Public completed combat report, readable without login. |
| `/combat/prepare/[id]`, `/combat/[id]` | Legacy redirects to the attack screen or public report. |
| `/harbor` | Saved character, harbor overview and live captain directory. |
| `/harbor/marketplace` | Placeholder view. |
| `/harbor/shipyard` | Placeholder view. |
| `/harbor/crew-training` | Spend five Energy for one point in a crew stat. |
| `/harbor/ship-upgrades` | Spend five Energy for one point in a ship stat. |

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
implemented. Economy, inventory and permanent death remain future work.

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
and discards banked time at the cap.

`train_stat(group, stat)` invokes an authenticated, narrowly scoped private
security-definer function. The function accepts no owner, cost, timestamp or
increment from clients. It verifies the Auth record, validates both arguments,
locks the caller's character row, calculates recovery and atomically spends five
Energy for one stat point. Client UPDATE permissions remain revoked. Health
values and the other seven stats are unaffected. Public and anonymous function
execution is explicitly revoked; search paths are fixed and empty.

Server Actions validate the session and inputs before invoking the RPC, then
revalidate the shared game layout. A shared client context keeps the bars and buttons
on the same server snapshot. It refreshes at the next recovery boundary and when
the browser returns to the foreground. No browser clock decides resource grants.
Training uses the same ordered participant locks as combat and is rejected while
an attacking engagement remains active. Defenders may continue training. Health recovery, incoming protection and injuries
do not prevent training. The game context also refreshes on health recovery,
combat deadlines and protection expiry.
See [the implemented training scope](TRAINING_FOUNDATION.md).

## Shared PvP encounters

/attack/<characterId> is the full-width preparation and attack screen. The URL always identifies the target;
opening another attacker\'s copied URL shows the current viewer\'s preparation and Join battle. The server resolves
the viewer\'s own encounter from game state, never from a shared attacker-specific URL. AttackSession remembers the
encounter during this visit and opens its public report on completion. Fresh visits show preparation again.
Legacy target/battle query URLs redirect to the target path. The root AppFrame removes regular game chrome. Active attackers have a persistent
database reservation; Proxy checks get_attack_lock for page requests and AppFrame also guards cached
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
