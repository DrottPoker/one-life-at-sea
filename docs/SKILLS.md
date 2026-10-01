# Skills och Character Level

Ägaren valde sju skills: Fishing, Logging, Cooking, Crafting, Crew Battling, Ship Battling och Foraging.
Varje karaktär börjar med 0 XP och nivå 1 i varje skill. Högsta nivån är 100. Character Level är summan
av alla sju nivåer, från 7 till 700. Den ger ingen extra strids- eller resursbonus.

## XP-kurva

Kurvan har 100 nivåer och kräver exakt **5 000 000 XP totalt** för nivå 100. Den första nivåhöjningen
kostar 200 XP och varje följande nivå kostar cirka 7,98 % mer än den förra. Jämfört med den ursprungliga
klassiska kurvan går de tidiga nivåerna något långsammare, medan de sena kräver mycket mindre XP.

För nivå L (1 till 100) avrundas tröskeln till närmaste heltal:

```text
XP(L) = round(200 * (r^(L - 1) - 1) / (r - 1))
r = 1.079775901474282
```

Tillväxtfaktorn är den positiva lösningen till `200 * (r^99 - 1) / (r - 1) = 5000000`. Den togs fram med
bisektion mellan 1 och 1,2; den sista sparade tröskeln är exakt 5 000 000. Den sparade heltalstabellen är
auktoritativ i både SQL och gränssnittet.

| Nivå | Total XP |
| --- | ---: |
| 1 | 0 |
| 2 | 200 |
| 3 | 416 |
| 10 | 2 495 |
| 25 | 13 311 |
| 50 | 105 265 |
| 75 | 731 748 |
| 90 | 2 319 435 |
| 99 | 4 630 405 |
| 100 | 5 000 000 |

Med 10 XP per handling krävs 20 handlingar för nivå 2. Den högre startkostnaden och den lägre
tillväxtfaktorn gör kurvan flackare men behåller totalen på fem miljoner XP. Sista nivån kostar 369 595 XP.
Avrundningen sker innan trösklarna sparas.

De 100 heltalströsklarna sparas på ett ställe, i `gameplay.skills.xpThresholds`. Nivåer härleds från XP
och kan inte ändras separat. Migrationen behåller all befintlig XP och räknar om skillnivåer och publik
Character Level. En karaktär kan därför gå upp eller ner i nivå när kurvan ändras, utan att förlora
intjänad XP.

XP kan fortsätta öka efter nivå 100 medan nivån står still. Sparad XP och tilldelningar är alltid
icke-negativa säkra heltal, med taket 9 007 199 254 740 991 för JSON-transport. En tilldelning måste vara
positiv; den gemensamma hjälparen stannar vid taket i stället för att slå runt. Crafting kontrollerar först
att XP:n ryms under taket, så varje lyckat craft ger hela sin konfigurerade XP.

<a id="combat-xp-and-battling-health"></a>
## Strids-XP och maxhälsa från Battling

