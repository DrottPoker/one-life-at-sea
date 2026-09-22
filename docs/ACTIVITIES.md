# Activities

The /activities page is available from the sidebar and the harbor directory. The initial
activities are Shore Fishing (Fishing XP), Foraging (Foraging XP) and Logging (Logging XP).
Each successful action costs 1 Stamina and grants 10 XP to its skill. Nine actions give
90 XP and reach level 2 on the classic curve. All three are available from level 1.

These are immediate actions with no timer, equipment requirement or morale modifier.
Shore Fishing now uses the admin-managed Harbor Shore loot table: success roll first,
fixed items second, then weighted fish. Both catches and misses cost 1 Stamina and grant
10 XP. Foraging and Logging remain XP-only until a table is assigned. Energy, Gold Coins
and training XP are unaffected. See [Loot tables](LOOT_TABLES.md). The
activity row shows its skill level, XP progress, reward and cost. Results and level-ups
appear inline in the row, with no modal. Stamina and skill progression refresh on success.
The profile reflects the same XP and public Character Level.

## Eligibility

The first activities take place near The Harbor and require the character to be in the
harbor, outside combat and hospital. Server checks enforce the same rules as navigation
and buttons. No ship-job restriction is added; a pending ship upgrade still blocks travel
but does not block these shore activities. Insufficient Stamina rejects the request.
Recovery is settled on the server before spending, so offline recovery can fund an action.
The existing Stamina deadline refresh re-enables buttons when a tick restores enough.

## Atomic requests and recovery

public.perform_activity(activity_id, expected_stamina_cost, expected_xp_gain, request_id)
delegates to the private authenticated transaction. The current character is determined
from the authenticated account, never supplied by the client. Its shared combat/character
locks serialize concurrent activities, training, resource changes and travel.

The transaction checks its existing private.activity_requests receipt first. An exact
replay returns that saved result without charging or granting XP again, even if the offer
has changed, the activity is disabled, or the character is now at sea, in combat or in
hospital. Reusing the ID with another activity, cost or reward raises REQUEST_CONFLICT.

For a new request the server checks eligibility, an active activity and the current offer,
then calls spend_activity_stamina, rolls and grants any configured loot using the skill
level before this attempt, and calls award_skill_xp in the same transaction and records
its receipt. Cost, XP, inventory, circulation, level projection, notifications and receipt commit together.
A replay returns the saved catch without rerolling, even after rebalancing or unlinking loot.
Invalid or failed actions leave no cost, reward or receipt. Concurrent unique requests
cannot overspend the remaining Stamina. A skill at the safe-integer XP storage limit
rejects further activity; reaching skill level 99 alone does not stop XP accumulation.

The shared browser economy journal saves the exact offer and UUID before sending. Web
Locks coordinate tabs. Ordinary in-flight requests do not display the recovery banner.
An uncertain response retains its request for safe checking through the existing recovery
control. Recovered requests refresh the current game state and skill display.

## Configuration and data access

The catalog is under gameplay.activities.catalog: stable id, name, skillId, description,
buttonLabel, xpGain and active. Stamina cost uses gameplay.stamina.activityCost. SQL and UI
use the same validated configuration. Existing activity IDs and skill mappings cannot be
removed or reassigned; activities can instead be disabled. XP gains may be rebalanced.
The client submits expected values for stale-offer detection, not authority over rewards.

Definitions and receipts are private with RLS and no client table grants. Verified admins
may inspect them read-only. Stored receipts include actual XP and Stamina changes, level
before/after, Character Level, gameplay revision and the saved loot outcome/table version. The existing profile privacy rule
still applies: detailed skill levels/XP belong only to their owner.

## Verification

Database checks cover all three skills, nine-click level-up, atomic cost/reward, saved loot,
stale/tampered offers, disabled activities, receipt replay, account isolation, rollback,
Stamina recovery, zero balance, combat, travel and hospital. Alternative-config checks
use 3 Stamina and 17 XP. Browser tests cover immediate feedback, profile persistence,
mobile layouts, resource recovery, concurrent/duplicate requests and saved-action recovery.
The shared feedback test holds a response open while checking two tabs for banner flashes.
