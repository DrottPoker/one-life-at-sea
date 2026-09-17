# Hamnens spelarlista

Datum: 2026-09-15.

## Beteende

The Harbor visar en panel med kaptener som har platsen `the_harbor`.
Även utloggade spelare ingår. Listan visar karaktärsnamn, markerar den egna
karaktären med **You** och visar det totala antalet kaptener.

Namnen sorteras alfabetiskt och visas med 20 per sida. Sidindelningen omfattar
hela hamnen, även om den innehåller fler spelare än Data API:s vanliga radgräns.
En tom eller borttagen sista sida flyttas automatiskt till en giltig sida.

Detta är en lista över karaktärernas plats, inte en lista över öppna
webbläsarflikar eller spelare som är online just nu. Alla karaktärer börjar
fortfarande i hamnen; resor och byte av plats har ännu inget spelargränssnitt.

## Realtidsuppdatering

Supabase Realtime skickar Postgres Changes via WebSocket när hamnlistan ändras.
Den öppna sidan hämtar då aktuell sida och antal från databasen utan omladdning.

En första lista renderas på servern. Webbläsaren prenumererar och hämtar sedan
en ny ögonblicksbild för att fånga ändringar som skett under anslutningen.
Klienten inväntar inloggningssessionen före anslutning och bekräftad
databasprenumeration innan statusen Live visas. Fel i en ändringshändelse visas
som pausade uppdateringar.
När anslutningen återkommer eller sidan återfår fokus hämtas listan igen.
Förfrågningar körs i ordning och upprepade ändringssignaler samlas ihop.
Det förhindrar att en gammal hämtning skriver över en nyare lista.

Panelen visar anslutningsstatus och en Retry-knapp vid problem. Den senaste
hämtade listan finns kvar, men markeras som möjlig att vara inaktuell.
Vanliga uppdateringar drivs av databasens händelser, utan återkommande polling.

## Datagräns

`public.harbor_players` innehåller endast:

- `character_id`: karaktärens offentliga identifierare.
- `display_name`: karaktärens namn.

Den privata karaktärstabellen och dess kontokoppling, stats och resurser
publiceras inte till Realtime. Bara registrerade konton har läsbehörighet till
hamnlistan. Anonyma anrop saknar behörighet; klienter kan inte skriva listan.

En privat databastrigger följer nya karaktärer och serverns ändringar av namn
eller plats. Främmande nyckel med cascade tar bort listposten när karaktären tas
bort. Träning och energiändringar skriver inte om hamnlistan. Äldre karaktärer
fylldes i när migrationen applicerades, utan ändring av deras speldata.

`list_harbor_players(requested_page)` kör med anroparens behörighet och RLS.
Sida, totalt antal och namn hämtas ur samma databasögonblicksbild. Databasen
begränsar sidstorleken och hanterar ogiltiga sidnummer.

## Lokal drift och verifiering

Realtime är aktiverat i `supabase/config.toml`. En redan startad lokal miljö
behöver startas om med `supabase stop` följt av `supabase start` när denna
konfiguration ändras. Använd inte `--no-backup` eller databasåterställning.

Migration: `20260915195100_add_harbor_roster.sql`.

Tester och utförda kontroller redovisas i
[implementationsstatus](IMPLEMENTATION_STATUS.md). Webbläsartestet använder
isolerade lokala konton och återställer sina testposter efter körningen.

Teknisk referens:
[Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
