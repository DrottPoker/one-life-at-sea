# Kortare skeppsarbete med bibehållen hamnspärr, 2026-09-21

Ägarens slutliga beslut är 30 sekunder per 5 Energy och fortsatt hamnlåsning.

- Nya skeppsjobb använder 6 sekunder per Energy: 5 Energy tar 30 sekunder,
  50 tar 5 minuter och 100 tar 10 minuter.
- Pågående skeppsjobb blockerar fortfarande avsegling i både UI och server-RPC.
  Stats och XP tilldelas vid sluttiden; då släpper avseglingsspärren automatiskt.
- Redan startade jobb behåller sina sparade sluttider, kostnader och belöningar.
- Slutlig migration: 20260921130045_central_gameplay_config_316321bbcfef.sql.
  Den är applicerad lokalt och skiljer sig från föregående configmigration
  endast genom tidsfaktorn och revisionsvärdet. Ingen databasåterställning.
- Förslaget att ta bort hamnspärren drogs tillbaka före migration. Resefunktionen
  och dess UI-spärr är oförändrade.

Verifierat:

- npm run check: lint, typkontroll, 279 enhetstester och produktionsbygge passerade.
- npm run test:db: 1 312 assertions i 25 filer passerade.
- npm run test:config:db: 83 assertions passerade. Alternativ konfiguration
  rullades tillbaka och originalkonfigurationen återställdes.
- Fyra riktade webbläsartester passerade tillsammans. Ett riktigt 30-sekundersjobb
  blockerade både avseglingsknappen och direkt RPC; knappen aktiverades vid
  sluttiden och avseglingen lyckades. Även samtidighet, återinloggning,
  flera flikar och exakt tidsvisning för 6 Energy (36 sekunder) verifierades.
- Säkerhetsadvisors rapporterade inga varningar eller fel.
- Aktuell app- och databasrevision matchar; git diff --check passerade.

Den tidigare dokumenterade Next.js-diagnosen om avbrutna RSC-strömmar förekom
även i denna webbläsarkörning och har inte räknats som löst här.

Se [träningsreglerna](TRAINING_FOUNDATION.md) för aktuellt beteende.

# Korta beskrivningar för resursbarer, 2026-09-21

Energy, Ship Health, Crew Health och Crew Morale visar nu en kort tooltip vid
hover, tangentbordsfokus eller tryck. Den ligger bredvid baren på dator och
ovanför på mobil. Tooltipen kan hovras och stängas med Escape eller ett tryck
utanför resurserna.

- De fasta förklaringstexterna och ticktiderna har tagits bort ur resurskortet.
- Energy visar återhämtningstakten för aktuell plats. HP visar återhämtningen
  eller aktuell strids-/Hospital-spärr. Crew Morale visar aktuell effekt och
  återgången mot 0.
- Serverns deadlines och automatisk uppdatering är oförändrade.
- Inga spelregler eller databasmigrationer ändrades.

Verifierat:

- npm run check: lint, typkontroll, 279 enhetstester och produktionsbygge passerade.
- De sex berörda webbläsartesterna passerade tillsammans i slutkörningen.
  Hover, tooltip-hover, fokus, Escape, återhämtning och responsiv placering ingår.
- Bilder från dator och mobil granskades. Tooltipen ryms inom skärmen vid
  samtliga kontrollerade bredder från 320 till 1280 pixlar.
- Berörda testfiler lintades även efter den sista justeringen.
- Configkontroll och git diff --check passerade.

Den tidigare dokumenterade Next.js-diagnosen om avbrutna RSC-strömmar förekom
även här. Den har inte räknats som löst av denna presentationsändring.

Se [gränssnittsdesign](INTERFACE_DESIGN.md) för beteende och underhåll.

# Crew Morale och tavernmåltider, 2026-09-21

Implementerat enligt ägarens beslut:

- Crew Morale börjar på 0 och har intervallet -100 till +100 med en decimal.
- Crew Training förbrukar 0,5 moral per Energy. Moralen före passet ger linjärt
  -5 % till +5 % på ökningen; Perfect Drill tillämpas därefter.
- Samma intervall påverkar Crew Attack, Defense, Speed och Accuracy i strid.
  Deltagarens moral och effekt sparas vid stridsstart/inträde. Permanenta stats,
  Ship-stats, hälsa och redan pågående strider behålls.
- På fasta femminutersgränser i UTC flyttas moralen 5 mot 0, även offline.
- Tavernans måltid ger +25 för 1 000 Gold Coins utan Energykostnad. Moralen
  stannar vid +100. Fullt pris nära taket visas före köpet; vid taket nekas köp.
- Baren vid Energy och HP har 0 i mitten, positiv fyllning åt höger och negativ
  åt vänster. Den visar en decimal och fungerar i mobilens tvåkolumnslayout.
- Serverlås och privata kvitton gör samtidiga handlingar och återförsök säkra.
  Admin kan ändra moral med ny återhämtningsstart och granska tavernkvitton.
- Migration 20260921072744_central_gameplay_config_43a877cba7da.sql är applicerad
  lokalt. Ingen databasåterställning gjordes.

Verifierat:

- npm run check: lint, TypeScript, 274 enhetstester och produktionsbygge passerade.
  Efter fler konfigurationstester passerade alla 279 enhetstester.
  Lint och typkontroll passerade även efter den sista testjusteringen.
- npm run test:db: 1 312 assertions i 25 filer passerade.
- npm run test:config:db: 83 assertions passerade; alternativ balans rullades tillbaka.
- Alla 12 riktade tester för moral och stabil ekonomisk återkoppling passerade.
- Helhetskörningen omfattade 84 webbläsartester. 83 passerade; ett äldre
  träningstest förväntade en ökning utan moralpåverkan. Förväntningen rättades
  till moralen före passet och testet passerade därefter i en riktad omkörning.
- Positiv och negativ fyllning granskades visuellt. Responsiva kontroller
  omfattade 1280, 375 och 320 pixlar utan horisontell överströmning.
- Databasens säkerhetsadvisors rapporterade inga varningar eller fel.
- Ekonomigranskningens åtta kontroller visade inga avvikelser.
- Configkontroll och git diff --check passerade.

Tidigare dokumenterade Next.js-diagnoser om avbrutna RSC-strömmar förekom i
helhetskörningen; en avbruten extra teststart rapporterade också Gzip-listeners.
De är inte dolda eller räknade som lösta av moralfunktionen.
Den riktade slutkörningen passerade utan dessa diagnoser.

Se [Crew Morale](CREW_MORALE.md) för spelregler, lagring och underhåll.

# Stabil återkoppling för ekonomihandlingar, 2026-09-21

Den gemensamma rutan **Unconfirmed action** blinkade tidigare till vid varje
vanlig handling eftersom journalen sparas före serveranropet. Återhämtningsvyn
väntar nu på karaktärens Web Lock och kontrollerar därefter om begäran finns kvar.

- Crew-träning, nivåköp, skeppsarbete, bank, Trash och marknad delar rättningen.
- Pågående handlingar behåller knappspärrar och sparade request-ID:n utan att
  visa återhämtningsrutan. Det gäller även andra flikar och omladdning där.
- Förlorade svar och en stängd ursprungsflik lämnar samma säkra återhämtning.
  Ingen begäran återspelas automatiskt och inga server- eller databasregler ändras.
- Sju nya webbläsartester håller kvar riktiga serversvar och observerar DOM:en
  för att fånga även mycket korta blinkningar samt provar återhämtning efter stängning.

Verifierat:

- npm run check: lint, TypeScript, 259 enhetstester och produktionsbygge passerade.
- Samtliga sju nya webbläsartester passerade i den riktade körningen.
- Hela webbläsarsviten: samtliga 79 tester passerade i samma körning (9 minuter).
- npm run audit:economy: samtliga åtta integritetskontroller utan avvikelse.
- git diff --check passerade.

Den tidigare dokumenterade Next.js-diagnostiken om avbrutna RSC-strömmar
förekom även här. Den har inte dolts eller räknats som löst av UI-rättningen.

Se [ekonomigranskningen](ECONOMY_AUDIT.md) för beteende och avgränsning.

# Dag/natt-cykel, 2026-09-21

Implementerat enligt ägarens önskemål: natt 21:00-06:00 server time (UTC).

- Den fasta bakgrunden använder den levererade nattbilden under natten.
  Endast bakgrunden växlar; välkomstbild, stridsbilder och spelregler behålls.
- Servern väljer rätt period i initial HTML. Öppna sidor växlar utan omladdning
  med en serverankrad monoton klocka, periodisk synk och återhämtning efter vila/nätfel.
- Den publika klockrutten returnerar enbart tid, period och nästa byte. Den behöver
  ingen databas och fungerar även under Hospital, resor och strid.
- Periodberäkningen är fristående för framtida serverstyrda regler. Nattfiske
  och andra tidsberoende belöningar ingår inte i denna etapp.
- Nattbilden är en lokal WebP på 1672 x 941 pixlar, 341 932 byte.
  Originalbilden är oförändrad. Ingen databasmigration behövdes.

Verifierat:

- npm run check: lint, TypeScript, 259 enhetstester och produktionsbygge passerade.
- Hela webbläsarsviten: samtliga 72 tester passerade i samma körning.
- Efter en stabilare väntan på testets initiala klocksynk passerade alla tre
  dag/natt-tester på nytt; lint och typkontroll passerade också efter teständringen.
- 21:00 och 06:00 verifierades utan omladdning, med felställd datorklocka,
  annan tidszon, förlorad tidssynk och återanslutning. Initial HTML fungerar utan JS.
- Klockrutten kontrollerades med inloggad Hospital-spärr och utan inloggning.
- Dag- och nattskärmbilder granskades visuellt. Responsiva kontroller passerade.
- Utvecklingsservern på port 3000 returnerar HTTP 200 för klockan och nattbilden,
  med korrekt aktuell nattperiod och nästa byte 06:00 UTC.
- Configkontroll och git diff --check passerade.

De tidigare dokumenterade Next.js-diagnoserna om avbrutna RSC-strömmar och
Gzip drain listeners förekom i helhetskörningen. Den riktade slutkörningen
rapporterade inga sådana diagnoser och inga webbläsarfel.

Se [dag/natt-cykeln](DAY_NIGHT_CYCLE.md) för beteende och underhåll.

# Publika spelar-ID:n och namnregler, 2026-09-21

Ägarens beslut: publika nummer från 100001 och UUID som intern identitet.
Nya karaktärsnamn får inte innehålla siffror eller mellanslag.

- Permanent databasgenererat player_number, unikt och skrivskyddat även vid
  administrativa ändringar. Borttagna nummer återanvänds inte.
- Alla 446 karaktärer som fanns före migrationen har samma UUID och
  nummer 100001-100446 i skapelseordning. Ingen databasåterställning gjordes.
- Players söker på namn eller nummer. #100001 ger exakt ID-sökning.
- Profiler och delade attackadresser använder numret. Gamla UUID-länkar
  omdirigerar och äldre stridssnapshots får nummer vid läsning.
- Nummer visas i spelvyer och admin. Spelhandlingar, relationer och RLS
  använder fortsatt UUID.
- Registrering och karaktärsskapande avvisar Unicode-tal och blanksteg
  i formulär, serverhandling och databas. Ogiltig registrering lämnar inget konto.
- Äldre namn behålls och hindrar inte spelhandlingar. Nya namn och
  administrativa namnbyten följer regeln.
- Berörda dokument och testfixturer är uppdaterade.

Verifierat:

- npm run check: lint, TypeScript, 246 enhetstester och produktionsbygge passerade.
- npm run test:db: 1 233 assertions i 24 filer passerade.
- npm run test:config:db: 76 assertions passerade; den alternativa konfigurationen
  rullades tillbaka och originalkonfigurationen återställdes.
- Lokala säkerhetsadvisors rapporterade inga varningar eller fel.
- Samtliga tre nya migrationer applicerades lokalt utan dataåterställning.

- Webbläsare: 69 scenarier verifierade mot samma produktionsbygge.
  Helhetskörningen gav 66 godkända. Tre testförberedelser rättades
  (formulärval, lösenord efter avvisat försök och ett gammalt testnamn med
  mellanslag); samtliga tre passerade i den riktade omkörningen.
- Sökning, samtidiga registreringar, RLS, äldre länkar, combat, sjöresor,
  Hospital, inventory, handel, träning och navigation omfattas.
- Spelarsökningens skärmbilder granskades för dator och mobil; ingen
  horisontell scroll vid 1280, 375 eller 320 px.
- Utvecklingssidans registreringsformulär på port 3000 svarar HTTP 200
  och visar den nya namnregeln.
- git diff --check passerade.

Den tidigare dokumenterade Next.js-diagnostiken om avbrutna RSC-strömmar
förekom i helhetskörningen, tillsammans med en drain-listener-varning.
Ingen varning eller något fel rapporterades i den avslutande riktade körningen.

Se [spelar-ID:n](PLAYER_IDS.md) och [karaktärsnamn](CHARACTER_NAMES.md).

