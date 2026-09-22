> Uppdatering 2026-09-22: [Activities](ACTIVITIES.md) ger nu 10 XP för strandfiske,
> foraging och trädhuggning till en kostnad av 1 Stamina. Loot och nivåbonusar återstår.

> Uppdatering 2026-09-22: färdighetssystemet är implementerat enligt [Skills](SKILLS.md).
> Fishing, Logging, Cooking, Crafting, Crew Battling, Ship Battling och Foraging har nivå 1-99
> med RuneScapes klassiska XP-kurva. Detaljerad progression är privat; summan av nivåerna
> visas publikt som Character Level (7-693). Aktiviteter, XP-belöningar och nivåbonusar
> återstår. Äldre öppna förslag om färdighetslista, kurva och nivåtak nedan är ersatta.

> Uppdatering 2026-09-16: aktuella stridsregler och implementation finns i [COMBAT_SYSTEM.md](COMBAT_SYSTEM.md). Den nya versionen använder en gemensam /attack-vy, flera angripare, realtid och publika rapporter. Äldre beskrivningar av separata prepare-sidor, exklusiv tvåpartsstrid eller privata slutrapporter nedan är historiska.

# One Life At Sea: combat och progression

Datum: 2026-09-16. Uppdaterad: 2026-09-19. Version: 0.8.

Status: **Resurser, träningsprogression, första PvP-versionen samt Gold Coins, banken och Hospital är implementerade lokalt. Intjäning, items, PvE och flottor är fortsatt design.**

Dokumentet skiljer mellan ägarens valda riktning, arbetsförslag och öppna frågor.
Den ursprungliga första etappen med konto, karaktär och hamn är färdig.

## Första implementerade spelsteget

Energy, Ship Health och Crew Health börjar på 100/100. Energy återhämtas med
5 var femte minut även offline. Crew och skepp börjar på 10 i sina fyra stats.
Crew tränas direkt med 1 % Perfect Drill; skeppet har tidsstyrda arbeten.
Båda får separat tränings-XP och bättre nivåer som köps för Gold Coins på karaktären.
Items, materialkostnader och consumables är uppskjutna. Se
[aktuella träningsregler och balans](TRAINING_FOUNDATION.md) och [PvP-systemet](COMBAT_SYSTEM.md).
Senare förslag nedan utökar inte den implementerade omfattningen.

## Grundmodell: kapten, eget skepp och besättning

Ägarens förtydligande är att kaptenen är spelarens karaktär. Till varje
karaktärsliv hör ett eget skepp och en besättning som alltid följer kaptenen.

- Skeppet behålls under hela karaktärslivet och uppgraderas över tid.
- Spelaren byter inte till andra skepp. Utrustningsdelar kan däremot bytas.
- Besättningen följer kaptenen och utvecklas tillsammans med skeppet.
- Uppgraderingarna hör till skeppet och besättningen.
- Crew Health är spelarens livsmätare. Crew condition var ett tidigare namn på
  samma värde. Modellen har ingen separat hälsostapel för kaptenen.
- Noll Crew Health innebär död besättning och fem minuter i Hospital, oavsett skadeorsak.
- Permanent karaktärsdöd och hardcore är borttagna. Karaktär, skepp, progression och pengar behålls.
- Under vistelsen är spelhandlingar låsta. Utskrivning sker automatiskt, även offline,
  med full Ship Health och Crew Health. Se [sjukhusreglerna](HOSPITAL.md).
- Ship Health, även kallat Hull HP, är skeppets skick och hålls åtskilt från Crew Health.
- Ett utslaget skepp i PvP repareras som samma skepp. En separat ersättningsbåt
  eller ett skeppsbyte ingår inte i denna modell.

Detta ersätter assistentens tidigare förslag om skeppsbyten och kaptensträning
som flyttas mellan olika fartyg. Skill levels, skeppsuppgraderingar,
besättningsuppgraderingar och utrustning är olika delar av samma karaktärsliv.

Noll Ship Health sätter också Crew Health till 0: besättningen går under med skeppet.
Samma femminutersvistelse gäller PvP och andra skadeorsaker; ingen ny karaktär skapas.

