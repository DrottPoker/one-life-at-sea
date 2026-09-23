# Träning och progression

Uppdaterat och implementerat lokalt 2026-09-23. Balansen kommer från [gameplayconfig](../config/gameplay.json).
[Implementationsplanen](TRAINING_PROGRESSION_PLAN.md) är designunderlaget. Skeppsarbete förbrukar nu material.

## Spelregler

Crew och skeppet behåller fyra stats: Attack, Defense, Speed och Accuracy.
Nya karaktärer börjar med 10 i varje stat. Befintliga stats, hälsa, Energy och guld bevaras.
Energy återhämtas med +5 på serverns fasta femminutersticks i hamnen, även offline, till högst 100.
Till havs gäller fasta tiominutersticks. Energy lagras alltid som heltal. Se [Energy](ENERGY_RECOVERY.md).

- Crew: 5 Energy ger en statberoende ökning direkt och 5 XP. Perfect Drill har 1 % chans
  att dubbla statökningen, utan extra XP.
- Skepp: välj stat och Energy med en slider från 5 till aktuell Energy, i heltalssteg.
  Varje Energy tar sex sekunder, alltså 30 sekunder per 5 Energy. Betala vid start och få stats/XP vid sluttiden.
  Ett pågående arbete åt gången, utan kö eller automatisk upprepning.
  Materialkostnaden är 1 Oak Plank och 1 Iron Nail per påbörjade 5 Energy.
  Exempel: 5 Energy kostar 1 av varje, 6 kostar 2 och 50 kostar 10.
- Slidern följer saldot när det ändras och låses tillsammans med startknappen under 5 Energy.
  Kostnad, tid och statökning visas direkt. Servern kontrollerar det återhämtade saldot vid start.
- Crew och Ship använder samma statberoende kurva, men Ship har 2x grundökning
  per Energy vid samma stat och workshop-effektivitet. Crew får dessutom -5 % till +5 %
  från aktuell Crew Morale och förbrukar 0,5 moral per Energy. Ship påverkas inte av
  moral eller Perfect Drill. Båda sparar decimaler.
- Varje Energy räknas separat med virtuell statökning under jobbet. Ett arbete för
  100 Energy ger exakt samma normala belöning som tio sekventiella arbeten för 10 Energy
  på samma stat och nivå, utan andra stat- eller balansändringar mellan jobben.
- Crew och skepp har separata kumulativa XP-spår. Varje spår delas av gruppens fyra stats.
  Ett XP per investerad Energy. XP förbrukas inte vid köp.
- Nästa övning/workshop kräver både XP och Gold Coins på karaktären. Bankpengar räknas inte.
  Steg köps i ordning och den högsta köpta nivån används automatiskt.
- En workshop kan köpas under ett arbete. Jobbet behåller sin ursprungliga ökning, XP och tid.
- Aktiva angripare, försvarare och sjukhuspatienter kan inte träna, starta arbete eller köpa nivåer.
  Försvarare kan läsa träningssidorna medan formulären är låsta, även över flera flikar.
  Redan startat arbete fortsätter under strid, sjukhusvistelse och offline.

Oak Planks och Iron Nails tas från spelarens inventory när skeppsarbetet startas.
Crew Training kostar fortfarande endast Energy. Consumables och utrustningsbonusar
ingår inte i träningen. Nya karaktärer börjar med 0 Gold Coins.
Ingen publik funktion för att skapa testpengar har införts.

## Progressionsvisning

Crew och skepp visar endast en progressionsmätare från 0 till 100 % för upplåsning.
Intjänad XP, XP-krav, återstående XP och XP-belöningar visas inte i spelgränssnittet,
inklusive träningsresultat och pågående/färdiga skeppsjobb. Vid slutnivån visas 100 %.
XP räknas fortfarande internt och köpkraven är oförändrade. Mätaren når 100 % först
när nästa nivå är upplåst; tidigare procenttal avrundas nedåt.

## Exakt beräkning

Låt S vara den valda statens permanenta värde före handlingen och M nivåns effektivitet.
Beräkningen görs i databasen med numeric, en gång för varje betald Energy:

```text
gain = 0
repeat E times:
    unit = round((M / 5) * (1 + (S + gain) / 1000)^0.6, 6)
    gain = gain + unit
```

Round avrundar till närmaste värde med sex decimaler; exakt halva avrundas uppåt för
dessa positiva värden. Nästa Energy räknas från S plus den hittills beräknade ökningen.
Ingen avrundning till heltalsstats sker. Befintliga sparade stats skrivs inte om.

