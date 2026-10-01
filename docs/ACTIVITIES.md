# Aktiviteter

Sidan `/activities` nås från sidomenyn och hamnens katalog. De första aktiviteterna är **Shore Fishing**
(Fishing XP), **Foraging** (Foraging XP) och **Logging** (Logging XP). Alla tre är öppna från nivå 1. Varje
försök kostar Stamina, se [Stamina](STAMINA.md). Ett lyckat försök ger aktivitetens `xpGain`, i dag 10 XP,
till dess skill. Tjugo lyckade försök ger 200 XP och nivå 2 på den ombalanserade kurvan.

Handlingarna sker direkt, utan timer, utrustningskrav eller moralmodifierare. Shore Fishing använder loot
table Harbor Shore, som hanteras i adminpanelen: först fångstslaget, sedan fasta föremål och sist viktade
fiskar. Både fångst och miss kostar Stamina. En fångst ger full XP och en miss ger [failure XP](#failure-xp).
Logging använder Woodland Logging och ger Oak Logs vid lyckat försök. Fångstchansen stiger med skillnivån
enligt aktivitetens koppling till sin loot table. Startvärdena är seedade standardvärden som
administratörer kan ändra i adminpanelen; de står i [Loot tables](LOOT_TABLES.md). Foraging ger bara XP
tills en loot table kopplas till den. Energy, Gold Coins och tränings-XP påverkas inte.

Aktivitetsraden visar skillnivå, XP-framsteg, belöning och kostnad. Resultatet visas i en expanderbar
resultatpanel under aktiviteten, utan modal. Tilldelad XP och nivåhöjningar visas i den gemensamma
[XP drop](SKILLS.md#xp-drop). Stamina och skillframsteg uppdateras när ett slutfört kvitto har bekräftats.
Profilen visar samma XP och publika Character Level.

## Resultatpanel

Ett bekräftat kvitto öppnar en kompakt panel under aktiviteten. En fångst visar **Success** med föremålens
miniatyrer och antal. En miss visar **Failure** och Stamina-kostnaden står kvar; den lägre XP:n syns i
XP drop som all annan XP. Aktiviteter som bara ger XP visar **Success** utan en tom belöningsrad. Väntande
eller nekade anrop märks inte som en misslyckad fångst: osäkra svar visar **Unconfirmed**, och kända fel
förklarar varför handlingen inte kunde genomföras.

Det senaste resultatet ligger kvar tills ett nytt resultat kommer eller stängknappen används. Stängning
flyttar fokus tillbaka till aktivitetsknappen. Vanliga uppdateringar av spelläget behåller panelen. Hover,
fokus eller tryck på en belöning visar föremålets namn; Escape eller en interaktion utanför stänger
tooltipen. Tooltips stannar inom visningsytan. Föremålsbilder använder inventoryns reservbild, inklusive
den gemensamma dummybilden. Meddelanden till skärmläsare är skilda från tooltips. Resultatet öppnas genom
att dess faktiska höjd expanderar under 240 ms med mjuk easing, så att raderna nedanför flyttas ned jämnt.
Klippningen upphör när animationen är klar, så att föremålens tooltips syns. Upprepade försök uppdaterar
ett redan öppet resultat utan att först fälla ihop det. Byte av aktivitet eller stängning fäller ihop den
gamla panelen och dess mellanrum under 150 ms innan den tas bort. Paneler som stängs är inerta och dolda
för hjälpmedel. Avbrutna animationer fortsätter från sin aktuella höjd, och inställningen för reducerad
rörelse genomför ändringen direkt.

Belöningarna visas i en radbrytande rad utan fast antal föremål. Presentationslagret tar emot dagens
lootkvitto med ett föremål och ett valfritt framtida `rewards`-objekt med en `items`-array och ett positivt
`gold_coins`-belopp. Det senare kan visa föremål, Gold Coins eller båda. Ett valfritt `outcome`-fält väljer
uttryckligen success eller failure för framtida aktivitetstyper; befintliga kvitton härleder utfallet från
`loot.caught`. Uttryckliga `rewards` ersätter äldre loot i vyn, så belöningar visas inte två gånger.
Failure visar aldrig någon belöning.

Detta är bara visningsstöd: dagens antal, lootchanser och faktiska valutautbetalningar är oförändrade.
Framtida belöningar med flera föremål eller guld måste delas ut atomiskt av servern och ingå i dess
beständiga kvitto. Webbläsaren delar aldrig ut belöningar utifrån visade värden.

## Failure XP

Ett missat fångstslag ger `gameplay.activities.failureXpPercent` (50) procent av aktivitetens XP, avrundat
nedåt men aldrig under 1 XP. En fångst, och varje försök i en aktivitet utan kopplad loot table, ger full
XP. Bara servern bestämmer beloppet utifrån det sparade lootutfallet; klientens erbjudande anger fortfarande
full XP för kontrollen av inaktuella erbjudanden. Kvitton som sparades före ändringen behåller den XP de gav.

## Villkor

De första aktiviteterna sker nära The Harbor och kräver att karaktären är i hamnen, utanför strid och
Hospital. Serverkontroller tillämpar samma regler som navigeringen och knapparna. Ingen begränsning för
skeppsarbete läggs till; en pågående skeppsuppgradering spärrar fortfarande resor men inte dessa
strandaktiviteter. För lite Stamina nekar begäran. Återhämtningen avräknas på servern innan kostnaden dras,
så återhämtning offline kan betala en handling. Den befintliga uppdateringen vid Stamina-deadline aktiverar
knapparna igen när ett tick har återställt tillräckligt.

## Atomiska anrop och återställning

`public.perform_activity(activity_id, expected_stamina_cost, expected_xp_gain, request_id)` delegerar till
den privata autentiserade transaktionen. Aktuell karaktär bestäms från det inloggade kontot och skickas
aldrig av klienten. Transaktionens gemensamma lås för strid och karaktär serialiserar samtidiga
aktiviteter, träning, resursändringar och resor.

Transaktionen kontrollerar först sitt befintliga kvitto i `private.activity_requests`. En exakt
återspelning returnerar det sparade resultatet utan att dra kostnad eller ge XP igen, även om erbjudandet
har ändrats, aktiviteten har stängts av eller karaktären nu är till sjöss, i strid eller på Hospital.
Återanvänds ID:t med en annan aktivitet, kostnad eller belöning ges `REQUEST_CONFLICT`.

För en ny begäran kontrollerar servern villkoren, att aktiviteten är aktiv och det aktuella erbjudandet.
Därefter anropas `spend_activity_stamina`, eventuell konfigurerad loot slås och delas ut med skillnivån före
försöket, och `award_skill_xp` anropas med full XP eller failure XP i samma transaktion, som också sparar
kvittot. Kostnad, XP, inventory, cirkulation, nivåprojektion, notiser och kvitto committas tillsammans. En
återspelning returnerar den sparade fångsten utan nytt slag, även efter ombalansering eller om kopplingen
till loot table har tagits bort. Ogiltiga eller misslyckade handlingar lämnar varken kostnad, belöning eller
kvitto. Samtidiga unika begäranden kan inte dra mer Stamina än som finns kvar. En skill vid lagringstaket
för säkra heltal nekar fler aktiviteter (`SKILL_XP_LIMIT`); att nå skillnivå 100 stoppar inte i sig
XP-ökningen.

Den gemensamma ekonomijournalen i webbläsaren sparar exakt erbjudande och UUID innan anropet skickas. Web
Locks samordnar flikarna. Vanliga pågående anrop visar inte återställningsbannern. Ett osäkert svar behåller
sin begäran så att den kan kontrolleras säkert via den befintliga återställningskontrollen. Återställda
begäranden uppdaterar aktuellt spelläge och skillvisning.

## Konfiguration och dataåtkomst

Katalogen ligger under `gameplay.activities.catalog`: stabilt `id`, `name`, `skillId`, `description`,
`buttonLabel`, `xpGain` och `active`. `gameplay.activities.failureXpPercent` (1-100) styr hur stor andel av
`xpGain` en miss ger. Stamina-kostnaden kommer från `gameplay.stamina.activityCost`. SQL och gränssnitt
använder samma validerade konfiguration. Befintliga aktivitets-ID:n och skillkopplingar kan inte tas bort
eller flyttas; aktiviteter kan i stället stängas av. XP kan ombalanseras. Klienten skickar förväntade
värden för att upptäcka inaktuella erbjudanden, inte för att bestämma belöningar.

Definitioner och kvitton är privata med RLS och utan tabellbehörigheter för klienter. Verifierade
administratörer kan läsa dem men inte ändra dem. Sparade kvitton innehåller faktisk XP- och
Stamina-ändring, nivå före och efter, Character Level, gameplay-revision och det sparade lootutfallet med
tabellversion. Den befintliga integritetsregeln för profiler gäller: detaljerade skillnivåer och XP visas
bara för ägaren.

## Verifiering

Databaskontroller täcker alla tre skills, de ombalanserade tidiga nivåerna, atomisk kostnad och belöning,
sparad loot, inaktuella och manipulerade erbjudanden, avstängda aktiviteter, återspelade kvitton, isolering
mellan konton, återrullning, Stamina-återhämtning, nollsaldo, strid, resor och Hospital. Missar ger halva
XP:n och minst 1 XP. Kontroller med alternativ config använder 3 Stamina, 17 XP och en failure-andel på
30 % (5 XP). Tester som behöver exakta XP-summor använder Foraging, som saknar fångstslag. Webbläsartester
täcker direkt återkoppling, beständighet i profilen, mobillayouter, resursåterhämtning, samtidiga och
duplicerade anrop och återställning av sparade handlingar. Det gemensamma återkopplingstestet håller ett
svar öppet medan två flikar kontrolleras så att bannern inte blinkar till.

Tester av resultatpanelen täcker även kompatibilitet med äldre kvitton, flera föremålsbelöningar, utfall
med bara föremål, bara mynt och båda, tooltips med olika inmatningssätt, stängning och radbrytning på
mobil. Framtida belöningsformat testas med presentationskvitton som bara tillhör engångskaraktärer för test.
