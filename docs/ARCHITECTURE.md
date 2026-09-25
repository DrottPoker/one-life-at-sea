# Projektarkitektur

## Ansvar och dataväg

Next.js App Router renderar sidor med Server Components. Client Components sköter inmatning, visningsstatus och uppdateringssignaler. Server Actions validerar indata, kontrollerar aktuell identitet och anropar typade Supabase-RPC:er.

PostgreSQL är auktoritativ för resurser, balans, slump, tidsgränser, innehav och behörigheter. Klienten får förhandsvisa kostnader men kan inte bestämma utfallet. Databaskvitton gör bekräftade mutationer idempotenta. [Kodunderhåll](CODE_MAINTENANCE.md) visar filplaceringen.

## Identitet och säkerhetsgränser

Supabase Auth hanterar lösenord, sessioner och återställning. Serverns Supabase-klient använder användarens session; applikationen behöver ingen service-role-nyckel. Klienten memoiseras bara inom en serverförfrågan, aldrig mellan spelare. Registreringen skapar konto och karaktär atomiskt.

Proxy hanterar session och navigation, men ersätter inte behörighetskontroll i Server Actions och SQL.
Publika RPC-wrappers kör som anroparen. Privata funktioner som behöver förhöjd rätt kontrollerar identitet och tillstånd och har fast sökväg. Privata tabeller saknar direkt klientåtkomst. RLS på publika tabeller begränsar synlighet och skrivningar.

Adminmedlemskap finns i databasen; användarmetadata ger inte behörighet. Varje mutation kontrollerar aktuellt medlemskap, orsak, versionsvillkor och kvitto. Klientens sparade begäran är bunden till den administratör som skapade den, även efter kontobyte. Se [Admin](ADMIN_PANEL.md).

PKCE-callback accepterar endast avsedda lokala destinationer. `SITE_URL` anger betrodd ursprungsadress. Publika miljövariabler innehåller bara Supabase-URL och publicerbar nyckel; hemligheter hör till miljön.

## Transaktioner och återförsök

Domänfunktioner äger sina egna regler. Karaktärslås och gemensam låsordning samordnar strid, handel, progression och överföringar. Debitering, belöning, kvitto och uppdateringssignal ingår i samma transaktion.

Ekonomins delade klientjournal sparar begäran före nätverksanrop. Web Locks samordnar flikar; en pågående åtgärd visas inte som misslyckad bara för att en annan flik öppnas. Vid ett förlorat svar återanvänds samma id och innehåll. Bekräftat historiskt utfall får inte räknas om med nya regler. Se [ekonomiintegritet](ECONOMY_AUDIT.md).

Admin, brevpost och forum har egna journaler med sina egna behörighets- och återhämtningsregler. Visuellt liknande formulär innebär inte att dessa regler ska slås ihop.

## Projektioner, tid och uppdateringar

Privata karaktärsrader publiceras inte till Realtime. Begränsade spelar-, hamn- och patientprojektioner samt ägarspecifika händelser driver uppdateringar. Närvaro och plats är separata begrepp; hamnlistan innehåller även utloggade kaptener.

`get_player_context` samlar identitet, adminmedlemskap och gameplayrevision.
`get_player_snapshot` samlar auktoritativ spelstatus, Skills och notisräknare.
Serverkontroller bevaras även när anrop kombineras för lägre latens.

Databastid styr återhämtning, resor, Hospital och skeppsjobb. Sparade deadlines fungerar offline. Klientens nedräkningar använder serverankare och monoton tid; de beviljar inte resurser. `createSnapshotPoller` serialiserar läsningar, samlar uppdateringssignaler, avbryter vid timeout och avmontering samt ignorerar sena svar.

## Navigation och gränssnitt

Den delade spellayouten behåller meny och resursmätare under sidbyten. `GameNavigationProvider` visar vänteläge direkt. `game-refresh.tsx` samordnar uppdateringar så att fokus, Realtime eller resursdeadlines inte skriver över pågående navigation. Vanliga länkar, historik och prefetch hanteras av Next.js.

Angripare är bundna till aktiv strid. Försvarare kan läsa tillåtna sidor men mutationer som ändrar eller flyttar karaktären är låsta. Hospital och resa har separata navigationsregler. Server och klient delar policyrepresentation; SQL kontrollerar villkoren igen. Se [Navigation](NAVIGATION.md), [Combat](COMBAT_SYSTEM.md) och [Resor](SEA_TRAVEL.md).

Gränssnittet delar tema, modaler, responsiva regler och resurskomponenter.
[Gränssnittsdesign](INTERFACE_DESIGN.md) beskriver visuella regler och tillgångarnas ursprung.
[Prestanda](PERFORMANCE.md) beskriver produktionsmätning; utvecklingsserverns kompilering är inte ett mått på vanlig navigation.

## Konfiguration och lagring

`config/` äger justerbara värden. `src/config/public.ts` exporterar webbläsarsäkra värden och en separat server-only-modul exporterar driftinställningar. SQL-delarna under `supabase/templates/gameplay/` genereras till nya, oföränderliga migrationer. En gameplayrevision upptäcker skillnader mellan app och databas. CSS och Supabase-TOML genereras från sina källor. Se [Konfiguration](CONFIGURATION.md).

Katalog-ID:n och historiska kvitton är beständiga. Adminhanterade items och loot bevaras vid configsync.
Privat post använder det nuvarande brevsystemet. Forumets tavlor kommer från konfigurationen, medan trådar, inlägg och räknare ägs av databasen, se [Forum](FORUMS.md). Gamla konversationstabeller behålls för idempotent import; deras ersatta RPC:er är borttagna.

Supabase kör lokalt som ett separat Docker-projekt med beständiga volymer.
Omstart görs utan återställning av data. Molnanslutning, Auth-inställningar, produktionsmejl och publicering är separata driftssteg. Aktuell verifiering och kvarstående begränsningar finns i [Status](IMPLEMENTATION_STATUS.md).
