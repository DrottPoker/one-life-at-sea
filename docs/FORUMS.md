# Forum

Forumet följer Torns upplägg med tavlor, trådar och numrerade inlägg, men med egna lösningar där Torn brister. Första etappen levererades 2026-09-25. Reaktioner, prenumerationer, sök, rapporter, forumavstängning och karma är senare etapper, se [Roadmap](ROADMAP.md#forum).

## Spelarupplevelse

- **Forums** ligger i sidomenyn. Forumet går att använda i Hospital, till sjöss och under resa, precis som brevposten. Angriparens stridslås gäller fortfarande. Forumet kräver en inloggad kapten; utloggade besökare kan inte läsa.
- `/forums` visar tavlorna grupperade i sektioner med antal trådar, antal inlägg och senaste inlägg. **New** markerar tavlor med olästa trådar. **Mark all read** markerar allt som läst.
- En tavla (`/forums/boards/<id>`) listar trådar med kolumnerna Thread, Replies, Views och Last post. Fästa trådar ligger först, sedan sorteras trådarna efter senaste inlägg, så ett nytt svar lyfter tråden. **New** leder till första olästa inlägget. Långa trådar visar länkar till sina sidor. **Mark board read** markerar tavlan som läst.
- En tråd (`/forums/threads/<id>`) visar inläggen i nummerordning. Antalet per sida styrs av konfigurationen. Författarkolumnen visar `Name [ID]`, rollen Admin för administratörer, Level och antal synliga inlägg. Varje inläggsnummer är en permalänk (`/forums/posts/<id>`) som hittar rätt sida även om sidstorleken ändras. URL:ernas sidnummer börjar på 1.
- **Quote** citerar ett inlägg i samma tråd. Citatet sparas som en hänvisning och visas från originalet: tar en moderator bort originalet försvinner citatet också, och ett senare redigerat original märks med *(edited since)*.
- Författaren kan redigera sina inlägg utan tidsgräns så länge tråden är öppen. Inlägget visar då **Last edited by** med namn och tid. Redigerar författaren det första inlägget kan trådens titel också ändras.
- Författaren kan radera sina egna inlägg när som helst, även i låsta trådar. En platshållare behåller numreringen. Raderas trådens sista synliga inlägg försvinner hela tråden och författaren skickas till tavlan. Torn saknar självradering; här får spelaren ta bort det den skrivit.
- Inlägg använder en liten BBCode-del: `[b]`, `[i]`, `[u]`, `[s]`, `[spoiler]` och `[url=...]...[/url]`. Webbadresser länkas automatiskt. Verktygsraden omsluter markerad text och **Preview** visar resultatet. Okända eller ofullständiga taggar visas som vanlig text. Bara `http(s)`-länkar utan inloggningsuppgifter tillåts och öppnas i en ny flik med `rel="nofollow ugc noopener noreferrer"`. Interna sökvägar som `/players/100001` blir vanliga spellänkar. Bilder stöds inte.
- Trådar och svar har en väntetid mellan inlägg och en gräns för nya trådar per timme. Samma text i samma tråd, eller samma titel på samma tavla, avvisas inom ett kort fönster. Felmeddelandet visar hur många sekunder som återstår.
- Olästa inlägg markeras bara när tråden är monterad i en synlig flik, och bara upp till det högsta inläggsnumret som visas. Serverläsningar, prefetch och gömda flikar markerar inget. Inlägg som var olästa när sidan öppnades behåller märket **New** under besöket. En ny kapten börjar utan olästa trådar; bara aktivitet efter att karaktären skapades räknas.
- **Views** räknar unika läsare, alltså kaptener som har öppnat tråden minst en gång. Omladdningar och prefetch räknas inte.
- Nya trådar och svar sparas i sessionStorage per karaktär och mål innan de skickas, som i brevposten. Blir svaret osäkert visar editorn **Retry post** med samma begäran, även efter omladdning. Inget skickas automatiskt när sidan laddas.

## Tavlor och konfiguration

`gameplay.forum` i [gameplay.json](../config/gameplay.json) äger tavlorna och gränserna:

- `boards[]` har ett stabilt `id`, sektion, namn, beskrivning, `posting` och `active`. `open` betyder att alla skriver, `moderators` att bara moderatorer startar trådar och svarar (Announcements), `closed` att ingen skriver (Graveyard). Konfigurationen kräver exakt en aktiv stängd tavla och minst en öppen.
- Tavlor tas aldrig bort, eftersom sparade trådar pekar på dem; avaktivera i stället. En inaktiv tavla och dess trådar döljs för spelare men syns för moderatorer. Namn, ordning och regler uppdateras vid `config:sync`, medan räknarna ägs av databasen.
- `threadTitleMaxLength`, `postMaxLength`, `threadsPageSize`, `postsPageSize`, `postCooldownSeconds`, `threadsPerHour` och `duplicateWindowMinutes` gäller både i appen och i SQL. Databasens egna tak är 200 tecken för titlar och 20 000 för inlägg, så en sänkt gräns påverkar inte sparade inlägg.

## Moderering

Administratörer är moderatorer. Separata spelarmoderatorer kommer i en senare etapp. Varje åtgärd kräver en orsak på 3-500 tecken och sparas i `private.forum_moderation_log` med före- och efterläge.

- Trådar kan fästas och lossas, låsas och låsas upp, flyttas, skickas till Graveyard (flyttas, låses och lossas) samt tas bort och återställas.
- Inlägg kan tas bort och återställas. Det sista synliga inlägget kan bara tas bort tillsammans med tråden.
- En moderator kan redigera andras inlägg. Inlägget märks då **Last edited by** med tillägget *(moderator)*. **History** visar tidigare versioner för moderatorer.
- Spelare ser "removed by a moderator" och "deleted by its author". Moderatorer kan fortfarande läsa texten och se borttagna trådar. Det som författaren själv tagit bort går inte att återställa.
- En låst tråd tar inte emot svar eller redigeringar från spelare, men de kan fortfarande läsa och radera sina inlägg. Moderatorer kan svara.
- Varje moderatorbegäran har ett eget UUID. Ett återförsök med samma innehåll returnerar det sparade kvittot; ändrat innehåll ger `REQUEST_MISMATCH`. En åtgärd som redan gjorts, till exempel att fästa en redan fäst tråd, ger `FORUM_NO_CHANGE` i stället för en ny loggrad.
- Adminpanelens databasbläddrare har gruppen Forum med tavlor, trådar, inlägg, versioner och modereringsloggen. Alla är skrivskyddade där; moderering sker i tråden.

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

Publika invoker-RPC:er anropar privata definer-funktioner med tom `search_path`. Den som skriver avgörs alltid av `private.combat_captain()`; det finns ingen parameter för författare. En tråd man inte får se ger samma `FORUM_NOT_FOUND` som en tråd som inte finns.

- Läsning: `get_forum_index`, `get_forum_board`, `get_forum_thread`, `locate_forum_post` (permalänk eller första olästa) och `get_forum_post_history` (moderatorer).
- Skrivning: `create_forum_thread`, `create_forum_post`, `edit_forum_post`, `withdraw_forum_post`, `mark_forum_thread_read`, `mark_forum_board_read` och `moderate_forum`.

Nya trådar och svar är idempotenta genom `(author_id, request_id)`. Ett upprepat anrop jämförs med originaltexten, så en senare redigering hindrar inte att samma begäran bekräftas. Skrivningar låser i ordningen författarens karaktär, tråd, tavla och sist författarstatistik. Första läsningen av en tråd låser tråden före läsraden, samma ordning som när man skriver, och ökar antalet unika läsare. Inläggsnummer tilldelas under trådens lås och återanvänds aldrig. Inlägg, räknare, läsposition och "senaste aktivitet" för karaktären sparas i samma transaktion. Forumet publicerar inget via Realtime; sidorna uppdateras genom spelramens vanliga omladdning.

När en karaktär raderas blir författarfältet tomt. Trådar och inlägg finns kvar under det sparade namnet, men utan profillänk. Läspositioner och statistik raderas; antalet unika läsare minskar inte.

## Verifiering

- `supabase/tests/forums.test.sql`: RLS och rättigheter, validering, kvitton och `REQUEST_MISMATCH`, väntetid, dubbletter, trådgräns, citat, redigering och versioner, radering, låsta och skrivskyddade tavlor, moderering med logg, sidor, permalänkar, olästa trådar, inaktiva tavlor, raderade karaktärer och att alla räknare stämmer mot raderna.
- `npm run test:config:db`: ändrade tavelnamn med citattecken och dollartecken, avaktiverade och nya tavlor, skydd mot borttagna tavlor, sidstorlekar, textgränser, väntetid och trådgräns.
- `tests/unit/forums.test.ts` och `tests/unit/config.test.ts`: sökvägar i Hospital och till sjöss, stridslås, sidnummer, textregler, sparade begäranden, BBCode-parsern med XSS-försök och osäkra länkar, serveråtgärdernas kontobindning och validering samt konfigurationsgränser.
- `tests/e2e/forums.spec.ts`: två spelare skapar tråd, förhandsvisar, citerar, redigerar och raderar. Testerna täcker också olästa trådar och permalänkar över sidor, mobilbredd utan sidledsscroll, förlorat svar med återförsök utan dubblett, Hospital och resa samt moderering med loggade orsaker. Testerna skapar och städar sina egna konton och trådar.
