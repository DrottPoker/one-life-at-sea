# Konfiguration och projektstruktur

Uppdaterat 2026-09-21.

## Källor och ansvar

```text
config/                    Justerbara värden och gränssnittets tema/CSS
src/config/                Typade importvägar och kontroll av databasversion
src/app/                   Next.js-rutter och serverhandlingar
src/components/            Återanvändbara gränssnitt och funktionskomponenter
src/hooks/                 Gemensamma React-livscykler
src/lib/                   Typer, dataåtkomst och domänfunktioner
src/styles/                Genererad CSS, redigeras inte manuellt
supabase/templates/        Underhållbar SQL-logik med config-tokens
supabase/migrations/       Oföränderliga databasmigrationer
supabase/tests/            Transaktionella databastester
scripts/config/            Validering, generering och alternativt balanstest
tests/unit/                Enhetstester, inklusive configkontrakt
tests/e2e/                 Webbläsartester
tests/support/             Gemensam lokal testmiljö
.env.local                 Ignorerade hemligheter och miljöanslutningar
```

Startpunkt: [config/README.md](../config/README.md). Native konfigurationsfiler som next.config.ts,
playwright.config.ts och vitest.config.ts finns kvar där verktygen kräver dem, men hämtar inställningar från config/.
supabase/config.toml är en genererad adapter. package.json innehåller kommandon och beroendeversioner.

### Gameplay

config/gameplay.json är värdekällan för både app och databas. Privata SQL-funktioner beräknar fortfarande
alla utfall och debiteringar. Webbläsaren kan inte välja kostnad, skadevärde eller slumpresultat.

scripts/config läser inkluderingsordningen i supabase/templates/gameplay.sql, sätter ihop delarna i
supabase/templates/gameplay/ och ersätter typkontrollerade skalära tokens. Ändra funktionen i rätt
funktionsdel; genererad SQL jämförs fortfarande i sin helhet mot senaste configmigrationen.
Training innehåller crewTiers och shipTiers. Generatorn skriver deterministiska SQL-kataloger
från dessa listor. Nivå-ID och ordning får inte ändras eller tas bort när de har installerats.
XP-krav och efficiency måste stiga och första nivån är gratis vid 0 XP.
Båda träningsgrupper använder energyPerUnit (5), statScale (1000) och statExponent (0,6).
Varje Energy räknas med den virtuellt ökade valda staten, avrundat till sex decimaler.
Se [träningsreglerna](TRAINING_FOUNDATION.md) för den exakta algoritmen.
Skeppsarbete använder dessutom shipMinEnergy (5) och shipSecondsPerEnergy (6, alltså 30 sekunder per 5 Energy).
Sliderns maxvärde är aktuell Energy. Konfigurationen begränsar Energykapaciteten till
10 000 för att hålla beräkningen ändlig; dagens kapacitet är fortsatt 100.
Effektivitet måste vara positiv, högst 1000, ha högst sex decimaler och ge en positiv
avrundad Energy-enhet. Exponenten måste ligga mellan 0,01 och 0,99.
Perfect Drill-chansen anges i basispunkter: 100 är 1 %. Sammansatta belöningar,
XP och tider kontrolleras mot sina numeriska gränser. Pågående jobb och kvitton
behåller sparade utfall vid configbyten. Alternativa kurvor testas med rollback.
Textvärden citeras och SQL-escapas. En ändring ger en ny migration via Supabase CLI; äldre migrationer
skrivs aldrig om. Samma värden används för kolumndefaults, relevanta CHECK-gränser, RPC-validering,
återhämtning, deltagarlogik och skadefunktioner.

Gränssnittet läser samma publika JSON-värden. Även knapptexter, valideringsmeddelanden, återhämtningstexter,
rundräknare och hälsostaplarnas procent använder dem. Hälsomax är gemensamt för Ship och Crew i denna version;
deras starthälsa och återhämtningstakt kan ändras separat.

private-funktionernas befintliga rättigheter och låsordning bevaras via CREATE OR REPLACE.
get_gameplay_revision() returnerar en versionshash.
Den innehåller inga konton, hemligheter eller spelarstats.

