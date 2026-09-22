# Projektets konfiguration

Alla justerbara spelregler och drift-/UI-inställningar samlas här. Nuvarande värden bevarar spelets balans och utseende.

| Fil | Vad du ändrar |
| --- | --- |
| gameplay.json | Stamina, Crew Morale, tavernpriser, Energy, hälsa, återhämtning, träningskostnad och ökning, åtta startstats, stridskostnad, ammunition, rundor, tidsgränser, skydd, träff-/skadekurvor, boarding, grundutrustning hamnens sidstorlek samt seaTravel med avgångskostnad, restider, platstyper samt scoutingens pris och sidstorlek. Marketplace styr avgift, popularitetsfönster, sidstorlekar och batchgräns; inventory styr katalog och handelsbarhet. |
| frontend.json | Spelnamn, språk-/datumformat, metadata, loggens tidszon, laddning/uppdateringsintervall, hamnbild, dag/natt-cykel och responsiva brytpunkter. |
| theme.css | Färger, typsnitt, sidbredd, stridsbredd, sidopanel, bildhöjd, fast bakgrundsbild, sidmarginal, touchstorlek och spinnerhastighet. |
| interface.css.template | Detaljerad CSS för gränssnittet; brytpunkter hämtas från frontend.json. |
| auth.json | E-post-/lösenordslängder och väntetid för lösenordsåterställning. |
| server.json | Lokala portar, Supabase-projekt-ID, databasåterförsök och isolerade testfönster. |
| supabase.toml | Supabase-tjänster, PostgreSQL-version, Auth, JWT, e-post och anropsgränser. Delade värden har config-tokens. |
| next.ts | Next.js-inställningar och HTTP-säkerhetsheaders. |
| testing.json | Testwebbläsare, parallellitet och testtimeout. |
| schema.json | Tillåtna configfält, typer och gränser. Ändras när utvecklare lägger till en ny inställning. |

## Ändra spelbalans

1. Ändra värdet i gameplay.json.
2. Kör `npm run config:sync`.
3. Kör `npm run db:migrate` för att applicera den nya migrationen i lokal Supabase.
4. Ladda om spelet. Produktionsbyggen behöver byggas och driftsättas igen.

`resources.energyRecoverySeconds` anger fasta servergränser i hamnen (300 sekunder).
Till havs och under resor används dubbla intervallet (600). `energyRecoveryAmount` är
samma heltalsbelopp (5) på varje tick. Se [Energy](../docs/ENERGY_RECOVERY.md).

`morale` styr spann, kostnad per Crew-Energy, fasta tickintervall, återgång mot 0,
bonus i basis points och tavernmåltidens effekt/pris. Morale stöder en decimal.
Aktuella standardvärden: ±100, 0,5/Energy, 5 mot 0 var 300:e sekund,
500 basis points (5 %) och +25 för 1 000 Gold Coins.
Se [Crew Morale](../docs/CREW_MORALE.md).

Exempel: `training.energyCost` styr crew-träningens kostnad och knapptext.
`training.shipMinEnergy` styr sliderns minimum (5), `shipSecondsPerEnergy` arbetstiden per Energy (6, alltså 30 sekunder per 5 Energy)
och `training.energyPerUnit` referensenheten (5) för både Crew och Ship.
Varje nivå har `efficiency`. `statScale` (1000) och `statExponent` (0,6) styr
statberoendet. Varje Energy avrundas till sex decimaler och ökar den virtuella staten
före nästa enhet. Se [exakta träningsregler](../docs/TRAINING_FOUNDATION.md).
`combat.mitigation.fullReductionDefenseRatio` styr när Defense blockerar all skada.
`startingStats.ship.attack` påverkar nya karaktärer; redan tränade stats skrivs inte om.

Marketplace har `feeBps` (500 = 5 %), `popularityHours` (12), `valueWindowHours` (12), `pageSize` (30),
`listingsPageSize` (20 per expansion eller sida i egna listings) och `maxBatchSize` (25). Avgiften sparas per listing;
ändringar gäller nya erbjudanden. `inventory.items[].tradable` styr tillsammans
med `active` om ett item får säljas. Återtagning av befintliga listings är kvar.
Se [Marketplace](../docs/MARKETPLACE.md).

## Ändra UI eller server

Kör `npm run config:sync` efter JSON-, CSS-mall- eller Supabase-ändringar. Det skapar bara
en gameplaymigration om gameplay eller dess SQL-mall faktiskt ändrats. Vanliga färgändringar i
theme.css behöver ingen generering. Next.js behöver startas om efter next.ts- eller serverändringar.
Supabase-inställningar kräver omstart av den lokala stacken; det raderar inte dess sparade data.

## Hemligheter

Nycklar, lösenord, anslutningar och miljöspecifik SITE_URL hör hemma i projektets ignorerade
.env.local. Den får läsas och ändras vid arbete med miljön enligt ägarens instruktion.
Lägg aldrig hemligheter i dessa versionshanterade filer. .env.example innehåller endast exempel.

Se [den fullständiga guiden](../docs/CONFIGURATION.md) för verifiering, deployordning och begränsningar.

Gränssnittets navy-/guldtema och den fasta hamnbakgrunden beskrivs i
[designgrunden](../docs/INTERFACE_DESIGN.md). Bakgrundens sökväg ändras via
--o-background-image och --o-night-background-image i theme.css. Spelmodulen scrollar med dokumentet.
frontend.json innehåller dayNight: dag börjar 06:00 och natt 21:00 UTC. Se [dag/natt-cykeln](../docs/DAY_NIGHT_CYCLE.md).

`resources.energyStorageMax` är 1 000; återhämtning stannar vid `energyMax` (100).
`stamina.storageMaximum` är 200 och `stamina.maximum` är återhämtningsgränsen 50, `recoveryAmount` 1, `recoverySeconds` 300 och `activityCost` 1.
Alla kommande yrkesaktiviteter använder samma grundkostnad. Se [Stamina](../docs/STAMINA.md).

`skills.catalog` definierar färdigheter och `skills.xpThresholds` deras gemensamma
XP-tabell för nivå 1-99. Samma tabell används i SQL och UI; befintliga XP bevaras vid synk.

`activities.catalog` anger de tre första aktiviteterna, deras färdigheter och XP-belöning
(10). Kostnaden är `stamina.activityCost` (1). Fältet `active` kan stänga av en aktivitet
utan att historiska kvitton påverkas. Se [Activities](../docs/ACTIVITIES.md).

Item definitions edited or created in Admin are preserved by config:sync (managed_by_admin). Loot tables and activity loot settings are database-owned. See docs/ADMIN_PANEL.md and docs/LOOT_TABLES.md. Local Storage is enabled for administrator item image uploads.
