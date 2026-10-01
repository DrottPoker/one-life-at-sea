# Adminpanel

Öppna `/admin` eller välj **Admin panel** i sidhuvudet. Arbetsytan har åtta avdelningar: **Overview**, **Economy**, **Players**, **Items**, **Loot tables**, **Activities**, **Database** och **Audit log**. En nionde länk, **Forum**, öppnar forumets modereringsverktyg. **Overview** länkar till de viktigaste arbetsflödena, spelets aktuella totaler och de senaste administrativa ändringarna. Ludorex är den första behöriga lokala administratören.

## Innehåll

1. **Items**: sök och filtrera i katalogen, skapa ett item eller ändra namn, kategori, beskrivning, effekttext, flaggorna för aktivt och handelsbart samt bild. Item-ID, ägandetyp och utrustningsplats kan inte ändras när itemet väl har skapats. Utrustning har också de statintervall som platsen kräver (se [Utrustning](EQUIPMENT.md)). En ändring av dem påverkar varje ägt exemplar, eftersom stats härleds från exemplarets Quality. När en Hull sparas avräknas först Ship Health för varje kapten som har den utrustad, så ett ändrat hälsointervall ger ingen hälsa i efterhand. Övriga effekter är beskrivande text; en ny förbrukningsvara lägger inte till någon ny spelfunktion.
2. **Loot tables**: skapa en namngiven samling, lägg till items, välj fasta procentsatser eller vikter vid nivå 1 och vid mastery, och ange antal. Utrustning slumpar sin Quality när den delas ut. Ett nivåreglage förhandsvisar procentsatserna för lyckade fångster, med mastery vid 100.
3. **Activities**: välj tabell, fångstchans vid start och vid mastery samt masterynivå för varje befintlig aktivitet. Välj **No loot (XP only)** för att behålla ett beteende med bara XP. Ändringar gäller nya försök direkt; tidigare kvitton behåller sitt ursprungliga resultat.

Se [Loot tables](LOOT_TABLES.md) för den exakta sannolikhetsmodellen och de första fiskarna. Ingen sällsynthetsklassning används. Databasbläddraren finns kvar för avancerad granskning, med grupperade resurser och länkar tillbaka till de särskilda redigerarna.

Bilder är valfria. `/images/items/placeholder.svg` är den gemensamma standardbilden, och trasiga bilder faller också tillbaka på den i inventariet, marknaden och adminpanelen. Uppladdningen tar emot PNG, JPG eller WebP upp till 4 MB; väljaren kontrollerar att bilden går att avkoda och att måtten är högst 8192 × 8192. Supabase Storage upprätthåller MIME-typ, storleksgräns och aktuellt adminmedlemskap. Den publika hinken `item-images` innehåller bara itembilder. Uppladdningarnas sökvägar är oföränderliga UUID:n under uppladdarens konto-ID, och en ersatt bild blir ett nytt objekt. Den autentiserade admin-RPC:n kontrollerar att uppladdade referenser finns. Godtyckliga externa adresser tas inte emot. Uppladdade objekt raderas inte automatiskt, så historiska bildreferenser fortsätter att fungera.

Allt innehåll sparas genom det befintliga systemet för granskning och återförsök, med versionskontroll. En tabell som är kopplad till en aktivitet kan inte avaktiveras; koppla bort den först. Ett item i en aktiv tabell kan inte avaktiveras; ta bort det från tabellen först. Definitioner raderas inte via panelen.

Items som skapats eller ändrats i adminpanelen har `managed_by_admin=true`. Konfigurationen fortsätter att seeda den ursprungliga katalogen men skriver inte över de raderna. Loot tables och aktiviteternas lootinställningar tillhör databasen och finns kvar efter senare konfigurationsmigreringar.

## Spelarverktyg

**Players** öppnar en statistiköversikt över kontotillväxt, nya konton och unika aktiva konton, med tre interaktiva diagram och perioderna senaste månaden, 12 månader och all tid. Upprepade inloggningar räknas en gång per period, och pågående sessioner räknas också. Den sökbara spelarlistan har tidsstämplar för registrering och senaste aktivitet, aktivitetsfilter och sortering. Se [Spelarstatistik](PLAYER_STATISTICS.md) för exakta definitioner och historikens gränser.

