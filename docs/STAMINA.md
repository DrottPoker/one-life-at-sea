# Stamina

Stamina funds profession activities independently of Energy. The initial balance and cap are 50.
Each activity costs 1 Stamina. Recovery grants 1 at fixed five-minute UTC boundaries (:00, :05,
:10 and so on), including offline, travel, sea, hospital and combat. No recovery is banked above
the cap. Values are whole numbers. A depleted bar needs 50 ticks (about 4 hours 10 minutes) to fill.

The owner selected Stamina for Fishing, Logging, Foraging, Cooking, Crafting and similar skills.
Skill XP/levels and profile display are implemented in [Skills](SKILLS.md). [Activities](ACTIVITIES.md)
now provides Shore Fishing, Foraging and Logging for 1 Stamina and 10 XP each. Food consumption
is not implemented yet. Existing training,
combat, travel and scouting continue to use their existing Energy costs. Tavern meals still affect
Crew Morale. Food restoration amounts and consumption limits remain undecided.

## Configuration and storage

All balance values live under gameplay.stamina in config/gameplay.json: maximum, recoveryAmount,
recoverySeconds and activityCost. The schema requires positive integers and validates cost and recovery
against capacity. The generated migration adds characters.stamina and stamina_updated_at. Existing
characters receive a full bar once; later config synchronization never refills existing balances.
Lowering the cap below existing stored balances fails instead of deleting excess player resources.

private.stamina_snapshot counts UTC boundaries since the settlement checkpoint, returns the recovered
balance and next deadline, and tolerates a future checkpoint without granting extra recovery.
get_game_state exposes the viewer's balance and deadline. The shared GameStateProvider schedules
server refreshes. No client clock grants resources and no periodic writes across all players are needed.
The sidebar shows a green bar after Energy, with a short hover/focus/touch description and no timestamp.

## Activity integration

private.spend_activity_stamina(character_id) locks the character using the shared combat lock order,
reads server time after locking, settles recovery and deducts the configured activityCost. It rejects
insufficient balance and checks the authenticated owner. It has no client execute grant or public RPC.
Future activity RPCs must call it inside the same transaction as their inventory/XP rewards, after
validating location and other activity rules, and after checking their durable idempotency receipt.
A replay must return the saved receipt without spending again. Rolling back an activity also rolls
back its Stamina deduction. The helper emits the existing player refresh notification.

Administrators may edit Stamina through the existing audited interface; edits reset the recovery
checkpoint. Normal players cannot directly update the balance or timestamp.

## Verification

supabase/tests/stamina.test.sql covers boundaries, midnight, offline catch-up, caps, future checkpoints,
spending, insufficient balance, ownership, access controls, game-state recovery, travel and admin edits.
The alternative-config database test changes capacity, recovery and activity cost. The browser test
covers the bar, tooltip, live refresh, responsive layout and independence from Crew Training Energy.
