# Skills and Character Level

The owner selected seven skills: Fishing, Logging, Cooking, Crafting, Crew Battling,
Ship Battling and Foraging. Every character starts with 0 XP and level 1 in each skill.
Each skill ends at level 99. Character Level is the sum of all seven levels, starting
at 7 and reaching 693. It does not grant an additional combat or resource bonus.

## XP curve

The accepted curve is RuneScape's standard level curve:

XP(L) = floor(sum(n=1..L-1, floor(n + 300 * 2^(n/7))) / 4).

Examples: level 2 requires 83 XP, level 10 requires 1,154, level 50 requires 101,333,
level 92 requires 6,517,253 and level 99 requires 13,034,431 total XP.
Reference: [OSRS Wiki, Experience](https://oldschool.runescape.wiki/w/Experience).

The 99 integer thresholds are stored once in gameplay.skills.xpThresholds and shared
by the generated SQL and interface. Levels are derived from XP, never independently
editable. XP may continue after level 99 while the level stays capped. Stored XP and
awards must be nonnegative safe integers, capped at 9,007,199,254,740,991 for safe JSON
transport. Award inputs must be positive; overflow saturates without wrapping.

## Privacy and profile

The owner sees a Skills section on their own profile with all levels, total XP and
progress/remaining XP to the next level. Other players see only Character Level.
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
returns its saved result without awarding XP again. The helper accepts a target
character so future server-resolved combat may reward offline participants. It is
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
Shore Fishing, Foraging and Logging for 1 Stamina and 10 XP each. Loot, cooking/crafting
actions, level requirements and level bonuses remain future work. Crew Training and Ship Upgrades keep their own workshop/training
XP and do not award Crew Battling or Ship Battling skill XP automatically.

## Verification

Unit tests cover the classic milestones and every exact level boundary. Database
tests cover initialization, all level boundaries, private API/table access, total
projection, max level, invalid awards, transaction rollback, admin changes and cleanup.
Alternative config tests double XP thresholds and add an eighth skill within a rolled-
back transaction. Browser tests cover ownership, live updates, responsive profiles
and eight concurrent XP awards without lost increments or an inconsistent public sum.
