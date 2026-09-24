# Skills and Character Level

The owner selected seven skills: Fishing, Logging, Cooking, Crafting, Crew Battling,
Ship Battling and Foraging. Every character starts with 0 XP and level 1 in each skill.
Each skill ends at level 100. Character Level is the sum of all seven levels, starting
at 7 and reaching 700. It does not grant an additional combat or resource bonus.

## XP curve

The curve has 100 levels and requires exactly **5,000,000 total XP** for level 100.
The first increase costs 200 XP. Successive level costs grow by about 7.98%.
Compared with the original classic curve, early levels are slightly slower while
late levels require much less XP.

For level L (1 through 100), thresholds are rounded to the nearest integer:

```text
XP(L) = round(200 * (r^(L - 1) - 1) / (r - 1))
r = 1.079775901474282
```

The growth factor is the positive solution to `200 * (r^99 - 1) / (r - 1) = 5000000`.
It was solved by bisection between 1 and 1.2; the last stored threshold is exactly
5,000,000. The stored integer table is authoritative in both SQL and the interface.

| Level | Total XP |
| --- | ---: |
| 1 | 0 |
| 2 | 200 |
| 3 | 416 |
| 10 | 2,495 |
| 25 | 13,311 |
| 50 | 105,265 |
| 75 | 731,748 |
| 90 | 2,319,435 |
| 99 | 4,630,405 |
| 100 | 5,000,000 |

At 10 XP per action, level 2 takes 20 actions. The higher initial cost and lower
growth factor make the curve flatter while preserving the five-million-XP total.
The final level costs 369,595 XP. Rounding is performed before storing thresholds.

The 100 integer thresholds are stored once in `gameplay.skills.xpThresholds`. Levels
are derived from XP and cannot be independently edited. Migration preserves all
existing XP and recalculates skill levels and public Character Level. A character can
therefore gain or lose levels when the curve changes, without losing earned XP.

XP may continue after level 100 while the level stays capped. Stored XP and awards
remain nonnegative safe integers, capped at 9,007,199,254,740,991 for JSON transport.
Award inputs must be positive; the shared helper saturates without wrapping.
Crafting checks capacity first so every successful craft awards its full configured XP.

## Combat XP and battling health

Every attacking order in [combat](COMBAT_SYSTEM.md#xp-och-maxhälsa) awards `combat.xpGain`
XP (10) to the skill of its phase, hit or miss. Cannon salvos train Ship Battling; firearm shots,
thrown temporaries and melee attacks train Crew Battling. The defender's automatic replies train
the defender the same way. Board, Disengage and Retreat award nothing.

Crew Battling raises maximum Crew Health and Ship Battling raises maximum Ship Health. Level 1
adds nothing. Every later level L adds L × `skills.battlingHealthPerLevel` (1), and the additions
stack, so the total bonus is L(L+1)/2 - 1 at the default setting:

| Level | Added by the level | Total bonus |
| --- | ---: | ---: |
| 1 | 0 | 0 |
| 2 | 2 | 2 |
| 3 | 3 | 5 |
| 4 | 4 | 9 |
| 10 | 10 | 54 |
| 50 | 50 | 1,274 |
| 100 | 100 | 5,049 |

Maximum Ship Health also includes the equipped Hull, see [equipment](EQUIPMENT.md#ship-health-från-hull).
A new level raises only the maximum: current health keeps its value and recovers at the normal
rate, while Hospital discharge restores the raised maxima. A combat snapshot keeps the maxima
from the start of the encounter, so a level gained during a fight applies afterwards. An
administrative XP correction settles recovery at the previous maximum first and lowers current
health to a reduced maximum. `private.battling_health_bonus` is authoritative; the profile shows
the same formula. The database bounds stored health by the level-100 bonus.

## Privacy and profile

The owner sees a Skills section on their own profile with all levels, total XP and
progress/remaining XP to the next level. The Crew Battling and Ship Battling cards also show
their health bonus and what the next level adds. Other players see only Character Level.
Opponents and public combat logs still show maximum health, as they did before these bonuses,
so the battling health bonus of a fighter can be inferred there.
Existing registered-player profile access rules remain in effect: public here means
visible to other registered players, not anonymous visitors.

private.character_skills holds XP per character/skill. RLS is enabled, the table has
no client grants and is absent from the realtime publication. public.get_own_skills()
has no target parameter and obtains the character through auth.uid() after verifying
the registered account. Server pages call it only for the current player's profile and Activities page.
A client cannot request another character's detailed progression or grant XP.

Only character_level is added to public.character_profiles and get_character_status.
The public projection updates only when the sum changes. XP that does not cause a
level-up does not publish a profile change. Private XP updates use the existing
owner-scoped player_game_events refresh. Other profiles use their existing public
profile subscription to refresh Character Level. No extra permanent client cache is added.

## Server integration and administration

private.award_skill_xp(character_id, skill_id, amount) is an internal helper with no
client execute grant. It uses the shared character/combat lock order and locks the
character before updating XP. Different skills awarded concurrently share that lock,
so both XP and the public total stay correct. It returns actual XP awarded, previous
and new skill level, total XP and Character Level.

Future activity RPCs must validate eligibility and call the helper in the same
transaction as costs/rewards and their durable idempotency receipt. A request replay
returns its saved result without awarding XP again. Combat calls the helper for the
attacker and the defender while resolving a round, under the locks it already holds, so
offline defenders are rewarded too and a replayed order awards nothing new. The helper is
not itself a public action or an idempotent activity endpoint.

Administrators can make audited XP corrections in the character_skills database
resource; levels and the public sum update automatically. Skill definitions and
thresholds are read-only in admin and edited through gameplay configuration.
Existing characters are backfilled at zero XP once. Reapplying config preserves XP.
Deleting an account cascades to its skill rows. Existing skill IDs cannot be removed
from configuration. New skill definitions add a level-1 row for each character and
therefore increase the public total by one.

## Scope

Progression, privacy and display are implemented. [Activities](ACTIVITIES.md) now provides
Shore Fishing, Foraging and Logging for 1 Stamina and 10 XP each.
[Crafting](CRAFTING.md) grants 10 Crafting XP per successful craft. [Combat](COMBAT_SYSTEM.md#xp-och-maxhälsa)
grants Crew Battling and Ship Battling XP, and those levels raise maximum health. Cooking, additional
recipes, level requirements and other level bonuses remain future work. Crew Training and Ship Upgrades keep their own workshop/training
XP and do not award Crew Battling or Ship Battling skill XP automatically.

## Verification

Unit tests cover the rebalanced milestones and every exact level boundary. Database
tests cover initialization, all level boundaries, private API/table access, total
projection, max level, invalid awards, transaction rollback, admin changes and cleanup.
Alternative config tests double XP thresholds and add an eighth skill within a rolled-
back transaction. Browser tests cover ownership, live updates, responsive profiles
and eight concurrent XP awards without lost increments or an inconsistent public sum.
Database tests in `battling-skills.test.sql` cover the health formula, both maxima with and
without a Hull, recovery, Hospital, administrative corrections and release, and XP from every
attacking order for both sides. Alternative config tests change the XP per attack and the
health per level. Browser tests cover the profile bonus, the raised Crew Health bar and the XP
line in the combat result.
