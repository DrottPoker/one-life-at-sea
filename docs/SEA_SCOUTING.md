# Scouting och PvP till havs

Implementerat lokalt 2026-09-20. Detta ersätter det tidigare beslutet att skjuta upp
allt PvP till havs. [Resor](SEA_TRAVEL.md) och [strid](COMBAT_SYSTEM.md) gäller fortfarande.

## Spelflöde

- Vid en havsplats finns **Scout nearby ships**. Sökningen sker direkt och kostar
  **5 Energy**, även om inga andra skepp hittas.
- Alla andra kaptener vid samma **Sea distance** hittas, oavsett platstyp eller
  inloggningsstatus. Själv, hamnkaptener och skepp under resa ingår inte.
  En färd som redan har anlänt räknas även innan ägaren loggar in.
- Resultatet visar kaptenernas namn och publika nummer med länkar till deras profiler. Alla resultat
  är åtkomliga med sidindelning, som normalt visar 25 kaptener per sida.
- Listan är en sparad ögonblicksbild. Omladdning, profilbesök, sidbyte och återinloggning
  kostar inget. Nya ankomster hittas först vid en ny betald scouting.
- Senaste sökningen ersätter föregående lista. Den gäller endast det aktuella
  havsbesöket. Ett nytt besök kräver ny scouting.
- Scouting är spärrad under resa, på Hospital och för båda deltagare i pågående strid.
  Energy återhämtas med +5 på fasta tiominutersticks, även under resor.
  Intjänad Energy räknas före kontroll och debitering av scouting. Se [Energy](ENERGY_RECOVERY.md).

## Attack efter scouting

Attack på profilen kan öppnas när angriparen har upptäckt skeppet och båda
fortfarande befinner sig vid samma Sea distance. Målets besöks-ID måste vara
detsamma som vid upptäckten. En gammal upptäckt följer inte ett skepp som lämnar
platsen och senare återkommer till samma avstånd.

Servern kontrollerar villkoren igen i både preview och start/join. Delade
attacklänkar och direkta API-anrop kan inte kringgå scouting. Upptäckten är inte
ömsesidig; en annan angripare behöver en egen scouting för att ansluta.

Vanliga stridsregler gäller, inklusive separat kostnad på 10 Energy för start/join,
hälsokrav, skydd och flera angripare. Ingen deltagare kan börja resa eller scouta mitt i strid.
Försvararen kan fortfarande läsa sparade fynd och öppna profiler. Alla handlingar som ändrar
karaktären omfattas av [stridens handlingslås](COMBAT_SYSTEM.md).
En överlevande kapten stannar vid sin havsplats. En besegrad kapten hamnar på
Hospital i hamnen och behåller sitt Max sea distance.

## Server, integritet och samtidighet

- `scout_nearby_ships(expected_version, request_id)` använder samma låsordning som
  resor och strid. Avgift, kvitto och hela resultatet sparas atomiskt.
  Identiska återförsök ger samma kvitto utan ytterligare avgift; ändrat innehåll
  med samma ID avvisas. Ett gammalt kvitto återställer inte en gammal lista.
- `get_sea_scout(requested_page)` läser endast den inloggade kaptenens senaste
  resultat vid aktuellt besök. Ogiltiga sidnummer begränsas till giltiga sidor.
  Ingen avgift tas ut och inga nya skepp läggs till.
- `get_game_state().sea.scout_id` signalerar senaste resultatet. Den befintliga
  ägarbegränsade revisionssignalen uppdaterar Energy och listan i andra flikar.
- Privata `sea_scouts` lagrar kvitton. `sea_scout_targets` lagrar endast den senaste
  resultatlistan per kapten. Äldre medlemslistor tas bort vid nästa sökning,
  medan kvitton behålls för säkra återförsök.
- Tabellerna har RLS, saknar klientbehörigheter och publiceras inte till Realtime.
  Funktionerna hämtar identiteten från det autentiserade, registrerade kontot.
- Upptäckta skepp refererar den publika profilens stabila identitet. Det undviker
  att två samtidiga scoutingar tar korsvisa lås på varandras privata karaktärsrader.
  Borttagna profiler tas automatiskt bort ur sparade resultat.
- Partiella index täcker havsplatser och planerade utresor. Sökningen använder
  en gemensam databasögonblicksbild utan att färdigställa andra kaptener.
- Profilstatus innehåller `can_attack_here`, beräknat för just betraktaren.
  Andras aktuella distans, besöks-ID, resursvärden och privata rutter publiceras inte.

## Konfiguration och verifiering

`seaTravel.scoutEnergyCost` och `seaTravel.scoutPageSize` i
[gameplayconfig](../config/gameplay.json) styr pris och sidstorlek.
Reglerna har sin källa i `supabase/templates/gameplay/sea-scouting.sql`.
Använd `npm run config:sync` och `npm run db:migrate` efter regeländringar.

Databastester finns i `supabase/tests/sea-scouting.test.sql`, webbläsartester i
`tests/e2e/sea-scouting.spec.ts` och alternativa konfigurationskontroller i
`scripts/config/test-database.mjs`. Aktuella resultat finns i
[implementationsstatus](IMPLEMENTATION_STATUS.md).
