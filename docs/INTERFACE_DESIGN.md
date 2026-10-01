# Gränssnittsdesign

Ägarens mockup från september 2026 är en visuell referens, inte en ny funktionsspecifikation.
Befintligt spelbeteende, laddning av rutter, reselås och auktoritativt resurs- och
ekonomitillstånd ligger kvar.

## Ram och bilder

- Den centrerade spelramen är högst 1240px bred, med en sidopanel på 232px på desktop.
- `public/images/harbor-background.webp` är en optimerad kopia av ägarens
  `ChatGPT Image 21 sep. 2026 03_31_20 (1).png` (1672 x 941).
  Originalfilen i Downloads är oförändrad.
- Klockan 21:00-06:00 UTC använder bakgrunden den levererade matchande nattbilden
  i `public/images/harbor-background-night.webp` (1672 x 941, 341932 byte).
  Servertiden väljer första renderingen och en öppen sida byter automatiskt.
  Se [dag och natt](DAY_NIGHT_CYCLE.md).
- Ett dekorativt fast lager, `body::before`, ritar bakgrunden bakom ramen.
  Dokumentet har en enda rullningslist; spelinnehållet rör sig och miljön står still.
  Inga scroll-lyssnare, inget parallaxskript och ingen inre rullning i spelet.
- Under den breda brytpunkten utelämnas den dekorativa bakgrunden så att innehållet får
  företräde. Den kompakta layouten använder hela skärmen med navigation i tre kolumner.