För Crew är E = 5. Grundökningen multipliceras en gång med

`1 + morale_before / 100 * 0,05`

och avrundas till sex decimaler. Moralen före passet används; efteråt dras
2,5 moral, med golv -100. Den tillfälliga stridsbonusen ingår aldrig i S.
Efter moralberäkningen drar servern ett slumputfall:
under 0,01 ger Perfect Drill och exakt dubbla normalökningen; annars vanlig ökning.
Bonussen läggs på hela passet en gång. Den ger varken extra XP eller en ny intern
omräkning under samma pass. Efterföljande pass räknas från den nya permanenta staten.

För Ship är E vald heltalsmängd mellan 5 och tillgänglig Energy, högst lagringstaket
1 000; normal återhämtning stannar vid 100. I algoritmen ersätts M med
`M * shipGainMultiplier`, där multiplikatorn är 2. Den läggs alltså på varje Energy,
så ett stort jobb och flera mindre jobb behåller samma totala statökning. På grund
av den virtuella statökningen blir ett helt jobb något mer än exakt två gånger
ett omultiplicerat jobb. Ingen moraleffekt eller Perfect Drill gäller Ship.
Jobbets belöning, XP, förbrukade material och sluttiden E * 6 sekunder senare sparas
vid start. Nivåköp eller balansändringar räknar inte om redan startade jobb.

Formeln `M * (1 + S / 1000)^0.6` är en nära uppskattning för fem Energy.
Den exakta algoritmen ovan inkluderar även den lilla ökningen mellan Energy-enheterna.
Exempel på Crew-pass för fem Energy vid neutral moral, utan Perfect Drill
(Ship använder två gånger tabellens M i den exakta algoritmen):

| Stat före passet | Nivå 1, M = 1 | Nivå 10, M = 3 |
| ---: | ---: | ---: |
| 10 | 1,006230 | 3,020129 |
| 100 | 1,059097 | 3,178760 |
| 1 000 | 1,515992 | 4,549630 |
| 10 000 | 4,215757 | 12,649595 |
| 100 000 | 15,944440 | 47,836945 |
| 1 000 000 | 63,134540 | 189,409355 |

Ett första Crew-pass på Attack 10 ger alltså 11,00623, eller 12,01246 vid Perfect Drill.
Ett Ship-jobb på Attack 10 i första workshopen för 5 Energy ger +2,012938 efter
30 sekunder och kostar 1 av varje material. För 6 Energy blir ökningen +2,415814
efter 36 sekunder, med 2 av varje material. XP är fortsatt 1 per Energy.
Ökningen i absoluta tal växer med staten, medan ökningen i procent av staten avtar.

Utrustningsvärden och tillfälliga stridsbonusar ingår inte i S. Crew Training
sänker moralen, men ändrar inte hälsan. Moralen rör sig 5 mot 0 på fasta
femminutersticks och kan höjas i tavernan. Se [Crew Morale](CREW_MORALE.md).

## Nivåer och ekonomi

Båda spåren använder följande trappa, men har egna namn, köpta nivåer och XP.
Effektivitet ersätter den gamla fasta belöningen, som tidigare gick från 1 till 1 500.
XP-krav och priser är bevarade. Ship multiplicerar tabellens M med 2 vid beräkning
av statökning. Tabellen visar priset för just det köpet, inte totalsumman.

| Nivå | Effektivitet M | Kumulativt XP-krav | Gold Coins |
| --- | ---: | ---: | ---: |
| 1 | 1,00 | 0 | 0 |
| 2 | 1,15 | 100 | 250 |
| 3 | 1,35 | 500 | 1 000 |
| 4 | 1,55 | 1 500 | 4 000 |
| 5 | 1,80 | 4 000 | 15 000 |
| 6 | 2,05 | 10 000 | 50 000 |
| 7 | 2,30 | 20 000 | 150 000 |
| 8 | 2,55 | 40 000 | 500 000 |
| 9 | 2,80 | 65 000 | 1 500 000 |
| 10 | 3,00 | 100 000 | 5 000 000 |

Första nivåköpet kan låsas upp med startens 100 Energy, alltså 20 Crew-pass.
Alla nivåköp kostar tillsammans 7 220 250 Gold Coins per spår. Priserna behöver
kalibreras mot den framtida guldintjäningen; de är inte en färdig ekonomimodell.

