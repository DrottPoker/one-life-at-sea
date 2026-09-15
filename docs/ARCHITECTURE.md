# First foundation architecture

## Application

Next.js App Router, React, TypeScript and Tailwind. The accepted Caribbean harbor
artwork is served locally from `public/images/harbor.webp`. Shared CSS tokens and
React components implement the compact left navigation and blue panel design.

Server Components load the current player. Client Components handle input,
validation feedback, password visibility, pending states and the active navigation.
Server Actions perform account and character mutations. No browser storage or
mock data substitutes for the database.

## Routes

| Route | Behavior |
| --- | --- |
| `/` | Routes to login or the harbor; incomplete older accounts can finish their name choice. |
| `/register` | Character name, email and password, password confirmation; creates account and character together and opens the harbor. |
| `/login` | Email/password login. |
| `/forgot-password` | Requests a reset email with a neutral account-existence response. |
| `/auth/callback` | Exchanges a PKCE authorization code and accepts only fixed local destinations. |
| `/auth/link-error` | Recovery from expired, reused or invalid account links. |
| `/reset-password` | Sets a new password for an authenticated session. |
| `/create-character` | Compatibility path for older unfinished accounts only; all new registrations already have a character and return to the harbor. |
| `/harbor` | Saved character and harbor overview. |
| `/harbor/marketplace` | Placeholder view. |
| `/harbor/shipyard` | Placeholder view. |

## Authentication

Supabase Auth owns passwords and sessions. Registration requires no email
confirmation in this development release, as requested by the owner.
Anonymous sign-in is disabled. Passwords require 12-128 characters in the app.

`src/proxy.ts` refreshes and validates sessions with `getClaims()`, propagates
updated cookies and sets private, non-cacheable response headers. Server-side
authorization additionally calls `getUser()` for a fresh account lookup.
All private pages and mutations require an authenticated account; a layout alone
does not authorize a Server Action.

The app needs only the publishable key. It does not use a service-role key.
Authorization does not trust user-editable metadata. Cookie-based Server Actions
use Next.js origin checks. The callback destination is restricted to `/` and
`/reset-password`; `SITE_URL` supplies the trusted origin.

Auth request limits are enforced by Supabase, including direct Auth API calls.
Password reset also has a visible resend cooldown. Local rate limits are explicitly
for development. Public operation needs an email provider and suitable abuse controls.
Query logging is disabled so callback codes are not written to Next.js access logs.
Password reset ends existing refresh sessions and asks the player to log in again.
Existing access tokens retain their normal expiry under Supabase's session model.

## Character persistence

`public.characters` stores ID, owning account ID, display name, generated name key,
fixed start location and creation timestamp. Account and character IDs are separate.
No economy, inventory, combat, ships or death mechanics exist in this release.

An `auth.users` insert trigger creates the character in the same transaction as
registration. It reads only `character_name` from user metadata, validates it via
the table constraints and assigns the owner from `new.id`. A rejected name rolls
back the account as well. Changes to Auth metadata after registration never alter
the saved character. Anonymous sign-in remains disabled; the trigger does not
create characters for anonymous Auth records.

Two constraints guarantee one character per account and case-insensitive name
uniqueness. Names are normalized to NFC with single internal spaces. SQL checks
also reject unnormalized or invalid direct API input. Future name changes are not
available. The unique account constraint makes concurrent creation safe.

`is_character_name_available` exposes only a boolean for a proposed name. It is a
public registration hint, not authorization or a reservation. Character rows,
account IDs and email addresses remain private. The registration action checks
availability before signup and again after a rejected signup to explain name
conflicts. Database constraints decide simultaneous requests.

The authenticated database role can select its own row and insert **only the
display_name column**. IDs, owner, location and timestamps are database defaults.
This insert permission is retained for older unfinished development accounts.
It cannot update or delete characters, and the unique owner constraint prevents
any existing player from creating a second character. RLS policies restrict reads and inserts to
the current account, including direct requests to Supabase's Data API.

`private.is_registered_player()` is a narrowly scoped security-definer helper. It
reads only the caller's server-owned Auth record to reject anonymous or deleted
accounts. It has a fixed empty search path, is outside the exposed API schema,
and is executable only by authenticated callers. The application cannot supply
another account ID to it.

The first migration created verification checks. The second records the owner's
decision to allow development signup without email confirmation. The third adds
atomic character creation during signup and the availability function. Apply all
three in order; do not edit applied migration history. Existing characters are
preserved, and unfinished older accounts are not assigned invented names.

The trigger follows [Supabase's documented user-data pattern](https://supabase.com/docs/guides/auth/managing-user-data).
Both new functions use fixed empty search paths. The trigger function is private
and cannot be called directly by clients.

## Local environment and cloud handoff

Supabase runs as the isolated Docker project `one-life-at-sea`. PostgreSQL and Auth
data survive `supabase stop` and subsequent starts. Never use `--no-backup` or
`db reset` to restart ordinary development.

The requested hosted project in Auxron could not be created because the owner's
two active Free project slots are occupied. No existing hosted projects were
paused or changed. All database mutations and browser tests use the local project.

When a hosted slot is available, create the project, apply the recorded migrations,
set the development Auth settings and redirect allowlist, then replace the local
URL and publishable key in the ignored `.env.local`. Rebuild after changing
`NEXT_PUBLIC_` variables. Production email delivery remains a separate setup step.

## Dependencies

Versions and the npm lockfile are pinned. TypeScript 6.0.3 and ESLint 9.39.5 match
the current Next.js ESLint integration: TypeScript 7 and ESLint 10 caused concrete
plugin failures during setup. ESLint 9 is past upstream support; track the Next.js
plugin updates before the first public release rather than silently removing lint.