## Överlevnad och resurser

Ägarens föreslagna grund för survival-systemet är Hunger som sjunker över tid,
Energy som förbrukas av handlingar och Ship Health som mäter skeppets skick.
Crew Health fyller nu rollen som spelarens liv enligt grundmodellen ovan.

| Resurs | Riktning från samtalet | Återstår att bestämma |
| --- | --- | --- |
| Hunger | Börjar på 100, sjunker över tid och återställs genom att äta | Takt, offlineförbrukning, gränsvärden och följder av hunger |
| Energy | Max 100, +5 var femte minut även offline; första träningen kostar 5 | Kostnader för framtida handlingar |
| Crew Health | Besättningens och kaptenens gemensamma livsmätare; första versionen 100/100 | Läkning och återhämtningstider |
| Ship Health / Hull HP | Skeppets HP; första versionen 100/100 | Framtida reparationskostnader; noll HP ger Hospital |

Det är inte bestämt om hunger kan orsaka död eller hur hunger fungerar offline.
Grundkonceptet ska inte kräva daglig inloggning för att överleva. Tidigare exempel
på hungerförbrukning per timme och lägstanivåer är inte beslutade värden.
Energy-reglerna för första versionen är däremot fastställda ovan.

## 1. Ägarens valda PvP-riktning

- PvP kan ske även när försvararen är offline. Båda spelarna behöver inte vara aktiva samtidigt.
- Besegrad besättning eller sänkt skepp leder till Hospital i The Harbor. Karaktären behålls.
- Föremål kan inte stjälas från andra spelare. Gold coins är den valuta som kan plundras.
- Kanonseger ger ingen möjlighet att plundra guld.
- Kanoner förbrukar ammunition.
- Sänkt skepp ger samma sjukhusvistelse som död besättning: fem minuter för nu.
- Bordningsseger ger möjlighet att plundra guld.
- Bordning orsakar normalt mindre skrovskada men skadar Crew Health.
- Överlevande crew läker snabbare än skrov; patienter återfår båda hälsomätarna vid utskrivning.
- De olika handlingarna och segerformerna kan ge olika XP. Exakta belopp är inte bestämda.

Detta ersätter det tidigare arbetsförslaget om samma guldutbyte vid båda segerformerna.
Ingen förlust kan permanent radera karaktären.

## 2. Taktiskt syfte

| Segerväg | Vad besegras? | Ekonomiskt utbyte för vinnaren | Följd för förloraren |
| --- | --- | --- | --- |
| Kanoner | Skeppets skrov | Inget plundrat guld; sjöstrids-XP enligt kommande regler | Hospital i fem minuter, därefter full hälsa |
| Bordning | Besättningens motstånd | Möjlighet att plundra gold coins; bordnings-XP enligt kommande regler | Hospital i fem minuter, därefter full hälsa |

Båda segerformerna ger samma sjukhustid i utvecklingsversionen. Bordning kan
senare användas för ekonomiskt utbyte. Färdigheter, utrustning, försvar och resurskostnader
påverkar vilken väg som är rimlig mot ett visst mål.

### Föreslagen regel för blandade strider

Skrovskador följer med mellan stridsfaserna. Överlevande återhämtar båda hälsovärdena
parallellt. Vid död återställs båda först efter sjukhusvistelsen. Dessa regler ersätter
förslaget om olika väntetid beroende på segerform.

## 3. Ägarens valda progressionsriktning

Färdigheter ska ha egna nivåer och egna XP, inspirerat av RuneScape.
Fishing, Mining, Sea Battle och Crew Battle har nämnts som färdigheter med separat
utveckling. Woodcutting och Crafting har nämnts som möjliga ytterligare färdigheter.
De engelska namnen är arbetsnamn.

### Föreslaget färdighetssystem

