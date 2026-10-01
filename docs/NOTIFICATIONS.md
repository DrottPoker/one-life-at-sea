# Notiser

Spelare har en beständig privat inkorg på `/notifications`. Klockikonen i sidhuvudet visar antalet olästa och länkar till inkorgen. Notiserna finns inte i platsmenyn i sidofältet. Inkorgen visar kompakta rader med länkade namn, en händelsebeskrivning, `[view]`, en tidsstämpel i UTC och lässtatus. Den fungerar i Hospital och till sjöss, även under resa. Stridsrapporter går också att läsa i Hospital och under resa. En aktiv angripare behåller det befintliga navigeringslåset tills deltagandet är slut.

## Första händelsen: inkommande attack

En `combat.attacked`-notis skapas för försvararen när ett möte går från aktivt till avslutat. Den listar alla angripare i den ordning de anslöt, även deltagare som redan har retirerat eller besegrats, med länkar till deras publika profiler. Texten säger `attacked you but lost` när försvararen vinner, `attacked and hospitalized you` när försvararen hamnar i Hospital och annars `attacked you`. Reträtter och oavgjorda strider beskrivs inte som förluster. Texten utgår från den slutligt sparade hälsan, inte karaktärens senare återhämtade värde. `[view]` öppnar den avslutade `/combatlog/<battle-id>` och markerar notisen som läst vid ett vanligt klick. Namn och spelarnummer är kopior från händelsen, så ett senare namnbyte skriver inte om historiken.

Avslutade möten omfattar seger, avvärjda attacker, reträtt, timeout, rundgräns och administrativt avbrott. Aktiva möten länkar inte till rapporter som inte finns än. Möten som redan var avslutade när notiserna infördes läggs inte till i inkorgen. Befintliga attacknotiser som saknar utfall kompletteras från den sparade striden utan att lässtatus ändras. Möten som var aktiva när migreringen kördes ger en notis när de senare avslutas. Spelare som är offline ser sparade notiser när de kommer tillbaka; utgångna strider avgörs genom befintliga spelläsningar, och därefter skapar samma avslutningstrigger notisen.

## Forumsvar och citat

`forum.reply` berättar för en trådprenumerant om ett nytt svar, och `forum.quote` berättar för en författare att ett inlägg har citerat deras. Båda nyttolasterna (version 1) innehåller trådens ID och titel, inläggets ID och nummer samt författarens namn och spelarnummer; länken öppnar `/forums/posts/<post-id>`. En prenumerant har högst en väntande svarsnotis per tråd tills den har läst förbi den, och spelare på mottagarens ignore-lista i brevposten skickar ingen av sorterna. Inläggets ID är händelsenyckeln, så ett återspelat inlägg notifierar aldrig två gånger. De två sorterna delas ut i omgångar efter att svaret har sparats: appen levererar direkt efter svaret och pg_cron-jobbet `forum-notifications` tar resten varje minut. Mottagarna bestäms vid leveransen, så ett svar som raderas innan dess notifierar ingen. Se [Forum](FORUMS.md#prenumerationer-och-notiser).

## Forummoderering

`forum.moderation` berättar för en författare att en moderator har tagit bort eller redigerat ett inlägg, tagit bort en tråd eller dess omröstning, dolt en bild eller tagit bort signaturen. Nyttolasten innehåller åtgärden och, utom för signaturer, tråden och inlägget, men inte moderatorns privata orsak. `forum.ban` anger när en forumavstängning upphör, eller att den är permanent, och dess orsak, och `forum.unban` säger att en avstängning har hävts. `forum.role` berättar för en spelare att den har utsetts till eller avsatts som forummoderator. Moderatorns begärans-ID är händelsenyckeln.

## Lagring, leverans och integritet

- `private.player_notifications` äger mottagare, sort, stabil händelsenyckel, versionerad JSON-nyttolast, händelsetid och lästid. ID:n är bigint internt och strängar i JSON och TypeScript för att behålla precisionen.
- `private.emit_notification(recipient_id, event_kind, event_key, event_payload, event_at)` är den gemensamma interna ingången och anropas i källans transaktion. `(character_id, kind, event_key)` deduplicerar återspelningar och behåller den ursprungliga nyttolasten och lässtatusen. En rollback tar bort notisen tillsammans med källhandlingen.
- Stridens avslutningstrigger anropar hjälparen en gång per möte, inte en gång per angripare. Nyttolasten innehåller bara publika namn och nummer, strids-ID och utfallet i strid och Hospital; konto-ID:n, e-post, privata stats och stridsögonblicksbilder förblir privata.
- RLS är påslaget, direkt åtkomst till tabell och sekvens är återkallad och tabellen ingår inte i Realtime. Publika invoker-RPC:er delegerar till privata definer-funktioner med tom `search_path` och kontroll av registrerad karaktär. Spelare kan inte skapa notiser eller ändra nyttolaster.
- `get_notification_summary`, `get_notifications`, `mark_notification_read` och `mark_all_notifications_read` hämtar alltid mottagaren från `auth.uid()`. Det finns ingen parameter där anroparen väljer mottagare.
- Nya rader och läsändringar signalerar den befintliga ägarbundna `player_game_events`. AppFrame laddar om serverns snapshots vid Realtime, återanslutning, fokus och den befintliga reservuppdateringen med intervallet `frontend.refresh.fallbackMs`. Ingen extra prenumeration, sekundtimer eller cache av inkorgen i webbläsaren tillkommer.
- Fallande indexerade ID:n ger markörbaserad sidindelning som inte förskjuts när nya rader kommer. Sidstorleken styrs av `gameplay.notifications.pageSize`. **Mark all as read** gäller till och med det senast inlästa ID:t; nyare notiser förblir olästa. När ett konto raderas raderas också dess inkorg. Ingen automatisk gallring är påslagen.

## Lägga till en händelsetyp

1. Definiera en stabil sort som `market.sale` och en versionerad nyttolast med bara fält som mottagaren får se. Använd ett stabilt käll-ID som händelsenyckel.
2. Anropa `private.emit_notification` i den lyckade auktoritativa transaktionen. Ge inte webbläsare rätt att anropa den och skicka inte notiser från UI-callbacks. En källspecifik trigger kan användas när flera kodvägar ska dela samma händelseövergång.
3. Lägg till en renderare för nyttolasten i `src/lib/notifications.ts`. Bygg länkar från validerade ID:n och kända routes; acceptera aldrig godtyckliga URL:er eller HTML från nyttolaster.
4. Lägg till tester för producenten (mottagare, rollback, återförsök och integritet) och för renderaren. Okända sorter och nyttolastversioner som inte stöds visar ett säkert generellt meddelande.
5. Kör config sync för att generera den append-only SQL-migreringen och tillämpa den lokalt.

## Verifiering

Databastesterna täcker grupperade attacker, en deltagare som har retirerat, exakta rapportlänkar, Hospital-utfall, isolering mellan roller och ägare, deduplicering, beständig lässtatus, realtidssignaler, sidindelning, gränsen för **Mark all as read**, rollback och kontostädning. Enhetstesterna täcker rendering av grupper, osäkra länkar, okända sorter, bigint-ID:n och navigeringsåtkomst. Webbläsartesterna täcker gruppattacker live, beständighet offline, åtkomst till rapporter i Hospital, synkad lässtatus mellan flikar, sidindelning, omladdning och mobilbredder.
