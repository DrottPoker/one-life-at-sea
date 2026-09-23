> Historiskt underlag. Beslut och förslag nedan hör till den daterade planen. För aktuellt beteende, se [dokumentationsindex](../../README.md) och [nuläge](../../IMPLEMENTATION_STATUS.md).

> Uppdatering 2026-09-19: detta är en historisk plan. Död crew eller sänkt skepp ger nu fem minuter i [Hospital](../../HOSPITAL.md). Alla skadeorsaker bevarar karaktären; äldre beskrivningar av fri återhämtning efter utslagning är ersatta.

> Uppdatering 2026-09-16: aktuella stridsregler och implementation finns i [COMBAT_SYSTEM.md](../../COMBAT_SYSTEM.md). Den nya versionen använder en gemensam /attack-vy, flera angripare, realtid och publika rapporter. Äldre beskrivningar av separata prepare-sidor, exklusiv tvåpartsstrid eller privata slutrapporter nedan är historiska.

# One Life At Sea: första stridssystemet

Datum: 2026-09-16. Version: 0.2.

Status: **Godkänd första version, implementerad lokalt. Se [systembeskrivning](../../COMBAT_SYSTEM.md) och [verifiering](../../IMPLEMENTATION_STATUS.md).**

Ägaren har valt att första spelbara versionen ska innehålla **både kanonstrid
och boarding, med enkla regler**. Planen godkändes med ändringen att full hälsa
inte krävs. Minst 1 Ship Health och 1 Crew Health krävs; övriga skador hindrar
inte en ny attack. Balansvärdena används som startpunkt för fortsatt provspelning. Tidigare beslut finns i
[strid och progression](COMBAT_AND_PROGRESSION_DESIGN.md).

## 1. Mål och omfattning

Från en annan kaptens profil öppnar spelaren en stridsvy, bedömer den synliga
informationen och väljer uttryckligen att starta PvP. Angriparen ger en order
per runda. Försvararen använder sparade försvarsorder även offline. Båda
orderna avgörs i samma runda.

Första bygget omfattar:

- PvP mellan två kaptener med deras befintliga skepp, besättning och tränade stats.
- Förberedelse, kanonstrid, boarding, reträtt och sparad stridsrapport.
- Enkla sparade försvarsorder på den egna profilen.
- Energy-kostnad, bestående hälsoskada och automatisk återhämtning.
- Begränsad ammunition per strid som första utvecklingsregel.

PvP dödar aldrig kaptenen eller besättningen permanent. Skeppet behålls.
Föremål kan aldrig stjälas. Ingen separat livsmätare för kaptenen tillkommer.

Guld, skill-XP, utrustningsbyten, ammunitionstillverkning, PvE, flottor och
permadöd ingår inte i detta bygge. Bordningsseger registreras separat så att
guldplundring kan kopplas på senare. Kanonseger ska fortsatt inte medge
guldplundring. Inga påhittade belöningar visas i första versionen.

## 2. Från profil till strid

1. En annan kaptens profil får länken **Attack**.
2. Länken öppnar `/combat/prepare/<character-id>` inom den befintliga spelramen.
3. Oss och motståndaren visas sida vid sida. Besöket skapar ingen strid,
   reserverar ingen spelare och kostar ingen Energy.
4. **Start fight** visar kostnaden och startar striden först vid klick.
5. Servern kontrollerar behörighet och tillgänglighet på nytt, reserverar båda
   deltagarna och drar Energy en gång. Misslyckad start kostar inget.
6. `/combat/<battle-id>` används under hela striden och för den avslutade rapporten.

Egen profil saknar Attack. Pågående strid får en **Resume fight**-länk.
Otillgängligt mål får en förklaring, exempelvis pågående strid, attackskydd eller exakt noll hälsa.
Ändrad tillgänglighet mellan förhandsvisning och start hanteras i samma vy.

Alla karaktärer är nu i The Harbor och resor saknas. Förslaget är att
profilattacker tillåts där i den lokala utvecklingsversionen, som möten utanför
hamnen utan nytt resesystem. Detta beslutar inte om framtida fredade hamnar
eller var PvP ska vara tillåtet i den färdiga världen.

## 3. Synlig och dold information

