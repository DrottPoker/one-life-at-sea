# Kodstruktur och fortsatt utveckling

Genomgång och städning genomförd 2026-09-20. Aktuella verifieringsresultat finns i
[implementationsstatus](IMPLEMENTATION_STATUS.md).

## Ansvarsfördelning

| Område | Plats |
| --- | --- |
| Rutter, serverdata och mutationer | `src/app/` |
| Presentation och lokal interaktion | `src/components/` |
| Inventorybilder och expanderade detaljer | `src/components/inventory/` |
| Gemensam nedräkning mot servertid | `src/hooks/use-server-countdown.ts` |
| Serialiserad hämtning av nya snapshots | `src/lib/snapshot-poller.ts` |
| Fokus, återanslutning och återkomst till fliken | `src/lib/browser-events.ts` |
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