- Sök på kaptensnamn, karaktärs-ID eller konto-ID.
- Granska och ändra namn, burna och bankade guldmynt, Energy, hälsa, åtta stridsstats, försvarsorder samt tidsstämplar för skydd och Hospital. En ändrad resurs nollställer motsvarande återhämtningstidsstämpel till korrigeringens tid.
- Ändra tränings-XP och köpt nivå via databasens sammansatta nyckel.
- Skapa aktiva katalogitems åt en vald kapten. Stackar läggs till befintligt innehav. Utrustning skapar enskilda exemplar med vald Quality (0-100, två decimaler) eller, om Quality lämnas tom, en Quality som slumpas för varje exemplar. Gränser: 1 000 000 stackade items eller 100 utrustningsexemplar per begäran.
- Korrigera antal i stackar och utrustningens Quality, eller radera en hel rad i inventariet. Raderas ett utrustat exemplar tas det också bort från kaptenens uppsättning. En ändring eller radering av utrustning avräknar först hälsan vid det tidigare maximumet, precis som en korrigerad battling-nivå.
- Skriv ut en patient från Hospital med full hälsa, inklusive bonusar från Hull och battling-nivåer. Utskrivningen är en egen loggad åtgärd och nekas medan kaptenen är i en strid.
- Korrigera privat skill-XP. En korrigering av Crew Battling eller Ship Battling avräknar först hälsoåterhämtningen vid det tidigare maximumet, så ett höjt maximum ger ingen gratis hälsa, och sänker aktuell hälsa till ett sänkt maximum.
- Avsluta en hel strid som oavgjord utan en ny skaderunda. Hälsa, tidigare händelser och snapshot-stats står kvar. Aktiva deltagare får oavgjort, engagemangslåsen tas bort och en publik händelse `admin_end` förklarar avslutet. Åtgärden ger inget nytt stridsskydd.
- Avbryt ett pågående skeppsjobb utan återbetalning och utan stats eller XP. Originaljobbet sparas i granskningsposten. Ett jobb vars sluttid har passerat är klart redan innan kaptenens läge läses igen: spelarsidan visar det som färdigt utan avbrytknapp, och databasen nekar med `SHIP_JOB_FINISHED`.

Adminåtkomsten fungerar även medan administratören själv ligger på Hospital eller har ett attacklås. En karaktär i en pågående strid kan inte ändras förrän striden är slut. Före en ändring eller radering avräknas kaptenens förfallna utskrivning från Hospital, ankomst från sjöresa och färdiga skeppsjobb. Versionskontrollen jämför fortfarande med den oavräknade rad som administratören såg, så de inmatade värdena blir slutgiltiga i stället för att ändras av en senare avräkning. Utdelning av items, korrigering av items och ändring av träningsframsteg använder samma ordnade karaktärs- och stridslås som spelet.

## Databasbläddrare

Bläddraren visar spel- och admintabeller från en tillåtelselista, även privata tabeller för strid, bankhistorik, jobb, inventarium, cirkulation och begärandekvitton. Den har:

- Bokstavlig textsökning, filtrering på exakt kolumn och värde samt sidor om 50 rader.
- Kolumnnamn, PostgreSQL-typer, primärnycklar, NULL-värden och fullständiga raddetaljer.
- Redigeringsformulär för karaktärer, träningsframsteg, itemstackar och utrustningsexemplar.
- Decimalsträngar för varje skalärt värde, så att precisionen i bigint och numeric behålls.
- En granskningsvy med begärande-ID, administratörens konto-ID, orsak, tidsstämpel, nyttolast samt värden före och efter. En utdelning av utrustning loggar varje nytt exemplar.

