# Crafting

Crafting lives at `/hideout/crafting`, reached through the Crafting link in the
Hideout workshop. Recipes show required ingredients, the captain's available stock,
the output and whether more materials are needed. Each click crafts one recipe
immediately and places the output in Inventory. There is no job or waiting timer.

## First recipe

- Oak Plank (`oak_plank`): consume **5 Oak Logs** (`oak_logs`) and create
  **1 Oak Plank**, using the existing `oak_planks` item definition and stack.
- The only cost is the listed ingredients. No Gold Coins, Energy or Stamina is
  charged. Each successful craft grants **10 Crafting XP**, regardless of its output
  quantity. The confirmed result lists the output and materials; the XP award and any Crafting level-up
  show in the shared [XP drop](SKILLS.md#xp-drop).
- Oak Logs is a new stackable, tradable material. Existing plank holdings retain
  their IDs and quantities. The log image uses the standard inventory placeholder.
- Logging uses the Woodland Logging loot table and awards one Oak Log per successful
  attempt. Five successes provide the ingredients for one plank. The activity starts
  at 70% success and reaches 90% at level 100; loot remains editable through admin.
  Players can also trade logs through Marketplace.

## Configuration and ownership

`gameplay.crafting.recipes` holds IDs, names, ingredients, output and active state.
`gameplay.crafting.xpGain` sets the XP reward per craft (10).
Config validation requires known stackable items, positive safe integer quantities,
unique recipe/ingredient IDs and no recipe consuming its own output. It supports
up to 100 recipes and 16 ingredients per recipe. Config sync preserves recipes and
receipts, deactivates omitted recipes and updates ingredients transactionally.

Private RLS-protected tables are `crafting_recipes`, `crafting_ingredients` and
`crafting_requests`. Players have no direct table access. The authenticated
`list_crafting_recipes()` RPC returns active recipes with current item metadata and
only the caller's inventory quantities. Marketplace escrow is not usable stock.
Unavailable or non-stackable definitions remove a recipe from the current list.

## Transaction and recovery

`craft_item(recipe_id, expected_version, request_id)` derives the character from
Auth, settles the shared character/combat locks and checks for an existing receipt.
An exact replay returns that receipt even after the recipe changes or the character
travels, enters hospital or starts combat. Reusing an ID with a changed payload fails.
New crafting is permitted only in The Harbor and outside combat/hospital.

The recipe version is a SHA-256 digest of its input/output terms and XP reward. Stale offers fail
without charging anything. The transaction validates every ingredient and output
capacity before changing stock, locks circulation counters in item order, removes
empty input stacks, merges output into inventory and records the result. All stock,
circulation history, Crafting XP, derived skill/Character Level, Last action and the
game refresh event commit together. Old receipts without an XP reward remain
unchanged; replay never retroactively awards XP or charges again.
The normal database retry wrapper handles transient lock/serialization failures.

Crafting participates in the shared browser economy journal and Web Locks. The
exact request is stored before sending and retained when the outcome is uncertain.
Reload/navigation can recover it with Check saved action; another economic action
cannot replace it. Current stock comes from fresh server snapshots, never from an
old receipt. Revalidation and the existing player-game event refresh other tabs.

## Verification

- Database tests cover authorization, private ownership, exact costs/output,
  replay/conflicts, unavailable recipes/items, overflow, transaction rollback,
  circulation, XP/level-ups, Last action, stack deletion and hospital/travel/combat restrictions.
- Alternative-config tests change both ingredient costs and output, add a second
  ingredient and verify unchanged historical receipts and stock after rejection.
- Browser tests cover keyboard navigation from Hideout, instant crafting, disabled
  buttons/material shortages, updates in a second tab, inventory persistence,
  reload recovery, parallel duplicate/unique requests and marketplace escrow.
- Responsive checks cover 1440/768/375/320px and review desktop/mobile screenshots.