# Ny combat-design, 2026-09-21

Attackvyn följer ägarens combat-referenser med mörkblå ytor, guldramar och
tydliga orderknappar. Spelregler och databasflöden är oförändrade.

- Egna och motståndarens kaptenskort visar hälsa, utrustning och relevanta stats.
- De två levererade bilderna har optimerats till lokal WebP, 1774 x 887:
  sjöstrid 406 328 byte, boarding 452 160 byte. Originalen är oförändrade.
- Mittbilden följer deltagarens serverlagrade fas, även efter Disengage.
- Energy, runda och ordernedräkning har samlats i sidhuvudet.
- Primär attack är guld, Board/Disengage blå och Retreat röd. Textetiketter,
  tangentbordsfokus, pending-tillstånd och befintliga spärrar finns kvar.
- Combat log och People har kompaktare paneler med bibehållen information.
- Mobilvyn placerar bilden över kaptenskorten och staplar orderknapparna.

Verifierat:

- Lint, TypeScript, 213 enhetstester och produktionsbygge passerade.
- Samtliga fem combat-tester passerade i slutkörningen. Båda testerna för
  försvararens handlingslås och det gemensamma designtestet passerade också.
- Förberedelse, sjöstrid, boarding, Disengage, reträtt, publika rapporter,
  flera angripare, samtidiga order och realtid ingick i webbläsarkontrollerna.
- Ingen horisontell scroll på 320, 375, 600, 768, 800, 1024 och 1680 px.
- Skärmbilder av båda stridsfaserna och mobilvyn granskades visuellt.
- Localhost på port 3000 och båda bildfilerna svarade HTTP 200.

Det nya bildtestet kontrollerar återgången till sjöstrid direkt efter Disengage.
Ett efterföljande kanonskott kan följas av motståndarens boarding och därför
byta fas igen. Den tidigare dokumenterade Next.js-loggvarningen om avbrutna
RSC-strömmar förekom under navigationstesterna; alla slutliga tester passerade.

Se [design och bildkällor](INTERFACE_DESIGN.md) och [combat-systemet](COMBAT_SYSTEM.md).

# Nautisk designgrund, 2026-09-21

Gränssnittet följer ägarens designreferens med mörkblå paneler, gulddetaljer,
serifrubriker och ett begränsat pergamentkort i hamnen.

- Den bifogade bakgrundsbilden har optimerats till lokal WebP, 1672 x 941,
  471 144 byte. Originalbilden är oförändrad.
- Bakgrunden ligger fast bakom den centrerade spelramen. Dokumentet och
  spelinnehållet scrollar tillsammans utan separata scrollområden.
- Hamnbilden är 156 px hög på desktop och 120 px i kompakt vy.
- Karaktär och resurser har ett gemensamt kort. Menyn blir ett kompakt rutnät
  på mobil; spelinnehållet använder då hela skärmbredden.
- Hamnens spelarlista och destinationer visas sida vid sida på stora skärmar.
  Marketplace är nu korrekt märkt Open i hamnkatalogen.
- Gemensamma färger och paneler gäller även inventory, marknad, träning och
  konto-/inloggningssidor. Befintliga spelregler och databasstruktur är oförändrade.
- Next.js Image använder den aktuella preload-egenskapen.

Verifierat:

- Lint, TypeScript, 213 enhetstester och produktionsbygge passerade.
- Efter slutlig justering passerade produktionsbygget och samtliga 25 berörda
  webbläsartester i samma körning: design, navigation, inventory, marketplace,
  träning och sjöresor.
- Layout utan horisontell scroll verifierades på 320-1680 px; fast bakgrund,
  bildhöjd, sidbyte och resursvisning kontrollerades i webbläsare.
- Skärmbilder av hamn, marketplace, träning och inloggning granskades visuellt.
- Localhost port 3000 visar den nya designen och svarar HTTP 200.
- Configkontroll och git diff --check passerade.

Den tidigare dokumenterade Next.js-loggvarningen om avbrutna RSC-strömmar
förekom under interaktionstesterna även i denna körning. Samtliga tester passerade.

Se [designgrund och underhåll](INTERFACE_DESIGN.md).

# Avrundad statvisning, 2026-09-21

Ägarens förtydligande: endast visningen ändras. Beräkningar och sparade värden
behåller tidigare precision och träningens balans påverkas inte.

- Befintliga Crew-/Ship-stats visas med högst två decimaler under 10 000.
  Från 10 000 visas avrundade heltal, även i stridsvyerna.
- Träningsökningar visar alltid högst två decimaler, även över 10 000.
  Regeln gäller knappar, förhandsvisningar, pågående/färdiga jobb och resultatmeddelanden.
- Onödiga slutnollor visas inte. formatStat och formatStatGain har separata ansvar.
- Ingen ändring av träningsformel, intern avrundning, kvitton, sparade jobb eller databasstruktur.

Verifierat:

- `npm run check`: lint, TypeScript, 213 enhetstester och produktionsbygge passerade.
- Samtliga 13 berörda webbläsartester passerade i en körning: träning, navigation,
  stridsspärrar och strid, inklusive båda stridsfaserna.
- Gränsvärden strax under/på/över 10 000 och stora belöningar kontrollerades.
  UI visar exempelvis sparad stat 10000.625 som 10,001 medan databasen behåller 10000.625.
- Desktop-/mobilbredder verifierades av träningssviten; mobilbilder granskades.
- Localhost port 3000 svarade HTTP 200. `git diff --check` passerade.

De tidigare dokumenterade Next.js-varningarna om avbrutna RSC-strömmar förekom
även i denna körning. Ingen ny databas- eller balansmigration gjordes för visningsändringen.

# Statberoende träning, 2026-09-21

Crew Training och Ship Upgrades använder nu samma statberoende kurva:
(efficiency / 5) * (1 + virtualStat / 1000)^0,6 per Energy, avrundad till sex
decimaler. Den virtuella staten ökar före nästa Energy-enhet. Nivåeffektiviteten
är 1,00; 1,15; 1,35; 1,55; 1,80; 2,05; 2,30; 2,55; 2,80; 3,00.

- Crew kostar fortsatt 5 Energy och ger 5 XP direkt. En separat Perfect Drill
  med 1 % chans dubblar normalökningen en gång, utan extra XP.
- Ship kostar vald heltalsmängd Energy, minst 5, och tar 60 sekunder per Energy.
  Belöning, XP och sluttid sparas vid start. Ingen Perfect Drill gäller Ship.
- Stats är numeric i båda grupperna. Energy, XP och Gold Coins förblir heltal.
  Samma stat och nivå ger exakt samma normala utbyte oavsett hur Ship-jobb delas upp.
- XP-krav, priser och köpta nivåer bevaras. Gamla jobb och kvitton räknas aldrig om.
  Nya kvitton sparar beräkningsunderlag och regelversion.
- UI visar statens beräknade ökning och nivåns effektivitet. Crew-raderna har
  bredare decimalfält på desktop och en separat knapp på mobil.
- Hälsa och skadeformel är oförändrade. Ägarens framtida hälsoprogression utgår
  från 100 Crew Health och Ship Health som startvärden.
- JSON-importer använder explicita importattribut, så samma konfiguration kan
  läsas i både Next.js och Node-baserade tester.

Verifierat:

- Ny migration 20260921000150_central_gameplay_config_6320997dd619 är applicerad
  lokalt. Kontrollsummor före och efter bekräftar exakt bevarande av alla
  karaktärsrader, XP/köpta nivåer, skeppsjobb och träningskvitton.
- `npm run check`: lint, TypeScript, 201 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 1 152 assertioner i 22 filer passerade.
- `npm run test:config:db`: 76 assertioner passerade. Alternativ skala,
  exponent, effektivitet, Energykostnad och Perfect-chans installerades inom en
  transaktion. Gamla jobb/kvitton bevarades och originalkonfigurationen återställdes.
- Hela webbläsarsviten kördes: 63 av 64 passerade. Navigationstestet hittade både
  en synlig och en dold cachead sida och rättades till att kontrollera den synliga vyn.
  Därefter passerade samtliga sex tränings- och navigationstester på slutbygget.
  Alla 64 distinkta testfall har därmed verifierats; ingen testretry användes.
- Samtidiga Crew-pass verifierar en obruten kedja av aktuellt permanent statvärde
  och rätt skalad belöning. Återförsök betalar och belönar en gång.
- Desktop och mobil granskades visuellt; träningsvyerna kontrollerades vid
  1 280, 768, 375 och 320 px utan horisontell overflow.
- SQL-lint och Supabases säkerhetsrådgivare rapporterade inga fel.
- `npm run audit:economy`: noll avvikelser i samtliga åtta kontroller.
- Balansanalysen har körts om med den implementerade algoritmen.
- Localhost på port 3000 svarade HTTP 200. `git diff --check` passerade.

De tidigare dokumenterade Next.js-varningarna om avbrutna RSC-strömmar och
Gzip-lyssnare förekommer fortfarande i breda webbläsartester. De är inte dolda
eller rättade här. Ingen commit, push eller extern driftsättning har gjorts.

Exakta regler och nivåtabell: [Träning och progression](TRAINING_FOUNDATION.md).
Bakgrund, flerårssimulering och återstående balansfrågor:
[Träningsresearch](TRAINING_BALANCE_RESEARCH.md).

# Omedelbara sidbyten och återanvändning, 2026-09-21

Sidval visar nu vänteläget direkt i innehållsytan. Menyikonerna ligger kvar och
vald destination markeras direkt, även innan sidans första serversvar kommit.
Menyn är fortsatt användbar medan nästa sida laddas.

- GameLink följer Next.js navigationslivscykel. Bara den senaste väntande länken
  får ta bort indikatorn; tangentbord, Ctrl-klick och historik fungerar som tidigare.
- Föregående innehåll döljs och görs inaktivt utan tidig avmontering. Pågående
  ekonomihandlingar och den beständiga journalen behåller sin livscykel.
- Befintlig återanvändning av layout, kod och förladdade laddningsgränser behålls.
  Serverklienten återanvänds inom samma rendering och oberoende kontroller körs
  parallellt. Ingen beständig cache införs för privata saldon, inventory eller spärrar.
- Bakgrundsuppdateringar väntar under navigation. Databasens lås, autentisering,
  versionskontroll, mutationernas omvalidering och realtime fungerar som tidigare.

Verifierat:

- `npm run check`: lint, TypeScript, 178 enhetstester och produktionsbygge passerade.
- Lint och typkontroll kördes igen efter det sista tillagda navigationstestet.
- `npm run test:e2e`: samtliga 64 tester passerade i en helhetskörning med Edge
  på 7,8 minuter, utan omkörningar.
- Navigation verifierades med blockerade serversvar, en helt oförladdad sida,
  flera snabba val, profillänkar, tangentbord, Ctrl-klick, bakåt/framåt och fokus.
- Desktop- och mobilbilder granskades; ingen horisontell overflow vid 375 px.
  Reduced-motion-inställningen och oförändrade sidebar/resurskomponenter verifierades.
- Localhost på port 3000 svarade HTTP 200. `git diff --check` passerade.

De sedan tidigare dokumenterade Next.js-varningarna för avbrutna RSC-strömmar
och Gzip-lyssnare förekom även i denna körning. De är inte dolda eller rättade här.
Ingen databasändring, commit, push eller extern driftsättning gjordes.

Se [navigationens dokumentation](NAVIGATION.md).

# Ekonomigranskning och säkra återförsök, 2026-09-21

Inventory, marketplace, escrow, Gold Coins, bank, nivåköp, Trash, adminändringar,
kontoradering, cirkulation och Value-historik har granskats. Detaljer, rättade
fynd och avgränsningar finns i [ekonomigranskningen](ECONOMY_AUDIT.md).

Rättningar:

- Request-ID och payload sparas före ekonomihandlingar och kan kontrolleras efter
  omladdning, navigation eller omstart. Andra flikar ser den olösta begäran.
  Web Locks skyddar journalen; databasens domänspecifika kvitton skyddar själva
  affären. Nya ekonomihandlingar väntar tills den sparade begäran är utredd.
- Serverhandlingarna binder formuläret till den karaktär som visades. Ett
  kontobyte kan inte debitera eller ändra en annan karaktär från en gammal flik.
- Det lokala inventoryverktyget återskapar inte längre utrustning som ligger
  till salu. Utrustning som redan köpts av en annan spelare förblir där.
- Banktester städar egna konton även vid testfel. Administratörstestet för
  återkallad behörighet använder en ny flik för att undvika konkurrens med den
  gamla sidans pågående uppdatering.

Verifierat:

- `npm run check`: lint, TypeScript, 178 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 1 129 assertioner i 21 filer passerade, inklusive 24 nya
  kontroller av atomiska fel, kapacitetsgränser och köpkvitton efter kontoradering.
