# Resor till havs

Implementerat lokalt 2026-09-20. [Designunderlag](SEA_TRAVEL_PLAN.md) och
[verifieringsresultat](IMPLEMENTATION_STATUS.md).

## Spelloop

1. Välj **Set sail** i The Harbor. Avfärden kostar 5 Energy och tar 60 sekunder.
2. Du anländer till **Outside the harbor**, med **Sea distance 1**.
3. Välj en av två synliga, olika platstyper. Varje färd tar 60 sekunder, kostar
   ingen Energy och ökar Sea distance med 1 vid ankomst. Nya val kräver ett nytt klick.
4. Från en havsplats kan du välja **Return to The Harbor**. Hemresan är gratis
   och tar en minut per Sea distance: 1, 2 och 5 ger 1, 2 respektive 5 minuter.

Under färden visas destination och nedräkning på `/sea`. Spelaren är mellan
platser och kan inte avbryta eller börja en annan resa. Resan fortsätter offline
och över omladdning, flikbyte och återinloggning.

Platserna är Deserted island, Island village, Deep water och Sharp rocks.
Två typer väljs med samma sannolikhet utan återläggning. Samma typ kan återkomma
längre ut, även som ett nytt besök av nuvarande typ. Besök och alternativ
hör till den egna resan, inte till en delad världskarta.

## Max sea distance

Den egna och andra kapteners profil visar **Max sea distance**, det största
avståndet som karaktären har nått. Det börjar på 0 och ökar först vid ankomst.
Hemkomst, kortare senare resor och Hospital sänker aldrig rekordet.

Servern sparar `characters.max_sea_distance` under samma lås som ankomsten.
En trigger bevarar rekordet vid serverändringar och räknar en redan inträffad
offlineankomst före eventuell Hospital-intagning. En avbruten färd som ännu inte
nått fram ger inget rekord. Klienter får inte skriva rekordet.

Profilprojektionen innehåller `max_sea_distance` och ett eventuellt kommande
`arrival_max_sea_distance`. Status-RPC:n räknar det kommande rekordet först när
ankomsttiden passerats, utan att skriva till den utloggade ägarens karaktär.
Migrationen utgår från nuvarande nått avstånd och eventuella förfallna utresor.
Äldre, avslutade resor utan sparat rekord återskapas inte.

## Regler för aktiviteter

- Energy återhämtas med +5 vid fasta tiominutersgränser till havs, inklusive båda resriktningarna.
- I hamnen gäller fasta femminutersgränser. Hemkomsten byter takt vid faktisk ankomst,
  även offline. Energy är alltid heltal. Hälsans återhämtning är oförändrad. Se [Energy](ENERGY_RECOVERY.md).
- Skeppsarbete måste vara färdigt före avfärd. Passerad sluttid tillgodoräknas en gång.
- Varken angripare eller försvarare kan lämna en pågående strid.
- Vid en havsplats kan du scouta för 5 Energy och attackera upptäckta skepp som
  fortfarande är vid samma Sea distance. Skepp under resa är skyddade. Se [scouting](SEA_SCOUTING.md).
- Hamnaktiviteter, inventorymutationer och försvarsändringar är servermässigt spärrade.
- Profiler och inventory får läsas vid en havsplats. Under färd visas vänteläget.
  Log out, kontoåterställning och behörig administration är tillgängliga.
- Övriga platsaktiviteter ingår inte i denna etapp.

## Server och lagring

`characters.location` är `the_harbor`, `open_sea` eller `traveling`.
`get_game_state().sea` beskriver motsvarande `in_harbor`, `at_sea` eller
`traveling`, reseversion, Sea distance, plats, alternativ och eventuell pågående färd.
Avståndet ökar först vid ankomst. Interna fältnamn som `sea_step`, `step` och
`returnSecondsPerStep` behålls för kompatibilitet; spelgränssnittet använder Sea distance.

