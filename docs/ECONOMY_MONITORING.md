# Economy monitoring

`/admin/economy` is a read-only, administrator-only view of the entire game economy.
The navigation and admin overview link to it. The screen refreshes every minute while
visible; Refresh requests an immediate reading. Failed refreshes retain the last
successful figures and display a warning. Revoked access clears the client view.

## Scope and valuation

- Gold supply sums every existing character's carried and bank balances, including
  offline characters and admins. Bank transfers do not create coins. No gold is held
  in marketplace escrow; only actual marketplace fees remove supply on a trade.
- Circulation counts stacked units, equipment instances and remaining market listings
  exactly once. Inventory values include all owned equipment instances. Listed items
  belong to their seller until sold, and appear separately in the wealth tables.
- Unit value reuses `private.item_market_value_at`, the same quantity-weighted market
  value used by Inventory and Marketplace. It uses completed gross sale prices over
  the configured window, currently 12 hours, and retains the last nonempty value.
  An unsold asking price does not establish value. Individual equipment stats do not
  modify the item type's value. This is an estimate, not guaranteed liquidation proceeds.
- A never-traded item is unpriced. Its quantity contributes to circulation, but it is
  excluded from estimated wealth. The dashboard explicitly reports unpriced units and
  types; player rows disclose unpriced units. Inactive definitions remain included.
- Combined known wealth is coins plus priced items. Price changes can alter it without
  any money or items being created. Rankings show the top 20 by coins, item wealth
  (inventory plus listings), or combined wealth, with player number as a stable tie-break.
- Monetary sums and item valuation use PostgreSQL numeric and decimal strings over
  the RPC boundary. The UI uses BigInt for exact totals; floating point is limited to
  chart coordinates and percentages. Values may exceed a single balance's safe limit.

The searchable item table has deterministic, server-side pages of 50 and sorts by
total value, quantity, name, or unpriced items first. Market cards report completed
purchase count, quantity, gross turnover and fees over the preceding 24 hours. The
30-day turnover chart groups actual purchases by UTC date; today is incomplete.
The money distribution chart reports carried versus banked coins and the richest
ten characters' share. There is no fabricated breakdown of historical money sources.

## History and operation

Canonical SQL lives in `supabase/templates/gameplay/economy.sql`, included by the
gameplay generator. Apply generated migrations through the normal config workflow.
The migration enables pg_cron and registers one named `economy-snapshot` job at
`*/5 * * * *`. It runs as the migration owner, independently of browser traffic.
Rerunning config migrations updates that same job instead of creating duplicates.

`private.economy_snapshots` stores observation time, carried/banked money, circulating
item units, priced item value, unpriced units and character count. One initial reading
is taken at installation. A unique five-minute slot makes repeated executions harmless;
the actual observation timestamp is preserved. Every observation is calculated in one
SQL statement under one database snapshot. Reading the dashboard never writes history.

History begins at installation. Existing market sales remain available for the turnover
chart, but earlier money supply and item wealth are unknown. No historical backfill or
synthetic points are invented. There is no snapshot retention deletion. The history RPC
returns at most 500 points, including first and current readings, sampling the last
observation in time buckets for longer series. The UI discloses sampling and breaks
trend lines across missing measurements rather than presenting downtime as flat supply.
Time range choices are 24 hours, 7 days, 30 days and all history.

Live totals are calculated directly from current holdings. A missing snapshot or one
older than 12 minutes produces a visible history warning. Operations can inspect
`cron.job` and `cron.job_run_details` for `economy-snapshot`. Supabase must be running
for the scheduler to collect observations; restarting does not backfill downtime.

## Access and consistency

Only `public.admin_economy` is exposed. It is an invoker wrapper around a private
definer with an empty search path and a fresh `private.require_admin()` check. Both
are volatile because admin membership is locked while checking revocation. Ordinary
players and anonymous users cannot read aggregate balances, inventories or rankings.
Snapshot tables use RLS without client policies; internal helpers and snapshot writes
have no client execute grants. No service key is exposed to the browser.

Each response uses one consistent statement snapshot for money, holdings, item values,
leaderboards and history. Raw sales are indexed by timestamp for the 30-day overview.
Aggregations deliberately occur in SQL instead of downloading all private records.

## Verification

- `supabase/tests/admin-economy.test.sql`: privileges, metadata spoofing, revocation,
  exact large values, unpriced stock, weighted pricing, pagination, escrow ownership,
  real purchases and fees, sampling, history boundaries and snapshot idempotency.
- `tests/unit/economy.test.ts`: BigInt display and percentage calculations.
- `tests/e2e/admin-economy.spec.ts`: real market purchase, page navigation, charts and
  keyboard inspection, filters, independent rankings, failed refresh, revoked access
  and desktop/mobile widths. Its disposable balances are excluded from scheduled
  history by pausing this specific local cron job and restoring its state in finally.
