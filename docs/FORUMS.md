# Forum

Forumet följer Torns upplägg med tavlor, trådar och numrerade inlägg, men med egna lösningar där Torn brister. Etapp 1-3 levererades 2026-09-25. Besättningsforum, omröstningar och liknande är en senare etapp, se [Roadmap](ROADMAP.md#forum).

## Spelarupplevelse

- **Forums** ligger i sidomenyn. Forumet går att använda i Hospital, till sjöss och under resa, precis som brevposten. Angriparens stridslås gäller fortfarande. Forumet kräver en inloggad kapten; utloggade besökare kan inte läsa.
- `/forums` visar tavlorna grupperade i sektioner med antal trådar, antal inlägg och senaste inlägg. **New** markerar tavlor med olästa trådar. **Mark all read** markerar allt som läst.
- En tavla (`/forums/boards/<id>`) listar trådar med kolumnerna Thread, Replies, Views, Rating och Last post. Fästa trådar ligger först, sedan sorteras trådarna efter senaste inlägg, så ett nytt svar lyfter tråden. **New** leder till första olästa inlägget. Långa trådar visar länkar till sina sidor. **Mark board read** markerar tavlan som läst.
- En tråd (`/forums/threads/<id>`) visar inläggen i nummerordning. Antalet per sida styrs av konfigurationen. Författarkolumnen visar `Name [ID]`, rollen Admin eller Moderator, Level, antal synliga inlägg och karma. Varje inläggsnummer är en permalänk (`/forums/posts/<id>`) som hittar rätt sida även om sidstorleken ändras. URL:ernas sidnummer börjar på 1.
- **Quote** citerar ett inlägg i samma tråd. Citatet sparas som en hänvisning och visas från originalet: tar en moderator bort originalet försvinner citatet också, och ett senare redigerat original märks med *(edited since)*.
- Författaren kan redigera sina inlägg utan tidsgräns så länge tråden är öppen. Inlägget visar då **Last edited by** med namn och tid. Redigerar författaren det första inlägget kan trådens titel också ändras.
- Författaren kan radera sina egna inlägg när som helst, även i låsta trådar, men bara innehållet försvinner, som på Reddit. Inlägget behåller nummer och tid, och spelare ser platshållaren "This post was deleted by its author." med författaren som `[deleted]`. Tråden och dess titel står alltid kvar, även om det enda inlägget raderas; en raderad öppningspost visas som `[deleted]` i trådlistan och räknas inte som svar. Torn saknar självradering, medan här får spelaren ta bort det den skrivit utan att samtalet får hål.
- Inlägg använder en liten BBCode-del: `[b]`, `[i]`, `[u]`, `[s]`, `[spoiler]` och `[url=...]...[/url]`. Webbadresser länkas automatiskt. Verktygsraden omsluter markerad text och **Preview** visar resultatet. Okända eller ofullständiga taggar visas som vanlig text. Bara `http(s)`-länkar utan inloggningsuppgifter tillåts och öppnas i en ny flik med `rel="nofollow ugc noopener noreferrer"`. Interna sökvägar som `/players/100001` blir vanliga spellänkar. Bilder stöds inte.
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
- Notiserna länkar till inläggets permalänk. Se [Notiser](NOTIFICATIONS.md).

## Sök och profiler

- `/forums/search` söker ord i inlägg och trådtitlar. `"fraser"`, `-ord` och `by:namn` eller `by:ID` fungerar, och sökningen kan begränsas till en tavla eller till trådar. Raderat och borttaget innehåll hittas aldrig, så en sökning på författare avslöjar inte vad någon raderat. Utdragen visas som ren text med spoilers dolda.
- Profilen visar **Forum posts** med antal synliga inlägg och trådar. Siffrorna länkar till en sökning på spelarens inlägg respektive trådar. Forumets startsida har **My posts** och **Subscriptions**.

## Tavlor och konfiguration

`gameplay.forum` i [gameplay.json](../config/gameplay.json) äger tavlorna och gränserna:

- `boards[]` har ett stabilt `id`, sektion, namn, beskrivning, `posting` och `active`. `open` betyder att alla skriver, `moderators` att bara moderatorer startar trådar och svarar (Announcements), `closed` att ingen skriver (Graveyard). Konfigurationen kräver exakt en aktiv stängd tavla och minst en öppen.
- Tavlor tas aldrig bort, eftersom sparade trådar pekar på dem; avaktivera i stället. En inaktiv tavla och dess trådar döljs för spelare men syns för moderatorer. Namn, ordning och regler uppdateras vid `config:sync`, medan räknarna ägs av databasen.
- `threadTitleMaxLength`, `postMaxLength`, `threadsPageSize`, `postsPageSize`, `postCooldownSeconds`, `threadsPerHour`, `duplicateWindowMinutes`, `reactionsPerMinute`, `newCharacterHours`, `searchPageSize`, `reportsPerHour`, `karmaMinPostLength` och `karmaPerAuthorPerDay` gäller både i appen och i SQL. Varje tavla har `karma` som anger om reaktioner där ger karma. Databasens egna tak är 200 tecken för titlar och 20 000 för inlägg, så en sänkt gräns påverkar inte sparade inlägg.

## Rapporter och ignore

- Varje inlägg har **Report** med en orsak (spam, trakasserier, stötande innehåll, regelbrott eller annat) och valfria detaljer. Moderatorerna ser rapporten och vem som skickade den, men författaren gör det inte. En spelare har högst en öppen rapport per inlägg; en ny rapport på samma inlägg ändrar inget, och knappen visar **Reported**. Nya karaktärer (`newCharacterHours`) och avstängda spelare kan inte rapportera, och `reportsPerHour` begränsar antalet.
- Inlägg från spelare på ens ignore-lista i brevposten fälls ihop med **Show post**, eftersom Torn saknar en ignore i forumet. Samma lista stoppar deras svars- och citatnotiser.

## Moderering

Administratörer är alltid moderatorer. De kan utse spelarmoderatorer, som får samma verktyg för innehåll, rapporter och avstängningar men inte kan utse moderatorer eller stänga av andra moderatorer. Ingen kan stänga av en administratör eller sig själv. Varje åtgärd kräver en orsak på 3-500 tecken och sparas i `private.forum_moderation_log` med före- och efterläge. Moderatorer ser **Moderation (antal öppna rapporter)** på forumets startsida, och adminpanelen länkar till samma verktyg under **Forum**.

- Trådar kan fästas och lossas, låsas och låsas upp, flyttas, skickas till Graveyard (flyttas, låses och lossas) samt tas bort och återställas.
- Inlägg kan tas bort och återställas, även det sista synliga. Tråden står då kvar med platshållare. Hela tråden döljs bara med **Remove**.
- En moderator kan redigera andras inlägg. Inlägget märks då **Last edited by** med tillägget *(moderator)*. **History** visar tidigare versioner för moderatorer.
- Borttaget och raderat innehåll döljs bara för spelare. Moderatorer läser fortfarande texten, även i citat, och ser vem som skrev den i tråden, trådlistan och forumindex. Texten märks "Hidden from players. Only moderators can read it." Spelare ser "removed by a moderator", där författaren fortfarande visas, eller "deleted by its author" med `[deleted]`. Det som författaren själv raderat kan inte återställas av moderatorer.
- En låst tråd tar inte emot svar eller redigeringar från spelare, men de kan fortfarande läsa och radera sina inlägg. Moderatorer kan svara.
- Varje moderatorbegäran har ett eget UUID. Ett återförsök med samma innehåll returnerar det sparade kvittot; ändrat innehåll ger `REQUEST_MISMATCH`. En åtgärd som redan gjorts, till exempel att fästa en redan fäst tråd, ger `FORUM_NO_CHANGE` i stället för en ny loggrad.
- `/forums/moderation` samlar rapporterna per inlägg med knapparna **Remove post**, **Dismiss** och **Ban author**. Att ta bort ett inlägg eller en tråd löser dess öppna rapporter, och avfärdade och lösta rapporter finns kvar som historik. Vyn **Bans and moderators** visar aktiva avstängningar och moderatorer; där stänger man av eller släpper spelare via spelar-ID, och administratörer utser och avsätter moderatorer. **Log** visar varje åtgärd med orsak.
- En avstängning gäller 1 timme, 1 dag, 7 dagar, 30 dagar eller för alltid och ersätter en tidigare. Den stoppar nya trådar, svar, redigering, reaktioner och rapporter. Läsning, prenumerationer och radering av egna inlägg fungerar fortfarande. Den avstängda ser orsaken och sluttiden i forumet och får notisen `forum.ban`, och `forum.unban` när avstängningen hävs. Orsaken till en avstängning visas alltså för spelaren, medan orsaker till övriga åtgärder bara syns för moderatorer.
- Författaren får notisen `forum.moderation` när en moderator tar bort eller redigerar ett inlägg eller tar bort en tråd. Notisen visar inte orsaken. En utsedd eller avsatt moderator får `forum.role`.
- Adminpanelens databasbläddrare har gruppen Forum med tavlor, trådar, inlägg, versioner, rapporter, avstängningar, moderatorer och modereringsloggen. Alla är skrivskyddade där; moderering sker i forumet.

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

Reaktionerna har kolumnen `counts` för karma, inläggen sin karmasumma och författarstatistiken karmatotalen. Tavlorna har `karma` från konfigurationen.

Publika invoker-RPC:er anropar privata definer-funktioner med tom `search_path`. Den som skriver avgörs alltid av `private.combat_captain()`; det finns ingen parameter för författare. En tråd man inte får se ger samma `FORUM_NOT_FOUND` som en tråd som inte finns.

- Läsning: `get_forum_index`, `get_forum_board`, `get_forum_thread`, `locate_forum_post` (permalänk eller första olästa), `get_forum_post_history`, `get_forum_reports` och `get_forum_moderation` (moderatorer), `search_forums`, `get_forum_subscriptions` och `get_forum_author_stats`.
- Skrivning: `create_forum_thread`, `create_forum_post`, `edit_forum_post`, `withdraw_forum_post`, `mark_forum_thread_read`, `mark_forum_board_read`, `set_forum_reaction`, `set_forum_subscription`, `report_forum_post` och `moderate_forum`. Moderatorbehörigheten kontrolleras med ett delat lås på moderatorraden, så att en avsättning väntar ut en åtgärd som redan pågår, som för administratörer.

Nya trådar och svar är idempotenta genom `(author_id, request_id)`. Ett upprepat anrop jämförs med originaltexten, så en senare redigering hindrar inte att samma begäran bekräftas. Skrivningar låser i ordningen karaktärer, tråd, tavla, författarstatistik, prenumerationer och sist notiser. Ett svar låser författaren och alla som ska notifieras i samma karaktärsordning som brevposten; mottagarna behöver bara det nyckellås som deras notisrader ändå tar. Notiserna skickas i en slinga i karaktärsordning, så att händelseraderna låses i samma ordning i alla transaktioner. Bara de låsta mottagarna notifieras, så den som prenumererar mitt under ett svar får nästa notis i stället. Första läsningen av en tråd låser tråden före läsraden, samma ordning som när man skriver, och ökar antalet unika läsare. Inläggsnummer tilldelas under trådens lås och återanvänds aldrig. Inlägg, räknare, läsposition och "senaste aktivitet" för karaktären sparas i samma transaktion. Forumet publicerar inget via Realtime; sidorna uppdateras genom spelramens vanliga omladdning.

När en karaktär raderas blir författarfältet tomt. Trådar och inlägg finns kvar under det sparade namnet, men utan profillänk. Läspositioner och statistik raderas; antalet unika läsare minskar inte.

## Verifiering

- `supabase/tests/forums.test.sql`: RLS och rättigheter, validering, kvitton och `REQUEST_MISMATCH`, väntetid, dubbletter, trådgräns, citat, redigering och versioner, radering, låsta och skrivskyddade tavlor, moderering med logg, sidor, permalänkar, olästa trådar, inaktiva tavlor, raderade karaktärer och att alla räknare stämmer mot raderna.
- `supabase/tests/forum-community.test.sql`: reaktioner och deras regler, räknare efter raderade karaktärer, automatisk och avslutad prenumeration, en väntande notis per tråd, citatnotiser, ignore-listan, återförsök utan dubbelnotis, sök med fraser, uteslutning, författare, trådar och tavlor, att raderat aldrig hittas samt profilstatistik.
- `supabase/tests/forum-safety.test.sql`: moderatorer utses och avsätts bara av administratörer, avstängning av administratörer och en själv nekas, karmareglerna (längd, tavla, nya karaktärer, dygnstak, byte av reaktion, radering, borttagning, återställning och aldrig under noll), rapporter med dubbletter, egna inlägg, nya karaktärer, kön, avfärdande och lösning, avstängningar som ersätts, löper ut och hävs, notiser, ignore-markering och att lagrad karma stämmer mot reaktionerna.
- `npm run test:config:db`: ändrade tavelnamn med citattecken och dollartecken, avaktiverade och nya tavlor, skydd mot borttagna tavlor, sidstorlekar, textgränser, väntetid, trådgräns, reaktionsgräns, gräns för nya karaktärer, sökningens sidstorlek, rapportgräns, karmans minimilängd och dygnstak samt tavlornas karmaflagga.
- `tests/unit/forums.test.ts` och `tests/unit/config.test.ts`: sökvägar i Hospital och till sjöss, stridslås, sidnummer, textregler, sparade begäranden, BBCode-parsern med XSS-försök och osäkra länkar, serveråtgärdernas kontobindning och validering samt konfigurationsgränser.
- `tests/unit/notifications.test.ts`: forumnotisernas text och länkar samt skadade nyttolaster.
- `tests/e2e/forum-safety.spec.ts`: rapport med orsak, kön i moderatorverktyget via adminpanelen, avstängning med notis och avstängningsbesked, borttagning som löser rapporten, hävd avstängning, utsedd moderator med begränsade verktyg, loggen, ihopfällda inlägg från ignorerade spelare, karma i författarkolumnen och att spelare inte når verktygen.
- `tests/e2e/forum-community.spec.ts`: like och dislike, rating, svarsnotis i realtid med länk till inlägget, citatnotis, prenumerationslistan, avprenumeration, sök med `by:`, profilens länk till spelarens inlägg och sökningen i mobilbredd.
- `tests/e2e/forums.spec.ts`: två spelare skapar tråd, förhandsvisar, citerar, redigerar och raderar. Testerna täcker också olästa trådar och permalänkar över sidor, mobilbredd utan sidledsscroll, förlorat svar med återförsök utan dubblett, Hospital och resa samt moderering med loggade orsaker. Testerna skapar och städar sina egna konton och trådar.