Den ägarskyddade karaktärsraden lagrar besök, version, ankomsttid och senaste avräkning av Energy.
Privata tabeller lagrar platskatalog, två alternativ per besök och resans
idempotenskvitton. Klienten har inga direkta skrivbehörigheter.

| RPC | Argument |
| --- | --- |
| `depart_harbor` | `expected_version, request_id` |
| `choose_sea_route` | `expected_version, option_id, request_id` |
| `return_to_harbor` | `expected_version, request_id` |

Servern väljer pris, tid, avstånd och destination. Varje kommando använder samma
sorterade deltagarlås som stridssystemet. Två samtidiga kommandon mot samma
version kan inte båda vinna. Ett återförsök med samma innehåll ger samma kvitto;
ändrat innehåll eller gamla reseversioner avvisas.

Nästa besöks alternativ skapas vid resans start och visas först efter ankomst.
En ny läsning kan därför inte slå om dem. Tid och namn sparas i resan och
alternativen, så senare configändringar inte flyttar en påbörjad färd eller
ogiltigförklarar redan erbjudna val.

`private.settle_sea_travel` färdigställer förfallna resor under befintliga lås.
Den anropas av gemensam settlement för spelstatus, navigation och mutationer.
Hemkomsten gäller vid sparad deadline. Ingen bakgrundsworker eller öppen flik
krävs. `private.character_energy_snapshot` räknar gemensamma tiominutersticks till havs
och femminutersticks efter faktisk hemkomst, utan att dubblera gränsen vid ankomst.

Adminredigering av Energy behåller heltalsvärden och flyttar avräkningstidpunkten.
Administrativ dödlig skada följer Hospital-regeln: resa och alternativ avslutas,
intjänad Energy räknas och kaptenen får hamnens takt från intagningen eller en tidigare
hemkomst. Generisk redigering av resefält är inte tillåten.

## Andra spelare och navigation

`character_profiles` publicerar identitet, grov plats, ankomsttid och distansrekord.
`get_character_status` kombinerar projektionen med Hospital och beräknar effektiv
plats och Max sea distance från databastid. Ingen privat rutt, resurs eller
kontokoppling exponeras.

`harbor_players` lagrar även planerad hemkomst, dold av RLS fram till deadline.
`list_harbor_players` använder samma tidsvillkor och returnerar serverns
observationstid och nästa hemkomst. Profiler och listor uppdateras via
Realtime, tidsgränser, fokus, återanslutning och reservkontroll. En offlinekapten
återkommer därför utan att först öppna sitt spel.

Proxy och AppFrame delar `src/lib/game-navigation.ts`. Hospital har företräde,
sedan strid och resa. Serverhandlingar validerar fortfarande alla villkor i SQL.
GameStateProvider schemalägger ankomstkontroll; nedräkningen låser aldrig upp
resan utan bekräftad spelstatus. Vid en havsplats är även attackförberedelse och
stridsrapporter tillgängliga. Start av strid kontrolleras separat av SQL.

## Konfiguration och utveckling

`seaTravel` i [gameplayconfig](../config/gameplay.json) innehåller avgångskostnad,
utrestid, hemresetid per avståndsenhet och typer med stabila ID:n, namn och `active`.
Minst två typer måste vara aktiva. Avaktiverade eller borttagna typer försvinner
ur framtida slumpning; erbjudna alternativ behåller sina sparade destinationer.

Ändra SQL i `supabase/templates/gameplay/sea-travel.sql`, kör
`npm run config:sync` och `npm run db:migrate`. Redigera inte installerade
migrationer. Schema infördes i `20260920001431_sea_travel_foundation.sql`.

Tester finns i `supabase/tests/sea-travel.test.sql`,
`supabase/tests/sea-distance-record.test.sql`,
`tests/unit/sea-travel.test.ts` och `tests/e2e/sea-travel.spec.ts`.
Alternativ konfiguration verifieras i `scripts/config/test-database.mjs`.
Webbläsartestet innehåller en verklig 60-sekundersresa och samtidiga RPC-anrop
från separata anslutningar. Övriga tidsförflyttningar gäller bara testkonton.
