# Spelarstatistik

`/admin/players` samlar communitystatistik och den sökbara spelarkatalogen. Bara nuvarande administratörer kan läsa RPC:erna för sammanställd statistik och katalogen. Ingen adminnyckel för Auth skickas till webbläsaren, och ingen av slutpunkterna returnerar e-post, IP-adresser eller tokens.

## Definitioner

- **Total players** räknar befintliga karaktärer med ett registrerat konto som inte är borttaget. Kortet visar också antalet konton och konton utan karaktär.
- **Active players** (24 timmar, 7 dagar och senaste månaden) räknar unika befintliga konton som loggade in eller använde en befintlig inloggad session under det rullande intervallet. Varje konto räknas en gång, oavsett upprepade inloggningar, flikar, enheter eller besök. En månad är en kalendermånad, inte fasta 30 dagar. Det är inte ett antal som är online just nu. Administratörer och registrerade konton utan karaktär räknas med.
- **New accounts** räknar registreringar under det rullande intervallet, även konton som har tagits bort senare men vars skapande registrerades. Anonyma konton räknas inte.
- **Last month**, **12 months** och **All time** väljer diagrammens period. Månads- och årsdiagrammen täcker UTC-datum från dagen efter motsvarande datum för en eller tolv månader sedan till och med i dag. All time börjar vid första kända registrering. Dagens värde är ofullständigt.
- Diagrammen visar nya konton, antalet konton i slutet av varje intervall och unika aktiva konton. De visar ett värde per dag upp till 500 dagar. Längre historik delas i på varandra följande intervall som vart och ett omfattar `ceil(days / 500)` dagar. Diagramtitlar, bildtexter och de datumintervall som visas vid inspektion anger grupperingen. Inga datum slängs. Unika konton dedupliceras över alla dagar i varje intervall och summeras aldrig från dagliga unika antal.
- Periodsammanfattningen räknar varje aktivt konto en gång över hela den valda perioden, även när det förekommer på många dagar i diagrammet. Den behåller konton som har tagits bort senare. Korten för nuvarande konton utesluter borttagna konton. Instrumentpanelen har inga antal inloggningshändelser och inga uppskattningar av hur många som är online just nu.

Statistiken uppdateras varje minut i en synlig flik, och **Refresh statistics** läser om direkt. Misslyckade läsningar behåller de tidigare siffrorna med en varning. Bildtexterna anger vilken period som visas medan ett annat val laddas. Diagrammen fungerar med mus, touch och tangentbord. Sökning i katalogen filtrerar inte statistiken för hela spelet. Katalogen filtrerar och sorterar på senaste aktivitet, med deterministisk sidindelning om 50 spelare.

## Insamling och historik

Triggers för registrering och inloggning i Auth sparar kontots senast kända aktivitet och gör en upsert av en aktivitetsrad per konto och UTC-datum. Upprepade inloggningar uppdaterar raden utan att fler spelare räknas. Den automatiska inloggningen vid registrering räknas med.

`usePlayerActivity` körs i den inloggade appens ram. Att öppna eller återvända till en befintlig session registrerar aktivitet, och synliga sidor kontrollerar dessutom en gång per minut. Dolda eller stängda sidor skapar inte aktivitet hela tiden. Kontrollen ändrar inte karaktärens Last action eller resurser och ger inga blinkande omladdningar. Profilens närvaro använder en separat signal per flik och session, se [Närvaro](PLAYER_PRESENCE.md). Fel är tysta och försöks igen vid nästa kontroll. Anrop avbryts efter tio sekunder och vid utloggning eller avmontering. Servern begränsar skrivningar till en per minut över alla flikar, utom när UTC-datumet byts eller dagens rad saknas.

`record_player_activity()` tar inga argument för konto eller tid. Servern använder `auth.uid()`, serverns tid, ett levande konto som varken är anonymt eller borttaget och en matchande, ej utgången rad i `auth.sessions`. Återkallade eller främmande sessioner kan inte rapportera aktivitet. Bara den inloggade anroparens tidsstämplar kan ändras. De privata tabellerna har RLS och inga klienträttigheter. Adminläsningar kontrollerar fortfarande aktuellt medlemskap vid varje anrop.

Fullständig daglig aktivitet finns från `private.player_statistics_config.activity_tracked_since`. Tidigare dagar i diagrammen är tomma, inte noll, och den första spårade dagen eller det första intervallet är ofullständigt. Kända senaste inloggningar importerades som senaste aktivitet för korten och för unika totaler över hela perioden. De tidigare totalerna är ofullständiga eftersom pågående sessioner inte registrerades förut. Ingen daglig aktivitet hittas på utifrån ett kontos senaste tidsstämpel.

Registreringshistoriken börjar med de konton som fanns när registreringsövervakningen installerades. Konton som raderats före dess går inte att återskapa. Nya registreringar och borttagningar sparas därefter. Hård radering tömmer Auth-ID:t men behåller historiken med bara tidsstämplar. Mjukt raderade konton försvinner från nuvarande totaler och katalogen. Den avvecklade tabellen `player_sign_ins_daily` finns kvar privat för migreringssäkerhet; den tar inte längre emot händelser och matar inte instrumentpanelen. Konfigurationsmigreringar behåller spårningsstarten, registrerad aktivitet och kontohistoriken.

## Verifiering

Kanonisk SQL: `supabase/templates/gameplay/player-statistics.sql`.

- Databastesterna täcker gränserna för admin och integritet, upprepade inloggningar, pågående och främmande sessioner, deduplicering av konton över dagar, periodgränser, lång historik för All time, okända dagar, borttagna konton och återkallat medlemskap.
- Webbläsartesterna kör riktig registrering, inloggning och sessionsförnyelse i Auth, återställda sessioner, periodbyten, tangentbordsåtkomst i diagrammen, misslyckade läsningar, sökning och responsiva layouter.
- Teststädningen tar bara bort de egna engångskontona och deras statistikrader. Riktig kontoradering behåller fortfarande den sammanställda historiken.