- Den lokala hamnillustrationen (`public/images/harbor.webp`) är inte längre välkomstbild;
  The Harbor öppnar med [sidbannern](#sidbanners-24-september). Illustrationen visas som låg
  banner när karaktären skapas och på platser som ännu inte är öppna, och som bild på
  inloggnings- och registreringssidorna. Dessa har egna höjdregler.

## Visuellt språk

Djupt marinblå ytor, varma guldaccenter, cyan länkar, tunna ramar och återhållsamma
serifrubriker följer den levererade referensen. Täta tabeller, formulär och
föremålsdetaljer behåller sans-serif-text.
Kaptenens identitet och aktuella resurser delar ett kort i sidopanelen: porträtt, namn,
aktuell plats och länken My Profile, sedan Gold Coins som en stor siffra. Player ID och
skapandedatum finns på profilen, och ingen rangtitel visas bredvid namnet. Se
[profilen](#profile-september-25) för porträttet.
Crew Morale delar kortet med Energy och hälsan. Dess stapel har en fast mittpunkt vid noll,
grön fyllning åt höger för positiva värden och korallröd fyllning åt vänster för negativa.
Ett värde med tecken och en decimal samt en tillgänglig mätare visar det exakta läget.
Resursstaplarna ligger i ett rutnät med två kolumner på mobil.

Resursbeskrivningar visas i korta tooltips vid hovring, tangentbordsfokus eller tryck.
Tooltipen stannar öppen medan pekaren är över den och stängs med Escape eller ett tryck
utanför. På desktop ligger tipsen bredvid stapeln; på mobil öppnas de ovanför den.
Återhämtningstext och tidpunkter för nästa tick visas inte i kortet. Serverns deadlines
styr fortfarande de automatiska resursuppdateringarna. Hälsotipsen följer
återhämtningsreglerna för strid och Hospital; moralen visar aktuella stats och effekten på
träning.

Avgångarna från hamnen syns tydligt direkt under bannern. Kaptenslistan och hamnens
destinationer ligger sida vid sida på breda skärmar och staplas vid smalare bredder.
Marketplace är korrekt märkt Open.

Det finns inga platshållarmeddelanden, uppdrag, dagliga mål, marknadsnoteringar eller
annan påhittad data från mockupen.

## Länkar och namn

Länkar och länkade spelarnamn är aldrig understrukna, inte heller vid hovring, fokus,
aktivt eller besökt läge. Det gäller inloggning, spel, notiser, stridsrapporter och
administration. Knappar i textstil följer samma konvention. Länkar behåller sina färger,
sin hovringsrespons och synliga fokusramar för tangentbord. Regeln hålls i den gemensamma
gränssnittsmallen och i adminpanelens stilmall.

Profilrubriker visar `Name [ID]`, med numret mindre än namnet. Den 12px stora
närvaropricken och dess etikett (Online, Idle eller Offline) inleder statusraden under
rubriken; pricken bär den tillgängliga etiketten. En diskret vertikal gradient gör
prickens nedre kant mörkare för djup i varje statusfärg. Långa namn radbryts utan att
numret inom hakparentes delas. Players-katalogen visar namn utan separata publika
nummerbrickor. Anslutningsindikatorn och prickarna för olästa notiser har samma skuggning.
Markörer för lästa notiser förblir genomskinliga.

## Underhåll

Ändra `config/theme.css` för palett, typografi, ramstorlek, sidopanelens bredd,
bannerhöjd och bakgrundsbildernas sökvägar för dag och natt (`--o-background-image`,
`--o-night-background-image`). Ändra `config/interface.css.template` för
komponentlayout och kör sedan `npm run config:sync`. Redigera inte den genererade
stilmallen för hand. Gemensam rendering finns i `shell.tsx`, spelets layout och
`resource-bars.tsx`.

Framtida 2D-grafik kan läggas till utan att navigationen eller spellogiken byggs om.
Behåll originaluppladdningarna orörda och använd optimerade lokala filer i applikationen.

## Verifiering

`tests/e2e/design.spec.ts` täcker fast miljö mot rullande innehåll, kompakt bannerhöjd,
responsivt överflöde, synliga resurser och navigering genom vyerna för inventarier,
marknad, besättning och skepp. Skärmdumpar skrivs till ignorerade `.local/design-*.jpg`
för visuell granskning. Befintliga interaktionssviter täcker den underliggande
funktionaliteten.

<a id="combat-presentation"></a>
## Stridspresentation

Attackrutten har en egen ram i marinblått och mässing, skild från administrationens ram.
Den behåller den fasta hamnbakgrunden på breda skärmar och saknar den vanliga
spelnavigationen under strid.

- `CombatHeading` visar Energy, den aktuella deltagarens fas och runda samt den
  serverförankrade deadlinen för order. Timern använder den befintliga nedräkningshooken.
- `CombatStage` delas av förberedelse och aktiv strid. Den egna och motståndarens
  kaptenspanel flankerar bilden på desktop. Under stridsbrytpunkten flyttas bilden ovanför
  de två panelerna; på mobil staplas orderknapparna vertikalt.
- `public/images/combat-sea-broadside.webp` och `combat-boarding-duel.webp` är ägarens
  scenbilder i 1774 x 887 (2026-09-24): två piratskepp i sidoprofil och två duellanter på en
  äntringsplanka. Angriparen ritas alltid till vänster, försvararen till höger. Ny grafik får
  ett nytt filnamn så att bildcacher aldrig serverar den gamla versionen.
- Bilden fungerar också som träffvisning (`CombatScene`). Betraktarens senaste egna runda
  spelas upp på den: kanoneld, Chain Shot, Grape Shot, närstrid, skjutvapen, Grenado och
  Smoke Pot har var sin effekt byggd av fyrkantiga pixlar. Skadan stiger från nedslaget, och
  en etikett under den träffade sidan visar resultatet till nästa runda. Etiketten är text på
  bilden, inte en ruta: zonen i kapitäler i displayserifen, sedan skadan som en större siffra
  i resultatets färg (röd, guld för kritisk träff med ett guldfärgat Critical framför, vit
  Blocked, blå Blinded, grå kursiv Miss), över en mjuk skugga med en tunn linje i samma färg
  som tonar ut under. På scener smalare än 420 px håller sig varje etikett vid sin egen kant.
  Missar plaskar bredvid skeppet, pareras mellan klingorna eller landar bredvid målet.
  Angriparens slag spelas först, sedan försvararens.
- En träff landar på en slumpad punkt inom den träffade zonens område, till exempel valfritt
  segel för Sails and rigging eller något av benen för Legs, och effekten spelas där.
  Punkten seedas av rundan, så en omladdning visar den på samma ställe. Varje slag lämnar ett
  litet sikte som Torns, som låser där det landade: rött för skada, guld för kritisk träff,
  vitt för blockerad träff, blått för Smoke Pot och grått för miss. Missar landar runt målet
  i stället för på en punkt: kanonkulor i vattnet längs skeppets sida, framför bogen, bakom
  aktern eller längre ut; skott från skjutvapen i utrymmet runt kaptenen (ovanför huvudet,
  bredvid huvudet och midjan, mellan benen); hugg pareras antingen mellan klingorna, med
  gnistor, eller undviks bredvid kaptenen; kast landar längs plankan. Tidigare slag i
  betraktarens rundor i samma fas står kvar som mindre ringar med en prick i samma färger,
  bleknar med åldern och ligger på den sida de siktades mot.
- Bara rundor som kommer medan sidan är öppen animeras; en omladdning visar märken och
  etiketter stilla. En runda som byter fas avslutas på sin egen bild innan den nya fasen
  tonar in. Andra angripares rundor stannar i loggen.
- Effekterna använder små pixlar (cirka 10-14 bildpixlar, 3-4 på skärmen) så att de matchar
  bildens detaljnivå; explosioner är täta moln som är hetast i mitten. Skadesiffrorna stiger
  strax efter och ovanför nedslaget så att explosionen syns.
- Rundan som avslutar mötet spelas upp i sin helhet. 0,5 sekunder efter att effekterna
  tonat bort (`FINALE_DELAY` i `combat-scene.tsx`) mörknar bilden, VS-märket tonar ut och en
  centrerad ruta visar utfallet (Victory, Defeat, You withdrew eller Draw) med en Leave-knapp
  som får fokus. Stridsloggen öppnas först när spelaren väljer Leave; orderpanelen och
  rubrikens tillbakalänk är borta under tiden. När slutrundan inte är ny för vyn, till
  exempel en annan angripares avgörande slag, följer rutan efter samma korta paus.
- Texten under bilden beskriver rundan i ord, till exempel "Round 3: You hit their sails
  and rigging for 12 and slowed their ship. Bo missed.", och läses upp för skärmläsare utan
  att avbryta. XP från rundan visas i det gemensamma XP drop-kortet, som beskrivs nedan. Med
  reducerad rörelse visas märken och etiketter utan effekter.
  VS-märket sitter i himlen överst i mitten, fritt från effekterna.
- Träffområden (en eller flera ellipser per zon, däck, plask och landningsplats) och
  ankarpunkter för kanoner, händer och etiketter finns i `src/lib/combat-scene-anchors.ts`, i
  bildens egna pixlar. Kalibrera om dem när grafiken ändras; enhetstester kontrollerar att
  varje konfigurerad träffzon har ett område inuti bilden och att träffar alltid landar inom
  det. `src/lib/combat-scene.ts` gör om en runda till slag, etiketter och bildtext.
  Effektfärgerna är `--o-fx-*`-tokens i `config/theme.css`.
- Scenen följer den aktuella angriparens auktoritativa fas, inklusive återgång till sjöss
  efter Disengage. Den härleder inte fasen från den senast klickade knappen eller från en
  annan angripares fas.
- Hälsa, utrustning och relevanta stats för skepp och besättning förblir synliga.
  Motståndarens stats och ammunition förblir dolda; motståndarens utrustning är okänd innan
  man ansluter. Vimplarna är dekorativa neutrala ikoner, inte spelar- eller fraktionsdata.
- Primära attacker är guld, boarding och Disengage blå och Retreat dämpat röd. Alla
  kontroller behåller textetiketter, tangentbordsfokus, vänteläge och inaktiverade villkor
  för ammunition och start. Boarding erbjuder Crew attack, Disengage och Retreat.
- Den kompakta loggen och deltagarpanelerna behåller tidsstämplar, bidrag, deltagarnas
  tillstånd och profillänkar.
- Stridsloggen läses som en tidslinje både i attackvyn och i den publika rapporten: en
  markör per händelse på en vertikal linje (flagga för starten, skepp för kanonstrid,
  korsade svärd för boarding, hjärta för Hospital), blå eller guldfärgade rubriker efter fas
  och varje order i linjerade kolumner för kapten, order och resultat. Träffar är guld,
  kritiska träffar fet guld, missar och blockerade träffar dämpade, och den avgörande
  händelsen är markerad. Smala skärmar lägger kaptenen på en egen rad och låter ett långt
  resultat hamna under ordern.
- Den publika rapporten (`/combatlog/<id>`) inleds med en banner med bilden från fasen som
  avgjorde mötet, utfallet som rubrik, vem som gav det sista slaget, när striden utkämpades
  och hur länge den varade, samt Copy public link. Under den står angriparna mot försvararen
  som kort med ett VS emellan: roll, resultatmärke, träffar och skada som stora siffror samt
  staplar för Ship Health och Crew Health efter striden. Hela tidslinjen följer utan inre
  rullning, och noten om överlevnad i PvP avslutar sidan.

Stridsgrafiken serveras genom Next Image med uttryckliga mått och responsiva storlekar.
Ingen bildgenerering eller externt beroende för bilder behövs. Ändra stridsfärgerna i
`config/theme.css` och synka sedan de genererade stilarna.

Den befintliga `tests/e2e/combat.spec.ts` kör förberedelse, båda fasbilderna, riktiga
order, omladdningar, publika rapporter och bredder från 320 till 1680px. Den skriver
ignorerade skärmdumpar till `.local/attack-*.jpg`. Med garanterade träffar kontrollerar den
scenens zoner, etiketter och bildtext för slag med chain, grape, grenado, pistol och
närstrid samt överlämningen till boarding, och fryser rundanimationen för att skriva
bildrutor till `.local/scene-*.png`. Sviten för stridens handlingslås täcker försvararens
begränsningar oberoende av presentationen.

Stamina visas efter Energy bland tillstånden i sidopanelen, med ett grönt spår och samma
tillgängliga tooltip vid hovring, fokus och tryck som de andra resurserna. Tooltipen visar
bara återhämtningsregeln och syftet.

Profiler visar offentlig Character Level bredvid Player ID. Bara profilens ägare får kortet Skills:
sju kompakta rader med nivå, total XP, en förloppsstapel och XP till nästa nivå. Skills på
högsta nivå visar Maximum level. Crew Battling och Ship Battling har en extra rad med sin
bonus till maximal hälsa och vad nästa nivå lägger till. Andra spelare får varken kortet
eller den underliggande privata datan.

XP drop använder spelets egen panelstil i stället för ett separat utseende: de flytande
panelernas mässingsram, marinblå ytgradient och hårda förskjutna skugga, skillens ikon och
namn i guld, ökningen i displaytypsnittet med samma fyrkantiga pixelkontur som stridens
skadesiffror, det vanliga resursspåret samt nivå och total XP i liten text. En nivåhöjning
gör nivåraden guldfärgad. Kortet glider in en gång, pulserar ökningen när mer XP kommer,
räknar upp ökningen och totalen medan stapeln stiger, stannar i fem sekunder efter den
senaste ökningen och tonar sedan ut. Det ignorerar pekaren, och reducerad rörelse tar bort
rörelsen. Se [Skills](SKILLS.md#xp-drop) för när det visas.

Activities är ett mål i sidopanelen och en post i hamnkatalogen. Tre rader visar en
tematisk ikon, beskrivning, skillnivå och XP-förlopp, belöning och handlingsknapp. Desktop
använder en rad med tre kolumner; mobil lägger knappen under detaljerna. Resultattexten
står kvar på raden i reserverat utrymme. Vanliga aktivitetsförfrågningar använder den
befintliga journalen utan att återhämtningsbannern blinkar.

Admin har nu uppgiftsorienterad navigation, genvägar på översikten, en föremålskatalog och
egna formulär för föremål, loot och aktiviteter. Förhandsvisningen av loot visar procent per
lyckad fångst. Responsiva kort, läsbara fältetiketter och grupperade databasresurser
ersätter den databasfokuserade startpunkten. Granskningsvyer visar läsbara värden med
teknisk JSON ihopfälld. Pågående sparningar i admin visar inte återhämtningsbannern.

## Crew Training, 23 september

Ägarens banner med träningsdäcket på natten och fyra genomskinliga guldikoner är
optimerade WebP-filer i `public/images/training/`. Den levererade originalgrafiken är
oförändrad. En panoramabanner leder in i den levande översikten i sex delar och fyra
färgade statkort. Samma konfigurerade Energy-kostnad visas diskret i varje kort. Korten
visar aktuella stats och Train-knappar med bara text, utan förhandsvisning av ökningen.
Varje kort har ett eget levande resultat ovanför knappen, med reserverat utrymme så att
layouten inte flyttar sig. Bekräftade serverkvitton anger faktiska ökningar och Perfect
Drill-utfall. Återkoppling för väntan, fel och nytt försök stannar i samma kort, utan någon
gemensam resultatpanel för träningen. Ingen Energy-väljare eller batchmängd införs.
Ekonomijournalen låser fortfarande alla övningar medan en förfrågan är oavgjord.
Kompakt kortavstånd lägger Energy direkt under beskrivningen med 5px mellanrum.
Statbilderna är 98px; bekräftade ökningar visas i framträdande 20px halvfet grön text.
Resultatplatsen håller knapparna i linje utan att lägga till tomrum före Energy-kostnaden.
Sedan 24 september har varje kortrad en fast storlek, så ett resultat ändrar aldrig
kortets höjd: beskrivningen reserverar två rader, resultatplatsen är en fast rad på 38px
(ökningstexten skalar med sidan och kortas av, text för väntan och fel begränsas till två
rader), statvärdena står på en rad, en Perfect Drill visas som ett märke i kortets hörn och
en knapp för nytt försök ersätter Train-knappen. Besättnings- och skeppskort mäter därför
lika vid varje bredd. Matchande hörnaccenter på 18px ramar in alla fyra hörnen.

Drill Schools visar alla tio konfigurerade nivåer med lägena aktiv, ägd och låst, förlopp i
procent och nästa tillgängliga köp. Den högsta köpta nivån är automatiskt aktiv. Guiden
bredvid använder de verkliga inställningarna för Energy, moral och Perfect Drill. Stabila
träningsformulär behåller väntelås, köpresultat och återhämtning med nytt försök.
Brytpunkter på containern går från fyra kort till två och sedan ett, och fäller ihop
översikten och skolorna utan horisontell rullning.

## Ship Upgrades, 24 september

Ship Upgrades använder Crew Trainings layout genom gemensamma komponenter i
`src/components/training/training-layout.tsx` och `training-tiers.tsx`, med de generiska
klasserna `o-training-*`. Banner, översikt, statkort, Shipyard Workshops och guide speglar
besättningssidan. Båda sidorna bygger varje kortinnehåll med `TrainingStatBody`: en
kostnadsnot, den reserverade resultatplatsen på en rad och kortets handling, så alla kort
har samma höjd i varje läge. Skeppets statkort är valbara radiokort; Work Order nedanför
har Energy-reglaget, förhandsvisning av ökningen, material och Start work. Under ett jobb
visar kortet för den staten förväntad ökning i sin resultatplats och nedräkningen i stället
för knappen, och Work Order ersätts av det pågående jobbet.
Grafiken återanvänder tills vidare besättningsträningens bilder som platshållare,
definierade i en konstant i `ship-upgrade-panel.tsx`.

## Sidbanners, 24 september

The Harbor, Hideout, Crew Training, Ship Upgrades, Activities, Inventory, Hospital, Tavern,
Bank och Marketplace öppnar med samma banner (`PageHero` i `src/components/page-hero.tsx`,
klasserna `o-page-hero-*`): bild, sidans `h1`, en kort ingress och en ikon. Bannern har en
fast höjd (158px, 168px i smala containrar) på varje sida och är sin egen size container,
så den ser likadan ut i och utanför träningslayouten. Bannern ersätter den tidigare
paneltiteln på de sidorna, och på The Harbor ersätter den den tidigare panelen med
välkomstbilden (hälsningen "Welcome ashore" är nu bannerns ingress); `Panel` renderas utan
titelrad när ingen titel anges. Marketplace behåller sin länkrad under bannern på alla
marknadsrutter. Sidor utan egen grafik använder `PLACEHOLDER_HERO`
(`public/images/headers/harbor-placeholder.webp`, ägarens hamnscen omkodad till cirka
295 KiB) och sin navigationsikon; byt `image`-propen per sida när slutlig grafik finns.

<a id="profile-september-25"></a>
## Profil, 25 september

Profilen följer ägarens mockup från 25 september som referens, inte 1:1, på en sida utan
flikar. `/players/<number>` öppnar med en bildbanner (`o-profile-hero`):

- `public/images/headers/profile-harbor-dusk.webp` är ägarens hamn i skymning, 2000 x 667,
  oförändrad. En mörk gradient från vänster håller texten läsbar; skeppet syns till höger
  och på smala skärmar.
- Kaptenens valda porträtt sitter i en guldram. Ägaren levererade tre pixelkonstporträtt i
  1086 x 1448 som används oförändrade: Harbor Rover (`harbor-rover.webp`, standard), Old Salt
  och Red Corsair. Katalogen är `gameplay.portraits`; se
  [profilreglerna](CHARACTER_PROFILES.md#porträtt). Sidopanelen visar samma porträtt, som
  också länkar till profilen.
- På den egna profilen öppnar en rund pennknapp i porträttets nedre högra hörn galleriet:
  en modal med varje porträtt som radiokort, det nuvarande märkt Current och valet inramat i
  guld. Save portrait aktiveras när ett annat porträtt har valts; ett sparat val stänger
  dialogen, återför fokus till knappen och meddelas som Portrait saved. Escape och Cancel
  stänger utan att spara. Galleriet använder den gemensamma `GameDialog`
  (`src/components/game-dialog.tsx`), som även forumets dialoger bygger på.
- Bredvid porträttet: `Name [ID]`, en statusrad med närvaro, plats (eller In hospital med
  återstående tid) och tre nyckeltal: Level, Character age och Max sea distance. Andra
  kaptener har Send message och Attack uppe till höger i bannern.

Under bannern finns kort med guldfärgad rubrik i versaler för resten: Details (Last action,
At sea since, Forum posts, Forum karma), sedan Defense orders och Skills, som bara syns på
den egna profilen. Där står Details och Defense orders bredvid Skills när huvudkolumnen är
bred; andra profiler visar Details-raderna i två kolumner över hela bredden. Defense orders
visar den sparade orderns ikon bredvid den befintliga väljaren och knappen Save orders.

Sidan är sin egen size container: vid 640px krymper porträttet och knapparna flyttas ned,
vid 440px flyttas nyckeltalen under porträttet och vid 340px staplas väljaren i Defense
orders. Det finns ännu ingen rangtitel eller biografi. Namnförhandsvisningen vid
registrering visar namnet utan prefixet Captain.
