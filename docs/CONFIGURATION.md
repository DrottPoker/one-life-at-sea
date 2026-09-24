# Konfiguration

## Källor och generering

[Filkartan](../config/README.md) visar vilken configfil som äger varje typ av inställning.
`gameplay.json` är gemensam värdekälla för app och SQL; databasen avgör fortfarande alla utfall.
Generatorn läser ordningen i `supabase/templates/gameplay.sql`, sätter ihop delarna och ersätter typkontrollerade tokens. Textvärden SQL-citeras.

`npm run config:sync` uppdaterar genererad CSS, Supabase-TOML och gameplayrevision. Ändrad gameplay eller SQL skapar en ny migration via Supabase CLI; tidigare migrationer skrivs aldrig om. Körningen är idempotent. Temaändringar kräver ingen databasmigration.

`config:check` jämför källor med genererade filer och senaste configmigrationen. Det körs före start, bygge, migration och integrationstester. Schema och sambandkontroller avvisar okända fält, fel typer, oförenliga gränser och numeriska överflöden.

Servern jämför appens gameplayrevision med databasen inom aktuell förfrågan.
Webbläsarimporten innehåller bara publika värden. Serverinställningar är server-only.
Hemligheter finns i ignorerad `.env.local` eller driftmiljön.

## Ändra spelregler eller SQL

1. Ändra rätt fält i `gameplay.json` eller rätt SQL-del.
2. Kör följande mot den lokala miljön:

```powershell
npm run config:sync
npm run db:migrate
npm run test:db
npm run test:config:db
npm run check
npm run test:e2e
```

`db:migrate` använder uttryckligen lokal Supabase. Molnmigration och publicering ingår inte.
Produktionsklienter behöver få det nya bygget; revisionen ska stämma på båda sidor.

Startvärden gäller nya karaktärer. Befintlig progression skrivs inte över.
Pågående jobb, resor, Hospital-vistelser och kvitton behåller sparade utfall/deadlines.
Aktiva stridsdeltagare behåller snapshots, medan nya order använder aktuella regler; planera balansändringar mellan strider om blandade regler är olämpliga.

Att sänka en lagrings- eller hälsogräns under sparade värden stoppas av databasen.
Det finns ingen tyst klippning. En sådan ändring kräver en avsiktlig datamigration.
Historiska rundor och ammunition får överstiga nya gränser; nya handlingar valideras mot aktiva regler.

## Migrationshistorik och baslinje

Varje configmigration innehåller hela den genererade gameplay-SQL:en, ungefär 290 kB. SQL-delarna är ordningsberoende (en del kan droppa en trigger som en senare del återskapar), så generatorn skriver alltid hela filen i stället för enbart ändrade delar.

`supabase/migrations/20260923111042_baseline.sql` ersätter de 86 första migrationerna sedan 2026-09-24. Den senaste configmigrationen ligger kvar efter baslinjen, så `config:check` fungerar som tidigare. De ursprungliga filerna finns i Git-historiken.

Baslinjen verifierades mot originalkedjan på en separat, tom Supabase-stack: schema, behörigheter, RLS, Realtime-publikation, storage buckets, cronjobb och startdata stämde, och alla databastester gick igenom. `supabase migration squash` återskapar inte Supabase standardbehörigheter korrekt, så baslinjen återkallar dem uttryckligen före de dumpade GRANT-satserna. Den lägger även till startdata som bara fanns i de sammanslagna migrationerna.

En ny sammanslagning är tillåten så länge ingen hosted databas har migrationerna. Gör den på samma sätt: jämför en tom databas byggd med den gamla respektive nya kedjan och markera sedan de ersatta versionerna som `reverted` i lokala databaser med `supabase migration repair --local`. När en hosted miljö finns skrivs publicerade migrationer aldrig om.

## Stabil identitet och innehåll

Träningsnivåer behåller installerade ID:n och ordning. XP-krav och effektivitet måste stiga; första nivån är gratis vid 0 XP. Kurvor och sammansatta resultat valideras mot tillåtna numeriska gränser. Se [Träning](TRAINING_FOUNDATION.md).