| Information | Förberedelse | Efter Start fight |
| --- | --- | --- |
| Namn | Båda synliga | Båda synliga |
| Ship Health och Crew Health | Båda synliga | Uppdateras per runda |
| Egna stats och utrustning | Synliga | Synliga |
| Motståndarens utrustningsnamn | Unknown | Avslöjas vid starten |
| Motståndarens exakta tränade stats | Dolda | Fortsatt dolda |
| Motståndarens ammunition | Unknown | Fortsatt dold; avfyrade salvor syns i loggen |
| Försvarstaktik och nästa order | Dolda | Ordern visas först efter avgjord runda |

Direkt avslöjande av utrustning vid start är den enklaste föreslagna regeln.
Avslöjande först när ett vapen används kan läggas till senare. Synligt vapen
innebär inte att tränade stats avslöjas.

Hemliga uppgifter ska saknas i webbläsarens svar, siddata och cache tills de
får visas. CSS-döljning räcker inte. Profilprojektionen får inga privata stats.

## 4. En runda, två order

Ett klick på en order innebär en hel runda:

1. Servern läser rundans gemensamma startläge.
2. Försvararens order väljs från sparad taktik och detta startläge.
   Valet får inte använda angriparens inskickade order.
3. Båda orderna och deras resurskostnader valideras.
4. Träffar och skador beräknas för båda från samma startläge.
5. Båda skadorna tillämpas tillsammans, även om en sida når noll.
6. Nederlag avgörs före reträtt och byte av stridsfas.
7. Resultat, ammunition, hälsa och logg sparas i samma transaktion.

Spelaren ser båda orderna och resultaten och väljer sedan nästa order.
Försvararen behöver aldrig klicka Ready. Även en inloggad försvarare använder
sina sparade order och tar inte över manuellt i första versionen.

Speed ger ingen extra tur och raderar inte den andras låsta attack.
Den påverkar undvikande och bordning. Om båda når noll i samma runda blir
resultatet oavgjort och båda återhämtar sig.

## 5. Två faser i samma möte

### Kanonstrid

Varje möte börjar i kanonstrid.

| Order | Effekt |
| --- | --- |
| Fire cannons | Förbrukar en salva ammunition. En träff skadar Ship Health. |
| Board | Ersätter egen salva med bordningsförsök. Motståndaren utför sin order som vanligt. |
| Retreat | Ingen egen attack. Motståndaren utför sin order; överlever vi lämnar vi mötet. |

Board sammanfattar att komma nära och kasta änterhakar. Ingen separat
avståndsmätare eller manövreringsfas behövs i första bygget.

- Bordning kräver inte att skrovet först skjuts ned till en viss procent.
- Noll Ship Health avgör mötet innan bordning kan ske.
- Överlevande reträtt avslutar mötet före ett eventuellt bordningsförsök.
- Annars kan Board lyckas eller misslyckas beroende på skeppens Speed.
- Om båda väljer Board lyckas bordningen utan slag; båda söker närkontakt.
- Lyckad bordning byter fas för båda. Första besättningsattacken sker nästa runda.
- Misslyckat försök lämnar båda i kanonstrid. Försöket gav ingen egen kanonskada.

Valet blir att skada skrovet eller avstå från en salva för att försöka
utnyttja en starkare besättning.

### Boarding

| Order | Effekt |
| --- | --- |
| Crew attack | En träff skadar Crew Health med besättningens stats. |
| Disengage | Ingen egen attack. Efter motståndarens order återgår båda till kanonstrid om vi överlever. |
| Retreat | Ingen egen attack. Efter motståndarens order avslutas mötet om vi överlever. |

Kanoner används inte under boarding. Disengage är ett säkert fasbyte om
besättningen överlever motattacken, utan extra slumpmoment. Det ger en väg
tillbaka när motståndarens besättning visar sig vara starkare.

Disengage fortsätter mötet med kanoner; Retreat lämnar hela mötet.
Efter Disengage får den andra sidan försöka borda igen nästa runda.
Första versionen har inget extra skydd mot ombordning.

### Exempel

1. Vi skjuter. Försvararen skjuter. Båda skeppen skadas.
2. Vi väljer Board. Försvararen skjuter igen. Vi tar skrovskada men överlever.
   Bordningsförsöket lyckas och fasen ändras.