Gold Coins använder economy.initialGoldCoins (0) och economy.maxGoldCoins
(9 007 199 254 740 991 per saldo). Bankkontot börjar alltid på 0. Startsaldoändringar
gäller nya karaktärer; tidigare saldon bevaras. Karaktärens saldo och banksaldot
är separata även i RPC och UI. Se [bankreglerna](GOLD_COINS_AND_BANK.md).

Energy använder resources.energyRecoveryAmount (5) per resources.energyRecoverySeconds (300).
Intervallet ligger på fasta UTC-gränser från Unix-epoken, gemensamma för alla kaptener.
Till havs och under resor används dubbla intervallet (600 sekunder) med samma heltalsbelopp.
Energy kapas vid energyMax (100). Tidsankaret anger senaste avräkning, inte en egen timer.
Se [Energy](ENERGY_RECOVERY.md) för byte av takt, offlineankomst och migration.

Hospital använder hospital.durationSeconds (300). Intagningen sparar start- och sluttid;
ett configbyte påverkar nya vistelser, inte redan sparade sluttider. Utskrivning ger full
Ship Health och Crew Health enligt resources.healthMax. Se [Hospital](HOSPITAL.md).

### Skydd mot config som inte stämmer

- Configvalideringen nekar okända fält, fel typer, negativa kostnader, ogiltiga kurvor och oförenliga gränser.
- config:check jämför aktuella källor med genererade filer och senaste configmigrationen.
- Kontrollen körs före dev, start, build, db:start, db:migrate och databastester.
- Serverns resursläsningar och spelhandlingar kontrollerar att den kompilerade gameplayversionen
  stämmer med databasens. Kontrollen cachas bara inom den aktuella React-förfrågan.
- Revisionen beror på gameplayvärden och SQL-mallens innehåll; en färgändring kräver ingen databasändring.
- Den publika config-importen innehåller endast gameplay, frontend och authgränser.
  Serverinställningar importeras separat genom en server-only-modul.

Efter en produktionsuppdatering ska öppna klienter laddas om så att de får det nya frontendbygget.

## Arbetsflöden

### Ändra ett gameplayvärde

```powershell
npm run config:sync
npm run db:migrate
npm run test:db
npm run test:config:db
npm run check
```

config:sync är idempotent. Om ingenting ändrats skapas ingen ny migration.
db:migrate använder uttryckligen lokal Supabase. Molnmigrationer och publicering görs inte av dessa kommandon.

Nya startvärden gäller nya karaktärer. Befintlig progression och historiska rapporter bevaras.
Nya stridsformler och kostnader gäller efter applicerad migration. Pågående deltagare behåller sina
sparade stats, HP, ammunition och deadlines, medan nästa order använder de aktuella reglerna.
Planera balansändringar mellan pågående strider om blandade regler är olämpliga.

Att sänka Energy- eller hälsomax under sparade värden stoppas av databaskravet.
Ingen automatisk klippning eller nollställning sker. Sådana balansändringar behöver en separat, avsiktlig
datamigration. Historiska rundnummer och ammunition får finnas kvar över nykonfigurerade gränser;
nya handlingar kontrolleras av de konfigurerade RPC-reglerna.

### Ändra frontend

theme.css kan ändras direkt. Efter frontend.json eller interface.css.template:

```powershell
npm run config:sync
npm run dev
```

Ett nytt produktionsbygge behövs för JSON-värden som skickas till webbläsaren.
Typografisk layout, färger och responsiva regler finns i config/. Komponenternas struktur ligger kvar i React.

### Ändra lokal drift eller Auth

Ändra server.json, auth.json eller supabase.toml och kör config:sync.
Starta om Next.js för dess driftsinställningar. För Supabase:

```powershell
npm run db:stop
npm run db:start
```

Använd inte db reset eller stop --no-backup. Efter port-/projektbyte måste .env.local peka på den
avsedda lokala stacken och SITE_URL matcha appens adress. setup:local skapar endast en saknad .env.local
och skriver aldrig över en befintlig fil. Ett nytt Supabase-projekt-ID innebär en separat lokal databas.

Auth-lösenordets minimilängd och återställningsintervallet hämtas från auth.json även i genererad TOML.
TOML-inställningar gäller den lokala Supabase-stacken. En hosted Supabase-miljö konfigureras separat.
Säkerhetsheaders finns i next.ts. Hemligheter och produktionsanslutningar finns i .env.local eller driftmiljön.

### Lägga till en inställning