Skill-ID:n får inte tas bort. Nya skills initialiseras och påverkar Character Level enligt [Skills](SKILLS.md).
Aktivitets-ID och koppling till skill är stabila; avaktivera i stället för att radera.
Item-ID, ägartyp och utrustningsplats består; ägda antal och individuella stats skrivs inte över.
Gamla platstyper kan avaktiveras medan sparade destinationer består.

Adminskapade eller adminredigerade items har `managed_by_admin=true` och skrivs inte över av configsync.
Loot tables och activity loot är databasägt innehåll. Startdata infogas bara om den saknas.
Se [Admin](ADMIN_PANEL.md) och [Loot](LOOT_TABLES.md).

Avgiftssatsen sparas på varje marknadslisting. Historiska köp och kvitton räknas inte om vid configbyte.
Värdehistorik kan beräknas från bevarade köp när tidsfönstret ändras.
Ekonomiövervakningens namngivna cronjobb uppdateras utan att observationshistorik återställs.

## Var reglerna beskrivs

| Inställningar | Funktion |
| --- | --- |
| `resources`, `stamina`, `morale`, `hospital` | [Energy](ENERGY_RECOVERY.md), [Stamina](STAMINA.md), [Morale](CREW_MORALE.md), [Hospital](HOSPITAL.md) |
| `training`, `startingStats`, `combat` | [Träning](TRAINING_FOUNDATION.md), [Combat](COMBAT_SYSTEM.md) |
| `skills`, `activities`, `crafting` | [Skills](SKILLS.md), [Activities](ACTIVITIES.md), [Crafting](CRAFTING.md) |
| `inventory`, `marketplace`, `economy` | [Inventory](INVENTORY.md), [Marketplace](MARKETPLACE.md), [värde](ITEM_MARKET_VALUE.md), [cirkulation](ITEM_CIRCULATION.md), [Bank](GOLD_COINS_AND_BANK.md) |
| `seaTravel`, scouting | [Resor](SEA_TRAVEL.md), [Scouting](SEA_SCOUTING.md) |
| `messages`, `notifications`, `presence` | [Brevpost](MESSAGES.md), [Notiser](NOTIFICATIONS.md), [Närvaro](PLAYER_PRESENCE.md) |

Återhämtningsgräns och lagringsgräns är olika: överfyllda resurser bevaras tills de används.
Materialkostnader och skeppsarbetets slider följer faktisk lagrad Energy.
Brevpostens sidstorlek gäller brev, inte det äldre konversationssystemet.

## Frontend och lokal drift

`theme.css` kan ändras direkt. Efter `frontend.json` eller CSS-mallen körs `config:sync`.
Ett nytt produktionsbygge behövs för JSON som skickas till webbläsaren.
`frontend.refresh.requestTimeoutMs` begränsar en snapshotläsning så att ett hängande anrop inte blockerar framtida uppdateringar. Sena svar ignoreras.
Dag/natt, visuella tokens och layout beskrivs i [design](INTERFACE_DESIGN.md) och [dag/natt](DAY_NIGHT_CYCLE.md).

Efter server-/Auth-/TOML-ändringar körs `config:sync` och berörda tjänster startas om:

```powershell
npm run db:stop
npm run db:start
```

Använd inte reset eller `--no-backup`. Port- eller projektbyte kräver rätt anslutning i `.env.local` och motsvarande `SITE_URL`.
`setup:local` skapar bara en saknad miljöfil.
Nytt Supabase-projekt-ID betyder separat lokal databas.
Lokala TOML-inställningar konfigurerar inte en hosted miljö.

## Lägga till inställningar och verifiera

Lägg värdet i rätt configfil och typen/gränsen i `schema.json`.
Lägg sambandkontroller i `scripts/config/core.mjs` när enskilda fältgränser inte räcker.
Koppla värdet till faktisk användning och uppdatera det berörda funktionsdokumentet.
Rutter, behörigheter, låsordning och enhetsomvandlingar är programlogik, inte godtyckliga balansparametrar.

Alternativtestet applicerar andra värden i en lokal transaktion, provar verkliga databasfunktioner och gör rollback.
Referenstester med fasta utfall dokumenterar avsiktlig balans; ändra dem medvetet vid balansbeslut.
Aktuella körresultat finns i [Status](IMPLEMENTATION_STATUS.md).