3. Vi väljer Crew attack. Båda besättningarna attackerar och tar skada.
4. Motståndaren verkar starkare på däck. Vi väljer Disengage, tar en
   besättningsattack och tar oss loss med Crew Health kvar.
5. Nu kan vi skjuta, försöka borda igen eller välja Retreat.

Tidigare skador finns kvar efter fasbyte.

## 6. Offlineförsvar och startutrustning

På egen profil finns **Defence orders**, med två val:

| Förval | Kanonstrid | Boarding |
| --- | --- | --- |
| Cannon focus, standard | Fire cannons om ammunition finns, annars Board | Crew attack |
| Boarding focus | Board | Crew attack |

Försvararen får fasta, begripliga regler. Hälsotrösklar, automatisk reträtt,
flera vapen och mer avancerade prioriteringar kan komma senare.

Stats, utrustning och försvarsorder sparas som ögonblicksbild vid start.
Ändrade försvarsorder gäller nästa möte. Träning blockeras under aktiv strid
så spelaren inte har två olika uppfattningar om sina stats.

Båda sidor får **Basic cannons** och **Cutlasses** som grundutrustning.
De är stridskonfiguration, inte föremål i ett nytt inventariesystem.
Tränade stats avgör skillnaderna mellan kaptenerna.

Varje sida får förslagsvis tio salvor per möte. Fire cannons förbrukar en
även vid miss. Ingen ammunition köps eller tas från ett permanent förråd.
Tilldelningen återställs vid nästa tillåtna möte. Detta är en uttrycklig
utvecklingsförenkling, inte den färdiga ammunitionsekonomin.
Tom ammunition blockerar Fire cannons men inte boarding eller reträtt.

## 7. Resultat, skador och återhämtning

Mötet avslutas vid noll Ship Health, noll Crew Health, reträtt, rundgräns eller
timeout. Resultatet anger vinnare om sådan finns, anledning och sista runda.
En försvarare kan vinna på samma villkor som angriparen.

- **Hull victory:** skeppet är utslaget. Ingen guldplundring.
- **Boarding victory:** besättningen är besegrad. Ingen dör. Kan senare ge guldplundring.
- **Retreated:** en sida lämnar utan att någon når noll. Ingen segerbelöning.
- **Draw:** båda når noll samtidigt, eller rundgränsen nås utan avgörande.

Resultatsidan visar skador, ammunition, återhämtning och hela loggen.
Torn-val som Mug eller Hospitalize läggs inte till. Följden avgörs redan
av det som hände med skeppet och besättningen.

Hälsoskador sparas för båda, även vinnaren. Ingen får lämnas fast på noll.
Första förslaget är automatisk återhämtning i The Harbor, med snabbare
läkning av Crew Health än reparation av Ship Health. Båda återhämtas
parallellt, även offline, utifrån serverns tid.

Nytt PvP tillåts med minst 1 i båda hälsomätarna. Full hälsa krävs inte.
Attackskydd skyddar bara mot inkommande attacker och upphör om man själv
startar en ny strid. Målets attackskydd kontrolleras fortfarande.
Profil, hamn och träning är tillgängliga under återhämtning. Noll Crew Health
efter PvP betyder återhämtning, aldrig död eller ny karaktärsskapning.

## 8. Startvärden för provspelning

Dessa värden används i första versionen och kan balanseras efter provspelning.
De är inte påståenden om Torn.

| Regel | Förslag |
| --- | --- |
| Energy för att starta | 10, en gång, endast angriparen |
| Energy för försvar och enskilda rundor | 0 |
| Ammunition | 10 salvor per sida och möte |
| Rundgräns | 25 totalt, inklusive fasbyten |
| Inaktivitet | Automatisk Retreat efter 2 minuter utan accepterad order |
| Längsta möte | 10 minuter, därefter automatisk Retreat |
| Ship Health efter avslut | +1 per 30 sekunder, högst 100 |
| Crew Health efter avslut | +1 per 10 sekunder, högst 100 |
| Attackskydd efter avslut | 5 minuter mot inkommande attacker; egen attack avslutar skyddet |

Hälsa återhämtas inte under strid. Energy följer befintliga regler.
Full reparation från noll tar med provvärdena 50 minuter. Full
besättningsåterhämtning tar 16 minuter och 40 sekunder.

