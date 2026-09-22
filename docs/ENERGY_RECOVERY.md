# Energy på fasta serverklockslag

Implementerat lokalt 2026-09-20. Detta ersätter både individuella återhämtningstimers
och den tidigare pausen till havs.

## Regler

| Position | Tillskott | Fasta klockslag varje timme |
| --- | --- | --- |
| Hamnen, inklusive Hospital | +5 Energy | :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55 |
| Havsplats och pågående resa i båda riktningarna | +5 Energy | :00, :10, :20, :30, :40, :50 |

Energy lagras och returneras som heltal, med högst 1 000. Naturlig återhämtning stannar vid 100.
Överskott bevaras utan nygenerering tills saldot faller under 100. Ingen delad tilldelning
på 2,5 används. Alla kaptener använder samma servergränser, oavsett senaste
handling, inloggning, webbläsarklocka eller tidszon. Hälsans timers ändras inte.

Exempel: 40 Energy i hamnen vid 12:04:58 blir 45 vid 12:05:00.
Till havs sker inget tillskott 12:05:00, men +5 vid 12:10:00.
Att spendera Energy 12:04:59 flyttar inte nästa tick.

Tillskott räknas även offline och under strid. Full mätare sparar inga extra ticks.
På en havsplats kan nytillkommen Energy användas direkt för scouting eller stridsstart;
andra aktivitetslås gäller fortfarande.

## Serverberäkning

PostgreSQLs klocka avgör utfallet. `private.energy_tick_snapshot` räknar passerade
fasta UTC-gränser från Unix-epoken mellan `energy_updated_at` och observationstiden.
Fältet är en avräkningstidpunkt, inte en timer som startar om vid varje handling.

Spelstatus räknar fram aktuellt saldo utan att skriva till alla karaktärer varje tick.
Handlingar låser karaktären och sparar återhämtat saldo före debitering. Det ger samma
globala tickutfall för aktiva och offlinekaptener utan en massuppdatering eller cron-jobb.
Upprepade läsningar och idempotenta återförsök kan inte dela ut samma Energy igen.

`energy_next_at` innehåller nästa absoluta servergräns, eller null vid full Energy.
GameStateProvider hämtar bekräftad spelstatus vid denna deadline. Sidopanelen visar
aktuellt saldo och återhämtningstakt i en tooltip; klienten delar inte ut Energy själv.

## Byte av plats

Avfärd räknar först hamnens intjänade Energy, betalar 5 och byter till havets takt.
Vidare resa och hemresa är fortsatt gratis. Alla havslägen använder samma takt.

En hemkomst gäller vid sparad `travel_arrives_at`, även om ägaren loggar in senare.
Servern räknar havsticks före ankomsten och hamnticks från ankomsten. Ett tick exakt
vid ankomst tillhör hamnen och räknas en gång. Hemkomst 12:12 ger nästa tillskott
12:15; hemkomst exakt 12:10 får ett tillskott vid 12:10.

Hospital-intagning avslutar resan, räknar redan intjänad Energy och använder hamnens
takt från intagningen. En tidigare inträffad hemkomst respekteras. Distansrekord,
stridslås och hälsoregler ändras inte.

## Konfiguration och migration

`resources.energyRecoveryAmount` är 5, `energyRecoverySeconds` är 300 och
`energyMax` är återhämtningsgränsen 100 och `energyStorageMax` är lagringsgränsen 1 000. Havets intervall är alltid dubbla basintervallet. Beloppet är
fortfarande ett heltal även med alternativ konfiguration.

Canonical SQL finns i `supabase/templates/gameplay/resources.sql`, med integration
i game-state, sea-travel och sea-scouting. Generera nya migrationer via
`npm run config:sync`; redigera inte redan applicerade migrationsfiler.

Migrationen `20260920040446_central_gameplay_config_51219ed7af39.sql`:
- Räknar befintlig återhämtning med de gamla reglerna en sista gång under tabellås.
- Färdigställer redan anlända resor och bevarar befintliga saldon, stats och rekord.
- Börjar räkna nya globala ticks från övergångstidpunkten, utan retroaktiva havstillskott.
- Tar bort `energy_paused_at` och dess pausvillkor. `energy` förblir PostgreSQL integer.
- Kör övergången endast när det gamla pausfältet finns.

Den tidigare individuella timerns delintervall överförs inte som extra Energy.
Nästa tillskott följer det nya gemensamma klockslaget.

## Verifiering

`supabase/tests/resource-overflow.test.sql` provar överfyllning, hårda gränser, adminpåfyllning,
förbrukning och återupptagen återhämtning. `tests/e2e/resource-overflow.spec.ts` verifierar
adminflödet, fyllda bars, mobilbredd och skeppsarbete med 1 000 Energy.

`supabase/tests/energy-ticks.test.sql` provar gränser före/exakt på/efter ticks,
olika tidigare handlingstider, heltal, maxvärde, offlineåterhämtning, klockåtergång,
tidszonsskifte, utresa, hemkomst, idempotens, serverdeadlines samt omedelbar användning
av återhämtad Energy till träning och scouting.

`tests/e2e/energy-ticks.spec.ts` kontrollerar visade serverklockslag och takt i hamnen,
under resa och vid havsplats, samt betald scouting med nyligen intjänad Energy.
Övriga kostnadstester använder ett framtida checkpoint på sina testkonton så att
ett verkligt klockslag under testkörningen inte ändrar deras förväntade saldo.
Återhämtningstesterna sätter uttryckligen tidsstämplar runt serverns verkliga gränser.

Se [implementationsstatus](IMPLEMENTATION_STATUS.md) för körda kontroller.
