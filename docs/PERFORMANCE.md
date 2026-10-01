# Svarstider för server och transaktioner

## Granskningen i september 2026

Granskningen omfattar konto- och sessionskontroller, delade layouter, navigeringsspärrar, resurser, bakgrundsprenumerationer, aktiviteter, crafting, bank, träning, tavernan, inventariet, marknaden, resor, spaning, strid, notiser, profiler och administration.

Den lokala utgångsmätningen gav en median på 18 ms för ett direkt aktivitets-RPC, mot 231 ms från klick tills aktivitetsknappen och bekräftad XP var klara i ett produktionsbygge. Det var omgivande anrop och rendering som dominerade den synliga väntan. Utvecklingsläget innehåller dessutom kompilering och utvecklingsverktyg och är därför inte måttstocken för produktion.

## Ändringar

- `get_player_context` returnerar bara den inloggade spelarens karaktär, aktuellt adminmedlemskap och gameplay-revision i en läsning. Den avräknar inget spelläge och tar inga stridslås. Valideringen av användaren på servern finns kvar.
- `get_player_snapshot` returnerar resurser, skills och antal notiser i en transaktion efter att det aktuella spelläget har avräknats. React-cachar som gäller per begäran delar resultatet mellan layouter och sidor. Det finns ingen beständig cache av privata saldon, behörigheter, erbjudanden eller lager.
- `requireCharacter` hoppar över resursläsningen bara när båda de befintliga navigeringsundantagen redan är påslagna. Sådana mutationer kontrollerar redan behörigheten i sin transaktion, och deras återhämtning via kvitton är oförändrad. Övriga anropare, även strid, behåller sina spärrar för Hospital och sjöresa.
- Navigeringskontrollerna avräknar fortfarande strid, Hospital och resor under samma lås, men bygger inte längre träningskataloger, skill-framsteg, resurssnapshots eller stridshistorik bara för att avgöra en omdirigering.
- Uppslaget av senaste strid delar upp försvararhistorik och deltagarhistorik, så att båda kan börja i de befintliga index som har karaktären först, i stället för att pröva varje strid med ett korrelerat OR-villkor.
- Världsklockan synkroniseras fortfarande vid montering, vid fokus och med sitt konfigurerade intervall. Vanliga serverrenderingar uppdaterar klockans tidsankare direkt i stället för att starta om klockan och lägga till ännu ett HTTP-anrop för varje spelhandling.
- Spelets snapshots bär sin sparade händelserevision. Uppdateringskön släpper fördröjda realtidshändelser som redan finns med i den renderade snapshoten, behåller nyare händelser och slår ihop uppdateringsbegäranden medan en uppdatering pågår.
- Ekonomibegäranden, stridsorder, försvarsändringar, resor, spaning och navigering skjuter upp bakgrundsuppdateringen medan deras egen begäran pågår. Stridsförberedelsen använder samma uppdateringskoordinator och tvingar inte längre fram en extra uppdatering efter att dess Server Action redan har revaliderat vyn. Dolda flikar kommer ikapp när de blir synliga i stället för att bygga om privata vyer gång på gång i bakgrunden.

## Transaktionsgarantier

Alla kostnader, all resursåterhämtning, belöningar, inventarier, cirkulation, progression, notiser och beständiga kvitton sparas fortfarande i sina befintliga PostgreSQL-transaktioner. Ändringarna tar inte bort lås, försvagar inte behörighetskontroller, cachar inte aktuella pengar eller lager, delar inte ut belöningar i förväg och kortar inte speltimers. Dubblettbegäranden, återförsök efter förlorade svar och kontobyten följer samma regler.

Databasens statistik per SQL-sats granskades tillsammans med mätningar genom hela kedjan. Befintliga nyckelade kvitton, karaktärslås, sidindelade läsningar av marknad och inventarium samt notisindex finns kvar. Granskningen hittade inget skäl att ta bort låsning eller lägga anslutningspooler ovanpå den befintliga PostgREST-transporten.

## Reproducerbara mätningar

Bygg först och kör sedan mot lokal Supabase:

```powershell
npm run build
$env:MEASURE_PERFORMANCE = "comparison"
node node_modules/@playwright/test/cli.js test tests/e2e/performance.spec.ts
Remove-Item Env:MEASURE_PERFORMANCE
```

