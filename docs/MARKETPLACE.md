# Marketplace

Implementerat lokalt 2026-09-20. Marknaden finns i The Harbor på
`/harbor/marketplace` och använder Torn-referensens upplägg med spelets färger
och egna itembilder.

## Spelarens vy

- **Most Popular** är startsidan. Itemtyper sorteras efter faktiskt sålt antal under
  de senaste 12 timmarna, flest först. Antalet räknar exemplar, inte affärer eller
  annonser. Vid lika försäljning används lägsta pris och därefter namn.
- Kategorierna finns längst till vänster. En kategori sorteras efter billigaste
  aktuella styckpris, billigast först. Items utan aktiva listings visas sist.
  Namnsökning och kategori gäller före sidindelning och bevaras i adressen.
- Itemkort visar lägsta styckpris följt av tillgängligt antal inom parentes på samma
  rad, med en liten Gold Coins-ikon. Försäljningsantal per 12 timmar visas inte på korten;
  Most Popular använder fortfarande samma försäljningsbaserade sortering.
- Över bilden visas ett öga till vänster och en varukorg till höger vid hover eller
  tangentbordsfokus. På pekskärm är kontrollerna alltid synliga.
- Ögat öppnar inventoryns beskrivning, effekttext, bild samt Value och Circ med
  varsitt diagram. [Value](ITEM_MARKET_VALUE.md) är antalsviktat genomsnitt från
  genomförda köp under 12 timmar, före avgift och avrundat nedåt i Gold Coins.
  Senaste Value ligger kvar när fönstret blir tomt; bara aldrig sålda items visar N/A.
  Varukorgen öppnar listings med säljarlänk, individuella stats, styckpris,
  kvarvarande antal, Quantity, Fill Max och Buy i kompakta rader. Priset är stigande.
  Först visas högst 20 listings. **Show more listings** lägger till upp till 20 åt gången
  och syns bara när fler finns. Redan visade rader ligger kvar medan fler hämtas.
  Vid nätverksfel behålls listan med Retry och köpen spärras tills den uppdaterats.
- Den öppna panelen placeras under hela itemraden. Endast en panel är öppen åt
  gången. Rutnätet anpassas från fem kolumner på dator till två på liten mobil.
  Panelen har en stabil identitet när dess rad flyttas, så valt diagram, period
  och expanderade listings bevaras vid skärmbyte och uppdaterad sortering.
- **Add Listings** visar aktiva, säljbara items i eget inventory. Välj flera items,
  antal och styckpris. Utrustning väljs per exemplar med dess egna stats.
  Urvalet bevaras vid kategori-, sök- och sidbyten.
- Sammanställningen visar antal, sammanlagt försäljningsvärde och beräknad avgift.
  Clear all tar bort urvalet. Hela batchen lyckas eller återställs tillsammans.
- **View Your Listings** visar egna aktiva erbjudanden. Cancel listing tar bort
  erbjudandet och återför hela återstående mängden till inventory.
- Marknadsuppdateringar hämtas i öppna flikar. Förbrukat lager, saldo, eget inventory
  och egna listings kontrolleras på nytt efter köp.

## Pengar, ägande och handlingslås

Köp debiterar köparens burna Gold Coins och krediterar säljarens burna Gold Coins.
Bankpengar används aldrig automatiskt. Antal, styckpris och pengar är positiva
heltal inom spelets gränser. Den sammanlagda summan för en listing får inte
överstiga maxgränsen för Gold Coins. Man kan inte köpa sin egen listing.

Säljaren betalar 5 % av varje listings sammanlagda försäljning, avrundat nedåt.
Avgiften för ett köp är skillnaden mellan den nya totala avgiften och redan
betald avgift. Exempel: en listing som säljer för 19 Gold Coins betalar 0 i avgift;
om nästa köp ger ytterligare 1 Gold Coin blir avgiften för det köpet 1. Totalt
20 Gold Coins sålt ger samma avgift oavsett hur köpen delas upp. Ingen avgift tas
för att lägga upp eller avbryta en listing.

Listade items hålls i separat lager och kan inte användas eller förstöras från
inventory. Utrustning behåller ursprungligt exemplar-ID, stats och skapelsetid vid
köp eller återtagning. Stackar slås ihop med mottagarens befintliga innehav.
Världens cirkulation ändras inte när items flyttas till eller från marknaden.

Nya köp, listings och återtagningar kräver hamnposition och är låsta i Hospital
och under strid för både angripare och försvarare. En attackerad försvarare kan
fortfarande läsa marknadsvyerna. Redan publicerade erbjudanden fortsätter kunna
säljas när säljaren är offline, till havs eller handlingslåst. Detta är passiv
avräkning av ett tidigare erbjudande; säljaren startar ingen ny handling.

## Databas och säkerhet