Möjliga första formler, med positiva stats:

- Träffchans: `clamp(0.75 + 0.25 * (accuracy - enemy_speed) / (accuracy + enemy_speed), 0.50, 0.95)`.
- Skada vid träff: `clamp(round(16 * sqrt(attack / enemy_defense)), 1, 40)`.
- Bordningschans: `clamp(0.70 + 0.30 * (ship_speed - enemy_ship_speed) / (ship_speed + enemy_ship_speed), 0.20, 0.90)`.

clamp begränsar ett värde till intervallet. Vid lika stats blir träffchansen
75 procent, skadan 16 och bordningschansen 70 procent. Crew-stats används under
boarding, annars Ship-stats. Separata slumpdrag görs för varje träff och
bordningsförsök. Inga kritiska träffar eller extra skadeslag ingår.
Provspela flera statskillnader innan värdena låses.

## 9. Gränssnitt

De två bifogade Torn-bilderna är referenser för informationsplacering:
två motståndare, utrustningsrader, tydlig start och logg under striden.
De fastställer inte spelets regler eller en kopia av Torns utseende.

- Befintlig blå spelram och vänsterpanel har samma bredd och placering.
- Överst: motståndare, fas och runda, exempelvis **Round 3 / 25**.
- Två jämnstora paneler visar kapten, skepp och båda hälsomätarna.
- Enkla illustrationer och täta utrustningsrader. Inga stora tomma kort.
- Egna order ligger vid egen panel; motståndarens sida är informativ.
- Aktiv fas markeras tydligt. Irrelevanta order är inte klickbara.
- Före start: Start fight med kostnad. Efter avslut: resultat och länkar
  till profilen och The Harbor.
- Loggen grupperas per runda med båda order, missar, skador, fasbyte och resultat.
- På mobil behålls jämförelsen sida vid sida, medan utrustning och stats får fler rader.
  Knappar har minst 44 px tryckyta och sidan får ingen horisontell scroll.
- All speltext är engelska. Färg kompletteras med text och värden.

Orderknappen får en liten laddningsindikator medan rundan sparas. Tidigare
värden står kvar tills svaret kommer. Inga förmodade träffar eller preliminära
skador visas. Serverns gemensamma resultat uppdaterar båda sidor.
Fel behåller vyn och ger möjlighet att hämta senast sparade läge.

## 10. Server och datalagring

### Befintlig grund

Next.js App Router, delad (game)-layout och Supabase/PostgreSQL används.
Profilerna har en separat identitetsprojektion. characters innehåller privata
resurser och stats med ägarbegränsad åtkomst. Dessa datagränser behålls.

Nya vyer läggs under src/app/(game)/combat/. Link-navigation och lokala
loading/error-gränser bevarar ramen. Förladdning får läsa förberedelsen men
aldrig starta ett möte. Inloggning och deltagarskap kontrolleras på servern.

### Data och kommandon

Föreslagen intern modell:

- Möte med deltagare, fas, rundnummer, regelversion, deadlines och resultat.
- Ögonblicksbilder av stats, grundutrustning och försvarsorder.
- Aktuell hälsa och ammunition samt beständig logg per runda.
- Reservation per deltagare som förhindrar flera samtidiga möten.
- Försvarsorder, återhämtningstid och skyddstid per karaktär.

Föreslagna operationer: get_combat_preview, start_combat, get_combat,
submit_combat_order och save_defence_orders. Start och order använder unika
begärans-ID:n. En order anger förväntat rundnummer. Avslut sker i stridslogiken,
inte genom ett klientkommando som själv anger vinnare eller skada.

Rundreglerna har en auktoritativ implementation i privata databasfunktioner,
med smala autentiserade RPC-anrop enligt projektets befintliga mönster.
TypeScript ansvarar för typer, inmatning och presentation. Webbläsaren skickar
ordern, aldrig träffchans, slumpresultat, skada eller belöning.

Start låser karaktärsrader i konsekvent ordning och reserverar båda atomiskt.
Samma låsordning gäller rundor, avslut och återhämtning. Träningsfunktionen
kontrollerar reservationen. Dubbelklick, återförsök och gamla rundnummer får
inte kosta eller skada två gånger.

