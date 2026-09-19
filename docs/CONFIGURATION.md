# Konfiguration och projektstruktur

Uppdaterat 2026-09-17.

## Källor och ansvar

```text
config/                    Justerbara värden och gränssnittets tema/CSS
src/config/                Typade importvägar och kontroll av databasversion
src/app/                   Next.js-rutter och serverhandlingar
src/components/            Återanvändbara gränssnitt
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

scripts/config läser supabase/templates/gameplay.sql och ersätter typkontrollerade skalära tokens.
Textvärden citeras och SQL-escapas. En ändring ger en ny migration via Supabase CLI; äldre migrationer
skrivs aldrig om. Samma värden används för kolumndefaults, relevanta CHECK-gränser, RPC-validering,
återhämtning, deltagarlogik och skadefunktioner.

Gränssnittet läser samma publika JSON-värden. Även knapptexter, valideringsmeddelanden, återhämtningstexter,
rundräknare och hälsostaplarnas procent använder dem. Hälsomax är gemensamt för Ship och Crew i denna version;
deras starthälsa och återhämtningstakt kan ändras separat.

private-funktionernas befintliga rättigheter och låsordning bevaras via CREATE OR REPLACE.
Endast en ny publik läsfunktion tillkommer: get_gameplay_revision(), som returnerar en versionshash.
Den innehåller inga konton, hemligheter eller spelarstats.

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
  skapande-/tränings-/stridslogik och gör ROLLBACK. Aktuella configfiler och sparade konton ändras inte.
- Webbläsartester täcker registrering, träning, navigation, profiler, hamnlista och strid.
- Exakta körresultat dokumenteras i IMPLEMENTATION_STATUS.md.

Referenstester med fasta förväntade värden beskriver en avsiktlig balans. Vid ett senare balansbeslut
behöver dessa förväntningar uppdateras medvetet; de ersätts inte automatiskt med implementationens värden.