| Färdighet | Handlingar som kan ge XP | Exempel på vad nivåer kan ge |
| --- | --- | --- |
| Fishing | Fånga fisk | Nya fångster, redskap och fiskemetoder |
| Mining | Bryta malm och mineraler | Nya fyndigheter och verktyg |
| Woodcutting, kandidat | Avverka och samla trä | Nya träslag och verktyg |
| Crafting, kandidat | Tillverka och reparera | Recept, utrustning och reparationsmetoder |
| Sea Battle | Meningsfulla insatser i sjöstrid | Bättre användning av kanoner och nya sjöstridstaktiker |
| Crew Battle | Meningsfulla insatser i bordning | Bättre bordningsförmåga och nya besättningstaktiker |

Färdigheterna hör till spelarens beständiga karaktär. Samma skepp och besättning
utvecklas över tid. Ingen förlust raderar progression eller innebär ett skeppsbyte.
Den tidigare idén om permanent död och att börja om med ny kapten är borttagen.

## 4. Arbetsförslag för nivåer och XP

- Varje färdighet börjar på nivå 1 med 0 XP.
- Nivå 99 är ett möjligt första tak, inte ett fastställt beslut.
- Varje färdighet visar nivå, intjänad XP och återstående XP till nästa nivå.
- Tidiga nivåer går relativt snabbt; högre nivåer kräver längre investering.
- Nivåer låser upp innehåll och ger kontrollerade effektivitetsfördelar.
- Stridsstyrka beror på uppgraderade stats, relevanta stridsfärdigheter, utrustning
  och skick; deras exakta bidrag är inte bestämda.
- Ett eventuellt Total Level visar sammanlagd utveckling men ger ingen egen stridsbonus.
- Gemensam eller separat XP-tabell, tillväxtkurva och alla belopp återstår att bestämma.

