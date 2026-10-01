# Server and transaction responsiveness

## September 2026 audit

The audit covers account/session checks, shared layouts, navigation guards, resources,
background subscriptions, activities, crafting, bank, training, tavern, inventory,
marketplace, travel, scouting, combat, notifications, profiles and administration.

The local baseline showed a median 18ms for a direct activity RPC, versus 231ms from
click until the activity button and confirmed XP were ready in a production build.
The surrounding requests and rendering dominated the visible wait. Development mode
also includes compilation and development tooling, so it is not the production budget.

## Changes

- `get_player_context` returns only the authenticated player's character, current
  administrator membership and gameplay revision in one read. It does not settle
  gameplay or take combat locks. Server-side user validation remains in place.
- `get_player_snapshot` returns resources, skills and notification counts in one
  transaction after settling the current game state. Request-scoped React caches
  share it across layouts/pages. There is no persistent cache of private balances,
  permissions, offers or stock.
- `requireCharacter` skips the resource read only when both existing navigation
  exceptions are already enabled. Such mutations already enforce eligibility in
  their transaction; their receipt-recovery behavior remains intact. Other callers,
  including combat, retain their hospital/sea guards.
- Navigation checks still settle combat, hospital and travel under the same locks,
  but no longer build training catalogs, skill progress, resource snapshots or
  combat history just to decide a redirect.
- Last-combat lookup separates defender history and participant history so each
  can start with the existing character-leading indexes, instead of testing every
  battle with a correlated OR condition.
- World-clock synchronization remains active on mount, focus and its configured
  interval. Ordinary server renders update its time anchor directly instead of
  restarting the clock and adding another HTTP request for every game action.
- Game snapshots carry their committed event revision. The refresh queue drops
  delayed realtime events already represented by the rendered snapshot, preserves
  newer events, and coalesces refresh requests while one is running.
- Economy requests, combat orders, defence changes, travel, scouting and navigation
  defer background refresh while their own request is active. Combat preparation
  uses the same refresh coordinator and no longer forces an extra refresh after
  its server action has already revalidated the view. Hidden tabs catch up when
  visible instead of repeatedly rebuilding private views in the background.

## Transaction guarantees

All costs, resource recovery, rewards, inventory, circulation, progression,
notifications and durable receipts still commit inside their existing PostgreSQL
transactions. The changes do not remove locks, weaken eligibility checks, cache
live money/stock, optimistically grant rewards or shorten gameplay timers. Duplicate
requests, retries after lost responses and account switches keep the same rules.

Database statement statistics were inspected alongside end-to-end measurements.
Existing keyed receipts, character locks, paginated market/inventory reads and
notification indexes remain in place. The audit found no reason to remove locking
or add connection pools on top of the existing PostgREST transport.

## Reproducible measurements

Build first, then run with local Supabase:

```powershell
npm run build
$env:MEASURE_PERFORMANCE = "comparison"
node node_modules/@playwright/test/cli.js test tests/e2e/performance.spec.ts
Remove-Item Env:MEASURE_PERFORMANCE
```

The opt-in test creates and cleans up a disposable account and writes raw samples
and summaries to `.local/performance-comparison.json`. It measures direct RPCs,
15 serial activity clicks, bank transfers, crew training and three full-document visits to each of ten pages.
It is skipped in ordinary correctness runs. Click measurements stop when the request
is no longer pending and the authoritative resource/XP change is visible, not at
first paint. The bank clears its input after a successful transfer, so its measurement
uses the completed form state rather than waiting for an empty-input button to enable.
There are no fixed timing assertions that would fail on a busy CI machine.

Initial matched comparison on the same local Edge/Postgres setup:

| Measurement | Before median, ms | After median, ms |
| --- | ---: | ---: |
| Activity click to ready | 231 | 143 |
| Activity RPC | 18 | 12 |
| Game-state RPC | 13 | 10 |

Activity p95 changed from 323ms to 190ms in the 15-sample comparison. This is about
38% lower median click latency. Full-document page measurements use three samples
per route and include browser work, so small differences are not significant:

| Page | Before median, ms | After median, ms |
| --- | ---: | ---: |
| /harbor | 308 | 315 |
| /activities | 315 | 285 |
| /harbor/bank | 321 | 256 |
| /harbor/crew-training | 311 | 310 |
| /harbor/ship-upgrades | 289 | 289 |
| /inventory | 287 | 252 |
| /harbor/marketplace | 350 | 268 |
| /hideout/crafting | 302 | 282 |
| /notifications | 292 | 297 |
| /players/profile | 311 | 269 |

A final independent run after the clock and unfinished-account fixes produced:

| Measurement | Samples | Median, ms | p95, ms |
| --- | ---: | ---: | ---: |
| Activity click to ready | 15 | 153 | 209 |
| Bank deposit to confirmed balance | 10 | 141 | 193 |
| Crew training to confirmed energy | 5 | 157 | 188 |
| Activity RPC | 15 | 14 | 50 |
| Game-state RPC | 15 | 11 | 33 |

The final activity median is 34% below the baseline. The two post-change runs
illustrate normal variation; bank and training do not have matched pre-change
samples. Raw final samples are stored locally in `.local/performance-final.json`.

These are local measurements, not a hosted latency guarantee or a capacity test.
Public deployment measurements must also cover client/server/database region distance,
concurrent players and long histories. Retain the fixture-based benchmark to compare
future changes under the same conditions.

## Measurements from the project audit, 2026-09-23

These measurements used Next.js 16.3.6 and Supabase JS 2.117.1.
The existing benchmark ran as part of the full browser suite against local PostgreSQL.

| Measurement | Samples | Median, ms | p95, ms |
| --- | ---: | ---: | ---: |
| Activity click to ready | 15 | 154 | 170 |
| Bank transfer to confirmed balance | 10 | 136 | 180 |
| Crew training to confirmed Energy | 5 | 140 | 217 |
| Activity RPC | 15 | 11 | 14 |
| Game-state RPC | 15 | 9 | 11 |

Raw samples: `.local/performance-audit-2026-09-23.json`. These results describe this local run; they are not a controlled before/after speed claim or a concurrent-load benchmark. The earlier measurements above remain historical comparisons.
