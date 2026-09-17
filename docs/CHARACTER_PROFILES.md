> Uppdatering 2026-09-16: aktuella stridsregler och implementation finns i [COMBAT_SYSTEM.md](COMBAT_SYSTEM.md). Den nya versionen använder en gemensam /attack-vy, flera angripare, realtid och publika rapporter. Äldre beskrivningar av separata prepare-sidor, exklusiv tvåpartsstrid eller privata slutrapporter nedan är historiska.

# Character profiles

## Implemented scope

- Each character has a profile at `/characters/<character-id>`.
- The interface is in English and uses the shared, compact blue game layout.
- `My Profile` in the character panel opens the current player's profile.
- Names in the realtime harbor roster link to the corresponding profile.
  Profile links prefetch on pointer hover or keyboard focus to avoid fetching
  every profile in the list at once.
- A simple anchor portrait accompanies the captain's name, location, creation
  date and character age. The current player sees `Your character` on their profile.
- Creation dates use UTC and English date formatting. Age counts completed
  24-hour periods since character creation; it is not a skill level.
- The sidebar always shows the viewing player's character and resources.
- Existing links, browser history and deep links work. A loading boundary keeps
  the shared frame visible, and missing profiles have a route back to The Harbor.
- Profiles require login and character creation, including direct page visits.
- Other profiles have Attack, opening a free combat preparation view.
- Your own profile has Defence orders and a link to the active or last fight.
  The saved defence preset applies to future encounters, including while offline.

## Data boundaries

`public.character_profiles` contains only `character_id`, `display_name`,
`location` and `created_at`. Row-level security allows registered,
non-anonymous accounts to read these identity fields. Clients cannot insert,
update or delete profile records.

A private database trigger copies profile fields from the character on signup
and server-owned name, location or date changes. Existing characters are
backfilled. Character deletion cascades to its profile. Private resource and
stat changes do not rewrite the projection.

Profiles are independent of the harbor roster, so their identity is retained
when travel is introduced. The profile uses a server snapshot and has no
dedicated realtime subscription. It does not infer online status from location.

Account IDs, email, Energy, health and combat stats are absent from this table.
The private character table keeps its existing owner-only access rules.
The profile table is not added to the Realtime publication.

## Future additions

Portrait uploads, biographies, messaging, trading, equipment, achievements and
additional visible statistics can be designed separately. Combat interactions
are implemented as described in [COMBAT_SYSTEM.md](COMBAT_SYSTEM.md).

## Local database

The sixth migration, `20260915222700_add_character_profiles.sql`, creates the
read model and its synchronization trigger. It is applied locally without
resetting or replacing character data.