RuneScape-referensen gäller principen att handlingar ger XP i den använda
färdigheten och att den färdigheten ökar i nivå, inte en beslutad kopia av dess
formler eller nivåtak. [Officiell färdighetsguide](https://www.runescape.com/game-guide/skills).

### Strider som använder båda färdigheterna

En spelare kan få Sea Battle XP för sin sjöstridsinsats och Crew Battle XP för
bordningen i samma möte. Segerformen kan ge en separat bonus i relevant färdighet.
En bordningsseger raderar inte XP som tjänades under sjöstridsdelen.

XP bör bero på meningsfull insats och motståndets svårighet, med en begränsad
budget per möte. Antal klick eller rundor i sig ska inte ge obegränsad XP.
Exakta regler för missar, reträtt, nederlag, automatiskt försvar, upprepade mål
och samordnad XP-farmning behöver beslutas innan implementation.

### Flottor

Varje deltagare får XP i de färdigheter som den faktiskt bidrog med. Belöningen
ska inte gå enbart till den som ger sista träffen. Produktion och reparation
under expeditionen kan ge XP i motsvarande yrkesfärdighet.

Bidrag, gemensamma segerbonusar och tilldelning till automatiska försvarsorder
behöver få exakta regler. Inga formler har fastställts.

## 5. Uppgraderingar, fyra stats och utrustning

Ägarens modell har två grupper med fyra uppgraderingsbara stats:

| Grupp | Stats |
| --- | --- |
| Skepp | Attack, Defense, Speed, Accuracy |
| Besättning | Attack, Defense, Speed, Accuracy |

Den långsiktiga riktningen är att använda material och Energy för att förbättra
värdena. Första versionen använder enbart 5 Energy per statpoäng. Skeppets attack kan
representera kanonernas skadeverkan och dess defense skrovets skydd. Den exakta
betydelsen av varje stat, formler och träningskostnader återstår att bestämma.
Defense är skademotstånd; Hull HP och Crew Health är separata resurser.

Implementerad grundmodell: Accuracy jämförs med motståndarens Speed enligt en Torn-inspirerad
kvotkurva, med 50 % träffchans vid lika stats och garanterade missar vid 64 gånger högre Speed.
Attack jämförs med Defense för skademinskning; full blockering kräver 25 gånger högre Defense,
enligt ägarens justering. Grundskadan växer med absolut Attack och ger 32 skada vid startstats 10.
Samma modell gäller skepp och besättning. Utrustningsmodifierare tillkommer senare.
Exakta formler och avrundning finns i [COMBAT_SYSTEM.md](COMBAT_SYSTEM.md).

Spelaren kan utrusta delar som ger bonusar till stats, exempelvis kanoner för
skeppet och vapen för besättningen. Utrustning kan också ge förmågor: ett utrustat
fisknät kan möjliggöra fiske till havs. Utrustningsplatser, krav, nackdelar och
begränsningar är fortfarande öppna frågor.

Den tidigare idén att huvudsakligen träna permanenta kaptenstats som följer med
mellan skeppsbyten gäller inte. Här förbättras spelarens eget skepp och dess
ständiga besättning. Första versionen har separata vyer för Crew Training och
Ship Upgrades; framtida koppling till andra hamnaktiviteter återstår.

### Samspelet med skill levels är fortfarande ett förslag

- Aktiviteter ger XP i relevanta färdigheter.
- Skill levels kan låsa upp utrustning, aktiviteter, taktiker och träningsalternativ.
- De uppgraderade stridsstatsen avgör grundläggande prestanda.
- Utrustning bidrar med bonusar, avvägningar och förmågor.

Träningens egna XP-spår har nu en vald riktning enligt avsnittet nedan. Kopplingen
till Sea Battle/Crew Battle och direkta bonusar från deras levels är fortfarande öppen.
Tidigare exempel med separata Gunnery, Seamanship, Strength och andra färdigheter
ska inte automatiskt läggas till som ytterligare nivåsystem.

### Gold Coins före träningsprogressionen, 2026-09-19

Ägaren har valt att först införa Gold Coins och en enkel bank i Harbor. Saldo på
karaktären visas ovanför mätarna; pengar på banken måste tas ut före köp. Nya
karaktärer börjar med 0. [Gold Coins och banken](GOLD_COINS_AND_BANK.md) beskriver
implementationen. Items skjuts upp, inklusive materialkrav och consumable-buffar;
de är fortsatt framtida design och ska inte implementeras i denna etapp.

### Vald träningsprogression, 2026-09-19

Följande grund är implementerad; nämnda itemeffekter är uppskjutna:

- Crew tränas direkt och får stats samt ett separat tränings-XP-spår, gemensamt för dess fyra stats.
- Tränings-XP låser upp nästa övning, som måste köpas för guld för att ge bättre utbyte.
- Perfect Drill har 1 % grundchans och ger dubbla stats. Consumables höjer chansen under en begränsad tid; sedan återgår den till 1 %. Höjningen är inte permanent.
- Skeppet utvecklas med tidsstyrda arbeten i valfri stat. Spelaren väljer storlek och betalar Energy vid start.
- Ett skeppsarbete åt gången, med automatisk stat-/XP-belöning när det är färdigt, även efter offline-tid.
- Skeppet har ett eget uppgraderings-XP-spår och workshops som köps för guld och kan kräva material.
- Större arbete ger proportionellt fler stats, inte bättre utbyte per Energy. Bättre workshop höjer utbytet.
- Spelaren kan fortsätta spela under arbetet. Ingen återkommande Major Upgrade-bonus ingår.

XP från träning och uppgradering baseras på investerad Energy. Dessa två spår
ersätter inte de framtida stridsfärdigheterna och ger inte automatiskt Sea Battle-
eller Crew Battle-XP. Exakta priser, steg, arbetstider och consumable-effekter är
fortfarande balansarbete.

[Implementationsplanen](TRAINING_PROGRESSION_PLAN.md) beskriver designunderlaget.
[Träningssystemet](TRAINING_FOUNDATION.md) beskriver den implementerade kärnan utan items,
provisorisk balans och högstatskonsekvenser för strid.

## 6. Stridsflöde som fortfarande är arbetsförslag

- En angripare ger order runda för runda; försvararen använder sparad taktik.
- Bordning kräver att skeppet når rätt avstånd och inleder bordningen.
- Hull HP och Crew Health är separata värden. De fyra uppgraderingsbara statsen
  och utrustningen påverkar effektiviteten, medan Crew Health visar återstående liv.
- Bordningsrundor minskar Crew Health tills en sida besegras eller lyckas dra
  sig ur. Noll Crew Health ger Hospital oavsett stridstyp.
- Förslag för Break away: ingen egen attack, en motattack, därefter frigörelse
  om besättningen står kvar. Sjöstriden fortsätter efter frigörelsen.
- Flott-PvE använder samma stridsregler med förhandsgodkända order som körs
  automatiskt. Varje skepp behåller egna resurser och bidrag.
- Gruppens beslut kan inte godkänna en ny dödlig risk åt en frånvarande spelare.

De tidigare klickbara exemplen illustrerar stridsflödet. Deras skadevärden,
tidsordning och rundor är inte fastställda regler eller en implementerad stridsmotor.
Äldre beskrivningar av Crew condition som ett generellt icke-dödligt stridsvärde
är ersatta av Crew Health-modellen ovan. Sjukhusreglerna gäller alla skadeorsaker.

## 7. Viktiga återstående beslut

1. Vilka färdigheter ingår, vad påverkar de och vad är nivåtaket?
2. Vilka steg, priser, XP-krav, arbetstider och tillfälliga itemeffekter ska den valda träningsmodellen ha, och hur samverkar den med framtida skills och utrustning?
3. Hur delas XP mellan handlingar, segerbonus, försvar och flottans deltagare?
4. Hur mycket guld får bordningsvinnaren ta, och vilken del av valutan är utsatt?
5. Behåller den besegrade sitt guld vid kanonseger, eller går något förlorat?
6. Vad händer vid noll Hull HP i PvE, och hur påverkas Crew Health och möjlighet till räddning?
7. Hur långa är väntetiderna och vilka hamnaktiviteter är tillgängliga under tiden?
8. Hur förbrukas och begränsas ammunition vid automatiskt offlineförsvar?
9. Vilka regler gäller för flykt, kapitulation, samtidiga attacker och attackskydd?
10. Hur godkänner flottans deltagare planer, risker och ändrad deltagaruppsättning?
11. Hur fungerar Hunger över tid och offline, och vad ska framtida handlingar kosta i Energy?
12. Vilka maxvärden och metoder för läkning och reparation ska gälla?

Assistentens nuvarande förslag till punkt 5 är att behålla guldet vid kanonförlust;
den längre reparationen är då den huvudsakliga påföljden. Ägaren har inte beslutat detta.

## 8. Nästa designsteg

Ägaren har valt att nästa bygge ska börja med enkel PvP från en annan kaptens
profil och innehålla både kanonstrid och boarding. Förberedelsevyn visar
deltagarna sida vid sida och döljer motståndarens utrustning före start.
Angriparen väljer order; försvararen använder förvalda order även offline.

[Planen för första stridssystemet](FIRST_COMBAT_PLAN.md) är godkänd och genomförd.
Ägaren ändrade hälsokravet: full hälsa behövs inte; minst 1 Ship Health och
1 Crew Health räcker för att anfalla skadad. Attackskydd gäller inkommande
attacker och avslutas när man själv startar ett möte.

[Systembeskrivningen](COMBAT_SYSTEM.md) dokumenterar den första implementerade
PvP-versionen. Detaljer som timeout, återhämtning, försvarsorder och formler är
nu startregler för provspelning. Tidigare arbetsförslag i detta dokument ersätts
för den avgränsade PvP-versionen av systembeskrivningen. Skills, guld, inventarier
och flott-PvE byggs senare; deras öppna frågor kvarstår.

## Accepted activity resource, 2026-09-22

Profession activities use Stamina independently of training/combat Energy. Initial capacity is 50,
recovery is 1 every fixed five-minute server tick and the initial cost is 1 per activity. Fishing,
Logging, Foraging, Cooking and Crafting share this resource. Stamina, the seven private skills and the public summed Character Level are implemented.
Shore Fishing, Foraging and Logging award skill XP. Shore Fishing also uses admin-managed
loot tables, with catch success followed by fixed and level-weighted rewards. Food will restore Stamina, with
amounts and limits still to be decided. See [Stamina](STAMINA.md).
