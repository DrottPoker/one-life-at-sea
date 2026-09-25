# Forum

Forumet följer Torns upplägg med tavlor, trådar och numrerade inlägg, men med egna lösningar där Torn brister. Etapp 1-4 levererades 2026-09-25. Besättningsforum väntar på att fraktioner finns, se [Roadmap](ROADMAP.md#forum).

## Spelarupplevelse

- **Forums** ligger i sidomenyn. Forumet går att använda i Hospital, till sjöss och under resa, precis som brevposten. Angriparens stridslås gäller fortfarande. Forumet kräver en inloggad kapten; utloggade besökare kan inte läsa.
- `/forums` visar tavlorna grupperade i sektioner med antal trådar, antal inlägg och senaste inlägg. **New** markerar tavlor med olästa trådar. **Mark all read** markerar allt som läst.
- En tavla (`/forums/boards/<id>`) listar trådar med kolumnerna Thread, Replies, Views, Rating och Last post. Trådar med omröstning märks **Poll**. Fästa trådar ligger först, sedan sorteras trådarna efter senaste inlägg, så ett nytt svar lyfter tråden. **New** leder till första olästa inlägget. Långa trådar visar länkar till sina sidor. **Mark board read** markerar tavlan som läst.
- En tråd (`/forums/threads/<id>`) visar inläggen i nummerordning. Antalet per sida styrs av konfigurationen. Författarkolumnen visar `Name [ID]`, rollen Admin eller Moderator, Level, antal synliga inlägg och karma. Varje inläggsnummer är en permalänk (`/forums/posts/<id>`) som hittar rätt sida även om sidstorleken ändras. URL:ernas sidnummer börjar på 1.
- **Quote** citerar ett inlägg i samma tråd. Citatet sparas som en hänvisning och visas från originalet: tar en moderator bort originalet försvinner citatet också, och ett senare redigerat original märks med *(edited since)*.
- Författaren kan redigera sina inlägg utan tidsgräns så länge tråden är öppen. Inlägget visar då **Last edited by** med namn och tid. Redigerar författaren det första inlägget kan trådens titel också ändras.
- Författaren kan radera sina egna inlägg när som helst, även i låsta trådar, men bara innehållet försvinner, som på Reddit. Inlägget behåller nummer och tid, och spelare ser platshållaren "This post was deleted by its author." med författaren som `[deleted]`. Tråden och dess titel står alltid kvar, även om det enda inlägget raderas; en raderad öppningspost visas som `[deleted]` i trådlistan och räknas inte som svar. Torn saknar självradering, medan här får spelaren ta bort det den skrivit utan att samtalet får hål.
- Inlägg använder en liten BBCode-del: `[b]`, `[i]`, `[u]`, `[s]`, `[spoiler]` och `[url=...]...[/url]`. Webbadresser länkas automatiskt. Verktygsraden omsluter markerad text och **Preview** visar resultatet. Okända eller ofullständiga taggar visas som vanlig text. Bara `http(s)`-länkar utan inloggningsuppgifter tillåts och öppnas i en ny flik med `rel="nofollow ugc noopener noreferrer"`. Interna sökvägar som `/players/100001` blir vanliga spellänkar. Bilder läggs in med `[img]id[/img]` eller `[img=beskrivning]id[/img]` efter en uppladdning, se [Bilder](#bilder).
- Trådar och svar har en väntetid mellan inlägg och en gräns för nya trådar per timme. Samma text i samma tråd, eller samma titel på samma tavla, avvisas inom ett kort fönster. Felmeddelandet visar hur många sekunder som återstår.
- Olästa inlägg markeras bara när tråden är monterad i en synlig flik, och bara upp till det högsta inläggsnumret som visas. Serverläsningar, prefetch och gömda flikar markerar inget. Inlägg som var olästa när sidan öppnades behåller märket **New** under besöket. En ny kapten börjar utan olästa trådar; bara aktivitet efter att karaktären skapades räknas.
- **Views** räknar unika läsare, alltså kaptener som har öppnat tråden minst en gång. Omladdningar och prefetch räknas inte.
- Nya trådar och svar sparas i sessionStorage per karaktär och mål innan de skickas, som i brevposten. Blir svaret osäkert visar editorn **Retry post** med samma begäran, även efter omladdning. Inget skickas automatiskt när sidan laddas.

## Reaktioner

- Varje inlägg har like och dislike med synliga räknare, som hos Torn. Ett nytt klick på samma knapp tar bort reaktionen, och ett klick på den andra byter. Vem som reagerat visas inte, och reaktioner ger inga notiser, så ett dislike inbjuder inte till hämnd.
- Trådens **Rating** i listan är likes minus dislikes på första inlägget.
- Man kan inte reagera på egna inlägg, i låsta trådar, i Announcements eller i Graveyard. En karaktär yngre än `newCharacterHours` kan gilla men inte ogilla. Reaktionerna har en gräns per minut.
- Spelare ser inga räknare på raderade eller borttagna inlägg. Raderna finns kvar i databasen för karman.

## Karma

- Karma följer Torn: likes minus dislikes på ens inlägg. Om en reaktion räknas avgörs en gång, när den ges första gången. Den räknas inte om inlägget är kortare än `karmaMinPostLength` tecken, om tavlan har `karma: false` (Announcements, Trading Post och Graveyard), om den som reagerar är yngre än `newCharacterHours` eller om den som reagerar redan har gett samma författare `karmaPerAuthorPerDay` räknade reaktioner det senaste dygnet. Den som byter like till dislike behåller sin plats i räkningen. Reaktionerna och deras räknare syns som vanligt.
- Ett raderat eller borttaget inlägg räknas som en helhet (ägarens beslut 2026-09-25): låg det totalt på minus står minuset kvar, låg det på plus försvinner plusset. Samma sak gäller inlägg i en borttagen tråd, och ett återställt inlägg eller en återställd tråd får tillbaka sin karma. Totalen blir aldrig lägre än noll.
- Karman visas i inläggets författarkolumn och som **Forum karma** på profilen. Inläggets karma och författarens total hålls aktuella av databasen när reaktioner ändras, när en karaktär raderas och när innehåll tas bort eller återställs.

## Prenumerationer och notiser

- Den som startar eller svarar i en tråd prenumererar automatiskt. **Subscribe** och **Unsubscribe** finns i trådhuvudet, och en aktiv avprenumeration gäller även om man svarar i tråden senare.
- Ett nytt svar ger prenumeranterna notisen `forum.reply`. Varje prenumerant får högst en väntande notis per tråd tills den läser tråden förbi det notifierade inlägget eller markerar tavlan som läst; då kan nästa svar notifiera igen. Den som redan läst inlägget får ingen notis.
- Den som blir citerad får notisen `forum.quote`, även utan prenumeration, och då ingen svarsnotis för samma inlägg. Spelare på ens ignore-lista i brevposten skickar varken svars- eller citatnotiser.
- `/forums/subscriptions` listar prenumererade trådar med antal nya inlägg efter läspositionen, senaste inlägg och en knapp för att avprenumerera.
- Notiserna delas ut efter att svaret har sparats, inte i samma transaktion. Appen levererar direkt när svaret har skickats tillbaka till den som skrev, och ett schemalagt jobb (`forum-notifications`, varje minut) tar det som blev kvar. Mottagarna bestäms vid leveransen: ett svar som raderas eller en tråd som tas bort innan dess notifierar ingen, och den som hunnit läsa inlägget eller ignorera författaren får ingen notis. En tråd med många prenumeranter delas upp i omgångar, så ett svar blir aldrig långsamt eller låser mottagarna. Torn saknar prenumerationer på trådar.
- Notiserna länkar till inläggets permalänk. Se [Notiser](NOTIFICATIONS.md).

## Sök och profiler

- `/forums/search` söker ord i inlägg och trådtitlar. `"fraser"`, `-ord` och `by:namn` eller `by:ID` fungerar, och sökningen kan begränsas till en tavla eller till trådar. Raderat och borttaget innehåll hittas aldrig, så en sökning på författare avslöjar inte vad någon raderat. Utdragen visas som ren text med spoilers dolda.
- Profilen visar **Forum posts** med antal synliga inlägg och trådar. Siffrorna länkar till en sökning på spelarens inlägg respektive trådar. Forumets startsida har **My posts** och **Subscriptions**.

## Omröstningar

- Den som startar en tråd kan lägga till en omröstning med **Add a poll**: en fråga, 2 till `pollOptionsMax` olika alternativ, hur många alternativ en röst får innehålla och om den stänger efter 1, 3, 7, 14 eller 30 dagar (upp till `pollMaxDays`) eller aldrig. Omröstningen skapas med tråden och kan inte ändras efteråt, så ingen kan byta frågan när rösterna redan kommit in.
- Omröstningen visas överst på varje sida i tråden. En röst kan ändras och dras tillbaka så länge omröstningen är öppen, och ett upprepat anrop ändrar inget.
- Resultatet visas först när man har röstat, när omröstningen har stängt eller om man inte får rösta. Den som ännu inte har bestämt sig påverkas alltså inte av hur andra röstat. Antalet röstande syns alltid. Moderatorer ser alltid resultatet.
- Nya karaktärer (`newCharacterHours`) och avstängda spelare kan inte rösta. Det gör det svårare att fylla en omröstning med nya konton.
- Omröstningen stänger vid sin tidsgräns, när trådens författare stänger den med **Close poll**, när en moderator stänger den eller när tråden låses, tas bort eller flyttas till Graveyard. En stängd omröstning öppnas aldrig igen.
- Ingen ser vem som röstat på vad, inte heller moderatorer i forumet. Rösterna ligger i `private.forum_poll_votes`, som inte finns i adminpanelens databasbläddrare.

## Bilder

- Den som får skriva i tråden och är äldre än `newCharacterHours` laddar upp bilder med bildknappen i verktygsraden eller genom att klistra in en bild i textfältet. PNG, JPEG, WebP och GIF tas emot upp till `imageUploadMaxBytes`. Taggen hamnar på egen rad vid markören och **Preview** visar bilden.
- Appen avkodar varje uppladdning och kodar om den till WebP, högst `imageMaxDimension` pixlar på längsta sidan. Då försvinner metadata som kamerans GPS-position och allt som gömts i filen, kamerans rotation följs och en animerad GIF blir en stillbild. Torn låter spelare länka bilder från andra webbplatser; här finns bara bilder som laddats upp till spelet, så ingen bild kan spåra läsarna eller bytas ut i efterhand.
- Ett inlägg visar högst `imagesPerPost` bilder, och bara uppladdarens egna. En spelare laddar upp högst `imagesPerHour` bilder per timme och kan ha högst `imagesUnusedMax` bilder som inget inlägg använder. Oanvända bilder raderas ett dygn efter uppladdningen, nästa gång samma spelare laddar upp.
- Bilder visas i full bredd upp till en fast höjd och öppnas i full storlek i en ny flik. Sidan känner till bildens mått innan den laddats, så inget hoppar. Citat och signaturer visar en platshållare i stället för bilden.
- En bild syns för spelare så länge ett synligt inlägg visar den. Raderar författaren inlägget döljs bilden också. Den som laddat upp en bild ser den alltid.
- Moderatorer döljer en bild med **Hide image** under inlägget och återställer den med **Restore image**. Spelare ser då "Image removed by a moderator", medan moderatorer fortfarande ser bilden märkt "Hidden from players". Författaren får notisen `forum.moderation`. För olagligt innehåll kan en administratör välja **Delete file**, som raderar filen för alla, även moderatorer. Det går inte att ångra.

## Signaturer

- `/forums/settings` har en signatur på högst `signatureMaxLength` tecken och `signatureMaxLines` rader med samma BBCode som inlägg, där bilder visas som platshållare. Nya karaktärer och avstängda spelare kan inte skriva en ny signatur men kan ta bort sin gamla.
- Signaturen visas en gång per sida, under författarens första synliga inlägg, och aldrig under raderade eller ihopfällda inlägg. Torns signaturer upprepas under varje inlägg och kan vara stora bilder; här är de korta och syns inte om och om igen.
- **Show other captains' signatures** stänger av alla signaturer för den som läser.
- Moderatorer tar bort en signatur med **Clear signature**. Den borttagna texten sparas i modereringsloggen och spelaren får en notis.

## Populära trådar

- Forumets startsida visar **Popular threads**: högst `popularThreadsCount` trådar med mest aktivitet de senaste `popularWindowHours` timmarna. Varje svar räknas en gång, varje annan kapten som svarar två gånger och varje like en gång, så en tråd där många deltar går före en där samma två kaptener svarar varandra. Nyare aktivitet avgör vid lika. Trådar utan svar eller likes från andra syns inte, och inte heller trådar i Graveyard.
- Rangordningen räknas om var femte minut av jobbet `forum-popular-threads`, inte vid varje sidvisning. Synligheten kontrolleras ändå vid läsningen, så en borttagen tråd försvinner direkt.

## Tavlor och konfiguration

`gameplay.forum` i [gameplay.json](../config/gameplay.json) äger tavlorna och gränserna:

- `boards[]` har ett stabilt `id`, sektion, namn, beskrivning, `posting` och `active`. `open` betyder att alla skriver, `moderators` att bara moderatorer startar trådar och svarar (Announcements), `closed` att ingen skriver (Graveyard). Konfigurationen kräver exakt en aktiv stängd tavla och minst en öppen.
- Tavlor tas aldrig bort, eftersom sparade trådar pekar på dem; avaktivera i stället. En inaktiv tavla och dess trådar döljs för spelare men syns för moderatorer. Namn, ordning och regler uppdateras vid `config:sync`, medan räknarna ägs av databasen.
- `threadTitleMaxLength`, `postMaxLength`, `threadsPageSize`, `postsPageSize`, `postCooldownSeconds`, `threadsPerHour`, `duplicateWindowMinutes`, `reactionsPerMinute`, `newCharacterHours`, `searchPageSize`, `reportsPerHour`, `karmaMinPostLength` och `karmaPerAuthorPerDay` gäller både i appen och i SQL. Detsamma gäller `pollQuestionMaxLength`, `pollOptionMaxLength`, `pollOptionsMax`, `pollMaxDays`, `popularThreadsCount`, `popularWindowHours`, `signatureMaxLength`, `signatureMaxLines`, `imagesPerPost`, `imagesPerHour`, `imagesUnusedMax`, `imageUploadMaxBytes` och `imageMaxDimension`. Konfigurationen kräver att bildgränserna räcker till ett inlägg med flest bilder. Varje tavla har `karma` som anger om reaktioner där ger karma. Databasens egna tak är 200 tecken för titlar och 20 000 för inlägg, så en sänkt gräns påverkar inte sparade inlägg.

## Rapporter och ignore

- Varje inlägg har **Report** med en orsak (spam, trakasserier, stötande innehåll, regelbrott eller annat) och valfria detaljer. Moderatorerna ser rapporten och vem som skickade den, men författaren gör det inte. En spelare har högst en öppen rapport per inlägg; en ny rapport på samma inlägg ändrar inget, och knappen visar **Reported**. Nya karaktärer (`newCharacterHours`) och avstängda spelare kan inte rapportera, och `reportsPerHour` begränsar antalet.
- Inlägg från spelare på ens ignore-lista i brevposten fälls ihop med **Show post**, eftersom Torn saknar en ignore i forumet. Samma lista stoppar deras svars- och citatnotiser.

## Moderering

Administratörer är alltid moderatorer. De kan utse spelarmoderatorer, som får samma verktyg för innehåll, rapporter och avstängningar men inte kan utse moderatorer eller stänga av andra moderatorer. Ingen kan stänga av en administratör eller sig själv. Varje åtgärd kräver en orsak på 3-500 tecken och sparas i `private.forum_moderation_log` med före- och efterläge. Moderatorer ser **Moderation (antal öppna rapporter)** på forumets startsida, och adminpanelen länkar till samma verktyg under **Forum**.

- Trådar kan fästas och lossas, låsas och låsas upp, flyttas, skickas till Graveyard (flyttas, låses och lossas) samt tas bort och återställas.
- Inlägg kan tas bort och återställas, även det sista synliga. Tråden står då kvar med platshållare. Hela tråden döljs bara med **Remove**.
- En moderator kan redigera andras inlägg. Inlägget märks då **Last edited by** med tillägget *(moderator)*. **History** visar tidigare versioner för moderatorer.
- Omröstningar kan stängas, tas bort och återställas från trådens verktyg. En borttagen omröstning visas för spelare som "A moderator removed this poll." och tar inte emot röster.
- Bilder döljs och återställs per bild under inlägget, och administratörer kan radera filen för gott. Signaturer tas bort med **Clear signature**. Spelarmoderatorer kan inte ta bort en administratörs eller en annan moderators signatur.
- Borttaget och raderat innehåll döljs bara för spelare. Moderatorer läser fortfarande texten, även i citat, och ser vem som skrev den i tråden, trådlistan och forumindex. Texten märks "Hidden from players. Only moderators can read it." Spelare ser "removed by a moderator", där författaren fortfarande visas, eller "deleted by its author" med `[deleted]`. Det som författaren själv raderat kan inte återställas av moderatorer.
- En låst tråd tar inte emot svar eller redigeringar från spelare, men de kan fortfarande läsa och radera sina inlägg. Moderatorer kan svara.
- Varje moderatorbegäran har ett eget UUID. Ett återförsök med samma innehåll returnerar det sparade kvittot; ändrat innehåll ger `REQUEST_MISMATCH`. En åtgärd som redan gjorts, till exempel att fästa en redan fäst tråd, ger `FORUM_NO_CHANGE` i stället för en ny loggrad.
- `/forums/moderation` samlar rapporterna per inlägg med knapparna **Remove post**, **Dismiss** och **Ban author**. Att ta bort ett inlägg eller en tråd löser dess öppna rapporter, och avfärdade och lösta rapporter finns kvar som historik. Vyn **Bans and moderators** visar aktiva avstängningar och moderatorer; där stänger man av eller släpper spelare via spelar-ID, och administratörer utser och avsätter moderatorer. **Log** visar varje åtgärd med orsak.
- En avstängning gäller 1 timme, 1 dag, 7 dagar, 30 dagar eller för alltid och ersätter en tidigare. Den stoppar nya trådar, svar, redigering, reaktioner och rapporter. Läsning, prenumerationer och radering av egna inlägg fungerar fortfarande. Den avstängda ser orsaken och sluttiden i forumet och får notisen `forum.ban`, och `forum.unban` när avstängningen hävs. Orsaken till en avstängning visas alltså för spelaren, medan orsaker till övriga åtgärder bara syns för moderatorer.
- Författaren får notisen `forum.moderation` när en moderator tar bort eller redigerar ett inlägg, tar bort en tråd eller en omröstning, döljer en bild eller tar bort en signatur. Notisen visar inte orsaken. En utsedd eller avsatt moderator får `forum.role`.
- Adminpanelens databasbläddrare har gruppen Forum med tavlor, trådar, inlägg, versioner, rapporter, avstängningar, moderatorer, modereringsloggen, omröstningar och deras alternativ, bilder och vilka inlägg som visar dem, signaturer och väntande notiser. Alla är skrivskyddade där; moderering sker i forumet. Enskilda röster finns inte med.

## Lagring och behörighet

Tabellerna ligger i schemat `private` med RLS och utan klienträttigheter:

| Tabell | Innehåll |
| --- | --- |
| `forum_boards` | Tavlor från konfigurationen och databasens räknare |
| `forum_threads` | Titel, författare med namn och nummer som kopia, `request_id`, fäst, låst, borttagen, räknare och senaste synliga inlägg |
| `forum_posts` | Numrerade inlägg med text, `format_version`, citat, kvitto, redigerings- och borttagningsinfo |
| `forum_post_revisions` | Ersatta versioner; version 0 är originaltexten |
| `forum_thread_reads`, `forum_board_reads` | Läsposition per tråd och "markera som läst" per tavla |
| `forum_author_stats` | Synliga trådar och inlägg per karaktär samt tid för senaste inlägg |
| `forum_moderation_log` | Moderatorernas kvitton och orsaker |
| `forum_reactions` | En like eller dislike per karaktär och inlägg; en trigger håller inläggets räknare, även när en karaktär raderas |
| `forum_subscriptions` | Prenumeration eller aktiv avprenumeration per tråd, och vilket svar som har en väntande notis |
| `forum_moderators` | Spelarmoderatorer och vem som utsåg dem |
| `forum_bans` | Avstängningar med start, eventuellt slut, orsak och när de hävdes; högst en ohävd per karaktär |
| `forum_reports` | Rapporter med orsak, detaljer, status och vem som hanterade dem; högst en öppen per spelare och inlägg |
| `forum_polls`, `forum_poll_options` | Omröstning per tråd med fråga, tidsgräns, stängning, borttagning och antal röstande; alternativen med sina röstsummor |
| `forum_poll_votes` | En rad per röstande med valda alternativ; en trigger håller summorna, även när en karaktär raderas |
| `forum_images` | Uppladdningar med ägare, sökväg, storlek, mått och tider för användning, rensning, döljande och radering |
| `forum_post_images` | Vilka bilder ett inläggs nuvarande text visar |
| `forum_profiles` | Signatur och inställningen för att visa andras signaturer |
| `forum_popular_threads` | Senaste rangordningen av populära trådar med poäng |
| `forum_notification_jobs` | Svar vars notiser ännu inte delats ut och hur långt leveransen kommit |

Reaktionerna har kolumnen `counts` för karma, inläggen sin karmasumma och författarstatistiken karmatotalen. Tavlorna har `karma` från konfigurationen.

Bildfilerna ligger i den privata Storage-hinken `forum-images` under uppladdarens mapp, alltid som WebP. Uppladdningen går genom routen `POST /api/forum-images` i stället för en Server Action, så att storleken kan kontrolleras innan filen läses. Routen tar bara emot anrop från spelets egna sidor, kodar om filen, reserverar den med `reserve_forum_image` under spelarens gränser och sparar den med spelarens egen session. Storage-policyerna kontrollerar reservationen igen. Bilder visas genom `GET /api/forum-images/<id>.webp`, som frågar databasen vid varje anrop om läsaren får se bilden och sedan hämtar filen med läsarens session; svaret får revalideras men aldrig återanvändas utan kontroll, så en dold bild försvinner direkt. Radering av filer sker bara via Storage-API:t: ägaren tar bort oanvända uppladdningar och administratören en rensad fil, och databasraden markeras först när filen är borta.

Publika invoker-RPC:er anropar privata definer-funktioner med tom `search_path`. Den som skriver avgörs alltid av `private.combat_captain()`; det finns ingen parameter för författare. En tråd man inte får se ger samma `FORUM_NOT_FOUND` som en tråd som inte finns.

- Läsning: `get_forum_index`, `get_forum_board`, `get_forum_thread`, `locate_forum_post` (permalänk eller första olästa), `get_forum_post_history`, `get_forum_reports` och `get_forum_moderation` (moderatorer), `search_forums`, `get_forum_subscriptions`, `get_forum_author_stats`, `get_forum_settings` och `get_forum_image`.
- Skrivning: `create_forum_thread` (med valfri `poll`), `create_forum_post`, `edit_forum_post`, `withdraw_forum_post`, `mark_forum_thread_read`, `mark_forum_board_read`, `set_forum_reaction`, `set_forum_subscription`, `report_forum_post`, `vote_forum_poll`, `close_forum_poll`, `set_forum_settings`, `reserve_forum_image`, `list_stale_forum_images`, `discard_forum_images`, `deliver_forum_notifications` (bara egna svar) och `moderate_forum`. Moderatorbehörigheten kontrolleras med ett delat lås på moderatorraden, så att en avsättning väntar ut en åtgärd som redan pågår, som för administratörer.

Nya trådar och svar är idempotenta genom `(author_id, request_id)`. Ett upprepat anrop jämförs med originaltexten, så en senare redigering hindrar inte att samma begäran bekräftas. Skrivningar låser i ordningen författarens karaktär, tråd, omröstning, bilder, tavla, författarstatistik, prenumerationer och sist notisjobbet. Ett svar låser bara sin författare och lägger ett jobb i `forum_notification_jobs` när någon kan behöva en notis. Leveransen tar jobben med `skip locked`, så appen och schemat aldrig väntar på varandra, och låser varje omgångs mottagare med nyckellås i karaktärsordning före deras prenumerationer och notiser. Jobbet saknar främmande nyckel till författaren, så att radering av en karaktär aldrig väntar på en leverans. En röst låser karaktären och sedan omröstningen, och triggern uppdaterar omröstningen före alternativen, samma ordning som när en raderad karaktärs röster försvinner. Första läsningen av en tråd låser tråden före läsraden, samma ordning som när man skriver, och ökar antalet unika läsare. Inläggsnummer tilldelas under trådens lås och återanvänds aldrig. Inlägg, räknare, läsposition och "senaste aktivitet" för karaktären sparas i samma transaktion. Forumet publicerar inget via Realtime; sidorna uppdateras genom spelramens vanliga omladdning.

När en karaktär raderas blir författarfältet tomt. Trådar och inlägg finns kvar under det sparade namnet, men utan profillänk. Läspositioner och statistik raderas; antalet unika läsare minskar inte.

## Verifiering

- `supabase/tests/forums.test.sql`: RLS och rättigheter, validering, kvitton och `REQUEST_MISMATCH`, väntetid, dubbletter, trådgräns, citat, redigering och versioner, radering, låsta och skrivskyddade tavlor, moderering med logg, sidor, permalänkar, olästa trådar, inaktiva tavlor, raderade karaktärer och att alla räknare stämmer mot raderna.
- `supabase/tests/forum-community.test.sql`: reaktioner och deras regler, räknare efter raderade karaktärer, automatisk och avslutad prenumeration, en väntande notis per tråd, citatnotiser, ignore-listan, återförsök utan dubbelnotis, sök med fraser, uteslutning, författare, trådar och tavlor, att raderat aldrig hittas samt profilstatistik.
- `supabase/tests/forum-extras.test.sql`: omröstningar med validering, kvitton, ändrade och återtagna röster, dolda resultat, nya karaktärer, tidsgräns, låsning, stängning och moderering; signaturer med gränser, dolda signaturer, avstängning och moderering; notiser i omgångar och att raderade svar inte notifierar; populära trådar; bilder med reservation, gränser, egna uppladdningar, synlighet, döljande, radering, oanvända filer och Storage-policyerna; samt att summorna stämmer när en röstande raderas.
- `supabase/tests/forum-safety.test.sql`: moderatorer utses och avsätts bara av administratörer, avstängning av administratörer och en själv nekas, karmareglerna (längd, tavla, nya karaktärer, dygnstak, byte av reaktion, radering, borttagning, återställning och aldrig under noll), rapporter med dubbletter, egna inlägg, nya karaktärer, kön, avfärdande och lösning, avstängningar som ersätts, löper ut och hävs, notiser, ignore-markering och att lagrad karma stämmer mot reaktionerna.
- `npm run test:config:db`: ändrade tavelnamn med citattecken och dollartecken, avaktiverade och nya tavlor, skydd mot borttagna tavlor, sidstorlekar, textgränser, väntetid, trådgräns, reaktionsgräns, gräns för nya karaktärer, sökningens sidstorlek, rapportgräns, karmans minimilängd och dygnstak samt tavlornas karmaflagga.
- `tests/unit/forums.test.ts` och `tests/unit/config.test.ts`: sökvägar i Hospital och till sjöss, stridslås, sidnummer, textregler, omröstningar, signaturer, sparade begäranden, BBCode-parsern med XSS-försök, osäkra länkar och bildtaggar, serveråtgärdernas kontobindning och validering, leverans av notiser efter svaret, radering av rensade filer samt konfigurationsgränser.
- `tests/unit/notifications.test.ts`: forumnotisernas text och länkar samt skadade nyttolaster.
- `tests/unit/forum-images.test.ts`: omkodning till WebP utan metadata, storleksgräns, kamerarotation, avvisade filer (även SVG) och kontrollen att uppladdningar kommer från spelets egna sidor.
- `tests/e2e/forum-extras.spec.ts`: uppladdad bild med förhandsvisning, omröstning som skapas, röstas i, ändras och stängs, dolda resultat, nya kaptener som inte kan rösta eller ladda upp, signatur en gång per sida och avstängda signaturer, svarsnotis efter svaret, populära trådar, mobilbredd, dold bild som ger 404 för spelare och radering av filen samt borttagen omröstning.
- `tests/e2e/forum-safety.spec.ts`: rapport med orsak, kön i moderatorverktyget via adminpanelen, avstängning med notis och avstängningsbesked, borttagning som löser rapporten, hävd avstängning, utsedd moderator med begränsade verktyg, loggen, ihopfällda inlägg från ignorerade spelare, karma i författarkolumnen och att spelare inte når verktygen.
- `tests/e2e/forum-community.spec.ts`: like och dislike, rating, svarsnotis i realtid med länk till inlägget, citatnotis, prenumerationslistan, avprenumeration, sök med `by:`, profilens länk till spelarens inlägg och sökningen i mobilbredd.
- `tests/e2e/forums.spec.ts`: två spelare skapar tråd, förhandsvisar, citerar, redigerar och raderar. Testerna täcker också olästa trådar och permalänkar över sidor, mobilbredd utan sidledsscroll, förlorat svar med återförsök utan dubblett, Hospital och resa samt moderering med loggade orsaker. Testerna skapar och städar sina egna konton och trådar.
