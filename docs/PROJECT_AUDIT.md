# Projektgranskning 2026-10-01

Granskningen omfattar SQL-mallar, Server Actions, `src/lib`, komponenter och hooks, skript, tester och all dokumentation. Varje fynd kontrollerades i koden innan det rättades. Rättningarna levererades i åtta commits, och den daterade [leveranshistoriken](archive/history/2026-10-01.md) beskriver varje del. Den förra granskningen från 2026-09-23 finns i [arkivet](archive/audits/2026-09-23.md).

## Viktiga fynd och rättningar

| Fynd | Konsekvens före rättningen | Rättning |
| --- | --- | --- |
| Next.js 16.3.6 saknade sju säkerhetsrättningar | Bland annat en SSRF i bildoptimeringen, som `next/image` använder när appen körs självhostad | Uppgradering till 16.3.8 |
| `unban_player` saknade skyddet som `ban_player` har | En avstängd spelarmoderator kunde häva sin egen avstängning och fortsätta redigera inlägg | Avstängda moderatorer förlorar verktygen; spelarmoderatorer agerar inte på sig själva, administratörer eller andra moderatorer |
| `ITEM_EQUIPPED` saknades i marknadens felmeddelanden | En listning av ett föremål som utrustats i en annan flik låste alla ekonomihandlingar | Meddelandet finns, och ett fel som databasen själv gett släpper alltid den sparade begäran |
| Adminens avbrott av skeppsjobb avräknade inte först | Ett klart men inte avräknat jobb raderades utan återbetalning | `SHIP_JOB_FINISHED`, och generiska adminändringar avräknar förfallna effekter först |
| Felsidorna anropade `reset` | **Try again** visade samma fel igen | `retry`, som hämtar sidan på nytt |
| Forumbilder kunde laddas upp direkt till Storage | Omkodningen kunde kringgås | Bildroute:n visar bara den reserverade WebP-filen |

## Övriga rättningar

- **Databas:**
  - Karma kunde tappa uppdateringar.
  - Reaktionsgränsen kunde kringgås.
  - Populära trådar räknade egna svar.
  - Att radera egna inlägg efter moderering gav kvitto utan ändring.
  - Porträttval räknades som handling även utan ändring.
  - Hull-ändringar i admin gav hälsa i efterhand.
  - `STALE_ROW` kördes om i onödan.
  - `notify_combat` skrev utanför låsmängden.
  - Configgränser och inaktiva lootföremål kunde ge misslyckade eller slumpvisa fel.
- **Server:**
  - Ett manipulerat omröstningsobjekt gav serverfel.
  - Forumets `revalidatePath` angav fel layoutsökväg.
  - Dubblerade id- och textvalidatorer är samlade i `src/lib/validation.ts`.
- **Gränssnitt:**
  - `GameDialog` kunde fastna som öppen.
  - Lokaliserade tal gav fel format och kunde ge hydreringsfel.
  - Ekonominotisen följde med till alla sidor.
  - Trash-dialogen angav fel orsak.
  - Tillbakalänken efter en strid gick alltid till hamnen.
  - Redigerarna navigerade tillbaka efter avmontering.
  - Mastheadens och bläddringens länkar saknade laddningsvy.
  - Tre olika sidbläddrare.
  - Hårdkodad lösenordslängd.
  - `aria-pressed` på knappar som byter etikett.
  - Olika ord för återförsök.
  - Fokus försvann i Marketplace.
  - Blandad brittisk och amerikansk stavning.
- **Skript:**
  - Servicenyckeln kunde skrivas ut vid fel.
  - Ekonomikontrollen hårdkodade guldgränsen.

## Tester och verktyg