Crew visar faktisk ökning först efter träning. Ship visar beräknad normalökning för vald
stat/arbetsstorlek. Båda visar aktuellt statvärde och nivåns effektivitet. Stats under 10 000 visas med högst två
decimaler; från 10 000 visas avrundade heltal. Alla träningsökningar visas med högst
två decimaler även när ökningen överstiger 10 000. Onödiga slutnollor visas inte.
Detta gäller bara presentationen: intern precision, sparade stats och kvitton är oförändrade.
Crew-korten staplas på små skärmar och värden kan radbrytas. Ships förhandsvisning använder JavaScript-tal;
databasens numeric-beräkning och sparade kvitto avgör alltid utfallet. Vid mycket stora
stats nära den tekniska gränsen kan förhandsvisningen ha lägre decimalprecision.

## Crew Training-gränssnitt

Sidan använder spelarens bildheader och fyra guldfärgade statsymboler. Översikten visar
aktiv övning, köpt nivå, effektivitet, Perfect Drill-chans, moraleffekt och tillgänglig Energy.
**Energikostnaden är gemensam för alla fyra stats: 5 Energy per pass.** Samma konfigurerade
kostnad visas diskret inne i varje kort. Korten visar aktuellt statvärde och en Train-knapp
utan symbol. Ingen gain visas i förväg. Efter träning visas den faktiska ökningen från
serverkvittot ovanför knappen i det tränade kortet, inklusive Perfect Drill vid sådant utfall.
Varje kort behåller sitt senaste resultat tills nästa pass där eller sidbyte. Pågående pass,
fel och säkra återförsök visas också i kortet; ingen gemensam träningsresultatruta skapas.
Det finns inga separata energival eller mängdreglage för respektive stat.

Drill Schools visar de tio befintliga nivåerna, aktiv/ägd/låst status och framsteg i procent.
Endast nästa nivå kan köpas, efter upplåsning och med tillräckligt med burna Gold Coins.
Den högsta köpta nivån används automatiskt. Designskissens extra val och mängdreglage
inför inte nya spelregler. Befintliga strids-, sjukhus- och reselås samt återförsök behålls.

## Material i Ship Upgrades

För vald arbetsstorlek visas nödvändigt antal och aktuellt innehav av varje material.
Startknappen låses när Energy eller material saknas. Innehavet uppdateras via samma
ägarskyddade signaler som övrig spelstatus, även över flera flikar. Under pågående
arbete visas de faktiskt förbrukade materialen från jobbets sparade snapshot.

Både Energy och samtliga material valideras innan något dras, i samma transaktion
som jobbet och kvittot skapas. Stackar som töms tas bort och cirkulationen minskas.
Återförsök använder originalkvittot utan nya avdrag, även om inventory är tomt.
Gamla jobb från före materialkravet behåller sin belöning och tom materiallista;
material dras aldrig retroaktivt. Iron Nails är ett aktivt, handelsbart material
med katalogens placeholderbild. Något recept eller lootflöde för spikar är ännu inte infört.

## Stridsbalans vid höga stats

HP och skadeformeln har inte ändrats. Med samma Attack och Defense ger den befintliga
formeln följande skada per lyckad träff mot 100 HP:

| Attack / Defense | Skada | Träffar för att slå ut |
| --- | ---: | ---: |
| 10 / 10 | 32 | 4 |
| 100 / 100 | 56 | 2 |
| 1 000 / 1 000 | 87 | 2 |
| 10 000 / 10 000 | 125 | 1 |
| 1 000 000 / 1 000 000 | 222 | 1 |
| 1 000 / 10 | 174 | 1 |
| 10 / 250 | 0 | Ingen skada |

Lika Accuracy och Speed ger fortsatt 50 % träffchans. Tabellen gäller lyckade träffar,
inte rundor. Höga stats kan alltså ge korta strider med dagens
100 HP. HP, skala och skadebalans behöver ett separat balansbeslut före långsiktig lansering.

Planerad design, förtydligad av ägaren 2026-09-21: 100 är startvärdet för både
Crew Health och Ship Health. Båda ska kunna ökas genom ett framtida system.
Mekaniken och tillväxtkurvan är ännu inte bestämda. Långsiktig träningsbalans
ska ta hänsyn till denna hälsoprogression. Dagens implementerade hälsotak är oförändrat.

## Databas och offline

