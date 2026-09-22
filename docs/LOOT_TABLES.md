# Loot tables and shore fishing

Implemented locally on 2026-09-22. Manage content through Admin > Items, Loot tables
and Activities. There are no rarity categories. Inventory categories such as Materials
and Miscellaneous organize items without influencing their chance.

## Attempt sequence

1. The server checks eligibility and deducts the activity's Stamina cost.
2. Read the skill level before granting this attempt's XP. Compute catch chance from
   the activity's starting chance, mastery chance and mastery level.
3. Roll catch success. A miss gives no item but still grants the usual XP.
4. For a successful catch, fixed entries reserve their exact percentages first.
5. The weighted entries share the remaining percentage. Select exactly one entry and
   grant its configured quantity. Equipment receives the entry's stored stats.
6. Inventory, circulation, XP, Stamina and the durable request receipt commit together.

The public RPC accepts neither random numbers nor reward items. Repeated requests use
their saved result and never reroll or grant again. Rebalancing, item renaming, disabling
or unlinking a table does not change old receipts. Failure to grant an item, including a
full stack, rolls back the entire operation, including Stamina and XP.

## Probability model

For level L and mastery level M:

```text
t = clamp((L - 1) / (M - 1), 0, 1)
catch chance = starting chance + (mastery chance - starting chance) × t
item weight = starting weight + (mastery weight - starting weight) × t
weighted item chance per successful catch =
  (100 - sum of fixed percentages) × item weight / sum of weights
```

Mastery can be 2–99, independently for every linked activity. Above mastery, catch
chance and weights remain at their mastery values. Fixed items do not use skill level.
A fixed 1% means one in 100 successful catches on average. At 30% catch success its
per-attempt chance is 0.3%; at 90% success it is 0.9%.

Multiple fixed items use disjoint intervals in one roll, not sequential independent
rolls that dilute later entries. The server's cumulative roll puts fixed intervals
before the normalized weighted remainder. Every successful catch selects one entry.

Tables contain 1–50 distinct items. Fixed percentages total at most 100%. Unless they
total exactly 100%, weighted entries must have positive combined weight at both
endpoints. Percentages and weights accept up to four decimal places. Quantity is
1–100; item ownership types and stat constraints remain authoritative.

## Initial Harbor Shore table

Shore Fishing is linked to Harbor Shore. It costs 1 Stamina and grants 10 Fishing XP
per attempt. Catch success rises linearly from 70% at level 1 to 90% at level 99.

| Item | Rule | Starting weight | Mastery weight | Chance at level 1, per catch | Chance at level 99, per catch |
| --- | --- | ---: | ---: | ---: | ---: |
| Sprat | Weighted | 40 | 10 | 39.6% | 9.9% |
| Sardine | Weighted | 30 | 15 | 29.7% | 14.85% |
| Mackerel | Weighted | 20 | 30 | 19.8% | 29.7% |
| Sea Bass | Weighted | 9 | 30 | 8.91% | 29.7% |
| Red Snapper | Weighted | 1 | 15 | 0.99% | 14.85% |
| Silver Ring | Fixed | - | - | 1% | 1% |

Each catch grants one item. Fish are passive Materials; the ring is a passive
Miscellaneous collectible. All six are stackable and tradable, use the shared default
image and have no consumable, cooking or combat effect yet. These are editable starting
values, not fixed balance rules. Logging and Foraging initially remain XP-only.

## Administration and persistence

private.loot_tables owns table identity, name, description, enabled status and a version
UUID. private.loot_entries has foreign keys to the table and item, with one row per item.
private.activity_loot binds existing activity IDs to a table and its difficulty curve.
These tables use RLS without direct client grants. Admin read/write endpoints independently
verify current database membership. No service-role credentials enter the browser.

Content saves use admin_mutate with request UUID, reason, audit, before/after snapshots
and optimistic version checking. Administrative content changes serialize under a content
lock. Gameplay locks the character first, then binding, table and selected item. Admin
table edits lock the table before replacing entries, so each attempt sees one complete
version. Content editors never acquire character locks.

The initial table is seeded only when absent. Admin content survives subsequent config
migrations. Admin-owned item rows are marked managed_by_admin; the original item catalog
remains the seed for untouched defaults. IDs and ownership shapes are permanent.

Missing images use public/images/items/placeholder.svg throughout admin, inventory and
marketplace. Optional artwork is stored in the public item-images Storage bucket with
admin-only uploads. Existing artwork and audited references are not automatically deleted.

## Verification

Tests cover exact fixed chances at all 99 levels, normalized weighted probabilities,
site difficulty, complete table validation, private access, immediate admin revocation,
audited and stale edits, fallback images, failure before fixed loot, configured quantities,
inventory/circulation, overflow rollback, receipt replay and unlinking/rebalancing. Browser
coverage exercises content creation, upload, assignment, real catches, simultaneous retries,
mobile layout and recovery-banner behavior. See implementation status for executed results.
