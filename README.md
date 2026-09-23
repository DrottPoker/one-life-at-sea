# One Life At Sea

Ett webbaserat, socialt pirat-RPG med beständig karaktär och progression. Spelets gränssnitt är på engelska.

Next.js, React och TypeScript står för gränssnittet. Supabase Auth och PostgreSQL äger konton, behörigheter och spelregler. Databasen beräknar och sparar alla spelutfall.

## Starta lokalt

Kräver Node.js 22.14 eller senare, npm och Docker Desktop med Linux-containrar.

```powershell
npm ci
npm run db:start
npm run setup:local
npm run db:migrate
npm run dev
```

Öppna [spelet](http://127.0.0.1:3000). `setup:local` skapar en saknad `.env.local` utan att skriva ut nycklar och skriver aldrig över en befintlig fil. Nästa gång räcker `db:start` och `dev`, samt `db:migrate` om nya migrationer finns.

[Supabase Studio](http://127.0.0.1:54323) administrerar den lokala databasen.
[Testinkorgen](http://127.0.0.1:54324) tar emot lokala återställningsmejl.
`npm run db:status` visar status utan nycklar. `npm run db:stop` behåller data.
Använd inte `supabase db reset` eller `stop --no-backup` för en vanlig omstart.

För ett lokalt produktionsbygge: `npm run build`, sedan `npm run start`.
För separata inloggningar: `npm run dev:players`, se [testfönster](docs/DEVELOPMENT_TEST_WINDOWS.md).

## Implementerat

- Konto, återställning, beständig karaktär, publika spelar-ID:n, profiler och närvaro.
- Resurser, Crew Training, tidsstyrt skeppsarbete med materialkostnader och Hospital.
- Havsresor, scouting, gemensamma PvP-strider och offentliga stridsrapporter.
- Skills, aktiviteter med loot, Hideout och Crafting.
- Inventory, bank, Marketplace samt cirkulations- och prishistorik.
- Privat brevpost, notiser och en behörighetsstyrd adminpanel med revisionslogg.

Aktuella regler finns i [dokumentindexet](docs/README.md).
[Status](docs/IMPLEMENTATION_STATUS.md) skiljer verifierade funktioner från kvarstående arbete.
[Framtida funktioner](docs/ROADMAP.md) omfattar bland annat Equip/Use, matlagning och fraktionssystem.

## Utveckling och kontroll

Justerbara värden finns i [config](config/README.md). Följ [konfigurationsguiden](docs/CONFIGURATION.md) vid ändringar i spelregler, SQL eller genererade filer.

```powershell
npm run check
npm run test:db
npm run test:config:db
npm run test:e2e
npm run audit:economy
```

`check` kontrollerar dokumentlänkar, lint, typer, enhetstester och produktionsbygge.
Databastesterna kräver den lokala Supabase-stacken. Webbläsartester använder Edge och startar produktionsbygget på port 3100. De skapar egna testkonton; automatiska traces, video och screenshots är avstängda för att skydda inloggningsuppgifter.

Se [arkitektur](docs/ARCHITECTURE.md), [kodunderhåll](docs/CODE_MAINTENANCE.md) och [projektgranskning](docs/PROJECT_AUDIT.md).
Molndrift, produktionsmejl och offentlig publicering behöver verifieras separat från lokal utveckling.
