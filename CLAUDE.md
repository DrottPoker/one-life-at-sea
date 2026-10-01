@AGENTS.md

# One Life At Sea

Text-based social pirate RPG. Next.js 16 App Router + React 19 + TypeScript in front, Supabase Auth + PostgreSQL behind, run locally in Docker. The game UI is in English, the documentation in `docs/` is in Swedish, code and comments are in English.

Start with [docs/README.md](docs/README.md) (index), [ARCHITECTURE](docs/ARCHITECTURE.md), [CODE_MAINTENANCE](docs/CODE_MAINTENANCE.md) and [CONFIGURATION](docs/CONFIGURATION.md). Each game system has its own rule document; read it before changing that system.

## Non-negotiable rules

- PostgreSQL is authoritative for every game outcome: resources, randomness, deadlines, ownership, permissions. The client only previews. Server Actions in `src/app/*-actions.ts` validate input and call typed RPCs; SQL re-checks everything.
- Mutations are idempotent through database receipts and respect the shared character lock order. Refactors must keep lock order, authorization, atomic outcomes and historical receipts intact.
- Never edit an existing migration. Never run `supabase db reset` or `supabase stop --no-backup` against the project stack; the local database holds the user's accounts and data.
- Do not edit generated files directly: `src/styles/interface.generated.css`, `supabase/config.toml`, `src/config/gameplay-revision.json` and `central_gameplay_config_*` migrations come from `config/` and `supabase/templates/`.
- Balance values live in `config/gameplay.json` (types and limits in `config/schema.json`, cross-field checks in `scripts/config/core.mjs`). Do not hard-code them in TS or SQL.
- `src/lib/database.types.ts` is hand-maintained; update it when an RPC signature changes.
- The Supabase MCP connector points at a cloud account. This project is local-only: never apply migrations or SQL to a hosted project unless the user explicitly asks.

## Changing game rules or SQL

SQL source lives in `supabase/templates/gameplay/*.sql`, ordered by `supabase/templates/gameplay.sql`. Every change regenerates the full gameplay SQL as a new migration:

```powershell
npm run config:sync   # regenerates artifacts and creates a new migration if gameplay/SQL changed
npm run db:migrate    # applies it to the local stack only
```

`config:check` runs before dev, build, migrate and integration tests and fails on stale artifacts. Template parts are order-dependent (one part may drop a trigger another recreates), so never hand-write partial gameplay migrations.

Tables created before the template system (for example `public.characters`) are defined in `supabase/migrations/20260923111042_baseline.sql`. Search `supabase/templates/` for current function definitions; the migrations are generated snapshots.

## Commands and verification

| Command | Covers |
| --- | --- |
| `npm run check` | docs links and anchors, lint (zero warnings), typecheck, unit tests, production build |
| `npm run test:db` | pgTAP: behavior, RLS, grants, receipts (needs local stack) |
| `npm run test:config:db` | alternative config values in a rolled-back transaction |
| `npm run test:e2e` | builds, checks the database, then Playwright in Edge against the production build on port 3100 |
| `npm run db:check` | local database runs the repository's gameplay revision; typed RPC signatures match (also before `test:db`) |
| `npm run db:lint` | Supabase SQL lint of `public` and `private` at warning level |
| `npm run audit:economy` | read-only economy invariants |

Run the full suite when shared lifecycles, permissions or navigation change. E2E tests create and clean up their own accounts; never store credentials in test artifacts. Report actual results only.

## Environment (Windows)

- Node >= 22.14 is required (system install in `C:\Program Files\nodejs`; nvm default in Git Bash points to `system`).
- Docker Desktop must be running. Start and stop the stack with `npm run db:start` / `npm run db:stop` (data is kept). `npm run db:status` shows URLs without keys.
- If `db:start` fails with "bind: An attempt was made to access a socket in a way forbidden", Windows WinNAT has reserved the 543xx ports (`netsh interface ipv4 show excludedportrange protocol=tcp`). The user must fix it in an admin shell; do not change ports to work around it.
- Put temporary scripts, logs and screenshots in the session scratchpad, not in the repo. `.local/player-browsers/` holds the user's logged-in test profiles for `npm run dev:players`; do not touch it.
- `.claude/launch.json` starts the dev server on http://127.0.0.1:3000 for the browser preview.

## Style

- Match the existing dense style: long lines, compact declarations, few comments. There is no Prettier; ESLint (`eslint-config-next`) and `tsc` with `noUnusedLocals` are the gates.
- Keep a shared helper's ownership (`createSnapshotPoller`, `subscribeToForeground`, `game-refresh.tsx`, the economy/admin/mail journals) rather than reimplementing it.

## Git

Overrides the global rule: commit directly on `main` after each completed and verified task, without asking. Group unrelated changes into separate commits, stage explicit paths (never secrets or `.env*`), write an English imperative subject line and no AI attribution. Never push, reset, rebase or amend unless the user asks.

## Documentation

Update the existing feature document when behavior changes, and record dated delivery notes in `docs/archive/history/YYYY-MM-DD.md` (linked from `docs/archive/README.md`). Do not copy balance values or the same rule into several overviews. Each doc outside the archive has exactly one `#` title; `npm run docs:check` validates links.
