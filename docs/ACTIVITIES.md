# Activities

The /activities page is available from the sidebar and the harbor directory. The initial
activities are Shore Fishing (Fishing XP), Foraging (Foraging XP) and Logging (Logging XP).
Each successful action costs 1 Stamina and grants 10 XP to its skill. Twenty actions give
200 XP and reach level 2 on the rebalanced curve. All three are available from level 1.

These are immediate actions with no timer, equipment requirement or morale modifier.
Shore Fishing now uses the admin-managed Harbor Shore loot table: success roll first,
fixed items second, then weighted fish. Both catches and misses cost 1 Stamina and grant
10 XP. Logging uses Woodland Logging and grants one Oak Log per successful attempt,
with the same 70%-90% success curve. Foraging remains XP-only until a table is assigned. Energy, Gold Coins
and training XP are unaffected. See [Loot tables](LOOT_TABLES.md). The
activity row shows its skill level, XP progress, reward and cost. Results appear in an
expandable result panel below the activity, with no modal. The awarded XP and level-ups show
in the shared [XP drop](SKILLS.md#xp-drop). Stamina and skill progression refresh when a completed receipt is confirmed.
The profile reflects the same XP and public Character Level.

## Activity result panel

A confirmed receipt opens a compact panel below the activity. Successful catches show
Success and their item thumbnails/quantities. Misses show Failure while retaining the
Stamina cost; their XP shows in the XP drop like any other gain. Activities with XP only show Success without an empty
reward row. Pending or rejected requests are not labelled as a failed catch: uncertain
responses show Unconfirmed, while known errors explain why the action could not complete.

The latest result stays visible until another result arrives or its close button is used.
Closing restores focus to the activity button. Normal game-state refreshes preserve the
panel. Hovering, focusing or tapping a reward shows its item name; Escape or an outside
interaction dismisses the tooltip. Tooltips stay within the viewport. Item artwork reuses
the inventory fallback, including the shared dummy image. Announcements for screen readers
are separate from tooltips. The result opens by expanding its actual height over 240 ms
with eased motion, smoothly moving the following rows down. Clipping ends when the slide
finishes so item tooltips remain visible. Repeated attempts update an already-open result
without collapsing it first. Switching activities or dismissing a result collapses the old
panel and its spacing over 150 ms before removing it. Closing results are inert and hidden
from assistive technology. Interrupted slides resume from their current height, and
reduced-motion settings complete the change immediately.

Rewards are a wrapping row, with no fixed item count. The presentation layer accepts the
current single-item loot receipt and an optional future rewards object containing an items
array and a positive gold_coins amount. The latter can show items, Gold Coins, or both.
An optional outcome field explicitly selects success/failure for future activity types;
existing receipts derive this from loot.caught. Explicit rewards replace legacy loot in
the view, so rewards are not displayed twice. Failure never renders a reward.

This is display support only: current drop counts, loot odds and actual currency payouts
are unchanged. Future multi-item/gold awards must be granted atomically by the server and
included in its durable receipt. The browser never grants rewards from displayed values.

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
rejects further activity; reaching skill level 100 alone does not stop XP accumulation.

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

Database checks cover all three skills, rebalanced early levels, atomic cost/reward, saved loot,
stale/tampered offers, disabled activities, receipt replay, account isolation, rollback,
Stamina recovery, zero balance, combat, travel and hospital. Alternative-config checks
use 3 Stamina and 17 XP. Browser tests cover immediate feedback, profile persistence,
mobile layouts, resource recovery, concurrent/duplicate requests and saved-action recovery.
The shared feedback test holds a response open while checking two tabs for banner flashes.

Result-panel tests also cover legacy receipt compatibility, multiple item rewards, item-only/coin-only/combined outcomes, tooltip input methods, dismissal, and mobile wrapping. Future reward formats are tested with presentation receipts belonging only to disposable test characters.
