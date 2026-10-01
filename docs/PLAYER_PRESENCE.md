# Närvaro och Last action

Profiler visar en 12 px stor grön, guldfärgad eller grå statusprick med etiketten **Online**, **Idle** eller **Offline** på statusraden under `Name [ID]`. Pricken bär den tillgängliga etiketten; det finns ingen separat detaljrad för spelarstatus. Samma livesnapshot ger **Last action** som förfluten tid. Hospital-statusen är ett eget fält. Detta gäller både den egna profilen och andra registrerade spelares profiler.

## Betydelse och tider

- **Online**: minst en ansluten spelflik har inte nått någon av inaktivitetsgränserna. Pekare, tangentbord, scroll och att återvända till fliken håller närvaron vid liv utan att räknas som en spelhandling. Inmatning utanför en fokuserad, synlig flik nollställer inte inaktiviteten.
- **Idle**: ingen inmatning under `gameplay.presence.idleSeconds`, eller fliken eller fönstret har varit dolt eller ofokuserat utan avbrott under `gameplay.presence.unfocusedSeconds`. Den gräns som nås först gäller. Korta fokusförluster behåller Online. När fokus kommer tillbaka nollställs båda tiderna; upprepade blur- och visibility-händelser förlänger inte en pågående frånvaro. En flik som redan är Idle förblir Idle när den tappar fokus.
- **Offline**: ingen ej utgången flik-lease hör till en levande Auth-session. En flik skickar en heartbeat var tredjedel av `gameplay.presence.leaseSeconds`. Dolda flikar fortsätter rapportera och blir Idle efter sin grace-tid. Vilande flikar och tappade anslutningar löper ut efter en stund. En close-händelse är best effort; när en webbläsare stängs kan det ta upp till en hel lease-tid innan fliken löper ut, plus tiden till profilens nästa uppdatering. Återkallade sessioner slutar räknas direkt vid nästa profilläsning, oavsett kvarvarande lease-tid.
- **Last action**: att öppna eller byta spelsida, eller att genomföra ett spelkommando. Följande räknas: träning, aktiviteter (även en misslyckad fångst som kostar Stamina), [crafting](CRAFTING.md), banköverföringar, tavernan, **Equip** och **Unequip**, Trash i Inventory, att lägga ut, köpa eller dra tillbaka på marknaden, resor, spaning, att ansluta till en attack, manuella stridsrundor, att spara försvarsorder, att skicka brev, att starta en forumtråd, svara i forumet, redigera eller radera ett eget inlägg och att välja ett nytt porträtt. Följande räknas inte: återspelning av ett befintligt kvitto, avvisade kommandon, att välja samma porträtt igen, en forumredigering som inte ändrar något, musrörelser, fokus, heartbeats, automatisk återhämtning av resurser, ankomst efter resa, passivt försvar och timeouts i strid.

Status är oberoende av Last action. Någon kan vara Idle i timmar med en gammal Last action. Att fokusera en flik gör den Online utan att nollställa Last action. Att besöka någon annans profil registrerar bara besökarens egen sidhandling.

Profilen hämtar sina snapshots med `get_character_status` och den befintliga pollern, som läser om med intervallet `frontend.refresh.fallbackMs`. Fokus och återanslutning ger en ny läsning. Last action visar **Just now** den första minuten och därefter hela minuter, timmar eller dagar. Visningens timer vaknar vid minutgränser i stället för varje sekund. Närvarons leases löper ändå ut vid sina exakta individuella tidpunkter. Båda använder serverns observationstid plus en monoton klocka i webbläsaren. Klienten skickar aldrig tidsstämplar. Vid fel behålls senast kända Last action, märkt **(last known)**, och statusen visar **Unavailable** med den befintliga knappen **Retry status**.

## Lagring och åtkomst

`private.player_presence` lagrar en lease per levande Auth-session och slumpat ID för den monterade fliken. Separata rader per flik gör att en inaktiv eller stängd flik inte kan skriva över en annan aktiv flik. Utgångna rader rensas vid kontots nästa rapport, och när en session raderas försvinner dess rader. `private.character_actions` lagrar en tidsstämpel per karaktär. När en karaktär raderas försvinner båda sorternas rader. Båda tabellerna har RLS och inga tabellrättigheter för klienter.

Närvaro-RPC:n kontrollerar det anropande kontot och dess matchande, ej utgångna Auth-session. Den tar bara emot flikidentitet och aktivitetsflaggor; den kan inte peka ut en annan spelare eller sätta godtyckliga datum. Heartbeat-skrivningar begränsas till en per tio sekunder, utom vid statusändringar. Profilen exponerar bara sammanräknade tidpunkter för anslutningen och den senaste handlingen, aldrig konto-ID:n, sessions-ID:n, flik-ID:n eller detaljer om kommandon. Åtkomst kräver fortfarande registrerad spelare. Nya kvitton uppdaterar tidsstämpeln atomärt genom privata triggers på kvittotabellerna, till exempel `inventory_requests` som täcker Trash, Equip och Unequip. Manuella stridsrundor, försvarsorder, brev, foruminlägg och porträttval sparar den i kommandots egen transaktion. Crafting sparar den i samma transaktion som ändringen i inventariet, och en återspelad eller avvisad craft flyttar den inte.

Befintliga karaktärer visar **Not recorded yet** tills deras första registrerade handling. Varken skapelsedatum eller tidigare heartbeats för kontostatistiken räknas som historiska karaktärshandlingar. Omgenerering av konfigurationen behåller alla registrerade tidsstämplar.

Kontostatistiken har kvar sin egen definition av daglig aktivitet, se [Spelarstatistik](PLAYER_STATISTICS.md). En närvaro-heartbeat skapar ingen extra inloggning och ersätter inte statistikinsamlingen.

## Verifiering

- Enhetstester: gränser för relativ tid, saknad historik, oberoende online- och idle-leases och utgång baserad på förfluten servertid.
- Databastester: levande, utgångna, återkallade och främmande sessioner, privat lagring, profilläsningar för registrerade spelare, flera flikar, att heartbeats och passiv uppdatering inte räknas, återspelade kvitton, avvisade kommandon, rensning av utgångna rader och radering.
- Webbläsartester: egen och andras profil, automatiska uppdateringar av status och Last action, idle-timeout, återgång till spelet, flera flikar, utloggning, misslyckad uppdatering med nytt försök och responsiva layouter.

Kanonisk SQL: `supabase/templates/gameplay/presence.sql` och `profile.sql`. Närvaroinställningarna finns i [gameplay.json](../config/gameplay.json); generera om med `npm run config:sync` och tillämpa lokalt med `npm run db:migrate`.