| Tabell | Ansvar |
| --- | --- |
| `private.market_listings` | Ägare, sparat item, återstående/sålt/återtaget antal, styckpris och sparad avgiftssats. |
| `private.market_sales` | Genomförda köp med antal, brutto, avgift och servertid för popularitet och Value. |
| `private.item_market_totals` | Privata kumulativa totalsummor för indexerade historiska marknadsvärden. |
| `private.market_requests` | Ägarspecifikt request-ID, normaliserad begäran och beständigt kvitto. |
| `public.market_item_events` | Endast item-ID och revisionsnummer för uppdatering av öppna marknadsvyer. |

Privata tabeller har RLS och inga direkta klienträttigheter. Registrerade spelare
använder publika invoker-RPC:er som anropar privata funktioner med ägar- och
handlingskontroll. Läsning visar offentliga säljaridentiteter, erbjudanden och
summerade itemtal, aldrig säljarens saldo eller övriga inventory.
Egna listings och säljbara items bestäms av den autentiserade spelaren.

Köp låser deltagare med stridssystemets ordnade lås, sedan listing och cirkulation.
Batcher tar cirkulationslås i item-ID-ordning. Lager, föremål, båda saldona,
försäljningshistorik och kvitto ändras i samma transaktion. Samtidiga köpare kan
inte köpa samma sista exemplar; ett samtidigt köp och en återtagning har endast
en vinnare. Ett misslyckat köp lämnar inga delvis flyttade pengar eller items.

Samma request-ID och samma innehåll returnerar det sparade kvittot.
Ändrat innehåll med samma ID nekas. Vid ett oklart nätverkssvar behåller klienten
begäran och erbjuder Retry med samma ID, även om erbjudandet under tiden försvunnit.
Serverkvitton kan läsas även efter att handlingsrätten ändrats.

Köplistan hämtas som en sammanhängande, sorterad ögonblicksbild upp till det antal
grupper spelaren öppnat. För `list_market_listings` med `own_only=false` anger
`requested_page` sista synliga gruppen: 0 ger högst 20 rader, 1 ger 40 och så vidare.
Varje uppdatering ersätter hela den öppna listan, så sålda och nya erbjudanden inte
orsakar luckor eller dubbletter mellan gamla sidor. Med `own_only=true` behålls vanlig
sidindelning. Ett bytt item börjar på 20 igen.

Populariteten räknas direkt från tidsindexerad försäljningshistorik.
Fönstret är `(servertid - 12 timmar, servertid]`. Kontoradering tar bort kvarvarande
innehav och listings, men försäljningshistorik behålls utan borttagna kontoidentiteter.

## Konfiguration och källor

`config/gameplay.json` innehåller:

| Inställning | Standard | Betydelse |
| --- | --- | --- |
| `marketplace.feeBps` | 500 | 5 % säljaravgift. Sparas när en listing skapas. |
| `marketplace.popularityHours` | 12 | Rullande försäljningsfönster. |
| `marketplace.pageSize` | 30 | Itemtyper per sida. |
| `marketplace.listingsPageSize` | 20 | Erbjudanden per expansion; sidstorlek för egna listings. |
| `marketplace.maxBatchSize` | 25 | Högsta antal listings i en begäran. |
| `inventory.items[].tradable` | true för nuvarande katalog | Tillåter handel när definitionen också är aktiv. |

Add Listings använder `inventory.pageSize`. Avaktiverade eller ej handelsbara
definitionsinnehav förblir synliga i vanliga inventory. Befintliga osålda listings
kan fortfarande återtas, men kan inte köpas. En ändrad avgift påverkar nya listings;
äldre behåller sin sparade avgiftssats.

- [Grundschema](../supabase/migrations/20260920084639_marketplace_foundation.sql)
  och [genererad gameplaymigration](../supabase/migrations/20260920085645_central_gameplay_config_0d45ca6e00a0.sql)
  är applicerade lokalt.
- [Kompakt expansion i grupper om 20](../supabase/migrations/20260920191132_central_gameplay_config_ffd3fb7bac47.sql)
  uppdaterar läsreglerna och är applicerad lokalt.
- [Läsning och itemöverföring](../supabase/templates/gameplay/marketplace-read.sql),
  [skapande och återtagning](../supabase/templates/gameplay/marketplace-sell.sql)
  och [köp](../supabase/templates/gameplay/marketplace-buy.sql) är de kanoniska SQL-källorna.
- [Marknadskomponenter](../src/components/marketplace), [typer och belopp](../src/lib/marketplace.ts)
  och [serverhandling](../src/app/marketplace-actions.ts) delar befintlig speluppdatering.
- [Databastester](../supabase/tests/marketplace.test.sql),
  [webbläsartester](../tests/e2e/marketplace.spec.ts) och
  [alternativ konfiguration](../scripts/config/test-database.mjs) verifierar affärerna,
  heltalsavgiften, rättigheter, samtidighet och återförsök.

Aktuella körresultat finns i [implementationsstatus](IMPLEMENTATION_STATUS.md).
Inga provitems, annonser eller köp har lagts till på vanliga spelarkonton.

## Beständiga återförsök

Gemensam lagring, kontobindning och återhämtning mellan flikar beskrivs i [ekonomiintegritet](ECONOMY_AUDIT.md).