- `npm run test:config:db`: 74 assertioner passerade; originalkonfigurationen återställdes.
- 63 distinkta webbläsartester verifierades med Edge. Första helhetskörningen
  gav 58 passerade och två testfel. Testinteraktionerna rättades; berörda sviter
  och tre tillagda återhämtningsfall kördes igen. Sista kvarvarande testet
  försökte skriva i ett korrekt låst bankfält och rättades. Det passerade därefter
  två gånger. Inga funktionella testfel återstår.
- Blandade samtidighetstester bevarade antal items och total Gold Coins inklusive
  avgifter efter åtta omgångar. Köp, listning, återtagning, bank, Trash och nivåköp
  provades med tappade serversvar efter commit och efterföljande omladdning.
- `npm run audit:economy`: noll avvikelser i åtta kontroller, både före och efter tester.
- SQL-lint för public/private och Supabases säkerhetskontroll rapporterade inga fel.
- Mobilens återhämtningsvy granskades visuellt vid 375 px och hade ingen horisontell overflow.
- Localhost svarade HTTP 200. Granskningens `economy-audit`-konton är borttagna.
- `git diff --check` passerade.

Den tidigare dokumenterade Next.js-diagnostiken för avbrutna RSC-svar och
Gzip-strömmens MaxListeners-varning förekommer fortfarande i serverloggarna.
De har inte dolts eller räknats som lösta av denna ekonomigranskning.
Granskningen bevisar inte frånvaro av alla framtida fel eller produktionsproblem.

Ingen databasreset, historikomskrivning, commit, push eller extern driftsättning
har gjorts. Befintliga ändringar och vanlig speldata har bevarats.

# Value behålls och räknas på 12 timmar, 2026-09-21

Value använder nu genomförda köp under de senaste 12 timmarna, viktat efter antal.
När fönstret blir tomt ligger senaste icke-tomma värde kvar i itemdetaljer och
diagram. Endast items som aldrig sålts visar N/A. Nya köp ersätter det kvarvarande
värdet med ett nytt snitt från det aktuella fönstret. Denna regel ersätter
24-timmarsfönstret och N/A-beteendet från avsnittet nedan.

Beräkningen behåller samma värde som precis före sista köpets utgång, även om
flera köp har samma tidsstämpel. Ingen inloggning, cache eller schemalagd körning
krävs för att bevara värdet. Historik, Inventory och Marketplace använder samma
serverberäkning. [Item Market Value](ITEM_MARKET_VALUE.md) beskriver regeln.

Lokalt applicerad migration:
`20260920220028_central_gameplay_config_782fb5de29c5.sql`.

Verifierat:

- `npm run check`: lint, TypeScript, 168 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 1 105 assertioner passerade, inklusive 54 Value-kontroller.
- `npm run test:config:db`: 74 assertioner passerade och konfigurationen återställdes.
- SQL-lint för public/private rapporterade inga schemafel.
- Value-webbläsartestet passerade med riktiga köp, tolv timmars fönster och
  kvarvarande värde i detaljer och diagram. Övriga webbläsarsviter kördes inte om
  för denna avgränsade beräkningsändring.
- Localhost svarade HTTP 200. `git diff --check` passerade.

Testkonton och deras köp städades bort. Ingen commit, push eller extern
driftsättning gjordes.

# Item Value och marknadsvärdehistorik, 2026-09-20

Value visas till vänster om Circ i både Inventory och Marketplace, med Gold
Coins-ikon och samma diagramkomponent, sex periodval och pekar/tangentbordsstöd.
Värdet är antalsviktat snittpris från genomförda köp under de senaste 24 timmarna,
före avgift och avrundat nedåt. Inga köp i fönstret ger N/A.
Se [Item Market Value](ITEM_MARKET_VALUE.md).

Historiken använder beständiga köp och en privat kumulativ projektion.
Befintliga köp ingår efter atomär backfill. Även när ingen ny affär sker syns
värdeändringar när köp blir äldre än 24 timmar. Publika svar visar inga deltagare.
Marknadens utfällda panel har dessutom stabil identitet när dess placering i
rutnätet ändras, så historik, vald period och listings-expansion kan bevaras.

Lokalt applicerade migrationer:

- `20260920211844_item_market_value_history.sql`
- `20260920212333_central_gameplay_config_911876fda4ce.sql`
- `20260920212700_central_gameplay_config_6d7a583d4b03.sql`
- `20260920212827_central_gameplay_config_1652e9905d88.sql`

Verifierat för ändringen:

- `npm run check`: lint, TypeScript, 168 enhetstester och produktionsbygge passerade.
  Efter de sista UI-rättningarna kördes lint för ändrade filer och nytt
  produktionsbygge med TypeScript.
- `npm run test:db`: 1 095 assertioner passerade, inklusive 44 nya Value-kontroller.
- `npm run test:config:db`: 74 assertioner passerade, inklusive ett alternativt
  värdefönster på två timmar. Konfigurationen återställdes genom rollback.
- SQL-lint för public/private hittade inga schemafel.
- Inventorys nio webbläsartester och det nya Value-testet passerade tillsammans.
  Efter sista rättningen av marknadspanelens identitet passerade Value-testet
  och samtliga fem Marketplace-tester igen, totalt sex i den sista körningen.
  Ingen fullständig omkörning av övriga spelflöden gjordes.
- Riktiga köp, viktat värde, återförsök, utgång ur tidsfönstret, perioder, Retry,
  Circ, Hospital och mobilbredd täcks. Skärmbilder av Inventory och Marketplace
  granskades; 1280, 375 och 320 px kontrollerades utan sidledes overflow.
- En separat jämförelse av den lokala projektionen mot samtliga sparade köp
  hittade noll avvikelser.
- Dokumentationens 254 lokala länkar och `git diff --check` passerade.
- Utvecklingsservern startades om i bakgrunden; localhost:3000 svarade HTTP 200.

Den tidigare dokumenterade Next.js stream-diagnostiken förekommer fortfarande
vid avbrutna sidströmmar i testloggen. Testkonton och deras köpdata städades bort.
Inga normala spelarkonton ändrades för testningen. Ingen commit, push eller extern
driftsättning har gjorts.

# Kompakt Marketplace och expansion i grupper om 20, 2026-09-20

Itemkorten visar nu Gold Coins-ikon, pris och tillgängligt antal inom parentes
på samma rad. Texten sold / 12h är borttagen. Most Popular använder fortfarande
faktiskt sålda exemplar under de senaste 12 timmarna för sorteringen.

Köplistan har lägre rader, mindre bilder/knappar och färre upprepade etiketter.
Först visas högst 20 erbjudanden med lägsta pris överst. Show more listings
utökar med upp till 20 och visas endast när det finns mer att hämta.
Hela det öppna urvalet läses i en sorterad ögonblicksbild. Tidigare rader behålls
under hämtning; nätverksfel ger Retry och spärrar köp tills data uppdaterats.

Lokalt applicerad migration:
`20260920191132_central_gameplay_config_ffd3fb7bac47.sql`.
Befintliga listings, pengar och itemägande ändras inte av migrationen.
Se [Marketplace](MARKETPLACE.md) för aktuella vyer och läsregler.

Verifierat i denna ändring:

- `npm run check`: lint, TypeScript, 164 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 1 051 assertioner passerade, inklusive åtta nya kontroller av
  20/40/slutgrupp, bibehållna rader, uppdaterad prisordning och egna sidindelade listings.
- `npm run test:config:db`: 73 kontroller passerade med alternativ konfiguration.
- Databaslint hittade inga schemafel.
- Utvecklingsservern startades i bakgrunden; localhost:3000 svarade HTTP 200 på marknadsvägen.
- Marknadens fem webbläsartester passerade. Expansion, fel/återförsök, borttagen
  billig listing, inga dubbletter, köp och stridslås ingår.
- Dator- och mobilbilder granskades; bredd 1280, 375 och 320 testades utan sidledes overflow.
- Hela webbläsarsviten kördes inte om för denna avgränsade marknadsändring.
  Föregående fullständiga körning med 53 tester är dokumenterad nedan.

Den tidigare dokumenterade Next.js stream-diagnostiken finns kvar i testloggen.
Ingen commit, push eller extern driftsättning har gjorts.

# Marketplace implementerad, 2026-09-20

Marknaden i The Harbor använder Torn-upplägget med spelets havsblå färger och
befintliga itembilder. [Marketplace](MARKETPLACE.md) beskriver regler och källor.

- Most Popular sorterar faktiskt sålda exemplar under senaste 12 timmarna.
- Kategorier till vänster sorterar efter lägsta aktuella pris. Sökning och sidindelning ingår.
- Öga och varukorg visas över bilden; detaljer respektive listings fälls ut under itemraden.
- Add Listings stöder flera items, mängd och styckpris, med bevarat urval mellan filter.
- View Your Listings visar eget lager och återför osålda items vid avbruten listing.
- Gold Coins flyttas mellan burna saldon. Säljaren betalar 5 % kumulativ avgift per
  listing, avrundat nedåt; delade köp ändrar inte totalavgiften.
- Separat marknadslager, individuella item-ID:n/stats, ägarskydd, cirkulation,
  samtidiga köp, försvararlås och säkra återförsök hanteras i databasen.

Lokalt applicerade migrationer:

- `20260920084639_marketplace_foundation.sql`
- `20260920085645_central_gameplay_config_0d45ca6e00a0.sql`

Historiska migrationer och befintliga karaktärer/innehav bevarades.
Ingen commit, push eller extern driftsättning har gjorts.

Verifierat:

- `npm run check`: lint, TypeScript, 164 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 1 043 assertioner passerade, inklusive 62 marknadskontroller.
- `npm run test:config:db`: 72 kontroller passerade. Äldre avgifter bevaras medan
  nya listings, sidstorlekar, batchgräns och popularitetsfönster följer ändrad config.
- Databaslint för public/private hittade inga schemafel; security advisors hittade inga problem.
- `npm run test:e2e`: hela sviten passerade, 53 av 53 tester, efter testisoleringen.
  Marknadens fem scenarier omfattar köp/avgift/återtagning, urval över filter,
  samtidiga köpare, tappat svar, paginering och försvararens handlingslås.
- Marknadens desktop- och mobilbilder granskades. Bredd 1280, 375 och 320
  kontrollerades utan sidledes overflow.
- Lint och TypeScript passerade även efter sista testjusteringen.
- Relativa dokumentlänkar och `git diff --check` kontrollerades.
- Localhost svarade HTTP 200 på marknadsvägen (inloggning krävs).

Första fullständiga webbläsarkörningen gav 51 av 53 godkända. Två marknadstester
antog felaktigt att inga andra spelarannonser fanns. Kontrollerna följer nu sina
egna testlistings och tillåter annat lager. SQL-testerna använder separata
itemdefinitioner inom en tillbakarullad transaktion. Ordinarie annonser bevaras.

