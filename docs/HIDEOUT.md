# Hideout

The Hideout is each captain's home in The Harbor. It houses Crafting and is the future home of Cooking
and similar domestic activities, with upgrades planned for the home itself
and its workspaces.

## Current page

- `/hideout` is available from the shared navigation and the harbor directory.
- The page welcomes the signed-in character to their own modest quarters.
- The Kitchen and Workshop introduce Cooking and Crafting. Their level and XP come
  from the owner's existing private skill progression, also used by their profile.
- Crafting opens `/hideout/crafting` with available recipes and owned materials.
  Its first instant recipe consumes 5 Oak Logs to create 1 Oak Plank. See [Crafting](CRAFTING.md).
- Cooking and Hideout upgrades remain marked Coming later. No home levels, bonuses
  or upgrade prices are defined yet.
- Inventory and Activities links let the player inspect belongings and gather supplies.
- The layout follows the existing navy/gold interface, responsive navigation and
  persistent sidebar. The welcome and workspace icons use the shared Lucide set.

## Access and state

The Server Component uses `requireCharacter()` and `ownSkillProgress()`. Login and a
character are required. Character identity always comes from the authenticated account;
there is no public home lookup or caller-selected owner. Existing hospital, sea, journey
and attacker navigation locks apply. The navigation disables Hideout while away from
The Harbor or in hospital, and direct URLs obey the same server-side restrictions.

Visiting home does not move the character, spend resources, give recovery bonuses or
change skill XP. Normal page navigation still records Last action. Home is currently a
view belonging to every character, with no separately mutable upgrade state. The home view itself needs no
mutable database state; Crafting uses its own private recipes and action receipts.

## Later gameplay

Future upgrades should persist per character in the database, with explicit upgrade
requirements and server-authoritative costs. Cooking and future workshop features
should use the existing inventory, skill progression, action locks and idempotent
receipt conventions. Additional recipes, XP rewards, station requirements and
upgrade balance remain to be designed.

## Verification

Browser coverage checks owner identity/private skills, logged-out redirects, keyboard
navigation and history, preserved sidebar/resources, useful links, hospital and sea
restrictions, and layouts at 1440/768/375/320px. Disposable fixtures cover existing XP
without introducing gameplay rewards into the page.
