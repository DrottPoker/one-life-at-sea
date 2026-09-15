# One Life At Sea: combat och progression

Datum: 2026-09-15. Version: 0.1.

Status: **Designunderlag under diskussion. Inga system i detta dokument är implementerade.**

Dokumentet skiljer mellan ägarens valda riktning, arbetsförslag och öppna frågor.
Det utökar inte den redan byggda första etappen med konto, karaktär och hamn.

## 1. Ägarens valda PvP-riktning

- PvP kan ske även när försvararen är offline. Båda spelarna behöver inte vara aktiva samtidigt.
- En karaktär kan aldrig dö av PvP. Förloraren återvänder till The Harbor.
- Föremål kan inte stjälas från andra spelare. Gold coins är den valuta som kan plundras.
- Kanonseger ger ingen möjlighet att plundra guld.
- Kanoner förbrukar ammunition.
- Att skjuta ut motståndarens skepp ger en lång väntetid i hamnen för reparation.
- Bordningsseger ger möjlighet att plundra guld.
- Bordning orsakar normalt mindre skrovskada men förbrukar besättningens condition.
- Besättningen återhämtar sig snabbare än ett utslaget skepp repareras.
- De olika handlingarna och segerformerna kan ge olika XP. Exakta belopp är inte bestämda.

Detta ersätter det tidigare arbetsförslaget om samma guldutbyte vid båda segerformerna.
Ingen PvP-förlust får skapa en oundviklig indirekt död efter striden.

## 2. Taktiskt syfte

| Segerväg | Vad besegras? | Ekonomiskt utbyte för vinnaren | Följd för förloraren |
| --- | --- | --- | --- |
| Kanoner | Skeppets skrov | Inget plundrat guld; sjöstrids-XP enligt kommande regler | Skadat eller utslaget skepp med lång reparation |
| Bordning | Besättningens motstånd | Möjlighet att plundra gold coins; bordnings-XP enligt kommande regler | Besättningsåterhämtning och reparation av eventuella skrovskador |

Kanoner kan användas för att slå ut en rival under längre tid. Bordning kan
användas för ekonomiskt utbyte. Färdigheter, utrustning, försvar och resurskostnader
påverkar vilken väg som är rimlig mot ett visst mål.

### Föreslagen regel för blandade strider

Skrovskador finns kvar även om striden slutar med bordning. Väntetid beräknas
utifrån de faktiska skadorna och besättningens condition. En slutlig bordningsseger
läker inte kanonskador som redan har uppstått.

Fulla reparationstider, återhämtningstider och eventuell parallell återhämtning
är fortfarande öppna beslut.

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

Färdigheterna hör till kaptenen. Skepp och utrustning är separata investeringar.
PvP-förlust eller byte av skepp raderar inte kaptenens färdigheter. Det ursprungliga
permadödskonceptet innebär att en ny kapten börjar om; framtida döds- och
historikhantering behöver fortfarande specificeras.

## 4. Arbetsförslag för nivåer och XP

- Varje färdighet börjar på nivå 1 med 0 XP.
- Nivå 99 är ett möjligt första tak, inte ett fastställt beslut.
- Varje färdighet visar nivå, intjänad XP och återstående XP till nästa nivå.
- Tidiga nivåer går relativt snabbt; högre nivåer kräver längre investering.
- Nivåer låser upp innehåll och ger kontrollerade effektivitetsfördelar.
- Stridsstyrka beror på relevanta stridsfärdigheter, utrustning och skick.
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

## 5. Träning och skeppsutveckling

Arbetsförslaget är att aktiviteter är huvudsättet att utveckla färdigheter.
En särskild träningsplats kan senare vara ett alternativ för stridsövningar.
Ett separat gym med ytterligare permanenta stridsstats är inte beslutat.

Skeppets kanoner, segel, skrov och utrustning förbättras med material, tillverkning
och pengar. Färdighetsnivå och utrustning ska fylla olika roller.

Om Sea Battle och Crew Battle blir de två stridsfärdigheterna behöver tidigare
förslag om separat Gunnery, Seamanship, Strength och andra stats prövas igen.
De tidigare exemplen ska inte automatiskt införas som extra nivåsystem.

## 6. Stridsflöde som fortfarande är arbetsförslag

- En angripare ger order runda för runda; försvararen använder sparad taktik.
- Bordning kräver att skeppet når rätt avstånd och inleder bordningen.
- Skrov och Crew condition är separata värden. Boarding strength är en egenskap,
  inte samma sak som besättningens återstående condition.
- Bordningsrundor minskar besättningens condition tills en sida ger upp eller
  lyckas dra sig ur. Noll condition betyder besegrad besättning, inte död kapten.
- Förslag för Break away: ingen egen attack, en motattack, därefter frigörelse
  om besättningen står kvar. Sjöstriden fortsätter efter frigörelsen.
- Flott-PvE använder samma stridsregler med förhandsgodkända order som körs
  automatiskt. Varje skepp behåller egna resurser och bidrag.
- Gruppens beslut kan inte godkänna en ny dödlig risk åt en frånvarande spelare.

De tidigare klickbara exemplen illustrerar dessa idéer. Deras skadevärden,
tidsordning och rundor är inte fastställda regler eller en implementerad stridsmotor.

## 7. Viktiga återstående beslut

1. Vilka färdigheter ingår, vad påverkar de och vad är nivåtaket?
2. Hur påverkar nivå, skepp, utrustning och skick respektive stridsvärde?
3. Hur delas XP mellan handlingar, segerbonus, försvar och flottans deltagare?
4. Hur mycket guld får bordningsvinnaren ta, och vilken del av valutan är utsatt?
5. Behåller den besegrade sitt guld vid kanonseger, eller går något förlorat?
6. Vad betyder utslaget skepp: lång reparation, ersättning eller permanent förlust?
7. Hur långa är väntetiderna och vilka hamnaktiviteter är tillgängliga under tiden?
8. Hur förbrukas och begränsas ammunition vid automatiskt offlineförsvar?
9. Vilka regler gäller för flykt, kapitulation, samtidiga attacker och attackskydd?
10. Hur godkänner flottans deltagare planer, risker och ändrad deltagaruppsättning?

Assistentens nuvarande förslag till punkt 5 är att behålla guldet vid kanonförlust;
den längre reparationen är då den huvudsakliga påföljden. Ägaren har inte beslutat detta.

## 8. Nästa designsteg

Bestäm den första färdighetslistan och varje färdighets uppgift. Beskriv därefter
en fullständig PvP-strid och en fullständig flott-PvE-strid med alla kostnader,
utfall, XP och återhämtningsregler. Först efter det avgränsas nästa byggbara etapp.
