# First foundation status

Verified locally on 2026-09-15.

## Delivered

- Registration with character name, email and password creates both account and
  character in one transaction, then opens The Harbor. Email confirmation is
  disabled for development, following the owner's decision.
- Login, logout and password recovery through Supabase Auth.
- Character name selection inside registration, validation and case-insensitive
  unique names. No separate character step for new accounts.
- One saved character per account, starting in The Harbor.
- The approved Caribbean illustration, blue panels and compact game layout.
- Left navigation on desktop, navigation above content on narrow screens.
- Marketplace and Shipyard placeholder views with persistent navigation.
- Real local PostgreSQL persistence, migrations and row-level access rules.
- Reproducible setup and verification commands in the README.

## Verification performed

| Check | Result |
| --- | --- |
| `npm run check` | Passed: lint, TypeScript, 21 unit tests and production build. |
| `npm run test:db` | Passed: 29 pgTAP assertions against local PostgreSQL. |
| Browser tests against the production build | All five scenarios passed in a single run against the updated application. |
| Atomic registration and one character per account | Passed: simultaneous signup with the same name creates one winner; the other account is rolled back and can retry. Extra character inserts are rejected. |
| Local database lint | No schema errors in `public` and `private`. |
| Local Supabase advisors | No issues reported. |
| Dependency audit during installation | Zero known vulnerabilities reported. |
| Visual inspection | Updated desktop/mobile registration screenshots and the harbor layout reviewed. |
| Keyboard review | Passed: skip link, field order, password visibility toggle, visible focus and navigation to login. |
| Actual web server restart | The existing session and saved character remained available after restarting Next.js. |

The browser scenarios cover registration with immediate character creation and
no confirmation email, invalid and taken names, retrying with the same email,
reload, logout/login, menu navigation, password recovery
through the local Mailpit inbox, old-password rejection, unauthorized routes,
invalid callbacks and rejected external callback destinations.

Direct API checks cover two-account isolation, anonymous access, concurrent
registration, second-character rejection, ignored metadata changes and attempted
owner/location manipulation. Failed signup with a missing name or taken name
leaves no account that can log in. Database checks separately
exercise constraints, privileges and row-level policies. Responsive checks cover
1280, 768, 375 and 320 pixel viewport widths. The separate visual smoke run reported
no browser JavaScript errors and confirmed persistence across a web server restart.

Tests create isolated, generated accounts under `example.test` in local Supabase.
They do not run against a hosted project. Unit and database tests do not require
email delivery; browser recovery tests read only the local test inbox.

## Environment and remaining limits

Older unfinished development accounts retain a one-time name selection path.
Existing characters were preserved by the new migration.

The application currently runs at <http://127.0.0.1:3000> with real Supabase
services in Docker. It has not been publicly deployed.

Creating the requested Supabase Free project in Auxron was rejected because the
owner's two active Free project slots were already occupied. Existing projects
were not changed. A hosted slot is needed before connecting this application to
Supabase Cloud. The local setup allows the agreed foundation to be used now.

External email delivery, public hosting and production abuse controls remain
future setup work. Registration intentionally does not verify email ownership.
Password recovery currently uses the local Mailpit inbox.

TypeScript and ESLint use versions compatible with the installed Next.js plugins.
ESLint 9 is past upstream support; the compatibility limitation and upgrade work
before public release are recorded in [ARCHITECTURE.md](ARCHITECTURE.md).

No economy, inventory, ship ownership, combat, multiplayer interactions or
permanent-death mechanics have been implemented. The next gameplay step remains
an owner decision after trying this foundation.