Crew- och Ship-stats, nivåernas efficiency och jobbens stat_gain använder numeric
så att decimaler inte försvinner. XP, Energy och Gold Coins förblir heltal. Stats och XP har fortsatt den tekniska gränsen 9 007 199 254 740 991.
Kostnader, varaktighet och sammansatta belöningar valideras i config.
Privata tabeller lagrar nivådefinitioner, två progressionsrader per karaktär,
aktionskvitton och skeppsjobb. När träningssystemet ursprungligen infördes fick befintliga spelare första nivån med 0 XP.
Den nya kurvan bevarar även redan köpta nivåer och intjänad XP.

Publika RPC:

- train_crew(stat, expected_tier_id, request_id)
- purchase_training_tier(training_group, tier_id, request_id)
- start_ship_upgrade(stat, energy_amount, expected_workshop_id, request_id)

Alla mutatorer autentiserar kontot, använder stridens ordnade deltagarlås och debiterar atomiskt.
Klienten väljer en heltalsmängd Energy men kan inte välja ägare, prisregel, tid, XP,
statökning, materialpris eller slumpresultat. Ogiltig mängd, otillräckligt saldo
och saknade/inaktiva material avvisas utan debitering.
Ett återförsök returnerar originalkvittot. Återanvänd request_id med annat innehåll avvisas.
Den tidigare train_stat-funktionen är borttagen i både public och private.

Skeppsjobbet lagrar sluttid, belöningssnapshot och förbrukade material. En partiell unik nyckel på karaktären
där applied_at är null håller platsen upptagen tills jobbet tillgodoräknats.
Servern färdigställer förfallna arbeten vid läsning av spelstatus, nya träningshandlingar
och köp samt före både stridsförhandsvisning och faktisk stridsstart.
Både angripare och offlineförsvarare färdigställs före en ny snapshot, med samma observed_at.
Befintliga stridssnapshots och rapporter ändras aldrig av träning.

Det behövs ingen bakgrundsarbetare: jobbet är logiskt klart vid sluttiden och tillgodoräknas
vid nästa relevant serverkontakt. UI uppdaterar vid sluttiden och återanslutning.
Karaktärens ändringssignal uppdaterar andra flikar. Oförändrade läsningar skickar ingen ny signal.
Sidan visar senaste färdiga arbetet även efter återinloggning.

## Konfiguration och verifiering

Ändra training i gameplayconfig, kör config:sync och db:migrate. Nivå-ID och ordning
är beständiga; befintliga nivåer får inte tas bort eller flyttas av en configmigration.
Balansändringar gäller nya handlingar. Sparade skeppsarbeten behåller alla sina värden.
Nya träningskvitton sparar dessutom stat_before, normal_gain, efficiency och config_revision.
Skeppskvitton sparar även materials och gain_multiplier. `shipGainMultiplier`,
`shipMaterialEnergy` och `shipMaterials` styr multiplikator, Energy per materialomgång
och materiallista. Antalen beräknas som `ceil(E / shipMaterialEnergy) * quantity`.
Gamla kvitton returneras oförändrade och slumpas eller räknas aldrig om vid återförsök.
Kvitton behålls för stabila återförsök; ingen rensningspolicy har införts.

Utförda kontroller redovisas i [implementationsstatus](IMPLEMENTATION_STATUS.md).

## Koppling till havsresor

Träning, nivåköp och skeppsarbete kräver hamnposition även vid direkta RPC-anrop.
Pågående skeppsarbete blockerar avfärd; en passerad sluttid tillgodoräknas före
avfärdskontrollen. Utresa, havsbesök och hemresa ger +5 Energy på gemensamma
tiominutersticks. Vid faktisk hemkomst återgår kaptenen till femminutersticks.
Hälsans befintliga återhämtning ändras inte. Se [resor](SEA_TRAVEL.md).

## Beständiga återförsök

Ekonomihandlingar sparar request-ID före anropet och kan återhämtas efter
omladdning eller navigation. Pågående handlingar visar ingen återhämtningsruta.
Först när anropet har avslutats utan säker bekräftelse visas **Unconfirmed action**
med **Check saved action**. Detta gäller även mellan flikar och efter omladdning.
Samma karaktär måste vara inloggad.
Se [ekonomigranskningen](ECONOMY_AUDIT.md) för skydd, tester och avgränsning.

## Research om statberoende träning

Ett Torn-inspirerat förslag för flerårig progression finns i
[balansresearchen](TRAINING_BALANCE_RESEARCH.md). Kurvan är nu implementerad enligt reglerna ovan, med avrundning och omräkning per Energy.
Analysen illustrerar progression över flera år; slutlig ekonomi och PvP-balans återstår.
