# Ekonomiövervakning

`/admin/economy` är en skrivskyddad vy, bara för administratörer, över hela spelets ekonomi. Navigeringen och adminöversikten länkar dit. Sidan uppdateras varje minut medan den är synlig, och **Refresh** begär en ny avläsning direkt. Misslyckade uppdateringar behåller de senaste lyckade siffrorna och visar en varning. Återkallad åtkomst tömmer klientens vy.

## Omfattning och värdering

- Guldmängden summerar alla befintliga karaktärers burna och bankade saldon, även karaktärer som är offline och administratörer. Banköverföringar skapar inga mynt. Marknaden håller inget guld i escrow; bara faktiska marknadsavgifter tar bort guld vid en affär.
- Cirkulationen räknar stackade enheter, utrustningsexemplar och kvarvarande marknadsannonser exakt en gång. Inventariets värden omfattar alla ägda utrustningsexemplar. Annonserade items tillhör säljaren tills de säljs och visas separat i förmögenhetstabellerna.
- Enhetsvärdet återanvänder `private.item_market_value_at`, samma kvantitetsviktade marknadsvärde som Inventory och Marketplace använder. Det bygger på genomförda bruttoförsäljningspriser inom fönstret `gameplay.marketplace.valueWindowHours` och behåller det senaste värdet som inte var tomt, se [Item Market Value](ITEM_MARKET_VALUE.md). Ett osålt utropspris skapar inget värde. Enskilda utrustningsexemplars stats påverkar inte itemtypens värde. Värdet är en uppskattning, inte en garanterad intäkt vid försäljning.
- Ett item som aldrig har handlats saknar pris. Dess antal räknas i cirkulationen men utesluts från den uppskattade förmögenheten. Instrumentpanelen redovisar uttryckligen enheter och typer utan pris, och spelarraderna visar enheter utan pris. Inaktiva definitioner räknas fortfarande med.
- Kombinerad känd förmögenhet är mynt plus prissatta items. Prisändringar kan ändra den utan att några pengar eller items skapas. Topplistorna visar de 20 främsta efter mynt, itemförmögenhet (inventarium plus annonser) eller kombinerad förmögenhet, med spelarnummer som stabil särskiljare vid lika.
- Penningsummor och itemvärdering använder PostgreSQL numeric och decimalsträngar över RPC-gränsen. Gränssnittet använder BigInt för exakta totaler; flyttal används bara för diagramkoordinater och procentsatser. Värdena kan överstiga gränsen för ett enskilt saldo.

Den sökbara itemtabellen har deterministiska sidor om 50 på servern och sorterar på totalt värde, antal, namn eller items utan pris först. Marknadskorten redovisar antal genomförda köp, antal enheter, bruttoomsättning och avgifter under de senaste 24 timmarna. Omsättningsdiagrammet för 30 dagar grupperar faktiska köp per UTC-datum, och dagens värde är ofullständigt. Diagrammet över penningfördelningen visar burna mot bankade mynt och de tio rikaste karaktärernas andel. Det finns ingen påhittad uppdelning av var pengarna historiskt har kommit ifrån.

## Historik och drift

Kanonisk SQL ligger i `supabase/templates/gameplay/economy.sql` och tas med av gameplay-generatorn. Genererade migreringar tillämpas genom det vanliga konfigurationsflödet. Migreringen aktiverar pg_cron och registrerar ett namngivet jobb, `economy-snapshot`, med schemat `*/5 * * * *`. Det körs som migreringens ägare, oberoende av trafik från webbläsare. När konfigurationsmigreringar körs igen uppdateras samma jobb i stället för att dubbletter skapas.

`private.economy_snapshots` lagrar observationstid, burna och bankade pengar, cirkulerande itemenheter, prissatt itemvärde, enheter utan pris och antal karaktärer. En första avläsning görs vid installationen. Ett unikt femminutersintervall gör upprepade körningar ofarliga, och den faktiska observationstiden behålls. Varje observation beräknas i en SQL-sats under en databassnapshot. Att läsa instrumentpanelen skriver aldrig historik.

Historiken börjar vid installationen. Befintliga marknadsförsäljningar finns kvar för omsättningsdiagrammet, men tidigare guldmängd och itemförmögenhet är okända. Ingen historik fylls i efterhand och inga syntetiska punkter hittas på. Snapshots gallras aldrig. Historik-RPC:n returnerar högst 500 punkter, inklusive första och nuvarande avläsning, och tar för längre serier den sista observationen i varje tidsintervall. Gränssnittet visar när urval görs och bryter trendlinjerna där mätningar saknas, i stället för att visa driftstopp som oförändrad mängd. Tidsintervallen är **24 hours**, **7 days**, **30 days** och **All history**.

Livetotalerna beräknas direkt från nuvarande innehav. En saknad snapshot eller en som är äldre än 12 minuter ger en synlig varning om historiken. Driften kan granska `cron.job` och `cron.job_run_details` för `economy-snapshot`. Supabase måste vara igång för att schemaläggaren ska samla observationer, och en omstart fyller inte i driftstopp i efterhand.

## Åtkomst och konsistens

Bara `public.admin_economy` exponeras. Det är en invoker-wrapper runt en privat definer-funktion med tom `search_path` och en ny kontroll med `private.require_admin()`. Båda är volatile eftersom adminmedlemskapet låses medan återkallelse kontrolleras. Vanliga spelare och anonyma användare kan inte läsa sammanställda saldon, inventarier eller topplistor. Snapshot-tabellerna har RLS utan klientpolicyer, och interna hjälpfunktioner och snapshot-skrivningar saknar körrättigheter för klienter. Ingen tjänstenyckel exponeras för webbläsaren.

Varje svar använder en och samma konsistenta snapshot för pengar, innehav, itemvärden, topplistor och historik. Råa försäljningar är indexerade på tidsstämpel för 30-dagarsöversikten. Sammanställningarna görs medvetet i SQL i stället för att alla privata rader hämtas.

## Verifiering

- `supabase/tests/admin-economy.test.sql`: rättigheter, förfalskad metadata, återkallelse, exakta stora värden, lager utan pris, viktad prissättning, sidindelning, ägande vid escrow, riktiga köp och avgifter, urval, historikgränser och idempotenta snapshots.
- `tests/unit/economy.test.ts`: visning med BigInt och procentberäkningar.
- `tests/e2e/admin-economy.spec.ts`: riktigt köp på marknaden, sidnavigering, diagram och inspektion med tangentbord, filter, oberoende topplistor, misslyckad uppdatering, återkallad åtkomst samt dator- och mobilbredd. Testets tillfälliga saldon hålls utanför den schemalagda historiken genom att just det här lokala cron-jobbet pausas och dess tillstånd återställs i `finally`.
