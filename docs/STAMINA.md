# Stamina

Stamina är resursen för yrkesaktiviteter och är skild från Energy. Startsaldot och taket för naturlig
återhämtning är 50; lagringsgränsen är 200. Varje aktivitet kostar 1 Stamina. Återhämtningen ger 1 vid
fasta femminutersgränser i UTC (:00, :05, :10 och så vidare), även offline, under resa, till sjöss, på
Hospital och i strid. Ingen återhämtning sparas över taket. Administrativa tillägg kan fylla på upp till
200. Överskottet behålls, men återhämtningen står still tills saldot är under 50 igen. Värdena är heltal.
En tom mätare behöver 50 tick (cirka 4 timmar och 10 minuter) för att fyllas.

Ägaren valde Stamina för Fishing, Logging, Foraging, Cooking, Crafting och liknande skills. I dag kostar
bara [Activities](ACTIVITIES.md) Stamina: Shore Fishing, Foraging och Logging drar den per försök, både vid
fångst och miss. XP per försök beskrivs där. [Crafting](CRAFTING.md) kostar för närvarande ingen Stamina,
bara ingredienser. Skill-XP, nivåer och profilvisning beskrivs i [Skills](SKILLS.md).

Matkonsumtion är inte implementerad, och hur mycket Stamina mat ska återställa och vilka gränser som ska
gälla är inte bestämt. Träning, strid, resor och scouting använder sina befintliga Energy-kostnader.
Tavernans måltider påverkar fortfarande Crew Morale.

## Konfiguration och lagring

Alla balansvärden ligger under `gameplay.stamina` i [config/gameplay.json](../config/gameplay.json):
`maximum`, `storageMaximum`, `recoveryAmount`, `recoverySeconds` och `activityCost`. Schemat kräver
positiva heltal och kontrollerar kostnad och återhämtning mot kapaciteten. Den genererade migrationen
lägger till `characters.stamina` och `stamina_updated_at`. Befintliga karaktärer fick full mätare en gång;
senare configsynkningar fyller aldrig på befintliga saldon. Att sänka lagringsgränsen under ett sparat
saldo misslyckas i stället för att radera spelarens överskott.

`private.stamina_snapshot` räknar UTC-gränser sedan senaste avräkningspunkt, returnerar återhämtat saldo
och nästa deadline och tål en avräkningspunkt i framtiden utan att ge extra återhämtning. `get_game_state`
visar spelarens eget saldo och deadline. Den gemensamma `GameStateProvider` schemalägger serveruppdateringar.
Ingen klientklocka ger resurser och inga periodiska skrivningar för alla spelare behövs. Sidomenyn visar en
grön mätare efter Energy, med en kort beskrivning vid hover, fokus eller tryck och utan tidsstämpel.

## Koppling till aktiviteter

`private.spend_activity_stamina(target_id)` låser karaktären i den gemensamma låsordningen för strid, läser
servertid efter låset, avräknar återhämtningen och drar konfigurerad `activityCost`. Den nekar för lågt
saldo (`INSUFFICIENT_STAMINA`) och kontrollerar att det inloggade kontot äger karaktären. Funktionen har
ingen execute-behörighet för klienter och ingen publik RPC.

`private.perform_activity` anropar den i samma transaktion som inventory- och XP-belöningarna, efter att
det beständiga idempotenskvittot, platsen och övriga aktivitetsregler har kontrollerats. En återspelning
returnerar det sparade kvittot utan att dra Stamina igen. Rullas aktiviteten tillbaka rullas även
Stamina-avdraget tillbaka. Hjälparen skickar den befintliga uppdateringsnotisen till spelaren. Nya
handlingar som kostar Stamina ska följa samma mönster.

Administratörer kan ändra Stamina i det befintliga granskade gränssnittet, se [adminpanelen](ADMIN_PANEL.md);
en ändring sätter en ny avräkningspunkt för återhämtningen. Vanliga spelare kan inte ändra saldot eller
tidsstämpeln direkt.

## Verifiering

`supabase/tests/resource-overflow.test.sql` täcker dessutom överfyllnad, administrativa tillägg,
förbrukning, återförsök, återupptagen återhämtning och hårda gränser för båda resurserna.

`supabase/tests/stamina.test.sql` täcker gränser, midnatt, återhämtning offline, tak, avräkningspunkter i
framtiden, förbrukning, för lågt saldo, ägarskap, åtkomstkontroll, återhämtning i spelläget, resor och
adminändringar. Databastestet med alternativ config ändrar kapacitet, återhämtning och aktivitetskostnad.
Webbläsartestet täcker mätaren, tooltipen, liveuppdatering, responsiv layout och att Stamina är oberoende av
Energy för Crew Training.