1. Lägg värdet i rätt configfil och beskriv det i config/README.md.
2. Lägg motsvarande typ/gräns i schema.json och eventuell sambandkontroll i scripts/config/core.mjs.
3. Koppla in värdet där det faktiskt används. Gameplay i SQL använder en token i gameplay.sql.
4. Kör config:sync, applicera migration vid behov och lägg till ett meningsfullt beteendetest.

Statuskoder, rutter, behörighetsregler, statnamn, SQL-lås och enhetsomvandlingar är programlogik.
De exponeras inte som godtyckliga balansvärden. Nya mekaniker kräver implementation, inte bara fler configfält.

## Verifiering

- Enhetstester verifierar felaktiga inställningar, SQL-citering, generering, revisionsändring och synkroniserade filer.
- De befintliga databastesterna kontrollerar den fastställda standardbalansen och behörigheterna.
- test:config:db använder en alternativ konfiguration i en enda lokal transaktion, kontrollerar faktisk
  skapande-/tränings-/stridslogik, resor och marknadshandel och gör ROLLBACK. Aktuella configfiler och sparade konton ändras inte.
- Webbläsartester täcker registrering, träning, navigation, profiler, hamnlista, strid, inventory, resor, scouting och marketplace.
- Inventorys kategorier, definitioner och sidstorlek finns i gameplay.inventory. Tidigare ID:n,
  itemtyp och utrustningsplats bevaras vid synk. Avaktivera definitioner i stället för att ta bort dem.
  Ägda antal och individuella stats skrivs inte över. Se [Inventory](INVENTORY.md).
- Exakta körresultat dokumenteras i IMPLEMENTATION_STATUS.md.

Referenstester med fasta förväntade värden beskriver en avsiktlig balans. Vid ett senare balansbeslut
behöver dessa förväntningar uppdateras medvetet; de ersätts inte automatiskt med implementationens värden.

### Cirkulationsdiagram

inventory.historyMaxPoints styr maximalt antal interna historikpunkter (500) plus
vänster och höger ändpunkt. Den fullständiga historiken sparas i databasen; stora
perioder hämtar begränsade stickprov genom ett tidsindex. Se [Item Circulation](ITEM_CIRCULATION.md).

### Resor till havs

`seaTravel.departureEnergyCost` är 5, `outwardDurationSeconds` är 60 och
`returnSecondsPerStep` är 60. `locationTypes` kräver minst två aktiva typer
med unika ID:n och namn. Nuvarande katalog har fyra typer.
Gamla typer avaktiveras vid borttagning ur config; sparade val och destinationer
består. Ändrade tider gäller nya färder, inklusive ny hemresa från en äldre havsplats.
Påbörjade resors sparade deadlines skrivs inte om. Konfigurationsdatabastestet
verifierar kostnad, ut-/hemrestid, namn och bevarade pågående resor.

### Marketplace

`marketplace.feeBps` är 500 (5 %), `popularityHours` är 12, `valueWindowHours` är 12, `pageSize` är 30,
`listingsPageSize` är 20 per expansion och `maxBatchSize` är 25. Avgiftssatsen sparas i varje ny
listing och tillämpas på dess ackumulerade försäljning, avrundat nedåt. Ett senare
configbyte påverkar inte äldre listings.

Value använder `valueWindowHours` för antalsviktat snittpris från genomförda köp.
Tomma fönster behåller senaste icke-tomma värde; endast aldrig handlade items visar N/A.
Historiken delar `inventory.historyMaxPoints` med Circ. Ett ändrat fönster räknar
om värden från beständiga köpdata; inga pengar eller kvitton skrivs om.
Se [Item Market Value](ITEM_MARKET_VALUE.md).

`inventory.items[].tradable` måste vara true och definitionen aktiv för nya listings
och köp. Avaktiverat innehav finns kvar i inventory och osålda erbjudanden kan
återtas. Add Listings filtrerar säljbarhet före `inventory.pageSize` tillämpas.

Alternativtestet verifierar 10 % för nya listings, bevarade 5 % för tidigare
listings, ett sex timmars popularitetsfönster, ett två timmars värdefönster, sidstorlekar, batchgräns och
icke-handelsbara items. Alla teständringar rullas tillbaka. Se [Marketplace](MARKETPLACE.md).