Varje attackorder i [strid](COMBAT_SYSTEM.md#xp-och-maxhälsa) ger `combat.xpGain` XP (10) till skillen för
sin fas, vid träff eller miss. Kanonsalvor tränar Ship Battling; skott med skjutvapen, kastade
Temporary-föremål och närstridsattacker tränar Crew Battling. Försvararens automatiska svar tränar
försvararen på samma sätt. Board, Disengage och Retreat ger ingenting.

Crew Battling höjer max Crew Health och Ship Battling höjer max Ship Health. Nivå 1 ger inget. Varje
följande nivå upp till 99 lägger till ett steg om `skills.battlingHealth.perLevel` (5), så nivå 2 ger +5,
nivå 3 +10 och nivå 99 totalt +490. Nivå 100 hoppar till `skills.battlingHealth.maxLevelBonus` (+750).
Konfigurationen nekar en bonus för nivå 100 som är lägre än bonusen för nivå 99. Max Ship Health
inkluderar även utrustad Hull, se [utrustning](EQUIPMENT.md#ship-health-från-hull).

En ny nivå höjer bara maxvärdet: aktuell hälsa behåller sitt värde och återhämtas i normal takt, medan
utskrivning från Hospital återställer till de höjda maxvärdena. Stridens ögonblicksbild behåller
maxvärdena från mötets start, så en nivå som nås under en strid gäller efteråt. En administrativ
XP-korrigering avräknar först återhämtningen mot det tidigare maxvärdet och sänker aktuell hälsa till ett
lägre maxvärde. `private.battling_health_bonus` är auktoritativ; profilen visar samma formel. Databasen
begränsar sparad hälsa med bonusen för nivå 100.

## Integritet och profil

Ägaren ser en Skills-sektion på sin egen profil med alla nivåer, total XP samt framsteg och återstående XP
till nästa nivå. Korten för Crew Battling och Ship Battling visar även hälsobonusen och vad nästa nivå ger.
Andra spelare ser bara Character Level. Motståndare och publika stridsloggar visar fortfarande maxhälsa,
precis som före bonusarna, så en kämpes hälsobonus från Battling kan räknas ut där.

## XP drop

Varje XP-ökning visas i ett litet kort längst ned till höger i spelramen och attackvyn, i spelets egen
panelstil. Kortet anger skillen och visar intjänad XP, nivå, total XP och en mätare mot nästa nivå, och
markerar en nivåhöjning. Kortet ligger kvar i fem sekunder efter senaste ökningen (`XP_DROP_MS` i
`xp-drop.tsx`) och tonar sedan ut. Mer XP medan det syns uppdaterar kortet på plats: ökningar i samma skill
läggs ihop med en kort puls, och en annan skill tar över kortet. Om flera skills ökar i samma uppdatering
visas den största ökningen. Ökningen, totalen och mätaren stiger från sina tidigare värden i en snabb
ease-out (`XP_COUNT_MS`, 0,45 sekunder) i stället för att hoppa; över en nivågräns fylls mätaren, börjar om
och nivåhöjningen visas när den når den nya nivån. Skärmläsare får slutvärdena en gång i stället för
uppräkningen.

Kortet har en enda källa: ägarens skillframsteg i spelarens ögonblicksbild. Klienten jämför varje ny
ögonblicksbild med den förra och visar varje skill vars XP ökat, oavsett vad som gav den: aktiviteter,
crafting, strid, inklusive försvararens automatiska svar, och administrativa korrigeringar. Den första
ögonblicksbilden efter en sidladdning är baslinjen, så en omladdning visar inget kort, ett återspelat
kvitto som inte ger något visar inget, och lägre XP visas aldrig som en ökning. Resultaten från aktiviteter
och crafting samt attackvyn upprepar inte längre den tilldelade XP:n; belöningsförhandsvisningar som
"+10 Fishing XP" på handlingarna finns kvar.

## Server och administration

`private.award_skill_xp(target_id, target_skill, amount)` är en intern hjälpare utan execute-behörighet för
klienter. Den använder den gemensamma låsordningen för karaktär och strid och låser karaktären innan XP
uppdateras. Olika skills som tilldelas samtidigt delar det låset, så både XP och den publika totalen blir
rätt. Den returnerar faktiskt tilldelad XP, tidigare och ny skillnivå, skillens totala XP och Character
Level.

Aktiviteter och crafting validerar villkoren och anropar hjälparen i samma transaktion som kostnader,
belöningar och sitt beständiga idempotenskvitto; nya handlingar ska göra likadant. En återspelad begäran
returnerar sitt sparade resultat utan att ge XP igen. Strid anropar hjälparen för angripare och försvarare
när en runda avgörs, under de lås striden redan håller, så även offlineförsvarare belönas och en återspelad
order ger ingen ny XP. Hjälparen är i sig varken en publik handling eller en idempotent aktivitetsendpoint.

Administratörer kan göra granskade XP-korrigeringar i databasresursen `character_skills`; nivåer och den
publika summan uppdateras automatiskt. Skilldefinitioner och trösklar är skrivskyddade i admin och ändras
via gameplaykonfigurationen. Befintliga karaktärer fick skillrader med 0 XP en gång. Att applicera config
igen behåller XP. Raderas ett konto raderas även dess skillrader. Befintliga skill-ID:n kan inte tas bort
ur konfigurationen. En ny skilldefinition lägger till en rad på nivå 1 för varje karaktär och höjer därför
den publika totalen med ett.

## Omfattning

Progression, integritet och visning är implementerade. [Activities](ACTIVITIES.md) ger Fishing, Foraging
och Logging XP, och [Crafting](CRAFTING.md) ger Crafting XP per lyckat craft; respektive dokument beskriver
hur mycket. [Strid](COMBAT_SYSTEM.md#xp-och-maxhälsa) ger Crew Battling och Ship Battling XP, och de
nivåerna höjer maxhälsan. Cooking, fler recept, nivåkrav och andra nivåbonusar återstår. Crew Training och
Ship Upgrades behåller sin egen workshop- och tränings-XP och ger inte automatiskt Crew Battling eller Ship
Battling XP.

## Verifiering

Enhetstester täcker de ombalanserade milstolparna och varje exakt nivågräns. Databastester täcker
initiering, alla nivågränser, åtkomst till privata API:er och tabeller, den publika totalen, maxnivå,
ogiltiga tilldelningar, återrullade transaktioner, adminändringar och städning. Tester med alternativ
config dubblar XP-trösklarna och lägger till en åttonde skill i en transaktion som rullas tillbaka.
Webbläsartester täcker ägarskap, liveuppdateringar, responsiva profiler och åtta samtidiga XP-tilldelningar
utan förlorade ökningar eller inkonsekvent publik summa.

Databastesterna i `battling-skills.test.sql` täcker hälsoformeln, båda maxvärdena med och utan Hull,
återhämtning, Hospital, administrativa korrigeringar och administrativ utskrivning samt XP från varje
attackorder för båda sidor. Tester med alternativ config ändrar XP per attack och hälsa per nivå.
Webbläsartester täcker profilbonusen, den höjda Crew Health-mätaren och XP drop-kortet (regionen
"Ship Battling XP gained") efter en attackorder.
