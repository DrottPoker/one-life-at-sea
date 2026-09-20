# Hamnens spelarlista

Uppdaterat 2026-09-20. Balans kommer från [gameplayconfig](../config/gameplay.json).

## Beteende

The Harbor visar kaptener som är i hamnen, även utloggade spelare. Namn sorteras
alfabetiskt med 20 per sida. Den egna kaptenen markeras med **You**. Antal och
sidindelning beräknas på hela listan; tomma sista sidor begränsas till en giltig sida.

Kaptenen lämnar listan vid avfärd och återkommer vid hemresans deadline.
Det kräver inte att resenären loggar in. Det är plats, inte onlinestatus, som
avgör medlemskapet. Se [resesystemet](SEA_TRAVEL.md).

## Serverprojektion och åtkomst

`public.harbor_players` innehåller `character_id`, `display_name` och
`arrives_at`. Ankomst är null för en färdigställd hamnposition, annars
hemresans deadline. En framtida ankomst döljs av RLS.

Endast registrerade konton kan läsa. Klienter kan inte skriva listan.
Kontokoppling, stats, resurser och privata resor publiceras inte.
Serverns trigger synkroniserar namn, plats och planerad hemkomst. En främmande
nyckel tar bort posten om karaktären raderas. Oförändrade publika värden
skriver inte om projektionen vid träning eller andra resursändringar.

`list_harbor_players(requested_page)` är en security-invoker RPC med RLS.
Namn, antal och sida läses med samma databasögonblick och tidsvillkor.
`observed_at` anger databastid. `next_arrival_at` hämtar nästa planerade
hemkomst från den minimala profilprojektionen.

## Öppen lista

Servern renderar första sidan. Klienten prenumererar på `harbor_players` och
`character_profiles`, som aviserar nya hemresor innan deras dolda listpost
är läsbar. Cookiebaserad Realtimeautentisering och bekräftad prenumeration
krävs innan statusen Live visas.

Den gemensamma snapshot-pollern samlar signaler och serialiserar hämtning.
Nästa hemkomst, reservkontroll, fokus och återanslutning uppdaterar listan
även om ingen ny databasskrivning sker vid deadline. Sista fungerande snapshot
behålls vid fel och markeras tillsammans med Retry.

## Verifiering

Databastester verifierar publik datagräns, RLS, sidindelning och offlinehemkomst.
Webbläsartestet genomför riktiga resekommandon, kontrollerar Realtimefält och
återhämtning efter nätavbrott samt mobilbredder. Egna lokala testkonton städas.

Aktuella resultat finns i [implementationsstatus](IMPLEMENTATION_STATUS.md).