Tidigare dokumenterad Next.js stream-/Gzip-diagnostik förekommer fortfarande i
testserverns logg. Se [frameworkdiagnostik](ARCHITECTURE.md#nextjs-stream-cancellation-diagnostic).

# Energy på fasta serverklockslag, 2026-09-20

Energy återhämtas nu på gemensamma servergränser:
- Hamnen och Hospital: +5 vid :00, :05, :10 och så vidare.
- Havsplatser och resor i båda riktningarna: +5 vid :00, :10, :20 och så vidare.
- Energy är alltid heltal, högst 100. Offlineåterhämtning räknas med samma klockslag.
- Hemkomst byter takt vid faktisk ankomst. Gränsen vid ankomst räknas en gång.
- Scouting kan använda nyligen intjänad Energy. Resor och strid behåller sina handlingslås.
- Sidopanelen visar aktuell takt och nästa Energy-tick med tidszon.

Se [Energy-regler och serverberäkning](ENERGY_RECOVERY.md). Detta ersätter tidigare
uppgifter nedan om fryst Energy till havs eller individuella återhämtningstimers.

Lokalt applicerad migration: `20260920040446_central_gameplay_config_51219ed7af39.sql`.
Övergången verifierades först i en tillbakarullad transaktion mot befintliga rader.
Intjänad Energy och distansrekord bevarades. Det gamla pausfältet är borttaget.
Ingen push eller extern driftsättning har gjorts.

Verifierat:

- `npm run check`: lint, TypeScript, 154 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 981 assertioner passerade, inklusive 35 nya Energy-kontroller.
- `npm run test:config:db`: 60 kontroller med alternativ konfiguration passerade.
- Databaslint hittade inga schemafel; security advisors hittade inga problem.
- Det nya webbläsartestet för Energy passerade separat.
- `npm run test:e2e`: hela sviten passerade, 48 av 48 tester. Resor, scouting,
  strid, handlingslås, träning, profiler och mobilbredder omfattas.
- Dokumentlänkar och `git diff --check` kontrollerades; localhost svarade HTTP 200.

Kostnadstesterna använder isolerade avräkningstider för att inte bero på när
serverklockan passerar en tick under körningen. Återhämtningstester provar
uttryckligen fasta gränser och verkliga RPC-anrop.

Den tidigare dokumenterade Next.js stream-/Gzip-diagnostiken syns fortfarande
i testserverns logg. Se [frameworkdiagnostik](ARCHITECTURE.md#nextjs-stream-cancellation-diagnostic).

# Handlingslås för försvarare implementerat, 2026-09-20

En spelare som blir attackerad kan fortfarande läsa sidor, inventory, profiler
och sparade scoutingresultat. Alla vanliga handlingar som flyttar eller ändrar
karaktären är däremot låsta under striden, både i gränssnittet och vid direkta API-anrop.

- Spärren omfattar resor i båda riktningar, scouting, föremålsändringar, träning,
  nya skeppsarbeten, nivåköp, banköverföringar, försvarsorder och separata attacker.
- Gemensam serverkontroll använder alla aktiva stridsdeltagare, inklusive försvarare,
  under samma ordnade deltagarlås som attackstart. Äldre kvitton kan läsas utan ny mutation.
- Öppna formulär, bekräftelser och återförsök låses när attacken börjar.
  Läsning, filtrering och navigering för försvararen är kvar.
- Vid flera angripare kvarstår försvararens lås tills hela mötet är slut.
  Kontrollerna blir tillgängliga igen via vanliga realtidssignaler.
- Redan startat skeppsarbete och passiv återhämtning behåller sina tidigare regler.
  Stridens sparade stats ändras inte av att ett tidigare skeppsarbete blir färdigt.

Reglerna ersätter äldre beskrivningar nedan där försvarare kunde träna och använda banken.
Se [stridssystemet](COMBAT_SYSTEM.md) för aktuellt beteende.

Lokalt applicerad migration: `20260920031448_central_gameplay_config_84f32a8c4fc9.sql`.
Historiska migrationer och befintliga speldata bevarades.

Verifierat:

- `npm run check`: lint, TypeScript, 154 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 946 assertioner passerade, inklusive lås, oförändrad data vid
  nekade handlingar, läsåtkomst och upplåsning efter sista angriparen.
- `npm run test:config:db`: 60 kontroller med alternativ konfiguration passerade.
- Databaslint för `public,private` hittade inga schemafel; security advisors hittade inga problem.
- De två nya webbläsartesterna passerade: öppna formulär över flera flikar,
  inventoryläsning, reload, hamnaktiviteter, resor, scouting och upplåsning till havs.
- `npm run test:e2e`: 46 av 47 passerade i den fullständiga körningen. Det enda felet
  var en reproducerad kapplöpning i diagramtestets simulerade nätåterställning:
  bakgrundsuppdateringen kunde ta bort Retry-knappen innan testets klick.
  Testet håller nu lyckade svar tills Retry klickats; ingen produktkod eller tidsgräns ändrades.
  Efter rättningen passerade testet tre av tre riktade upprepningar.
  Därmed har samtliga 47 scenarier passerat, men hela sviten kördes inte om efter testjusteringen.
- Lint och TypeScript kördes om och passerade efter den sista testjusteringen.
- `http://localhost:3000/login` svarade med HTTP 200.

Next.js tidigare dokumenterade stream-/Gzip-diagnostik förekommer fortfarande i
testserverns logg. Se [känd frameworkdiagnostik](ARCHITECTURE.md#nextjs-stream-cancellation-diagnostic).

# Scouting och havs-PvP implementerat, 2026-09-20

Vid en havsplats finns **Scout nearby ships** för **5 Energy**. Sökningen sparar
alla andra kaptener på samma Sea distance, oavsett platstyp eller inloggningsstatus.
Listan har profil-länkar och sidindelning. Omladdning och sidbyten är gratis.

Ägarens förtydligande är implementerat: listan är en ögonblicksbild och scouting
krävs före attack. Målet måste fortfarande finnas på samma Sea distance och vid
samma besök som vid upptäckten. Nya ankomster kräver en ny betald sökning.
Start/join behåller den separata kostnaden 10 Energy.

- Betalning och resultat sparas atomiskt. Identiska återförsök debiteras en gång.
- Scoutingen är privat och serverstyrd. Endast senaste medlemslistan lagras;
  historiska kvitton behålls för idempotens. Ett nytt besök kan inte återanvända gamla fynd.
- Preview, profilens Attack och start/join delar plats- och upptäcktsvillkor.
  Resande, olika avstånd och ej upptäckta mål kan inte angripas.
- Stridsorder, gemensamma attacker, skydd, reträtt och Hospital fungerar till havs.
  Ingen stridsdeltagare kan scouta eller börja resa. Överlevande stannar på havsplatsen.
- Ett reproducerat deadlock vid samtidiga scoutingar rättades. Upptäckter refererar
  stabila profilidentiteter i stället för att låsa andra kaptenernas privata spelrader.

Nya lokalt applicerade migrationer:

- `20260920023849_sea_scouting_foundation.sql`
- `20260920024333_central_gameplay_config_0b2bcd4361a2.sql`
- `20260920024733_central_gameplay_config_64ca1945a605.sql`
- `20260920024848_central_gameplay_config_4e669087fd49.sql`
- `20260920025539_sea_scout_identity_reference.sql`

Verifierat:

- `npm run check`: lint, TypeScript, 154 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 915 assertioner passerade, inklusive 75 nya scoutingkontroller.
- `npm run test:config:db`: 60 kontroller passerade med alternativ konfiguration.
- Databaslint för `public,private` hittade inga schemafel. Supabase security advisors
  med varningsnivå och högre hittade inga problem.
- `npm run test:e2e`: hela sviten passerade, 45 av 45 tester.
  De tre nya testerna omfattar scouting till strid, sparade resultat, kostnader,
  profilåtkomst, samtidig attack/avfärd, idempotens och samtidiga scoutingar.
- Det tidigare felande samtidighetstestet passerade tre riktade upprepningar,
  vardera med fem par samtidiga sökningar.
- Mobilbredder 375 och 320 samt datorbredd 1280 kontrollerades utan sidledes
  overflow. Dator- och mobilbilder granskades visuellt.
- Lint och TypeScript passerade även efter sista teständringen.
- Dokumentlänkar och `git diff --check` kontrollerades.
- Den lokala utvecklingsservern på port 3000 svarar HTTP 200.

Tidigare dokumenterade Next.js-diagnostiker för avbrutna RSC-strömmar och
Gzip-listeners förekom fortfarande i testserverns logg. Se
[känd frameworkdiagnostik](ARCHITECTURE.md#nextjs-stream-cancellation-diagnostic).

Aktuella regler finns i [scouting](SEA_SCOUTING.md), [resor](SEA_TRAVEL.md),
[strid](COMBAT_SYSTEM.md) och [profiler](CHARACTER_PROFILES.md).
Det tidigare uppskjutna havs-PvP-beslutet i historiska avsnitt nedan är därmed ersatt.

# Sea distance och profilrekord, 2026-09-20

Resevyn använder nu **Sea distance**. Den egna och andra kapteners profil visar
**Max sea distance**, det största avstånd som karaktären har nått.

- Rekordet ökar vid ankomst, inklusive offlineankomst, och bevaras efter hemkomst,
  kortare senare resor och Hospital. En ännu inte avslutad färd ger inget rekord.
- Servern lagrar rekordet och skyddar det mot klientskrivningar och oavsiktlig sänkning.
  Profilens tidsstyrda projektion kan visa rätt rekord utan att ägaren loggar in.
- Migrationens startvärde är nuvarande nått avstånd eller en redan förfallen utresa.
  Äldre avslutade resor utan sparat rekord återskapas inte.
- Befintliga interna fältnamn med `step` behålls för kompatibilitet.

Följande nya migrationer är applicerade i den lokala databasen:
`20260920011728_sea_distance_record.sql` och
`20260920011921_central_gameplay_config_4697f396f8a4.sql`.

Verifierat för ändringen:

- `npm run check`: lint, typkontroll, 148 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 840 assertioner passerade, inklusive 26 nya rekordkontroller.
- `npm run test:config:db`: 57 kontroller passerade med alternativ konfiguration.
- Databaslint för `public,private`: inga schemafel.
- Riktade Playwright-tester för profiler och havsresor: 5 av 5 passerade, inklusive
  verklig 60-sekundersresa, offlineankomst, offentlig/egen profil och hemkomst.
  Testets profilväljare korrigerades för Next.js dolda sidkopior.
- Lint och TypeScript kördes igen efter testjusteringen och passerade.
- Profilen kontrollerades vid 1280, 375 och 320 pixlar utan sidledes overflow;
  dator- och mobilbilder granskades visuellt.
- `git diff --check` och dokumentlänkar kontrollerades.

Den tidigare dokumenterade Next.js-diagnostiken för avbrutna RSC-strömmar
förekom fortfarande i webbläsartesternas serverlogg.
Se [reseregler](SEA_TRAVEL.md), [profiler](CHARACTER_PROFILES.md) och
[känd frameworkdiagnostik](ARCHITECTURE.md#nextjs-stream-cancellation-diagnostic).

# Stegvisa havsresor implementerade, 2026-09-20

Reseloopen från [planen](SEA_TRAVEL_PLAN.md) är implementerad. Aktuellt kontrakt
och spelbeteende finns i [resesystemet](SEA_TRAVEL.md).

- Set sail kostar 5 Energy. Första 60-sekundersresan går till Outside the harbor,
  steg 1. Varje havsbesök visar två olika, sparade platstyper.
- Nästa steg är gratis och tar 60 sekunder. Direkt hemresa är gratis och tar
  steg gånger 60 sekunder. Under resa visas destination och vänteläge.
- Servern äger tid, slumpning, steg och pris. Versioner, kvitton och gemensamma
  stridslås skyddar mot gamla flikar, återförsök och samtidiga kommandon.
- Energy är pausad under hela frånvaron. Delintervall bevaras; återhämtning efter
  offlinehemkomst räknas från den faktiska ankomsttiden.
- Hamnaktiviteter och havs-PvP är spärrade. Både angripare och försvarare måste
  avsluta striden före avfärd. Skeppsarbete måste vara klart.
- Profiler och inventory är läsbara vid en havsplats. Profiler och hamnlistan visar
  korrekt offlineankomst via tidsmedvetna publika projektioner och deadlines.
- Adminredigerad Energy och Hospital-intagning håller resan och energipausen konsekventa.
- En reproducerad navigationskapplöpning rättades: bakgrundsuppdatering vid fokus
  köas när en vy laddas. Länkar och laddningsgräns delar kö med resurs-/reseuppdatering.

Tre nya migrationer har applicerats lokalt utan återställning av spelardata:
`20260920001431_sea_travel_foundation.sql`,
`20260920002303_central_gameplay_config_a163841e8c41.sql` och
`20260920003353_central_gameplay_config_dea2f0672d05.sql`.
Äldre migrationer är oförändrade. Ingen extern driftsättning har genomförts.

Verifierat:

- `npm run check`: lint, TypeScript, 148 enhetstester och produktionsbygge passerade.
- `npm run test:db`: 814 assertioner passerade, varav 90 för resor.
- `npm run test:config:db`: 57 kontroller passerade i återställd transaktion,
  inklusive ändrade resetider och bevarade pågående färder/alternativ.
- `supabase db lint --local --schema public,private --level error --fail-on error`:
  inga schemafel.
- `npm run test:e2e`: hela sviten passerade, 41 av 41 tester. Reseflödet omfattar
  en faktisk 60-sekundersresa, två flikar, utloggning, offlinehemkomst och samtidiga
  rese-/stridskommandon. Det reproducerade fokus-/navigationsfallet passerade.
  Efter testhjälparens hantering av serialiseringskonflikter passerade även tre
  riktade upprepningar av samtidighetstestet.
- Mobilbredder 375 och 320 samt datorbredd 1280 kontrollerades utan sidledes
  overflow. Dator- och mobilbilder granskades visuellt.
- `git diff --check` och lokala dokumentlänkar passerade.
- Lokal spelserver på port 3000 svarar 200 och serverar den nya resestatusen.

De tidigare dokumenterade Next.js-diagnostikerna för avbrutna RSC-strömmar och
Gzip-listeners förekommer fortfarande i webbläsarsvitens serverlogg. De döljs inte.
Se [arkitekturdokumentets kända frameworkdiagnostik](ARCHITECTURE.md#nextjs-stream-cancellation-diagnostic).

Platsaktiviteter och havets framtida PvP-system ingår inte. Besök är ännu privata
reseidentiteter utan en gemensam geografisk världskarta.

# Plan för stegvisa havsresor, 2026-09-20

[Reseplanen](SEA_TRAVEL_PLAN.md) beskriver avfärd för 5 Energy, två synliga
slumpade destinationer, en minuts resa per steg utåt och hemresa på en minut
per steg från hamnen. Energy återhämtas inte till havs.

- Planen täcker lagring, serverstyrda ankomster, offlinebeteende, samtidighet,
  energipaus, navigation, hamnlista och integration med befintliga spelhandlingar.
- Skeppsarbete måste vara färdigt före avfärd. Varken angripare eller försvarare
  får lämna en pågående strid.
- PvP till havs väntar på ett separat framtida system. I denna etapp kan spelare
  till havs varken attackera eller bli attackerade, även när de står still.
- Beslutade regler skiljs från arbetsförslag. Genomförandet har fem etapper.

Detta är en dokumentationsleverans. Ingen spelkod, config eller databas har ändrats.
Implementationskontrollerna i planen är framtida arbete och har inte körts nu.

Verifierat för dokumentleveransen: `git diff --check`, 54 lokala dokumentlänkar
samt planens rubrikstruktur, kodblock och blankstegskontroll passerade.

# Kodstädning, 2026-09-20

Projektets kod, konfiguration, SQL-mallar, testhjälpare och dokumentation har gåtts igenom.
[Underhållsguiden](CODE_MAINTENANCE.md) beskriver ansvarsfördelningen och fortsatt utveckling.

- Nedräkningar delar serverankare och monoton lokaltid. Sjukhuslista och profil delar
  serialiserad hämtning, avbrott, återförsök och tidsstyrd uppdatering.
- Dubbla fokusuppdateringar är borttagna. Inventorybilder och expanderade detaljer
  har egna komponenter. Generell validering och formatering ligger utanför spelmodulerna.
- SQL-mallen är uppdelad i elva funktionsområden med oförändrad genererad SQL och
  versionshash. Spelregler, migreringshistorik och befintliga spelardata har bevarats.
- Gemensamma testkonton används av inventory-, hospital- och admintester.
  Oanvänd CSS och tomma äldre kataloger är borttagna. TypeScript kontrollerar
  oanvända lokala variabler och parametrar.

Verifierat: `npm run check` passerade med lint, typkontroll, 127 enhetstester
och produktionsbygge. Alla 38 webbläsartester passerade i samma körning.
724 databasassertioner och 49 kontroller med alternativ konfiguration passerade.
Konfigurationsgeneratorns kontroll bekräftade oförändrad SQL och versionshash.

Next.js loggar fortfarande tidigare dokumenterad diagnostik för avbrutna strömmar
och Gzip-lyssnare. Ett extra adminscenario passerade med `--trace-warnings`;
stackspåret för Gzip-varningen pekar på Next.js komprimering och serverruntime.
Ingen loggfiltrering eller beroendepatch har införts. Se [arkitekturen](ARCHITECTURE.md).

# Centrerade popupfönster, 2026-09-19

Alla modala dialoger centreras som standard i skärmens synliga yta, om ingen särskild
placering anges. Trash och adminpanelens dialoger använder ett gemensamt litet kryss
uppe till höger. Krysset stänger utan att skicka formuläret; Trash behåller befintligt
skydd mot stängning medan en radering pågår.

Verifierat: lint och produktionsbygge med TypeScript passerade. Båda befintliga
Trash-webbläsartesterna passerade. En separat webbläsarkontroll bekräftade centrering,
kryss, Escape, återställt fokus och oförändrat itemantal efter avbrytning.
Trash kontrollerades vid 1280, 375 och 320 px bredd, och admin vid 1280 och 375 px,
även med sidan scrollad. Skärmbilder granskades på desktop och mobil.

# Energy-slider för skeppsarbete, 2026-09-19

Work size använder nu en slider från 5 till aktuell Energy, i steg om 1.
En Energy tar en minut. Förhandsvisningen uppdaterar tid, kostnad och statökning direkt.
Slidern följer ändrat saldo och arbete går inte att starta med mindre än 5 Energy.
Första workshopen ger fortsatt 1 stat per 5 Energy; exempelvis ger 6 Energy +1,2 stats.

- RPC tar energy_amount och validerar heltal, minimum, tak och aktuellt återhämtat saldo.
- Skeppsstatistik och sparade jobb använder numeric för att bevara decimaler.
- Befintliga jobb behåller sina kostnader, belöningar och sluttider. Crew-balansen är oförändrad.
- Nya jobb använder en fast statökning per Energy så att uppdelning inte ger avrundningsbonus.
- Två migrationer applicerade lokalt utan återställning av databasen.

Verifierat: lint, typkontroll, 121 enhetstester och produktionsbygge passerade.
724 databasassertioner och 49 kontroller med alternativ konfiguration passerade.
Fem webbläsartester för träning passerade, inklusive saldoförändringar, minimum,
decimalbelöningar, återförsök, samtidighet och automatisk färdigställning i flera flikar.
Slidern kontrollerades visuellt på desktop och mobil; 320 px ger ingen horisontell overflow.
Supabase security advisors rapporterade inga problem. Localhost svarade HTTP 200.

# Adminpanel implementerad, 2026-09-19

[Adminpanelen](ADMIN_PANEL.md) finns på `/admin`, med Ludorex som lokal administratör.
Funktionalitet har prioriterats enligt ägarens instruktion.

- Spelarsökning, resurs-/stat-/saldoändringar och träningsprogression.
- Itemgenerering med antal och individuella utrustningsstats, mängdändringar och radering.
- Databasvy för samtliga 25 nuvarande spel-/admintabeller med sökning,
  exakta filter, kolumntyper, fullständiga värden och 50 rader per sida.
- Utskrivning från Hospital, avslut av strid utan extra skaderunda och avbrytning
  av skeppsjobb utan återbetalning. Adminvyn fungerar även vid egna spellås.
- Databasägd behörighet, HTTP 403 för inloggade icke-administratörer och skydd
  i både serverfunktioner och RPC:er. Ingen service-nyckel behövs.
- Orsak, förhandsgranskning, samtidighetskontroll och atomär före/efter-logg.
  Sparade anrops-ID:n kan återanvändas efter nätverksfel och omladdning.
- Resursändringar sätter nya återhämtningstider. Gamla tidsankare kan därför inte
  omedelbart återställa manuellt ändrad Energy eller hälsa.
- Tre adminmigrationer är applicerade lokalt utan databasåterställning.
  Kataloger, projektioner, historiska kvitton och audit är skrivskyddade i panelen.
  Kontoborttagning, behörighetstilldelning och schemaändringar är fortsatt ägaroperationer.

Verifierat:

- Lint, typkontroll, 105 enhetstester och produktionsbygge passerade.
- 698 databasassertioner passerade, varav 81 för administration.
  Tre nya resurstester misslyckades före den sista korrigeringen och passerade efteråt.
- 49 kontroller med alternativ konfiguration passerade och rullades tillbaka.
- Hela webbläsarsviten passerade: 37 av 37 scenarier i samma körning.
  Efter den sista resursmigrationen passerade alla fyra adminscenarier igen.
  De täcker även förlorat svar följt av omladdning, samtidiga tilldelningar,
  stale edits, återkallad behörighet, stridslogg och avbrutet skeppsjobb.
- 320, 375, 768 och 1280 px kontrollerades utan sidöverflöde.
  Dator- och mobilbilder granskades visuellt.
- Supabase security advisors rapporterade inga problem. Samtliga befintliga
  public/private-tabeller har en post i adminvyns tillåtna tabellregister.
- Audit-testet avgränsar numera till sitt eget konto, eftersom tidigare auditposter
  avsiktligt finns kvar efter kontoborttagning.
  Diagramtestet inväntar färdigrenderat periodbyte och använder ett bestämt HTTP
  503-svar vid test av API-fel och Retry.
- Den vanliga lokala utvecklingsservern kör på port 3000 och har adminrutten.

Next.js rapporterar fortfarande den tidigare dokumenterade diagnostiken för
avbrutna RSC-strömmar. Vid avsiktligt avbrutna anrop förekommer också en
MaxListenersExceededWarning från serverns Gzip-ström. Dessa har inte dolts;
ovanstående funktionstester passerar. Ingen commit eller publicering har gjorts av agenten.

# Stabilt periodbyte i cirkulationsdiagrammet, 2026-09-19

- Felet reproducerades på 1280 och 375 px: ett nytt periodval tog bort diagrammets
  DOM-nod medan hämtningen pågick, vilket krympte sidan och flyttade scrollpositionen.
- Den senaste kurvan ligger nu kvar tills ersättningen kommer. Plotten behåller
  samma DOM-nod och uppmätt bredd. Laddning, fel och stickprovsindikator ligger
  ovanpå en stabil diagramyta; bildtextens höjd ändras inte vid periodbyte.
- Retry bevarar tidigare data och anger vilken period som fortfarande visas om
  den nya hämtningen misslyckas. Avbrutna svar kan fortfarande inte skriva över nya val.
- Lint och produktionsbygge inklusive TypeScript passerade. Det fullständiga
  cirkulationsflödet samt två regressionstester passerade i samma körning.
  Regressionstesterna håller tillbaka nätverkssvaret och mäter sidans höjd,
  scrollposition och plottnod varje bildruta före, under och efter bytet.
  Ingen uppmätt scrollförflyttning över 1 px och ingen höjdändring tilläts.
- De två nya regressionstesterna misslyckades på versionen före fixen.

# Item Circulation implementerat, 2026-09-19

[Item Circulation](ITEM_CIRCULATION.md) är implementerat och applicerat lokalt.

- Circ. visar det globala antalet per itemtyp. En diagramknapp öppnar historiken
  direkt under itemets detaljer, före nästa itemrad.
- Sex perioder finns, med All time förvalt. Vänsterkant följer verklig historik
  och vald period; högerkant är aktuell observationstid.
- Hover, tryck och tangentbord visar datum/tid i UTC samt Total in circulation.
- Räknare och historik uppdateras atomärt med skapande, ändrade mängder,
  Trash och kontoradering. Ägar-/statändringar och idempotenta återförsök räknar
  inte extra. Historiken börjar vid införandet med det befintliga innehavet.
- Stora globala antal behåller sin precision. Stora historiksvar begränsas
  genom indexerade stickprov; den fullständiga historiken sparas.
- Diagrammet kan läsas under sjukhusvistelse och hanterar avbrutna hämtningar,
  periodbyten och Retry. Tooltipen begränsas till diagrammets bredd även under resize.

Verifierat:
- Lint, typkontroll, 102 enhetstester och produktionsbygge passerade.
  De nio diagramtesterna och berörda lintkontroller kördes också efter sista ändringen.
- 617 databasassertioner passerade, varav 49 för cirkulation.
- 49 kontroller av alternativ config passerade och rullades tillbaka.
- Alla sju inventoryscenarier passerade tillsammans, inklusive det nya fullständiga
  cirkulationsflödet, två samtidiga ägare, nätverksfel, Hospital och mobil.
- Skärmbredder 320, 375, 768 och 1280 px klarade kontrollen utan horisontellt överflöde.
  Slutresultatet inspekterades visuellt på dator och mobil.
- Supabase security advisors fann inga problem. Samtliga sex globala totalsummor
  jämfördes med faktiskt innehav och stämde.
- Localhost svarar med HTTP 200. Inga commits eller publiceringar har gjorts.

Den sedan tidigare dokumenterade Next.js-diagnostiken vid avbrutna RSC-strömmar
förekommer i testserverns logg; samtliga spel- och diagramflöden passerade.

# Inventory och items implementerat, 2026-09-19

[Inventory](INVENTORY.md) är implementerat enligt den första etappen i
[inventoryplanen](INVENTORY_PLAN.md).

- Inventory finns i sidopanelens Harbor-meny med sex kategorier, namnsökning och sidindelning.
  Panelen fyller innehållsytans bredd; itemradernas grundhöjd är 36 px på dator och 45 px på mobil.
  En tunn, indragen avskiljare ligger mellan miniatyren och namnet.
  Detaljbildens yta är högst 280 × 190 px och 180 px hög på mobil.
- Kompakta itemrader visar egna bilder, namn, stackantal och individuella stats.
  Klick öppnar beskrivning, effekttext och större bild direkt under raden.
  Detaljernas egenskaper visas i två kolumner: Category/Quantity och Damage/Accuracy,
  bredvid bilden på dator och under bilden på mobil.
- Crew-vapen och kanoner är separata exemplar. Förbrukningsvaror och material stackas.
- Trash har antal, bekräftelse, ägarkontroll, atomär radering och beständiga kvitton.
  Återförsök efter ett förlorat svar förstör inte fler items, även om sista raden försvunnit.
- Andra flikar uppdateras. Öppen bekräftelse visar senaste tillgängliga mängd.
- Inventory kan läsas i Hospital. Trash är spärrat där och för aktiva angripare.
  Profiler, sjukhusnedräkning och övriga navigationslås fungerar fortsatt.
- Equip och Use är synliga men inaktiva. Medicinska effekter, träningsbuffar,
  utrustningsbonusar och value återstår. [Cirkulation och historik](ITEM_CIRCULATION.md) är tillagt.
- Katalogen följer central config. Tidigare definitioner kan inte tas bort eller
  ändra typ/utrustningsplats genom synk; befintliga innehav och stats bevaras.
- Två nya migrationer är applicerade lokalt utan reset:
  20260919072355_inventory_foundation.sql och
  20260919072801_central_gameplay_config_60b2d2217835.sql.
- Vanliga karaktärer har tomt inventory. Ett verifierat lokalt fixturekommando finns
  för en uttryckligt vald testkaraktär. Provitems har därefter lagts på Ludorex på ägarens begäran.
- Sex egna transparenta PNG-bilder finns i public/images/items. Prompter och ursprung
  är dokumenterade i [ITEM_ART.md](ITEM_ART.md).

Efter justeringen av bredd, bildstorlek och menylänk passerade lint, typkontroll,
produktionsbygge och samtliga sex inventoryscenarier igen. Dator- och mobilbilder
kontrollerades visuellt; Inventory förblev tillgängligt under sjukhusvistelse.

Verifierat vid grundimplementationen:

- Lint, typkontroll, 93 enhetstester och produktionsbygge passerade.
- 568 databasassertioner passerade, inklusive 61 nya för inventory.
- 49 kontroller med alternativ config passerade i en återställd transaktion.
  De täcker även beständiga itemstats, oförändrade stackar, sidstorlek,
  avaktiverade definitioner, citattecken och förbjudna katalogändringar.
- Alla 11 relevanta webbläsarscenarier passerade i samma körning: sex för inventory,
  fyra för Hospital/profiler och ett för navigation. Inventory täcker flera flikar,
  återinloggning, medicinsk kategori i Hospital, stridslås, nätverksavbrott,
  samtidiga raderingar, tomt innehav och radering av sista resultatsidan.
- 320, 375, 768 och 1280 px kontrollerades utan horisontellt överflöde.
  Miniatyrerna ryms inom raderna och alla sex bilder laddas.
- Lokalt fixturekommando verifierades med ett separat testkonto: sju poster skapas
  och en upprepning bevarar redan ändrade mängder. Testkontot togs bort.
- Supabase security advisors rapporterade inga problem. Localhost svarar med HTTP 200.

Den tidigare dokumenterade Next.js-diagnostiken "The destination stream closed early"
förekommer fortfarande vid avbrutna RSC-strömmar. De verifierade flödena passerar;
diagnostiken döljs inte.

# Inventory: implementationsplan, 2026-09-19

[Inventoryplanen](INVENTORY_PLAN.md) är klar. Ingen inventoryfunktion är implementerad ännu.

- Första etappen är beständiga items, kategorifilter, kompakta rader och utfällbara detaljer.
- Crew-vapen och kanoner är de första utrustningstyperna.
- Equip och Use visas men väntar med faktisk spelpåverkan till nästa etapp.
- Trash fungerar i första etappen, med antal och bekräftelse.
- Inventory får läsas på sjukhuset. Medicinska items får användas där när Use införs.
  Trash och andra itemhandlingar är spärrade under sjukhusvistelsen.
- Value och antal i cirkulation införs senare.
- Planen bygger på ägarens referensbilder, förtydliganden och Torns officiella wiki.
- Detta är en dokumentationsändring. Inga migrationer, itemtilldelningar eller speländringar har gjorts.

# Profiler tillgängliga under sjukhusvistelse, 2026-09-19

- My Profile är alltid tillgänglig. Sjukhuspatienter kan läsa sin egen och andra spelares profiler.
- Patientnamnen i Hospital länkar till profilerna. Tillbaka-länken på profilen leder till Hospital under vistelsen.
- Profiler visar Hospital, In hospital och en nedräkning för alla registrerade spelare.
  Statusen uppdateras vid intagning och tas bort efter utskrivning, även när patienten är offline.
- Sjukhussidan och profilen delar samma nedräkningskomponent. Databastid styr återstående tid.
- get_hospital_status läser den befintliga RLS-skyddade patientprojektionen och lämnar bara
  sluttid och observationstid. Profilens fyra identitetsfält och privata karaktärsrader är oförändrade.
- Sidundantaget delas av proxy och klientens navigationsskydd. Aktiva stridslås gäller fortfarande.
- Träning, uppgraderingar, bank, attack och ändring av försvarsorder förblir spärrade i databasen.
  Attack och försvarsformulär är också inaktiva där de visas på profilerna.
- Migration 20260919061624_central_gameplay_config_ac5f1398a9f8.sql är applicerad lokalt.

Verifierat: lint, typkontroll, 71 enhetstester, produktionsbygge, 507 databasassertioner
och samtliga 10 webbläsarscenarier för strid, sjukhus och profiler passerade.
Profilscenariot täcker två spelare, liveintagning, nedräkning, direktlänk, omladdning,
ny flik, egna/andras profiler, fortsatt handlingsspärr samt online- och offlineutskrivning.
320, 375 och 1280 px kontrollerades utan överflöde; desktop och mobil granskades visuellt.
Security advisors rapporterade inga problem. Dokumentlänkar och git diff --check passerade.
Den tidigare dokumenterade Next.js-diagnostiken vid avbrutna RSC-strömmar finns kvar.
Localhost svarar på http://127.0.0.1:3000/login.

# Hospital och beständig karaktär, 2026-09-19

[Hospital](HOSPITAL.md) är implementerat i Harbor-panelen och ersätter den tidigare
idén om hardcore och permanent karaktärsdöd.

- Noll Crew Health ger fem minuter i Hospital. Noll Ship Health sätter också Crew Health till 0.
- Alla nya spelhandlingar spärras i både gränssnitt och databas: crew-träning, skeppsarbete,
  nivåköp, banköverföringar, försvarsorder och strid. Patienter kan inte attackeras.
- Direktlänkar, cachad navigation, nya flikar och återinloggning leder tillbaka till sjukhuset.
- Sjukhuset visar alla aktuella patienter, även offline, med paginering och liveuppdateringar.
- Utskrivning sker automatiskt med full hälsa, även offline. Karaktär, stats, progression och pengar behålls.
- Passiv Energy och redan påbörjade skeppsjobb fortsätter under vistelsen.
- Intagningen täcker både PvP och andra serverstyrda skadeorsaker. Extern död under ett aktivt
  möte frigör deltagarna utan att tilldela en påhittad PvP-seger.
- hospital.durationSeconds är 300 i config. Redan sparade sluttider ändras inte av configbyte.
- Migrationerna 20260919052625_hospital_recovery.sql,
  20260919053041_central_gameplay_config_87100bb68e0a.sql och
  20260919053954_central_gameplay_config_6a8bd1163a61.sql är applicerade lokalt utan reset.
- Tidigare designbeskrivningar av permanent död är ersatta eller markerade historiska.

Verifierat:

- Lint, typkontroll, 71 enhetstester och produktionsbygge passerade.
- 501 databasassertioner och 39 kontroller med alternativ config passerade.
  Alternativkonfigurationen återställdes genom rollback.
- Hela dåvarande webbläsarsviten passerade: 22 scenarier. Efter slutjusteringarna passerade
  alla sex bank- och sjukhusscenarier, inklusive det nya fallet där en frisk besökare
  besegras medan sjukhussidan redan är öppen.
- Ett befintligt navigationstest hade timingberoende antaganden om förladdning.
  Det kontrollerar nu både Nexts innehållsladdare och dess länkindikator utan
  ögonblicksbilder som kan bli inaktuella. Testet passerade tre upprepningar i följd.
  Det jämför också bevarad faktisk träningsstat så att Perfect Drill inte orsakar ett slumpfel.
- Sjukhusvyn kontrollerades vid 320, 375, 768 och 1280 px utan horisontellt överflöde.
  Desktop- och mobilskärmbilder granskades visuellt.
- Supabase security advisors rapporterade inga problem.
- Dokumentlänkar och git diff --check passerade. Localhost svarar på http://127.0.0.1:3000/login.

Den redan dokumenterade Next.js-diagnostiken "The destination stream closed early"
förekommer vid avbrutna navigationer/förladdningar. Den döljs inte och gav inga
JavaScript-fel i de verifierade sjukhusflödena.

# Träningsprogression visas endast i procent, 2026-09-19

- Crew Training och Ship Upgrades visar en 0-100 %-mätare i stället för synliga XP-tal.
- Intjänad XP, krav, återstående XP och XP-belöningar är dolda i gränssnittet och statusmeddelandena.
- Mätarens tillgänglighetsvärden använder också procent. 100 % visas först vid upplåsning eller slutnivån.
- Intern XP, priser och köpkrav är oförändrade.
- Lint, typkontroll, 71 enhetstester och produktionsbygge passerade.
- Alla fyra webbläsarscenarier för träning passerade, inklusive båda vyerna, köp och återförsök.
- Crew-vyn granskades visuellt och git diff --check passerade.

# Energy +5 var femte minut, 2026-09-19

- Energy återhämtas nu med 5 per helt femminutersintervall, även offline, till max 100.
- Mängden styrs av resources.energyRecoveryAmount. Tidsankaret följer intervall, inte poäng.
- Sidopanelen, träningstexten och dokumentationens progressionstider är uppdaterade.
- Migration 20260919020734_central_gameplay_config_f70b531a82c5.sql är applicerad lokalt.
- Typkontroll, 71 enhetstester, 443 databasassertioner och 38 kontroller med alternativ config passerade.
- Kontrollerna täcker intervallgränsen, offlineåterhämtning, kvarvarande delintervall och klippning vid full Energy.
- Denna ändring har inte krävt en ny full webbläsarkörning.

# Träningsprogression implementerad, 2026-09-19

Kärnan i [träningsplanen](TRAINING_PROGRESSION_PLAN.md) är implementerad lokalt enligt
ägarens senare avgränsning utan items. Aktuella regler och balans finns i
[träningssystemet](TRAINING_FOUNDATION.md).

- Crew tränas direkt, får XP och har 1 % Perfect Drill med dubbla stats.
- Crew och skepp har separata XP-spår och tio köpta övningar/workshops.
- Endast Gold Coins på karaktären betalar nivåköp. XP förbrukas inte och nivåer kan inte hoppas över.
- Skeppet har ett arbete åt gången: 5/25/50 Energy och 5/25/50 minuter. Stats och XP ges automatiskt vid färdigställande.
- Arbeten fortsätter offline och under strid. Ett workshop- eller configbyte ändrar inte ett sparat jobb.
- Förfallna arbeten tillgodoräknas även för offlineförsvarare före ny stridssnapshot.
  Pågående strider behåller sina snapshots.
- Databasen styr tid, ägare, kostnad, XP och slump. Gemensamma deltagarlås och privata kvitton skyddar samtidighet och återförsök.
- Ändringssignaler uppdaterar andra flikar; sidans tidsstyrda uppdatering fångar jobbets sluttid.
- Befintliga karaktärsvärden bevaras. Progression börjar på första nivån med 0 XP, utan retroaktiv uppskattning.
- Statkolumner och XP använder säkra bigint-värden. Gamla public/private train_stat är borttagna.
- Migrationerna 20260919013000_training_progression.sql och 20260919013751_central_gameplay_config_26c391f022e6.sql är applicerade lokalt utan reset.
- Items, consumables, material och intjäning ingår inte. HP och stridsformler är oförändrade.
  Nivåpriser och XP-trappa är justerbara första balansvärden.

Verifierat efter implementation:

- Lint, typkontroll, 70 enhetstester och produktionsbygge passerade.
- 441 databasassertioner passerade. Bland annat: kontoavskiljning, RNG-gräns,
  guldköp, återförsök, säker heltalsgräns, offlineförsvarare och oförändrade aktiva snapshots.
- 37 kontroller med alternativ config passerade i transaktion. Originalconfig återställdes.
  Ändrade katalogvärden påverkar inte befintliga saldon eller jobbets kostnad, gain, XP och tid.
  Katalogtext med apostrof och dollaravgränsare verifierades.
- Hela webbläsarsviten passerade i samma körning: 20 av 20 scenarier.
  Träningen omfattar två flikar, alla arbetsstorlekar, automatisk färdigställning,
  ut-/inloggning, samtidiga anrop och ett förlorat crew-svar utan ny debitering eller slumpning.
- Ett etikettproblem på storleksvalet hittades och rättades innan den gröna slutkörningen.
- Skärmbilder för crew och skepp granskade på desktop och mobil. Layoutkontroller vid 320, 375, 768 och 1280 px passerade.
- Supabase security advisors rapporterade inga problem.
- 53 dokumentlänkar, git diff --check och slutlig config:check passerade.
- Localhost svarar på http://127.0.0.1:3000/login.

Den tidigare dokumenterade Next.js-diagnostiken "The destination stream closed early"
förekommer fortfarande vid avbrutna svar/navigation. Alla scenarier passerar.
Inga molnändringar, commits eller pushar har gjorts.

Följande avsnitt är historiska leveransanteckningar.

# Gold Coins och banken, 2026-09-19

Implementerat och migrerat lokalt före träningsprogressionen:

- Gold Coins på karaktären visas ovanför resursmätarna.
- Bank finns i Harbor med separat banksaldo, ett beloppsfält samt Deposit och Withdraw.
- Nya och tidigare karaktärer får 0 i de nya saldona. Befintliga stats, resurser och historik bevaras.
- Endast gold_coins är tillgängligt för framtida köp. bank_gold_coins kräver uttryckligt uttag.
- Positiva heltal, saldokontroller, säkra heltalsgränser och atomiska överföringar.
- Privata kvitton gör återförsök idempotenta. Ett förlorat svar kan kontrolleras med Retry transfer utan dubbel debitering.
- Ägarskyddade ändringssignaler uppdaterar saldo i andra flikar.
- Items, material, consumables och intjäning har inte införts. Träningsplanen är uppdaterad med den nya ordningen.
- Migrationerna 20260919010606_add_gold_coins_and_bank.sql och 20260919010900_central_gameplay_config_6f7dc499f0c0.sql är applicerade utan reset.
- Lokal databas och utvecklingsserver är igång på http://127.0.0.1:3000.

Verifierat:

- Lint, typkontroll, 64 enhetstester och produktionsbygge passerade.
- 398 databasassertioner passerade, inklusive 51 bankkontroller.
- 26 kontroller med alternativ gameplayconfig passerade i en transaktion; originalkonfigurationen återställdes.
- Hela webbläsarsviten passerade: 18 av 18 scenarier i samma körning.
- Banktester täcker insättning, deluttag, helt uttag, överdrag, flera flikar, samtidiga anrop, förlorat svar, ut-/inloggning och kontoavskiljning.
- Beloppsfältets etikett rättades efter den första webbläsarkörningen. Slutligt bygge och hela sviten passerade efter rättningen.
- Mobil/desktop-skärmbilder granskade; ingen horisontell överströmning vid 320, 375, 768 eller 1280 px.
- Supabase security advisors: inga anmärkningar. Dokumentlänkar och git diff --check passerade.

Den tidigare dokumenterade Next.js-diagnostiken om avbrutna RSC-strömmar förekommer
fortfarande i strids-/navigationsregressionen; samtliga scenarier passerar.
Inga molnändringar, commits eller pushar har gjorts.

[Systembeskrivning](GOLD_COINS_AND_BANK.md).

# Plan för träningsprogression, 2026-09-19

[Implementationsplanen](TRAINING_PROGRESSION_PLAN.md) beskriver den accepterade
grunden: köpta crew-övningar, 1 % Perfect Drill med tillfälliga consumable-effekter,
samt köpta workshops och tidsstyrda skeppsarbeten. Den skiljer ägarens beslut
från föreslagna balansvärden och beskriver ekonomi/inventarium, offlinefärdigställande,
stridsintegration, migration och verifiering i fem etapper.

Detta är en dokumentationsleverans. Ingen spelkod, config eller databas har ändrats.
Grunddesignen är accepterad; implementationsplanens detaljer är arbetsförslag.
Implementationskontrollerna i planen är framtida arbete och har inte körts i detta planarbete.

Verifierat för dokumentleveransen: git diff --check passerade. En separat dokumentkontroll
verifierade 39 lokala länkar i fem filer och åtta kontroller av planens struktur och centrala regler.

# Central konfiguration och organiserade källor, 2026-09-17

- config/ samlar gameplay, frontend, tema/CSS, auth, server, Supabase, Next.js och testinställningar.
- Hemligheter, anslutningar och miljöspecifik SITE_URL ligger i ignorerad .env.local, enligt ägarens instruktion.
- Appen läser gemensamma publika JSON-värden; serverinställningar hålls bakom server-only.
- SQL-funktionernas underhållbara källa finns i supabase/templates/gameplay.sql.
  Configvalidering och generering skapar nya migrationer med samma gameplayvärden som UI använder.
- Migration 20260917060236_central_gameplay_config.sql är applicerad lokalt. Balans, startstats,
  befintliga karaktärer, tidigare migrationer, behörigheter och stridshistorik bevaras.
- Resource bars, texter, träningsknappar, validering och stridsvisning följer nu configvärdena.
- Native verktygsfiler är adaptrar. CSS- och Supabasefiler som genereras kontrolleras mot källorna.
- Serverns gameplayrevision jämförs med databasens före resursläsningar och spelhandlingar.
- config:sync är idempotent och skriver aldrig om tidigare configmigrationer.
- config/README.md och docs/CONFIGURATION.md beskriver filindelning, exempel, omstarter och deployordning.
- Ett tidigare navigationstest förväntade stat 2 efter träning. Det har korrigerats till 11 enligt startstats 10.

Verifiering:
- npm run check passerade: lint, typkontroll, 43 enhetstester och produktionsbygge.
- npm run test:db passerade med 347 assertioner.
- Alternativ gameplayconfig: 23 faktiska databaskontroller passerade i en transaktion;
  ändringarna rullades tillbaka och den installerade configrevisionen återställdes.
- Enhetstester renderar dessutom UI med alternativa kostnader, ökningar, HP-/Energymax och återhämtningstider.
- Hela Playwright-körningen klarade 14 scenarier; navigationstestets föråldrade förväntningar rättades
  och det femtonde scenariot passerade separat. Samtliga 15 scenarier är därmed verifierade.
- Supabase security advisors rapporterade inga problem. config:check och git diff --check passerade.
- Upprepad config:sync skapade ingen extra migration.
- Den tidigare dokumenterade Next.js-varningen om avbrutna RSC-strömmar kvarstår vid navigation.

Tillämpning: ändra config, kör config:sync och applicera genererad gameplaymigration med db:migrate.
Frontend-/Nextändringar behöver nytt produktionsbygge; lokala Supabaseinställningar kräver omstart.
Resursmax kan inte sänkas under sparade värden utan en separat, avsiktlig datamigration.
Inga hemligheter flyttades in i config, inga molnändringar gjordes och inget har committats eller pushats.

# Startstats på 10, 2026-09-16

- Nya karaktärer börjar med 10 i Attack, Defense, Speed och Accuracy för både skepp och crew.
- Migration 20260916064805_combat_stats_start_at_ten.sql är applicerad lokalt och ändrar alla åtta kolumndefaults.
  Befintliga karaktärers progression och pågående striders snapshots behålls.
- Träning ger fortfarande +1 för 5 Energy. Skadeformeln är oförändrad:
  nya karaktärer med lika stats 10 gör nu 32 skada per träff.
- Registrerings- och träningstester verifierar samtliga startvärden samt 10 till 11 efter träning.
  Stridsregressioner använder uttryckliga referensstats för att isolera sina scenarier från startbalansen.
- README, TRAINING_FOUNDATION, COMBAT_SYSTEM, COMBAT_AND_PROGRESSION_DESIGN och ARCHITECTURE är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 347 assertioner. Alla sju Playwright-scenarier för träning och strid
passerade tillsammans. Supabase security advisors rapporterade inga problem och git diff --check passerade.
Den tidigare dokumenterade Next.js-varningen om avbrutna RSC-strömmar syntes vid navigation;
samtliga webbläsarscenarier passerade.

# Torn-inspirerade statkurvor med justerad Defense, 2026-09-16

- Samma serverberäkningar används för skepp, crew och automatiska motattacker.
- Accuracy / motståndarens Speed ger träffchans från 0 till 100 %. Lika stats ger 50 %;
  64 gånger högre Speed ger garanterade missar, 64 gånger högre Accuracy garanterade träffar.
- Attack / Defense styr skadan via en logaritmisk kurva. Ägaren valde **25 gånger Defense**
  för full blockering i stället för Torns 14. Lika stats ger fortfarande 50 % skademinskning.
- Grundskadan växer med absolut Attack, med statskalan anpassad så att nya kaptener ger 15 skada per träff.
- Minst 1 skada vid träff under 25-gränsen förhindrar för tidig full blockering genom avrundning.
  Vid gränsen och över ges 0 skada. Tidigare tak på 40 skada är borttaget.
- Combat log skiljer mellan Missed och Blocked · 0 damage; en blockerad träff räknas som träff.
- Utrustningsmodifierare och övriga stridsregler ingår inte i ändringen.
- Migration 20260916051659_torn_style_combat_curves.sql är applicerad lokalt utan reset.
  Nästa order använder de nya kurvorna, även i pågående strider; historiska händelser bevaras.
- COMBAT_SYSTEM, ARCHITECTURE, COMBAT_AND_PROGRESSION_DESIGN och README är uppdaterade.
  Referenser, Torn-approximationernas begränsningar och våra anpassningar finns i COMBAT_SYSTEM.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 339 assertioner, inklusive 66 nya kurv- och gränskontroller.
Alla fem Playwright-scenarier i tests/e2e/combat.spec.ts passerade tillsammans, inklusive miss/blockering
i båda faserna. Supabase security advisors gav inga problem; git diff --check passerade.
Utvecklingsserverns /login svarade HTTP 200. Den tidigare kända Next.js-varningen om avbrutna
RSC-strömmar kvarstår vid navigation; inga webbläsarscenarier misslyckades.

# Delbara attacker och tydligare stridsloggar, 2026-09-16

- Attackvyn använder /attack/<character-id>, med motståndarens ID. Adressen är samma före start och under striden.
- En kopierad adress visar mottagarens egen kapten och Join battle när målet redan angrips.
- Möte och deltagarroll hämtas från servern. Att öppna länken ansluter inte spelaren eller förbrukar Energy.
- Det beständiga sidlåset, reload och separat stridsfas per angripare fungerar med den nya adressen.
- När mötet avslutas öppnas samma offentliga rapport för angriparna. Ett nytt besök på målets länk visar förberedelsen.
- Combat log visar servertid (UTC), utan lokala rundnummer eller summerat antal rundor.
- Deltagarnas skada visas som Ship damage och Crew damage, inklusive försvararens motattacker.
- Alla namn i stridsvyn, händelserna, deltagarlistan och resultatet länkar till profiler.
- Äldre query-länkar omdirigeras till den nya adressen.
- Migration 20260916044300_combat_damage_breakdown.sql är applicerad lokalt. Befintliga händelser summeras utan reset eller omskrivning av historiken.
- README, ARCHITECTURE och COMBAT_SYSTEM är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 273 assertioner. Supabase security advisors rapporterade inga problem.
Webbläsarregressionen omfattar 14 scenarier. 13 passerade i hela körningen; det nya testet för gemensamt
stridsslut läste först serverstatus för tidigt. Efter korrigerad väntan passerade även detta test separat.
Tester täcker kopierad länk mellan konton, rätt egen kapten, dold utrustning före join, energikostnad,
livehälsa, sidlås, reträtt, final blow/assist, rapportövergång, profillänkar, servertid och skadevärden.
Den tidigare dokumenterade Next.js-varningen om avbrutna RSC-strömmar kvarstår.


# Förenklade karaktärsnamn, 2026-09-16

Karaktärsnamn behöver bara vara ifyllda och unika. Kraven på 3-24 tecken och endast
bokstäver har tagits bort från formulär, servervalidering och databas. Siffror,
symboler, emoji och namn på ett enda tecken fungerar. Namn normaliseras fortfarande
och unikhet kontrolleras utan hänsyn till stora och små bokstäver.

Migration 20260916042055_relax_character_names.sql har applicerats lokalt utan reset.
Befintliga konton och namn bevaras. README, arkitektur och byggplan är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och
produktionsbygge. npm run test:db passerade med 264 assertioner. Två riktade
webbläsartester passerade: registrering med långt namn, siffror, understreck och
emoji samt samtidiga registreringar med samma namn. Supabase security advisors
rapporterade inga problem. git diff --check passerade.

# Förenklad lösenordspolicy, 2026-09-16

På ägarens begäran har utvecklingsversionens lösenordskrav sänkts från 12 till 6 tecken.
Ingen teckenblandning krävs. Formulär för registrering och återställning, servervalidering
och lokal Supabase Auth använder samma miniminivå. Bekräftelsefältet kontrollerar fortfarande
att lösenorden matchar. Den tekniska inmatningsgränsen på 128 tecken finns kvar.

supabase/config.toml anger minimum_password_length = 6 och password_requirements = "".
Konfigurationen laddas genom en vanlig lokal omstart, utan databasreset.
Befintliga konton och lösenord ändras inte.

npm run check passerade: lint, typkontroll, 21 enhetstester och produktionsbygge.
Lokal Supabase har startats om med policyn. Två riktade webbläsartester passerade:
registrering/inloggning samt lösenordsåterställning med lösenord på sex små bokstäver.


# Lokala testfönster, 2026-09-16

- npm run dev:players öppnar tre separata Edge-profiler för samtidig testning med olika konton.
- Antalet kan väljas med --count 1-6; endast lokala speladresser tillåts.
- Sparade profiler ligger i den Git-ignorerade katalogen .local/player-browsers.
- Separata konton, reload, återstart med bibehållen inloggning och oberoende utloggning har verifierats med riktiga lokala konton.
- Spelets produktionskod, autentisering och databas har inte ändrats i denna leverans.
- Instruktioner finns i [DEVELOPMENT_TEST_WINDOWS.md](DEVELOPMENT_TEST_WINDOWS.md).

# Senaste leverans: gemensam PvP, 2026-09-16

Implementerat och migrerat i den lokala utvecklingsmiljön:

- Gemensam /attack-route för förberedelse och pågående strid, utan hamnens sidopanel.
- Start battle / Join battle med 10 Energy per angripare och idempotent debitering.
- Beständig serverkontrollerad navigationsspärr för aktiva angripare.
- Flera angripare med egna rundor och faser mot delad försvararhälsa.
- Atomisk final blow och assist, individuella reträtter och nederlag.
- Realtidsuppdatering för angripare och onlineförsvarare. Försvararen använder spelet som vanligt.
- Offentlig /combatlog/<id> med deltagare, träffar, skada och logg, även utan inloggning.
- Migration 20260916022241_shared_attack_encounters.sql applicerad utan reset. Totalt tio migrationer.
- Ingen molndatabas, publicering eller Git-historik har ändrats.

Verifierat: npm run check passerade inklusive lint, typkontroll, 21 enhetstester och produktionsbygge.
npm run test:db passerade med 258 assertioner. Hela npm run test:e2e passerade: 13 av 13 webbläsartester, inklusive alla tre combat-scenarier.
De verifierar också navigation bort, bakåtknappen, ny flik, reload, anonym rapportåtkomst,
samtidig start, dubbla order, konkurrerande sluthits, separata faser och livehälsa.

De äldre balanseringsvärdena gäller: 25 rundor per angripare, två minuters inaktivitet, tio minuter per möte.
Guld, XP, inventarium, ammunitionsekonomi och PvE återstår. Detaljer finns i COMBAT_SYSTEM.md.

Känd begränsning: Next.js 16.3.5 kan logga "The destination stream closed early" vid avbrutna
RSC-navigationer. Detta inträffade även under de passerande testerna; inget browser pageerror uppstod
i det verifierade attackflödet. Den tidigare dokumenterade framework-begränsningen kvarstår.
Slutlig manuell skärmbildsgranskning kunde inte slutföras på grund av verktygsfel; layoutbredd
och tillgängliga order verifierades i webbläsare vid 320, 375, 768 och 1280 px.

## Tidigare implementationshistorik

Avsnitten nedan beskriver tidigare leveranser. Vid skillnader gäller COMBAT_SYSTEM.md och senaste leveransen ovan.

# Implementation status

Verified locally on 2026-09-15.

## Delivered

- Registration with character name, email and password creates both account and
  character in one transaction, then opens The Harbor. Email confirmation is
  disabled for development, following the owner's decision.
- Login, logout and password recovery through Supabase Auth.
- Character name selection inside registration, validation and case-insensitive
  unique names. No separate character step for new accounts.
- One saved character per account, starting in The Harbor.
- The approved Caribbean illustration, blue panels and compact game layout.
- Left navigation on desktop, navigation above content on narrow screens.
- Marketplace and Shipyard placeholder views with persistent navigation.
- Real local PostgreSQL persistence, migrations and row-level access rules.
- Reproducible setup and verification commands in the README.

## Original foundation verification

| Check | Result |
| --- | --- |
| `npm run check` | Passed: lint, TypeScript, 21 unit tests and production build. |
| `npm run test:db` | Passed: 29 pgTAP assertions against local PostgreSQL. |
| Browser tests against the production build | All five scenarios passed in a single run against the updated application. |
| Atomic registration and one character per account | Passed: simultaneous signup with the same name creates one winner; the other account is rolled back and can retry. Extra character inserts are rejected. |
| Local database lint | No schema errors in `public` and `private`. |
| Local Supabase advisors | No issues reported. |
| Dependency audit during installation | Zero known vulnerabilities reported. |
| Visual inspection | Updated desktop/mobile registration screenshots and the harbor layout reviewed. |
| Keyboard review | Passed: skip link, field order, password visibility toggle, visible focus and navigation to login. |
| Actual web server restart | The existing session and saved character remained available after restarting Next.js. |

The browser scenarios cover registration with immediate character creation and
no confirmation email, invalid and taken names, retrying with the same email,
reload, logout/login, menu navigation, password recovery
through the local Mailpit inbox, old-password rejection, unauthorized routes,
invalid callbacks and rejected external callback destinations.

Direct API checks cover two-account isolation, anonymous access, concurrent
registration, second-character rejection, ignored metadata changes and attempted
owner/location manipulation. Failed signup with a missing name or taken name
leaves no account that can log in. Database checks separately
exercise constraints, privileges and row-level policies. Responsive checks cover
1280, 768, 375 and 320 pixel viewport widths. The separate visual smoke run reported
no browser JavaScript errors and confirmed persistence across a web server restart.

Tests create isolated, generated accounts under `example.test` in local Supabase.
They do not run against a hosted project. Unit and database tests do not require
email delivery; browser recovery tests read only the local test inbox.

## Environment and remaining limits

Older unfinished development accounts retain a one-time name selection path.
Existing characters were preserved by the new migration.

The application currently runs at <http://127.0.0.1:3000> with real Supabase
services in Docker. It has not been publicly deployed.

Creating the requested Supabase Free project in Auxron was rejected because the
owner's two active Free project slots were already occupied. Existing projects
were not changed. A hosted slot is needed before connecting this application to
Supabase Cloud. The local setup allows the agreed foundation to be used now.

External email delivery, public hosting and production abuse controls remain
future setup work. Registration intentionally does not verify email ownership.
Password recovery currently uses the local Mailpit inbox.

TypeScript and ESLint use versions compatible with the installed Next.js plugins.
ESLint 9 is past upstream support; the compatibility limitation and upgrade work
before public release are recorded in [ARCHITECTURE.md](ARCHITECTURE.md).

Ship and crew stats, three resource bars and Energy-based training are now
implemented as the next bounded gameplay step. No economy, inventory, combat,
player-to-player actions or permanent-death mechanics have been implemented.
The Harbor now has a shared captain directory with realtime updates.

The current [gameplay design](COMBAT_AND_PROGRESSION_DESIGN.md) records the
owner's decisions about the persistent personal ship and crew, Crew Health,
eight upgradeable combat stats, equipment, PvP outcomes and separate skill
progression. The [training foundation](TRAINING_FOUNDATION.md) defines the
implemented subset. Hunger and unresolved combat details remain proposals or
open questions. The original verification results above are historical.

## Resource and training verification

Verified during the training implementation on 2026-09-15:

- Lint and TypeScript checks passed.
- All 21 existing unit tests passed.
- The production build passed, including both new training routes.
- The fourth migration was applied to local Supabase without resetting data.
- All 74 pgTAP checks passed, including 45 resource/training checks.
- Local database advisors reported no issues.
- All seven browser/API scenarios passed against the production build.
- The two training scenarios passed again after adding an open-page recovery
  check: Energy changes from 4 to 5 and training becomes available automatically.
- Twenty-five simultaneous requests produce exactly twenty paid upgrades and
  five insufficient-energy rejections.
- Desktop and mobile screenshots were reviewed; layout checks passed at
  1280, 768, 375 and 320 pixels with no horizontal overflow.
- Progress persists across reload, logout and login. No browser errors were recorded.

Resources start at 100/100 and stats at one. Five Energy buys one stat point.
Energy recovers one point every five minutes, including offline time, capped at
100. Ship and crew health are persisted indicators; damage and healing are future
work. Training currently has no material cost or skill-XP reward.

## Harbor roster verification

Verified during the roster implementation on 2026-09-15:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All 99 pgTAP checks passed, including 25 roster checks.
- Local database advisors reported no issues.
- The fifth migration is applied; Realtime is enabled and its container is healthy.
- All eight browser/API scenarios passed against the production build.
- The roster updates after arrivals, removals and returns without reloading.
- Changes missed during a network interruption are recovered after reconnecting,
  and subsequent realtime events continue to arrive.
- Received WebSocket records contain only character IDs and display names.
- Offline captains remain listed; anonymous access and private character access
  are rejected, and pagination is verified.
- Desktop and mobile screenshots were reviewed. Layout checks passed at
  1280, 375 and 320 pixels with no horizontal overflow or browser JavaScript errors.

Scope and data boundaries are recorded in [the roster specification](HARBOR_ROSTER.md).

## Navigation and loading verification

Verified during the navigation implementation on 2026-09-15:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All nine browser/API scenarios passed against the production build.
- Actual automatic prefetch responses were observed before navigation.
- With a navigation response deliberately held, the content displays its loading
  indicator and the original sidebar and resource-bar DOM elements remain mounted.
- Choosing another destination interrupts the pending navigation successfully.
- Training updates Energy and stats without replacing the shared resource bars.
- Navigation, training and browser back/forward issue no browser document requests.
- Opening a deep link directly still restores the correct view and saved stats.
- Desktop and mobile loading screenshots were reviewed. The mobile check has
  no horizontal overflow, and reduced-motion settings stop the spinner animation.
- The new scenario reported no browser JavaScript errors.
- The local development app remains available on port 3000.

The [navigation architecture](ARCHITECTURE.md#navigation-and-loading) describes
the shared layout and nested loading boundaries. Automatic prefetching is assessed
in the production build; development mode does not enable it.

## Stable frame width verification

Verified during the scrollbar layout fix on 2026-09-15:

- Reproduced the horizontal shift with classic scrollbars enabled in Edge.
  The long harbor view shifted the frame by 7.5 pixels at a 1280-pixel viewport;
  at 1100 pixels its frame was 15 pixels narrower than the shorter views.
- Added a stable scrollbar gutter to the root scroll container.
- Measured all five harbor views at viewport widths of 1280, 1100, 375 and
  320 pixels. Frame and content widths and horizontal positions now match
  exactly between views at each viewport size.
- The production build and its TypeScript check passed.

The focused browser measurements used an isolated local test account, which was
removed afterward. Headless browser measurements with hidden scrollbars did not
reproduce the original problem; verification explicitly enabled classic scrollbars.

## Character profile verification

Verified during the profile implementation on 2026-09-16:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All 123 pgTAP assertions passed, including 24 profile access and synchronization checks.
- Local database advisors reported no issues.
- The sixth migration was applied locally without resetting character data.
- All ten browser/API scenarios passed. Profile and roster checks passed again
  after restricting roster-link prefetching to hover/focus.
- The viewer can open their own profile from the sidebar and another captain's
  profile from the harbor roster, including a logged-out captain.
- Normal links, keyboard access, browser history and direct URLs passed.
- The original viewer sidebar remains mounted. Its resources are not replaced
  by the viewed captain's values. No full document loads occur during link navigation.
- Anonymous profile reads and client writes are rejected. Only four public identity
  fields are returned, and the other captain's private state remains inaccessible.
- Invalid UUIDs and missing characters show a local not-found panel with a working
  link to The Harbor. Logged-out profile visits redirect to login.
- Desktop/mobile screenshots were reviewed. Checks passed at 1280, 768, 375 and
  320 pixels; the frame retains its width and horizontal position with classic scrollbars.
- No browser JavaScript errors were reported. The server stream-cancellation
  diagnostic is recorded in ARCHITECTURE.md for upstream follow-up.

See [the implemented profile scope](CHARACTER_PROFILES.md).

## Combat implementation and verification

Implemented and verified locally on 2026-09-16.

- Profile Attack opens free preparation; Start fight begins persistent two-party PvP.
- Cannon combat, boarding, disengagement, retreat, reports and offline defence work.
- Defence orders on the own profile apply to the next encounter.
- Full health is not required. Both health meters need at least one point.
- Incoming protection does not block outgoing attacks; starting a fight relinquishes it.
- Health damage persists, with automatic offline recovery after the encounter.
- No gold, XP, permanent death or inventory economy was added.
- Migrations seven through nine are applied locally without resetting existing data.
- Existing profile privacy and the shared game frame are preserved.

Verification:

| Check | Result |
| --- | --- |
| npm run check | Passed: lint, TypeScript, 21 unit tests, production build. |
| npm run test:db | Passed: 214 assertions, including 91 combat assertions. |
| npm run test:e2e | Passed: all 12 scenarios in one run against the production build. |
| Local database advisors | No warning/error issues reported. |
| Visual review | Desktop preparation, active encounter and mobile screenshots reviewed. |
| Layout and navigation | No horizontal overflow at 768, 375 or 320 px; classic-scrollbar frame position and width preserved; no document navigation between profile, preparation and rounds. |
| Concurrency | Competing starts produce one encounter; duplicate orders produce one round and one charge. |
| Interrupted play | Reload restores the saved round; timeout performs a counterattacked retreat and recovery starts at its deadline. |
| Privacy | Enemy equipment absent before start; enemy training stats absent afterward; outsiders cannot read reports; anonymous sessions cannot participate. |

The existing Next.js stream-cancellation diagnostic still appears during the
rapid invalid-profile test. That scenario and all other browser checks pass;
the previously documented upstream limitation remains in ARCHITECTURE.md.

See [the implemented PvP system](COMBAT_SYSTEM.md) and
[the approved plan with the health correction](FIRST_COMBAT_PLAN.md).
