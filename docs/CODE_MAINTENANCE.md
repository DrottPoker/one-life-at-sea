# Kodstruktur och underhåll

## Filplacering

| Område | Plats |
| --- | --- |
| Rutter, siddata och Server Actions | `src/app/` |
| Gemensam spelram och presentation | `src/components/` |
| Funktionskomponenter | `src/components/admin/`, `combat/`, `forums/`, `inventory/`, `marketplace/`, `messages/`, `training/` |
| React-livscykler | `src/hooks/` |
| Domäntyper, validering, dataåtkomst och rena beräkningar | `src/lib/` |
| Browser-safe respektive server-only configadaptrar | `src/config/` |
| Värden, tema och genereringsmallar | `config/` |
| SQL-källor per system | `supabase/templates/gameplay/` |
| Installerbar databashistorik | `supabase/migrations/` |
| Databastester med rollback | `supabase/tests/` |
| Lokal drift och generering | `scripts/` |
| Enhets-, webbläsartester och gemensamma fixturer | `tests/unit/`, `tests/e2e/`, `tests/support/` |

Next.js och testverktygens rotfiler ligger kvar på de platser verktygen kräver.
`supabase/templates/gameplay.sql` anger delarnas ordning.
Genererad CSS, Supabase-TOML och gameplayrevision redigeras genom sina källor.
Äldre migrationer skrivs aldrig om. Undantaget är en verifierad sammanslagning till baslinje före hosted drift, se [Konfiguration](CONFIGURATION.md#migrationshistorik-och-baslinje).

## Gemensam kod

Använd befintliga hjälpare för validering, formatering, tid, nedräkning och bakgrundshämtning.
`createSnapshotPoller` äger serialisering, timeout, avbrott och sena svar.
`subscribeToForeground` äger webbläsarens fokus-/onlinehändelser.
`game-refresh.tsx` samordnar sidbyten och bakgrundsuppdatering.
`ItemHistoryChart` visar både cirkulations- och marknadsvärdeshistorik.
`Pagination` ger numrerade sidlänkar åt brevposten och forumet.

Ekonomins journal delar lagring och samordning mellan flikar. Serverhandlingar och databaskvitton behåller domänens egna regler. Adminjournalen validerar lagrat innehåll och binder begäran till kontot. Refaktorering måste bevara låsordning, behörighet, atomiska utfall och historiska kvitton.

Ta bort en fil först efter att importer, dynamiska namn, SQL, konfiguration och testbruk har kontrollerats. Äldre datatabeller som fortfarande behövs för import är inte död kod.

## Verifiering vid ändring

- `npm run check`: dokumentlänkar, lint utan varningar, oanvända TypeScript-symboler, enhetstester och produktionsbygge.
- `npm run test:db`: databasbeteende, RLS, behörigheter, kvitton och rollback.
- `npm run test:config:db`: alternativa regler i en transaktion som rullas tillbaka.
- `npm run test:e2e`: verklig lokal Auth, serverhandlingar och webbläsarflöden mot produktionsbygget.
- `npm run audit:economy`: läsande kontroll av ekonomins invariants.

Kör hela sviten när delade livscykler, rättigheter eller navigation ändras.
Testkonton ska använda gemensamma hjälpare och städas även vid testfel. Stäng deras webbläsarsidor före radering så att bakgrundsanrop inte läser borttagna konton. Spara inga inloggningshemligheter i testartefakter.

Next.js 16.3 loggar `⨯ Error: The destination stream closed early.` när en klient avbryter en
strömmad RSC-rendering, till exempel när ett sidbyte avbryter en pågående uppdatering. Det är inget
serverfel: bara GET-renderingen avbryts och inget sparas. React rapporterar avbrottet som ett vanligt
`Error`, medan Next bara tystar `AbortError` och `ResponseAborted`
([vercel/next.js#96704](https://github.com/vercel/next.js/issues/96704)). Rättningen
([#96715](https://github.com/vercel/next.js/pull/96715)) finns i canary men inte i 16.3.6. Ta bort
noteringen efter uppgradering till en version med rättningen. I webbläsartesterna syns raden nästan
en gång per test: när realtidskanalen ansluter efter inloggningen begär `app-frame.tsx` en
uppdatering för att fånga missade ändringar, och testets nästa `page.goto` avbryter den. Playwright
kan inte pålitligt vänta ut den uppdateringen, så testerna gör det inte.

## Dokumentation

[Dokumentindexet](README.md) pekar ut aktuella källor. Regler finns i respektive funktionsdokument, arbetsflöden i konfigurationsguiden och systemgränser i arkitekturen.
Status sammanfattar dagens verifiering. Daterade leveransnoteringar och ersatta planer hör till [arkivet](archive/README.md).
Undvik att kopiera balansvärden och samma regelbeskrivning till flera översikter.

[Projektgranskningen](PROJECT_AUDIT.md) dokumenterar genomförda rättningar och deras verifieringsgränser.