Härledda projektioner och historiska poster går att granska men inte att redigera direkt. Items och loot ändras i de särskilda innehållsredigerarna. Skill-kurvor, aktiviteternas kostnad och XP, träningsnivåer och inventariekategorier styrs fortfarande av `config/gameplay.json` och `config:sync`. Historiska kvitton och granskningsposter kan inte ändras eller raderas. Kontoägarskap och primärnycklar kan inte flyttas. Panelen är till för att administrera spelet; den exponerar inte godtycklig SQL, schemaändringar, kontolösenord, sessionstoken eller infrastrukturscheman. Radering av konton och ändringar av adminmedlemskap görs fortfarande av databasägaren.

## Behörighet och återförsök

`private.admin_members` lagrar de nuvarande administratörernas konto-ID. Alla admintabeller har RLS och saknar direkta klienträttigheter. De publika RPC-wrapparna är security invoker. De privata ingångarna är security definer med fast `search_path`, kräver ett registrerat konto och kontrollerar medlemskapet vid varje anrop, även vid återförsök mot ett kvitto. Användarmetadata kan inte ge åtkomst. En återkallelse gäller utan att JWT behöver förnyas; ett delat lås på medlemskapet låter en transaktion som redan pågår bli klar först.

Next.js kontrollerar identitet och behörighet på servern. Proxyn svarar HTTP 403 när en inloggad användare som inte är administratör begär en adminroute, och HTTP 503 om medlemskapet inte gick att kontrollera. Server Actions och databasens RPC:er är skyddade var för sig. Vanlig synlighet för karaktärer och spelarnas övriga policyer är oförändrade. Ingen service-role-nyckel behövs.

En mutation och dess granskningskvitto sparas i samma transaktion. Ett begärande-UUID per administratör gör att återförsök körs ett i taget. Ett återanvänt UUID med annan åtgärd, nyttolast eller orsak misslyckas. Ändringar och raderingar av rader jämför radens ursprungliga fingeravtryck i databasen efter låsningen, så en inaktuell vy kan inte skriva över nyare data. Varje ändring kräver en orsak på 3-500 tecken och ett uttryckligt granskningssteg med en läsbar sammanfattning. Tekniska nyttolaster är ihopfällda. Begäranden som pågår visas inte i återhämtningsbannern; en begäran som verkligen är obekräftad går att återuppta efter ett osäkert svar eller en omladdning.

Innan en mutation skickas sparar webbläsaren begäran i sessionStorage, avgränsat per konto. Obekräftade begäranden kan kontrolleras igen efter en omladdning eller navigering i samma flik. Kontrollen återanvänder det ursprungliga begärande-UUID:t och kan inte dela ut eller radera något en andra gång. När fliken stängs försvinner webbläsarens journal, men den beständiga granskningen i databasen finns kvar. Adminformulären visar regelbrott utan att exponera råa databasfel.

Ändringar i inventarier uppdaterar världens cirkulation och historik automatiskt genom de befintliga triggrarna. Revisionshändelser som bara ägaren tar emot uppdaterar de berörda spelarnas flikar.

## Lokal åtkomsthantering

Använd en befintlig, uttryckligen vald karaktär:

```powershell
node scripts/admin-access.mjs grant "Ludorex"
node scripts/admin-access.mjs revoke "Character name"
```

Skriptet riktar sig bara mot den konfigurerade lokala Docker-databasen. Migreringsfilerna hårdkodar inte och befordrar inte automatiskt något konto. I en framtida hosted databas ger databasägaren åtkomst till det verifierade konto-UUID:t i `private.admin_members`; ingen route i webbläsaren kan göra den första tilldelningen.

Schemat infördes av migreringarna `admin_panel`, `admin_combat_interruption` och `admin_resource_timestamps`, som nu ingår i baslinjen `20260923111042_baseline.sql`.

## Verifiering

Se [implementationsstatus](IMPLEMENTATION_STATUS.md) för genomförda kontroller. Testerna använder tillfälliga lokala konton, och SQL-sviten rullar tillbaka sina fixtures.

## Resor till havs