- **Testkonton:** registreras när de skapas och raderas när arbetsprocessen avslutas, om ett test misslyckas innan det hinner städa. Tidigare kunde konton bli kvar.
- **Instabila tester:** Testet för populära trådar jämför sidan med databasens rangordning i stället för att anta en global topplista. Fasta pauser är ersatta av signaler: avslutade animationer och en `MutationObserver`.
- **Prestandaspecen:** skapar `.local/` själv.
- **`npm run docs:check`:** validerar även ankare. Sju trasiga ankare i arkivet är lagade.
- **`npm run db:check`:** jämför databasens gameplayrevision och de typade RPC-signaturerna med repot. Det körs före `test:db`, `test:config:db` och `test:e2e`.
- **`npm run test:e2e`:** bygger först.
- **`npm run db:lint`:** kör SQL-linten på varningsnivå.
- **`config:check`:** stoppar en handskriven migration som är nyare än gameplaymigrationen.

## Dokumentation

- **Översättning:** femton dokument som var skrivna på engelska är översatta till svenska.
- **Inaktuella påståenden är rättade:** bland annat stridsbalansen vid höga stats, XP vid missade fångster, Stamina för aktiviteter, spärrade handlingar i Hospital och strid, hälsoticks, sidor som går att nå, Last action, guldets användning och källfiler.
- **Dubbletter:** upprepade balansvärden är ersatta med länkar till det dokument som äger regeln eller med konfignyckeln.
- **Ägarbeslut:** de öppna besluten om profiltext och uppladdade porträtt står i [Roadmap](ROADMAP.md), och beslutet om tavelnamn står i [Forum](FORUMS.md).

## Valda lösningar

- **Moderering:** Spelarmoderatorer agerar inte på administratörers, andra moderatorers eller sitt eget innehåll. Verktygen visas inte där.
- **Populära trådar:** bara svar och likes från andra räknas.
- **Porträtt:** samma porträtt igen räknas inte som handling.
- **Forumbilder:** bildroute:n kontrollerar filens metadata mot reservationen. En fil som inte stämmer visas inte.

## Verifieringsresultat

| Kontroll | Slutresultat |
| --- | --- |
| `npm run check` | Dokumentkontroll med ankare, lint utan varningar, typkontroll, 540 enhetstester och produktionsbygge godkända |
| `npm run test:db` | 2 590 påståenden i 47 filer |
| `npm run test:config:db` | 166 påståenden; alternativ config rullades tillbaka |
| Hela webbläsarsviten | 130 godkända och 1 överhoppad, Edge mot produktionsbygget. Den överhoppade är den opt-in-styrda prestandamätningen. Inga testkonton fanns kvar efteråt |
| `npm run db:check` | Gameplayrevisionen och alla 95 typade RPC-signaturer stämmer |
| `npm run db:lint` | Inga varningar eller fel |
| `npm audit` | 0 kända sårbarheter |
| `npm run audit:economy` | 0 avvikelser i samtliga 8 kontroller |

Varje del verifierades innan den committades; [leveranshistoriken](archive/history/2026-10-01.md) anger resultaten per del. Två nya migrationer, `20261001114109` och `20261001120517`, applicerades endast lokalt. Inga befintliga migrationer ändrades och databasen återställdes inte.

## Kvarstående begränsningar

- Next.js 16.3.8 loggar fortfarande `The destination stream closed early.` vid avbrutna RSC-anrop, se [kodunderhåll](CODE_MAINTENANCE.md#nextjs-stream-cancellation). Gzip-varningen `MaxListenersExceededWarning` finns också kvar.
- I en av de fullständiga webbläsarkörningarna blev inloggningssidan inte interaktiv inom 60 sekunder i testhjälparen. Felet gick inte att återskapa i upprepade körningar och är inte dolt med omförsök.
- Kodkommentaren i `stamina.sql` som kallar aktivitets-RPC:er framtida rättas vid nästa SQL-ändring, eftersom en ren kommentar annars kräver en ny migration.
- Hamnlistan, Hospital och scouting bläddrar med knappar i webbläsaren eftersom deras listor uppdateras live. De har ingen adress per sida.
- Verifieringen gäller den lokala miljön, inte hosted drift, produktionsmejl, backupåterställning eller större samtidig last.
