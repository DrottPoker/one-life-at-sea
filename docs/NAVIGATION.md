# Navigation och laddning

Så snart en vanlig spellänk väntar på svar byter spelet huvudinnehållet mot en laddningsvy. Det väntar inte på nästa serversvar för att visa återkoppling. Sidomenyn markerar målet direkt, behåller sina ikoner och går fortfarande att använda. Den förra sidan är dold och `inert` medan laddningsvyn visas.

## Implementering

- `src/components/game-navigation.tsx`: provider, omslag kring Next.js `Link`, optimistisk menysökväg och innehållsväxling. Bara den aktiva länken kan avsluta vänteläget.
- `src/components/content-loading.tsx`: gemensam laddningsstatus som håller tillbaka bakgrundsuppdateringar.
- `src/components/game-refresh.tsx` / `app-frame.tsx`: skjuter upp bakgrundsuppdateringar medan ett sidbyte, en laddningsgräns eller en spelhandling pågår. Realtidshändelser som redan ingår i den aktuella snapshotens revision kräver ingen extra uppdatering. När realtidskanalen ansluter läser ramen den lagrade händelserevisionen och uppdaterar bara om något har ändrats efter serverrenderingen; en misslyckad läsning uppdaterar ändå. Tidigare uppdaterade ramen vid varje anslutning, vilket kostade en hel serverrendering per sidladdning.
- `src/proxy.ts` / `src/lib/direct-redirects.ts`: hela sidladdningar av vägar som bara skickar vidare (`/`, gamla `/characters/<uuid>` och `/attack/<uuid>`, `/messages/<number>`, `/combat/prepare/<id>`, `/forums/posts/<id>` och `/forums/threads/<id>?unread=1`) får en riktig HTTP-omdirigering innan något renderas. En omdirigering inifrån sidan skulle först strömma sidans laddningsläge. Klientnavigering och Server Actions, som hämtar RSC-data, följer fortfarande sidans egen omdirigering, och sidorna finns kvar som reserv som visar "not found".
- `(game)/layout.tsx`: håller sidomenyn, resurserna och ekonomins begäransjournal monterade mellan spelvyerna.
- `src/lib/supabase/server.ts`: delar en autentiserad klient inom en serverrendering med React `cache`, utan att dela sessioner mellan begäranden.

Använd `GameLink` för länkar i spelramen, även i sidhuvudet och `Pagination`. `AppFrame` håller navigationsprovidern, så en länk i sidhuvudet som **Messages** visar samma laddningsvy och håller tillbaka bakgrundsuppdateringar precis som en länk i sidomenyn. `GameLink` behåller Next.js Links props, prefetch-val, Ctrl-klick, tangentbordsaktivering, omdirigeringar och webbläsarhistorik. Utanför spelets provider fungerar den som en vanlig Next.js Link. Innehållsväxlingen avmonterar inte gamla komponenter innan routern har genomfört bytet, så pågående ekonomihandlingar kan fortfarande registrera sitt resultat. Ekonomins beständiga journal överlever också navigering.

## Spelaridentiteter

Profiler använder `/players/<player-number>` och attacker `/attack/<player-number>`. Gamla UUID-länkar leds om till de vägarna på servern, som HTTP 308 vid hela sidladdningar. Navigeringsreglerna för Hospital och sjön tillåter spelarkatalogen och numeriska profiler på samma villkor som befintliga profiler. Stridslås bär både målets interna UUID och dess publika nummer, så att en gammal attacklänk når sin kanoniska omdirigering utan att hamna i en omdirigeringsslinga.

## Cache och aktualitet

Routern återanvänder layoutsegment, nedladdad kod och prefetchade laddningsgränser. Dynamisk privat data får ingen godtycklig cachelivslängd. Inventory, Gold Coins, marknadens lager, Hospital-status och stridslås använder fortfarande aktuella serverkontroller, invalidering efter mutationer, realtidsnotiser och avstämning som reserv.

React `cache` gäller här bara inom en serverrendering. Det är ingen global autentiserad klient, ingen svarscache mellan användare och ingen ändring av proxyns privata no-store-headers. Oberoende serverkontroller körs parallellt, medan läsningar som ändrar tillstånd fortfarande väntar på autentisering och validering av gameplay-revisionen.

Automatisk prefetch är en produktionsfunktion. Utvecklingsläget på localhost betalar dessutom för kompilering, så jämför verklig navigeringshastighet med ett produktionsbygge.

## Regressionstester

Navigeringstesterna håller medvetet tillbaka serversvar, även alla prefetch-svar för en kall väg. De kontrollerar att bara innehållsytan laddar, stabila menyikoner, att målet markeras direkt, avbrott med tangentbordet, sena svar, Ctrl-klick och profillänkar. Befintliga tester kontrollerar att sidomenyn och resurserna behåller sin identitet, fokusuppdatering under navigering, webbläsarens bakåt och framåt, aktualitet efter mutationer, direkta djuplänkar, innehåll som flödar över (overflow) på mobil och reducerad rörelse.

Den delade layouten och serverklienten påverkar alla spelfunktioner, så ändringar kräver hela webbläsarsviten utöver lint, typer, enhetstester och bygge. Körresultaten redovisas i [implementationsstatus](IMPLEMENTATION_STATUS.md).

Det lätta navigerings-RPC:t avräknar fortfarande förfallna strider, Hospital och resor under de befintliga låsen, utan att läsa in alla resurser, träning eller stridshistorik. Se [prestanda](PERFORMANCE.md) för den bredare granskningen och reproducerbara mätningar.

## Forum

Länken **Forums** i sidomenyn och alla forumvägar (`/forums`, `/forums/search`, `/forums/subscriptions`, `/forums/moderation`, `/forums/settings`, `/forums/boards/<id>`, `/forums/boards/<id>/new`, `/forums/threads/<id>` och `/forums/posts/<id>`) går att använda i Hospital, till sjöss och under resa. Angriparens navigeringslås gäller fortfarande. Forumsidorna är dynamiska serverrenderingar som uppdateras av spelets vanliga uppdatering, och en tråd markeras som läst bara av den monterade, synliga sidan. Se [Forum](FORUMS.md).

## Brevpost

`/messages` och dess vägar `/messages/compose`, `/messages/mail/<id>` och `/messages/ignore` går att använda i Hospital, till sjöss och under resa. Angriparens befintliga navigeringslås gäller fortfarande. Sidhuvudet har länkarna **Messages** och **Notifications** med antal olästa; ingen av dem finns i sidomenyn. Gamla brevlänkar med spelarnummer leds om till **Compose**.

Länkar till ett brev behåller vald mapp, sökning och sida. Brevpostens gemensamma arbetsyta läser mappen och det begärda brevet samtidigt genom RPC:er som är begränsade till ägaren. En djuplänk till ett skickat brev utan mappen leds om till brevets kanoniska Outbox-adress. På breda skärmar ligger listan bredvid brevet; smala layouter växlar mellan lista och brev. Brevraderna navigerar med Next-länkar som visar vänteläget i raden, behåller det nuvarande skrivbordet tills navigeringen är genomförd och håller tillbaka bakgrundsuppdateringar under bytet. Prefetch av länkar hämtar ingen brevtext, och en serverläsning markerar inget som läst. Bara det monterade, synliga brevet kvitterar läsningen. Se [Brevpost](MESSAGES.md) för brevpostens beteende.
