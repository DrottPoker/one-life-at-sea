# Projektets konfiguration

Alla justerbara spelregler och drift-/UI-inställningar samlas här. Nuvarande värden bevarar spelets balans och utseende.

| Fil | Vad du ändrar |
| --- | --- |
| gameplay.json | Energy, hälsa, återhämtning, träningskostnad och ökning, åtta startstats, stridskostnad, ammunition, rundor, tidsgränser, skydd, träff-/skadekurvor, boarding, grundutrustning och hamnens sidstorlek. |
| frontend.json | Spelnamn, språk-/datumformat, metadata, loggens tidszon, laddning/uppdateringsintervall, hamnbild och responsiva brytpunkter. |
| theme.css | Färger, typsnitt, sidbredd, stridsbredd, sidopanel, bildhöjd, sidmarginal, touchstorlek och spinnerhastighet. |
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

Exempel: `training.energyCost` styr crew-träningens kostnad och knapptext.
`training.shipMinEnergy` styr sliderns minimum (5), `shipSecondsPerEnergy` arbetstiden per Energy (60)
och `shipEnergyPerUnit` hur många Energy som motsvarar workshopens basökning (5).
`combat.mitigation.fullReductionDefenseRatio` styr när Defense blockerar all skada.
`startingStats.ship.attack` påverkar nya karaktärer; redan tränade stats skrivs inte om.

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
