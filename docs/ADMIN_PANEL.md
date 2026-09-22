# Admin panel

Open `/admin`, or use **Admin panel** in the header. The workspace has seven sections:
Overview, Players, Items, Loot tables, Activities, Database and Audit log. Overview links
to the primary workflows, live game totals and recent administrative changes. Ludorex
is the first authorized local administrator.

## Content authoring

1. **Items**: search/filter the catalog, create an item or edit its name, category,
   description, effect text, active/tradable flags and image. Item IDs, ownership types
   and equipment slots are permanent after creation. Effects are descriptive text;
   creating a consumable does not add a new gameplay operation.
2. **Loot tables**: create a named collection, add items, choose fixed percentages or
   weights at level 1/mastery, and set quantity. Equipment also records damage/accuracy.
   A level slider previews percentages of successful catches, with mastery at 99.
3. **Activities**: select a table, starting/mastery catch chances and mastery level for
   each existing activity. Select No loot to retain XP-only behavior. Changes apply to
   new attempts immediately; earlier receipts preserve their original result.

See [Loot tables](LOOT_TABLES.md) for the exact probability model and initial fish.
No rarity classification is used. The database browser remains available for advanced
inspection, with grouped resources and links back to the dedicated editors.

Images are optional. `/images/items/placeholder.svg` is the shared default and broken
images also fall back to it in inventory, marketplace and admin. Upload accepts PNG,
JPG or WebP up to 4 MB; the picker checks decoding and dimensions up to 8192 × 8192.
Supabase Storage enforces MIME/size limits and current admin membership. The public
item-images bucket contains item artwork only. Upload paths are immutable UUIDs under
the uploader's account ID; replacing an image creates a new object. The authenticated
admin RPC verifies uploaded references exist. No arbitrary external URLs are accepted.
Uploaded objects are not deleted automatically, preserving historical image references.

All content saves use the existing audit/retry system with version checks. A linked
table cannot be disabled; unlink it first. An item in an active table cannot be disabled;
remove it from that table first. Definitions are not deleted through the panel.

Admin-created and admin-edited item rows carry `managed_by_admin=true`. Configuration
continues to seed the original catalog but does not overwrite those rows. Loot tables
and activity loot settings belong to the database and survive later config migrations.

## Player tools

- Search by captain name, character ID or account ID.
- Inspect and edit names, carried/banked gold, Energy, health, eight combat stats,
  defence orders, protection timestamps and hospital timestamps. Resource changes
  reset the corresponding recovery timestamp to the time of the correction.
- Edit training XP and purchased tier using the database's composite key.
- Generate active catalog items for any selected captain. Stacks add to existing
  holdings; equipment creates individual instances with chosen damage/accuracy.
  Limits: 1,000,000 stack items or 100 equipment instances per request. Equipment
  damage accepts 0-1,000,000,000 and accuracy 0-100, with two decimal places.
- Correct stack quantities and equipment stats, or delete an entire inventory row.
- Release a hospital patient with full health.
- End an entire combat as a draw without another damage round. Health, previous
  events and snapshot stats remain intact. Active participants become draws,
  engagement locks are removed and a public `admin_end` event explains the ending.
  This operation does not award new combat protection.
- Cancel a pending ship job without a refund or stat/XP grant. The original job
  is preserved in the audit record. Already completed jobs cannot be cancelled.

Admin access remains available during the administrator's hospital/attack lock.
Editing a character in an active encounter is refused until that encounter ends.
Item grants, item corrections and training progress edits use the same ordered
character/combat locks as gameplay.

## Database browser

The browser exposes allowlisted game/admin tables, including private combat,
bank history, jobs, inventory, circulation and request receipts. It provides:

- Literal text search, exact column/value filtering and 50-row pagination.
- Column names, PostgreSQL types, primary keys, NULL values and full row details.
- Editable forms for characters, training progress, item stacks and instances.
- Decimal strings for every scalar value, retaining bigint/numeric precision.
- An audit browser with request ID, administrator account ID, reason, timestamp,
  payload and before/after values. A grant of equipment records every new instance.

Derived projections and historical records are inspectable but not raw editable.
Items and loot use the dedicated content editors. Skill curves, activity cost/XP,
training tiers and inventory categories still use config/gameplay.json and config:sync. Historical receipts and audit records cannot be edited or deleted.
Account ownership/primary keys cannot be reassigned. This is a game administration
panel; it does not expose arbitrary SQL, schema changes, account passwords,
session tokens or infrastructure schemas. Account deletion and admin membership
changes remain database-owner operations.

