# Brevpost

Länken **Send message** på en annan spelares profil öppnar `/messages/compose?to=<player-number>` med spelaren förvald. Messages fungerar som brevpost med flikarna **Inbox**, **Compose**, **Outbox**, **Saved** och **Ignore list**. Gamla konversationslänkar skickas vidare till brevskrivaren. Den egna profilen har ingen Send message-knapp.

## Spelarupplevelse

- Compose använder samma pergament som läsvyn, med bläckfärgade mottagarchips, fält för ämne och meddelande och den guldfärgade knappen **Send mail** under papperet. Textfältet växer med långa utkast i webbläsare som stöder field-sizing och går annars att dra större för hand.
- Spelaren skriver ett ämne och en text i ren text och väljer mottagare via namn eller publikt spelarnummer, upp till den konfigurerade gränsen. Varje mottagare får en egen privat kopia i inkorgen. Avsändaren får en post i utkorgen med hela mottagarlistan. Mottagarna ser **To: You**.
- Ett svar är ett nytt brev som bara går till den ursprungliga avsändaren. Ämnet blir som standard `Re: <subject>`. Svar går aldrig till de övriga mottagarna. **History** visar tidigare brev i samma svarskedja, begränsat till kopior som läsaren fortfarande har tillgång till.
- Inbox, Outbox och Saved är ett skrivbord i två delar: kompakta kuvertrader till vänster och det valda brevet på pergament till höger. Sökfältet ligger i sidhuvudet. Olästa brev och den valda raden har olika utseende. Brev utan ämne visas som **No subject**. Listan delas i numrerade sidor och stannar på sista tillgängliga sida. Ett öppnat brev behåller mapp, sökning och sida i URL:en. Att gå till en mapp öppnar inget brev automatiskt och markerar inte det första som läst.
- Vid smal innehållsbredd är listan och det öppnade brevet separata vyer, och länken **Back to inbox**, **Back to outbox** eller **Back to saved mail** behåller sammanhanget. Långa brev växer naturligt; stycken och långa obrutna strängar radbryts utan fast höjd på läsvyn och utan avklippt text. Brevets maxlängd är konfigurerbar. Illustrationen längst ner behåller sina proportioner och sträcks aldrig ut med brevets längd.
- **Delete**, **Ignore**, **Save** och **Mark unread** ligger under brevet. **Reply** öppnar svarseditorn och lägger fokus där; stängs den behålls utkastet så länge brevet är monterat. **History** behåller också det pågående svarsutkastet. **Mark unread** går tillbaka till listan och stänger av den automatiska läsmarkeringen, så brevet förblir oläst tills det öppnas igen. **Unsave** på ett öppnat brev i Saved går tillbaka till mappen. Kryssrutor visar massåtgärderna. Raderna är cirka 46 px höga, så en hel sida får plats på en datorskärm utan egen rullningslist i listan. Långa ämnen kortas bara i listan och syns i sin helhet i titelns tooltip och i det öppnade brevet; korta datum har en tooltip med fullständig tidsstämpel.
- Sökningen matchar ord i ämne, text och avsändarens namn inom vald mapp. Den söker aldrig på och visar aldrig en annan mottagares namn. En tom sökning tar bort filtret.
- Enskilda brev kan sparas, avsparas eller raderas. Med kryssrutor, för enstaka rader eller alla rader på sidan, går det att spara (**Save selected**), radera (**Delete selected**) eller markera som läst (**Mark read**) i en omgång. Åtgärderna påverkar bara läsarens egen kopia. Radering tar bort kopian från alla mappar och direktlänkar, utan att röra andras kopior.
- En avsändare ignoreras från ett öppnat brev, eller genom att söka upp spelaren under **Ignore list**. Ignorerade spelare kan inte skicka nya brev till den som ignorerar dem. Tas ignoreringen bort kan man ta emot brev igen. Ett utskick där någon mottagare är otillgänglig eller blockerar avsändaren misslyckas helt och pekar inte ut vilken spelare som blockerar. Befintliga brev går fortfarande att läsa. Samma ignore-lista fäller ihop spelarens inlägg i forumet och stoppar deras svars- och citatnotiser, se [Forum](FORUMS.md#rapporter-och-ignore).
- Att öppna ett synligt brev markerar bara det brevet som läst. Serverläsningar, prefetch och gömda flikar markerar inget. Misslyckade läsmarkeringar visas och görs om vid fokus eller när brevet öppnas igen.
- Ägarens spelhändelser uppdaterar mapparna och antalet olästa i sidhuvudet automatiskt genom den befintliga uppdateringskön. Ingen brevtext publiceras via Realtime, och ingen extra prenumeration eller polling varje sekund tillkommer.
- Brevposten fungerar i Hospital, till sjöss och under resa. Angriparens navigeringslås under strid gäller fortfarande. Att skicka brev kostar inga spelresurser.
- Texten behåller radbrytningar och escapas av React. Den här versionen använder ren text, utan HTML-redigering, bilagor, rapportering eller svar till alla.

## Lagring och behörighet

`private.mail_messages` lagrar ett oföränderligt kuvert med kopior av avsändarens identitet, mottagarnas namn och nummer, ämne, text, tidsstämpel, begärans UUID och eventuellt brev som besvaras. `private.mail_boxes` lagrar varje ägares riktning samt läst-, sparad- och raderad-status. `private.mail_ignored` lagrar riktade ignore-relationer mellan ägare och spelare. Alla tre tabellerna har RLS och saknar direkt klientåtkomst. De publiceras inte via Realtime och finns inte i adminpanelens resurs-API:er.

Publika invoker-RPC:er anropar privata definer-funktioner med fast tom `search_path`:

- `send_mail(target_numbers, mail_subject, mail_body, request_id, reply_to_id)`
- `get_mailbox(folder, query, page)`
- `get_mail(mail_id, include_history)`
- `get_mail_summary()` och `get_message_summary()`
- `update_mail(mail_ids, operation)`
- `get_mail_ignored()` och `set_mail_ignored(target_player_number, ignored)`

Varje RPC hittar den registrerade karaktären via `auth.uid()`. Det finns ingen parameter för avsändare eller brevlådans ägare. Detalj-, historik- och sökfrågor filtrerar på ägarskap och radering, och mottagarlistan returneras bara för avsändarens kopia i utkorgen. Ett brev som besvaras måste vara ett tillgängligt inkommande brev som avsändaren äger, och svaret måste gå till det brevets avsändare. Otillgängliga och orelaterade brev-ID:n ger samma not-found-fel. Server Action binder också ändringar till den visade karaktären, vilket skyddar gamla formulär efter kontobyte.

Utskick låser alla deltagare i den befintliga deterministiska karaktärsordningen. Kuvert, brevlådekopior, avsändarens Last action och ägarnas uppdateringshändelser sparas atomärt. Sorterade, deduplicerade mottagare och den unika nyckeln `(sender_id, request_id)` garanterar en leverans per mottagare vid samtidiga utskick och återförsök. Återanvänds ett ID med annan text, ämne, mottagare eller annat besvarat brev misslyckas anropet. Bekräftade kvitton går fortfarande att hämta efter en ignore eller vid hastighetsgränsen. Ändringar i ignore-listan tar samma ordnade karaktärslås. Brevlådeåtgärder låser bara sin ägare och signalerar bara när något faktiskt ändras.

Index för mapp, sparat och oläst stödjer ägarens läsningar. Ett GIN-fulltextindex stödjer sökningen och utelämnar medvetet mottagarnamn. Spelets gemensamma snapshot använder fortfarande den lilla frågan `get_message_summary()`, som bara räknar olästa. Antalet brev per mapp hämtas bara på brevsidorna. Brev-ID:n är bigint-strängar genom hela API:et och i webbläsaren.

När en karaktär raderas försvinner dess brevlåde- och ignore-rader och avsändarens främmande nyckel anonymiseras, medan mottagarnas befintliga kopior behåller det historiska avsändarnamnet, tidsstämpeln och texten. Det går inte att svara en raderad avsändare. Raderade brevlådekopior och kuvert finns kvar som privata databasrader; funktionen har inget jobb för gallring eller rensning.

## Återförsök och migrering

En obekräftad utgående begäran sparas i sessionStorage per karaktär med sitt UUID, exakta ämne, text, mottagare och besvarade brev. Efter omladdning, eller när Compose öppnas igen, kan spelaren välja **Retry mail** utan dubbel leverans. Formuläret visar den väntande begäran och går inte att redigera förrän resultatet är känt. Ett svar som har en annan väntande begäran länkar först till Compose. Inget skickas automatiskt när en sida monteras. Utkast under skrivning och hämtad brevhistorik sparas inte i webbläsarens lagring.

Migreringen importerar varje gammalt privat meddelande som ett eget brev med tomt ämne och behåller text, skickad- och lästid och ursprungligt begärans-UUID. Tidigare meddelanden i varje gammal konversation blir besvarade brev i historiken. Upprepade konfigurationsmigreringar nollställer inte läst-, sparad- eller raderad-status och återuppväcker inte raderade brev. De gamla tabellerna finns kvar som privat arkiv, medan de gamla konversations-RPC:erna är borttagna, se [Borttaget konversations-API](#borttaget-konversations-api). Det gamla sessionsutkastet `pending-message:<character>:<recipient>` känns igen när den mottagarens brevskrivare öppnas, även via den gamla länken `/messages/<player-number>`. När ett väntande brev bekräftas rensas bara den matchande gamla begäran, så andra mottagares väntande utskick finns kvar. Enter i mottagarsökningen skickar aldrig formuläret.

## Konfiguration och verifiering

`gameplay.messages` i [gameplay.json](../config/gameplay.json) styr `maxRecipients` (mottagare per nytt brev), `subjectMaxLength` (ämnets längd i Unicode-tecken), `maxLength` (textens längd), `pageSize` (rader per sida), `conversationPageSize` (antal tidigare brev i svarshistoriken; nyckeln har behållit sitt gamla namn) och `perMinute` (mottagarleveranser per avsändare och minut). Varje mottagare i ett utskick till flera räknas mot leveranskvoten, men återspelningar gör det inte. Styrtecken i text och ämne, tom text, ogiltiga listor och för långa värden avvisas både i Server Action och i databasen. Konfigurationsändringar går via sync och append-only lokala migreringar.

Databastesterna täcker behörigheter, integritet mot utomstående och andra mottagare, atomära utskick, mottagargränser, ignore, läst-, sparad- och raderad-status per ägare, begränsad sökning, sidor och historik, import av gamla meddelanden, bevarade tidsstämplar, återförsök, rollback, hastighetsgräns och raderade avsändare. Webbläsartesterna täcker ingången från profilen, utskick till flera mottagare live, svar och historik, sökning och massåtgärder, ignore, mobillayout, Hospital och resa, gömda flikar, förlorade svar, samtidiga återförsök och gamla utkast. Enhetstesterna täcker validering, bigint-sökvägar, kontobindning och sparade begäranden. Aktuella körresultat finns i [implementationsstatus](IMPLEMENTATION_STATUS.md).

## Framtida utskick till fraktioner

Vanlig brevpost är begränsad till `maxRecipients` mottagare per nytt brev. Utskick till en hel fraktion är en separat planerad funktion: en spelare med rätt fraktionsbehörighet ska kunna nå hela fraktionen, även fraktioner med fler än 100 medlemmar. Det ger inte vanlig brevpost en högre mottagargräns, inte ens för fraktionens officerare.

Det framtida utskickskommandot måste kontrollera avsändarens behörighet mot fraktionen och slå upp hela medlemslistan på servern. Det måste använda beständiga, idempotenta leveransjobb i begränsade omgångar i stället för att låsa över 100 karaktärer i en begäran. Utskickens kvoter måste vara skilda från den vanliga gränsen `perMinute`, så att ett behörigt utskick till hela fraktionen kan slutföras. Medlemskap, behörighetsregler och leverans av utskick är inte implementerade än, och ingen fraktionsflagga eller behörighetsgenväg från klienten accepteras.

Redan sparad vanlig brevpost behåller sitt kvitto när en senare konfiguration sänker gränsen. Tolkning och validering av en begäran tillåter historiska mottagarantal upp till det högsta värde som konfigurationen stöder (`maximum` för `maxRecipients` i [schema.json](../config/schema.json), speglat av `MAX_MAIL_REQUEST_RECIPIENTS` i `src/lib/messages.ts`). Databasen avvisar ändå varje nytt brev över den aktiva gränsen. Äldre utkast som inte skickats kan kortas ned till den nya gränsen efter avvisningen.

## Bilden till brevskrivbordet

Bakgrunden är `public/images/mail-parchment.webp`, skapad med det inbyggda bildgenereringsverktyget och kodad som WebP för webbplatsen. Pappersbilden är inte interaktiv; alla ämnen, avsändarnamn, datum och brevtexter är riktig HTML. Användarens egen brevdesign var förlaga för layouten. Den slutliga prompten var:

> Use case: stylized-concept. Asset type: background texture for a readable letter in a
> nautical browser game's mail interface. Generate a single flat front-facing warm cream
> and pale tan antique parchment sheet that fills the complete image, rectangular 5:4
> landscape composition. Subtle natural paper fibers and gently worn darker edges,
> restrained texture so black UI text remains very readable. In the bottom quarter only,
> a faded antique sepia copperplate engraving of a sailing ship at lower left and a tiny
> distant island harbor at lower right with delicate waves connecting them. A very faint
> compass rose in the upper right corner. The center and the upper left 75 percent must
> be spacious blank paper, no writing, lettering, labels, words, interface controls,
> envelopes, folds or objects on top. Soft even lighting, no perspective, no drop shadow
> outside the paper. This is a production background asset, NOT a screenshot or UI
> mockup. No text, no watermark.

## Borttaget konversations-API

De tidigare RPC:erna `send_player_message`, `get_message_inbox`, `get_message_conversation` och `mark_messages_read` är borttagna, både de publika och de privata versionerna (`drop function` i `supabase/templates/gameplay/legacy-mail.sql`). Ingen nuvarande klient använder dem. De gamla tabellerna är fortfarande privata och behåller sina data för idempotent import till den nuvarande brevposten. Den aktiva wrappern `get_message_summary` ligger bland brevpostens läsfunktioner. Komponenterna finns under `src/components/messages/`.