Testet körs bara på begäran och hoppas över i vanliga korrekthetskörningar. Det skapar och städar ett tillfälligt konto och mäter direkta RPC:er, 15 aktivitetsklick i följd, banköverföringar, besättningsträning och tre helsidesbesök på var och en av tio sidor. Klickmätningarna stoppar när begäran inte längre väntar och den auktoritativa ändringen av resurs eller XP syns, inte vid första renderingen. Banken tömmer sitt fält efter en lyckad överföring, så den mätningen använder formulärets färdiga läge i stället för att vänta på att en knapp med tomt fält aktiveras. Det finns inga fasta tidskrav som skulle fallera på en upptagen CI-maskin.

Råa mätvärden och sammanfattningar skrivs till `.local/performance-<tag>.json` på den dator som kör mätningen, där `<tag>` är värdet i `MEASURE_PERFORMANCE` (ovan `comparison`). `.local/` ignoreras av Git, så mätfilerna ingår inte i repot.

Första jämförelsen med samma lokala uppsättning av Edge och Postgres:

| Mätning | Median före, ms | Median efter, ms |
| --- | ---: | ---: |
| Aktivitetsklick till klar | 231 | 143 |
| Aktivitets-RPC | 18 | 12 |
| RPC för spelläge | 13 | 10 |

Aktivitetens p95 gick från 323 ms till 190 ms i jämförelsen med 15 mätvärden. Mediantiden för ett klick blev ungefär 38 % lägre. Helsidesmätningarna har tre mätvärden per route och omfattar webbläsarens arbete, så små skillnader är inte signifikanta:

| Sida | Median före, ms | Median efter, ms |
| --- | ---: | ---: |
| /harbor | 308 | 315 |
| /activities | 315 | 285 |
| /harbor/bank | 321 | 256 |
| /harbor/crew-training | 311 | 310 |
| /harbor/ship-upgrades | 289 | 289 |
| /inventory | 287 | 252 |
| /harbor/marketplace | 350 | 268 |
| /hideout/crafting | 302 | 282 |
| /notifications | 292 | 297 |
| /players/profile | 311 | 269 |

En sista, oberoende körning efter rättelserna av klockan och av ofärdiga konton gav:

| Mätning | Mätvärden | Median, ms | p95, ms |
| --- | ---: | ---: | ---: |
| Aktivitetsklick till klar | 15 | 153 | 209 |
| Bankinsättning till bekräftat saldo | 10 | 141 | 193 |
| Besättningsträning till bekräftad Energy | 5 | 157 | 188 |
| Aktivitets-RPC | 15 | 14 | 50 |
| RPC för spelläge | 15 | 11 | 33 |

Den slutliga aktivitetsmedianen ligger 34 % under utgångsläget. De två körningarna efter ändringarna visar normal variation; bank och träning saknar jämförbara mätvärden från före ändringarna. Råvärdena från körningen sparades bara lokalt på den dator som mätte.

Det här är lokala mätningar, inte en garanti för svarstider i en hosted miljö och inte ett kapacitetstest. Mätningar inför en publik driftsättning måste också täcka avståndet mellan klientens, serverns och databasens regioner, samtidiga spelare och långa historiker. Behåll det fixturebaserade mättestet för att jämföra framtida ändringar under samma förutsättningar.

## Mätningar från projektgranskningen 2026-09-23

Mätningarna gjordes med Next.js 16.3.6 och Supabase JS 2.117.1. Det befintliga mättestet kördes som en del av hela webbläsarsviten mot lokal PostgreSQL.

| Mätning | Mätvärden | Median, ms | p95, ms |
| --- | ---: | ---: | ---: |
| Aktivitetsklick till klar | 15 | 154 | 170 |
| Banköverföring till bekräftat saldo | 10 | 136 | 180 |
| Besättningsträning till bekräftad Energy | 5 | 140 | 217 |
| Aktivitets-RPC | 15 | 11 | 14 |
| RPC för spelläge | 15 | 9 | 11 |

Råvärdena sparades bara lokalt på den dator som körde mätningen och ingår inte i repot. Resultaten beskriver just den lokala körningen; de är inte ett kontrollerat påstående om snabbhet före och efter och inte ett test med samtidig belastning. De tidigare mätningarna ovan står kvar som historiska jämförelser.