## Authorization and retries

`private.admin_members` stores current administrator account IDs. All admin tables
use RLS and no direct client grants. Public RPC wrappers are security invokers.
Private entrypoints use fixed-search-path security definers, require a registered
account and verify membership for every call, including receipt retries. User
metadata cannot grant access. Revocation is effective without JWT refresh; a
membership share lock allows an already running transaction to finish first.

Next.js checks identity and authorization server-side. Proxy returns HTTP 403 for
signed-in non-admin requests to admin routes. Server Actions and database RPCs
remain independently protected. Ordinary character visibility and other player
policies are unchanged. No service-role key is needed.

Mutations and their audit receipt commit together. A per-administrator request
UUID serializes retries. Reusing a UUID with a different action, payload or reason
fails. Row edits/deletes compare the original database fingerprint after locking;
stale screens cannot overwrite newer state. All changes require a 3-500 character
reason and an explicit review step with a readable summary. Technical payloads are
collapsed. In-flight requests stay hidden from the recovery banner; a genuinely
unconfirmed request becomes recoverable after an uncertain response or reload.

Before sending a mutation, the browser saves its request in account-scoped
session storage. Unconfirmed requests can be checked again after a reload or
navigation within the same tab. Checking reuses the original request UUID and
cannot grant/delete a second time. Closing the tab removes this browser journal;
the durable database audit remains. Admin forms return rule violations without
exposing raw database errors.

Inventory changes automatically update world circulation and history through the
existing triggers. Owner-only revision events refresh affected players' tabs.

## Local access management

Use an existing, explicitly selected character:

```powershell
node scripts/admin-access.mjs grant "Ludorex"
node scripts/admin-access.mjs revoke "Character name"
```

The script targets only the configured local Docker database. Migration files do
not hardcode or automatically promote any account. For a future hosted database,
the database owner grants access to the verified account UUID in
`private.admin_members`; no browser route can perform that bootstrap.

Migrations:
- `20260919100637_admin_panel.sql`
- `20260919102311_admin_combat_interruption.sql`
- `20260919104637_admin_resource_timestamps.sql`

## Verification

See [implementation status](IMPLEMENTATION_STATUS.md) for executed checks.
Tests use disposable local accounts; the SQL suite rolls back its fixtures.


## Sea travel integration

Verified admins retain access while traveling. Travel fields are not editable
through the generic player editor. Energy edits preserve whole-number balances and
reset the settlement checkpoint without changing global tick boundaries. Lethal
administrative damage ends the journey through Hospital, clears route choices
and switches to harbor recovery from admission or an earlier actual homecoming.
See [sea travel](SEA_TRAVEL.md).

## Crew Morale

The character editor supports crew_morale from -100 to +100 with at most one
decimal. Database constraints enforce the same bounds for admin edits. Each
change establishes a fresh morale checkpoint and is recorded in the existing
audit log. Combat locks still apply. Tavern receipts are available as a read-only
resource. Canonical admin mutation SQL is in supabase/templates/gameplay/admin.sql.

Stamina is an editable character resource. Its integer balance is limited by the configured cap.
An audited edit resets `stamina_updated_at` to the server time; direct player edits are denied.

The `character_skills` resource permits audited corrections to `xp` only. Its composite key
identifies the character and skill. The private skill level and public Character Level are
derived automatically. Skill catalogs and threshold tables are read-only in the admin panel.

`activity_definitions` and `activity_requests` are read-only administrator resources. Definitions
are managed through gameplay configuration; receipts preserve committed cost, XP and
loot. The separate activity_loot resource is managed from Activities. The player detail
page also exposes Stamina, Crew Morale and private skill XP corrections.

## Economy

`/admin/economy` monitors Gold Coins (carried and banked), item circulation and market valuation, unpriced stock, trade turnover and fees. Independent wealth leaderboards link to player tools. Searchable item totals include market escrow exactly once. Charts record actual observations every five minutes through a private pg_cron job, independently of admin visits. Access is checked on every read; all totals preserve integer precision. See [Economy monitoring](ECONOMY_MONITORING.md) for definitions, limits and operations.