Verifierade administratörer behåller åtkomsten under resor. Resefälten kan inte ändras i den generella spelarredigeraren. Ändrad Energy behåller heltalssaldon och sätter en ny avräkningspunkt utan att flytta de globala tickgränserna. Dödlig skada från en administratör avslutar resan via Hospital, rensar ruttval och byter till hamnåterhämtning från intagningen eller från en tidigare faktisk hemkomst. Se [Resor till havs](SEA_TRAVEL.md).

## Crew Morale och övriga resurser

Karaktärsredigeraren tar emot `crew_morale` från -100 till +100 med högst en decimal. Databasens villkor upprätthåller samma gränser för adminändringar. Varje ändring sätter en ny avräkningspunkt för moralen och sparas i den befintliga granskningsloggen. Stridslåsen gäller fortfarande. Tavernans kvitton finns som en skrivskyddad resurs. Den kanoniska SQL:en för adminmutationer ligger i `supabase/templates/gameplay/admin.sql`.

Stamina är en redigerbar karaktärsresurs. Heltalssaldot begränsas av det konfigurerade taket. En loggad ändring sätter `stamina_updated_at` till serverns tid; spelare kan inte ändra värdet direkt.

Resursen `character_skills` tillåter loggade korrigeringar av enbart `xp`. Den sammansatta nyckeln anger karaktär och skill. Den privata skill-nivån och den publika Character Level härleds automatiskt. Skill-kataloger och tröskeltabeller är skrivskyddade i adminpanelen.

`activity_definitions` och `activity_requests` är skrivskyddade adminresurser. Definitionerna hanteras i gameplay-konfigurationen, och kvittona bevarar sparad kostnad, XP och loot. Den separata resursen `activity_loot` hanteras från **Activities**. Spelarens detaljsida har också korrigeringar av Stamina, Crew Morale och privat skill-XP.

## Ekonomi

`/admin/economy` övervakar Gold Coins (burna och bankade), itemcirkulation och marknadsvärdering, lager utan pris, handelsomsättning och avgifter. Separata förmögenhetstopplistor länkar till spelarverktygen. De sökbara itemtotalerna räknar items i marknadens escrow exakt en gång. Diagrammen bygger på faktiska observationer var femte minut från ett privat pg_cron-jobb, oberoende av adminbesök. Åtkomsten kontrolleras vid varje läsning, och alla totaler behåller heltalsprecision. Se [Ekonomiövervakning](ECONOMY_MONITORING.md) för definitioner, gränser och drift.

## Forummoderering

Administratörer modererar alltid forumet och utser eller avsätter spelarmoderatorer. Modereringen sker i själva forumet: trådsidorna har verktyg för att fästa, låsa, flytta, skicka till Graveyard, ta bort, återställa, redigera och stänga av, och `/forums/moderation` (länkad som **Forum** i adminnavigeringen) samlar rapportkön, avstängningar, moderatorer och modereringsloggen. Varje åtgärd kräver en orsak. På trådsidorna går det också att stänga, ta bort och återställa omröstningar, dölja och återställa bilder och ta bort signaturer; bara administratörer raderar bildfiler för gott. Databasbläddraren har gruppen Forum med skrivskyddade tavlor, trådar, inlägg, versioner, rapporter, avstängningar, moderatorer, modereringsloggen, omröstningar och deras alternativ, bilder och de inlägg som visar dem, signaturer och väntande notiser. Enskilda röster är utelämnade så att röstningen förblir anonym. Se [Forum](FORUMS.md#moderering).

## Kontobundna sparade begäranden

Webbläsarens journal validerar sparade begärande-ID, åtgärder, orsaker och JSON-nyttolaster innan de visas eller skickas. Ogiltig lagring lämnas orörd och ger en varning som går att åtgärda. Server Action kontrollerar att den inloggade användaren fortfarande är begärans ägare innan databasen anropas, så ett byte till en annan administratör kan inte köra ett gammalt formulär. Är sessionen tillfälligt otillgänglig eller medlemskapet återkallat sparas begäran för bekräftelse när åtkomsten är tillbaka.