Rundans hälsa skrivs även till karaktärernas resurser i samma transaktion.
Sidopanelen visar verklig hälsa. Avslut registrerar återhämtning och frigör
deltagarna exakt en gång, utan att skriva över senare hälsa eller ge dubbel läkning.

Interna stats, kommande order och slumpdata är inte allmänt läsbara eller
publicerade till Realtime. Deltagarna får filtrerade läsvyer av sitt möte.
Andra spelare kan inte läsa rapporten via ett känt battle-id.
RLS och explicita rättigheter används. Klientskrivning till stridstabeller förbjuds.

### Avbrott och återanslutning

- Siduppdatering eller navigation bort pausar inte serverns tidsgränser.
- Återbesök använder sparad runda, utan nya slumpslag eller dubbel Energy-kostnad.
- Timeout utför angriparens automatiska Retreat med samma motorder och
  skaderegler som manuellt val. Stängd flik ger ingen gratis flykt.
- Noll hälsa efter motattacken ger nederlag; annars registreras reträtt.
- Servern avslutar förfallna möten vid nästa relevanta läsning eller skrivning
  innan tillgänglighet avgörs. Återhämtning räknas från deadline, inte återbesöket.
- Ett möte som ingen återöppnar får inte blockera senare attack eller träning.
  Periodisk städning kan tillkomma för drift men behövs inte för korrekthet.
- Skador avgörs före rundgräns. Utan nederlag slutar runda 25 oavgjord
  innan en ny fas eller runda börjar.

Det är turbaserat även om båda handlingarna avgörs samtidigt. Första versionen
behöver ingen separat websocketserver eller ständig simulering mellan klick.
Angriparens svar uppdaterar vyn direkt. Försvararen kan läsa aktivt eller senast
avslutat möte från egen profil; status hämtas igen vid sidbesök/fokus.
Livevisning för en försvarare som följer mötet kan tillkomma separat.

## 11. Byggordning efter godkänd plan

1. **Lås reglerna:** avslöjande, order, förval, kostnader, ammunition,
   återhämtning och deadlines. Provvärdena ovan är startpunkten.
2. **Stridskärna och persistens:** migrationer, behörigheter, simultana rundor,
   båda faserna, slump, avslut och återhämtning. Verifiera med två testkaptener.
3. **Profil och förberedelse:** Attack, Defence orders, förhandsvisning,
   Start fight och Resume fight. Sidbesök får inte börja striden.
4. **Spelbar stridsvy:** paneler, order, logg, resurssynk, fasbyten och resultat.
   Kontrollera desktop, mobil, tangentbord och bibehållen ram.
5. **Hela flödet:** offlineförsvar, återanslutning, timeout, samtidiga anrop,
   sekretess, återhämtning och befintliga tester.

Stegen ingår i samma första version. Enbart förberedelse eller en mockad
stridsanimation räknas inte som färdigt stridssystem.

## 12. Klart när

- Två riktiga lokala konton kan strida medan försvararen är utloggad.
- Förberedelse är gratis och döljer utrustning även i nätverkssvaret.
- Start reserverar båda och debiterar en gång, även vid samtidiga startförsök.
- Försvarsförval ger dokumenterade order utan att läsa angriparens val.
- Båda får utföra ordern, inklusive ömsesidigt utslag och fasbytets motattack.
- Ingen kan skjuta utan ammunition, välja fel fasorder eller upprepa sparad runda.
- Hull victory, Boarding victory, Disengage, Retreat, Draw och timeout fungerar.
- Sida, session eller nätverk kan avbrytas och återupptas utan omräknad strid.
- Utgången strid låser inte spelaren och ger inte dubbel återhämtning.
- PvP-förlust behåller kapten, skepp, besättning och tränade stats.
- Hälsa återhämtas offline med serverns tid. Träning fungerar under återhämtning.
- Andra konton kan inte läsa hemliga stats, ändra resultat eller öppna rapporten.
- Befintliga kontroller och relevanta nya databas-/webbläsartester passerar.
- UI fungerar vid 320 px och med klassiska scrollbars utan att ramen flyttar sig.

Planen är genomförd. Körda kontroller och resultat finns i implementationsstatus.
Guld, XP, utrustningsekonomi och PvE/flottor kvarstår som senare utökningar.

