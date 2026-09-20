# Kodstruktur och fortsatt utveckling

Genomgång och städning genomförd 2026-09-20. Aktuella verifieringsresultat finns i
[implementationsstatus](IMPLEMENTATION_STATUS.md).

## Ansvarsfördelning

| Område | Plats |
| --- | --- |
| Rutter, serverdata och mutationer | `src/app/` |
| Presentation och lokal interaktion | `src/components/` |
| Inventorybilder och expanderade detaljer | `src/components/inventory/` |
| Marknadsvyer, formulär och återförsök | `src/components/marketplace/`, `src/lib/marketplace.ts` |
| Marknadens lager, köp och listning | `supabase/templates/gameplay/marketplace-*.sql` |
| Gemensam nedräkning mot servertid | `src/hooks/use-server-countdown.ts` |
| Serialiserad hämtning av nya snapshots | `src/lib/snapshot-poller.ts` |
| Fokus, återanslutning och återkomst till fliken | `src/lib/browser-events.ts` |
| Omedelbar sidåterkoppling och Next.js-länkar | `src/components/game-navigation.tsx`, `content-loading.tsx` |
| Gemensam navigationspolicy för Hospital, strid och resa | `src/lib/game-navigation.ts` |
| Havsresor och sparade alternativ | `supabase/templates/gameplay/sea-travel.sql`, `src/lib/sea-travel.ts` |
| Generell validering och formatering | `src/lib/validation.ts`, `format.ts`, `time.ts` |
| Spelregler och visningsvärden | `config/` |
| Databasfunktioner per funktionsområde | `supabase/templates/gameplay/` |
| Gemensamma lokala testkonton och SQL-hjälpare | `tests/support/accounts.ts` |

`supabase/templates/gameplay.sql` anger SQL-delarnas ordning. Generatorn sätter ihop
delarna innan configvärden ersätts. Uppdelningen gav exakt samma genererade SQL och
versionshash som tidigare. Installerade migrationer är oförändrade.

## Genomförda förbättringar

- Skeppsarbete, sjukhus och strid använder samma nedräkning med serverankare och
  monoton lokaltid. Nya snapshots ersätter ankaret utan att visa föregående nedräkning.
- Profilens sjukhusstatus och patientlistan delar hämtning, avbrott, återförsök och
  sammanslagning av uppdateringssignaler. En gammal begäran får inte skriva efter avmontering.
- AppFrame äger sidans uppdatering vid fokus och återanslutning. GameStateProvider
  schemalägger enbart spelresursernas tidsgränser, vilket tar bort dubbla fokusuppdateringar.
- Inventoryns bilder och itemdetaljer är separerade från listans filtrering och Trash-flöde.
- UUID-validering hör inte längre till stridsmodulen. Statformattering hör inte längre
  till träningsmodulen. Formaterare återanvänds mellan anrop.
- Inventory-, hospital- och admintester delar kontoskapande, inloggning, lokal
  databasåtkomst och städning av sina egna testkonton.
- Oanvänd CSS för tidigare spelram och e-postbekräftelse är borttagen.
- TypeScript avvisar oanvända lokala variabler och parametrar. Ignorerade experiment i
  `.local/` ingår inte längre i projektets typkontroll.

## Vid nästa ändring

Lägg nya spelregler i rätt SQL-del och config, kör `npm run config:sync` och skapa
nya migrationer när reglerna ändras. Redigera inte äldre migrationer eller genererad CSS.

Behåll domänspecifika kvitton, behörighetskontroller och idempotens vid refaktorering.
Dela gemensamma livscykler och representationer när de faktiskt har samma regler;
olika spelhandlingar behöver inte en gemensam abstraktion bara för att deras formulär liknar varandra.

Kör `npm run check` och relevanta webbläsar-/databastester. Vid breda ändringar i
delad kod ska hela webbläsarsviten verifieras. Befintliga designplaner är historik
eller framtida förslag; följ funktionsdokumenten och faktisk kod för aktuellt beteende.

Bakgrundsuppdatering samordnas via `game-refresh.tsx`: länkens vänteläge och
spellayoutens laddningsgräns skjuter upp AppFrames uppdatering. GameStateProvider
använder samma kö för resurser och reseankomst. En fokusuppdatering mitt i ett
sidbyte kan därmed inte låsa den nästa navigationen.

Ekonomins klientjournal finns i `src/lib/economy-journal.ts` och
`src/components/economy-requests.tsx`. Den delar lagring och återhämtning medan
serverhandlingar och databaskvitton behåller sina egna domänregler.
`npm run audit:economy` kontrollerar lokal ekonomiintegritet utan att ändra data.
Se [ekonomigranskningen](ECONOMY_AUDIT.md).
