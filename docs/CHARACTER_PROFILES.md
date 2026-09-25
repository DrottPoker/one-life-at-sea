# Karaktärsprofiler

Uppdaterat 2026-09-25.

## Innehåll och åtkomst

`/players/<player-number>` visar namn, grov plats, Max sea distance, skapandedatum och karaktärsålder.
Sidan öppnar med en bild med porträtt, namn, status och tre nyckeltal, följd av kort med
detaljer; se [gränssnittet](INTERFACE_DESIGN.md#profile-september-25). Alla kaptener har samma
standardporträtt tills egna porträtt finns. Ingen rangtitel visas.
Max sea distance är karaktärens längsta nådda avstånd, ökar vid ankomst och behålls
efter hemkomst, kortare resor och Hospital. Nya karaktärer börjar på 0.
My Profile och namn i hamnlistan länkar hit. Profilen visar även permanent Player ID.
Äldre `/characters/<uuid>` omdirigerar till nummerprofilen. **Players** ger sökning på namn
eller nummer, inklusive entydig `#100001`-sökning. Se [spelar-ID:n](PLAYER_IDS.md). Sidopanelen tillhör alltid betraktaren.
Profiler kräver ett registrerat konto med karaktär. De är läsbara i Hospital och
på en stillastående havsplats; under resa visas vänteläget.

Platsen visas som The Harbor, At sea, Traveling eller Hospital. Sjukhusvistelse
har företräde och visar återstående tid. Andra profiler visar Attack när både
betraktare och mål är i hamnen, eller efter [scouting](SEA_SCOUTING.md) när båda
är kvar vid samma Sea distance. Resande skepp och patienter är skyddade.
SQL kontrollerar dessutom stridsvillkoren vid start. Den egna profilen visar försvarsorder, som endast kan ändras i hamnen.

## Publik datagräns

`public.character_profiles` innehåller `character_id`, `player_number`, `character_level`, `display_name`,
`location`, `created_at`, `arrives_at`, `arrival_location`, `max_sea_distance` och
`arrival_max_sea_distance`. Det sista fältet är ett eventuellt planerat nytt rekord
som räknas först vid ankomst. En kortare resa innehåller inget kommande rekord.
Konton, e-post, Energy, hälsa, stats, besöks-ID och privata resealternativ ingår inte.

Tabellen har registrerad-läsar-RLS och inga klientskrivbehörigheter. Serverns trigger
synkroniserar verkliga ändringar av publika fält; karaktärens borttagning kaskaderar.
Tabellen publiceras till Realtime, medan privata karaktärsrader aldrig publiceras.

`get_character_status(target_id)` beräknar effektiv plats och `max_sea_distance` mot
databastid och returnerar aktuell ankomstdeadline, Hospital-deadline, `observed_at`
och betraktarspecifik `can_attack_here`. Den senare tillämpar samma plats- och
scoutingvillkor som stridsstart utan att exponera andras privata resestatus.
En offlinekapten får därför rätt rekord och plats vid ankomst utan egen serverkontakt.
Den äldre `get_hospital_status` finns kvar för kompatibilitet.

Klienten prenumererar på profil- och patientändringar. Den serialiserade pollern
hämtar ny status vid deadlines, fokus, återanslutning och reservkontroll.
Misslyckad uppdatering visas med Retry och blockerar Attack tills status kan verifieras.
Plats används aldrig för att påstå att spelaren är online.

[Resor](SEA_TRAVEL.md), [strid](COMBAT_SYSTEM.md), [Hospital](HOSPITAL.md) och
[verifiering](IMPLEMENTATION_STATUS.md) beskriver de anslutna funktionerna.

## Brevpost

Andra spelares profiler länkar till brevskrivaren med mottagaren förvald. Den egna profilen visar ingen sådan åtgärd. Brevpost kan användas i Hospital och under resa; angriparens stridslås gäller fortfarande. Se [Brevpost](MESSAGES.md).

## Level och närvaro

Profilen visar Character Level från [Skills](SKILLS.md) och separat [närvarostatus](PLAYER_PRESENCE.md). Närvarons lease och senaste aktivitet är skilda från platsen; en kapten i hamnen behöver inte vara online.

## Forum

Profilen visar **Forum posts** med antal synliga foruminlägg och trådar samt **Forum karma**. Siffrorna länkar till en forumsökning på spelarens inlägg respektive trådar. Raderat och borttaget räknas inte. Se [Forum](FORUMS.md#sök-och-profiler).
