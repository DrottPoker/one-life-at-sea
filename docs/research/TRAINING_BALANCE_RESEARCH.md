# Research: Torn-inspirerad träning över flera år

Datum: 2026-09-21. Status: **grundförslaget är implementerat**.
Aktuella, exakta regler finns i [träningsdokumentet](../TRAINING_FOUNDATION.md).
Researchen nedan beskriver bakgrund, jämförelse med det tidigare systemet och återstående balansfrågor.

Ägarens inriktning: långsiktig statsutveckling över flera år, som Torn.
Förtydligande 2026-09-21: 100 Crew Health och 100 Ship Health är startvärden.
Båda ska kunna ökas genom ett framtida system. Hur ökningen tjänas in, dess
kurva och eventuella slutliga gränser är ännu inte bestämda.
Befintliga stats, XP, köpta nivåer, jobb och kvitton bevaras. Nya handlingar använder
statberoende träning med effektivitet 1-3 och omräkning för varje Energy.

## Slutsats

Låt utbytet bero på den stat som tränas, men ersätt samtidigt den nuvarande
nivåtrappans stora fasta ökningar. Att multiplicera dagens +1 till +1 500 med
ytterligare statskalning skulle kombinera två mycket starka tillväxtmotorer.

Träningens tempo måste bedömas tillsammans med användbar Energy per dag,
fördelningen över åtta stats, guld till nivåköp och stridernas längd.
En växande statökning bevisar inte att PvP eller ekonomin är balanserad.

## Vad källorna faktiskt visar

- Torns gym har olika effektivitet per stat. Standardgymmen går från 2,0 till
  7,3 gym dots, vilket motsvarar 3,65 gånger utbytet per Energy under i övrigt
  lika förhållanden. Nya gym kräver träningsprogression och medlemsavgift.
  [Torn Wiki: Gym](https://wiki.torn.com/wiki/Gym).
- Befintligt värde i den tränade staten, Energy och gymmodifierare påverkar
  ökningen. Spelarundersökningen beskriver multiplikativa bonusar, slump och
  separata beräkningar för varje pass även när flera pass beställs tillsammans.
  Det är en empirisk uppskattning, inte offentlig serverkod.
  [Vladar: Training Formula V2.0](https://www.torn.com/forums.php?p=threads&t=16182535).
- Happy påverkar särskilt tidig utveckling. Det kommer bland annat från boende
  och förbrukningsvaror, och träning förbrukar Happy.
  [Torn Wiki: Happy](https://wiki.torn.com/wiki/Happy).
- Gränsen som stoppade ökningen av träningsutbytet över 50 miljoner per stat
  togs bort den 2 augusti 2022. Ökningarna fortsätter därefter, men med
  bromsad skalning. Äldre guider som använder ett oförändrat tak är inaktuella.
  [Chedburns besked](https://www.torn.com/forums.php?p=threads&t=16288778).
- Torns naturliga återhämtning är +5 Energy var femtonde minut för vanliga
  konton och var tionde minut för donatorer, till 100 respektive 150.
  Det ger teoretiskt 480 respektive 720 Energy/dygn. Extra Energy finns från
  flera andra system.
  [Torn Wiki: Energy](https://wiki.torn.com/wiki/Energy).
- Torn har också växande Life med spelarens level, till skillnad från våra
  fasta 100 HP.
  [Torn Wiki: Life](https://wiki.torn.com/wiki/Life).

En användbar pedagogisk förenkling av normal träning är:

`ökning ≈ Energy × gymeffektivitet × bonusar × (grunddel + statberoende del)`

Det är en beskrivning av mekaniken, inte en komplett aktuell Torn-formel.
Happy påverkar delarna och högstatsområdet behöver sin egen behandling.
Wikins enkla uppskattning och den äldre textformeln i V2-tråden får därför inte
okritiskt användas för dagens stats över 50 miljoner. Den senare texten anger
fortfarande det gamla taket trots att tråden länkar till en uppdaterad kalkylator.

## Verifierat utgångsläge före implementationen

Källor: [gameplayconfig](../../config/gameplay.json),
[träningsregler](../TRAINING_FOUNDATION.md) och
[serverberäkningen](../../supabase/templates/gameplay/training.sql).

| Egenskap | Före ändringen |
| --- | --- |
| Stats | Fyra för Crew och fyra för Ship, startvärde 10 vardera |
| Crew | 5 Energy per pass; fast ökning från nivån |
| Perfect Drill | 1 % chans till dubbla stats; genomsnittlig direktbonus 1 % |
| Ship | Heltals-Energy, minst 5; en minut per Energy; belöning sparas vid start |
| Nivåer | Tio per spår; +1, +2, +4, +8, +20, +50, +125, +300, +750, +1 500 per 5 Energy |
| XP | Ett XP per Energy; separata spår för Crew och Ship |
| Sista nivån | 100 000 XP i respektive spår |
| Alla nivåköp | 7 220 250 Gold Coins per spår, 14 440 500 för båda |
| Återhämtning | 1 440 Energy/dygn i hamn eller 720 till havs, om ingen återhämtning går förlorad |
| Energytak | 100; från tom till full på 100 minuter i hamn |
| Träning på havet | Inte tillgänglig; återhämtad Energy kan användas efter hemkomst |

Vår dubbla återhämtning jämfört med en Torn-donator betyder inte automatiskt
dubbel utveckling i varje stat: vi har dubbelt så många stats. Jämnt fördelad
maximal hamnåterhämtning ger 180 Energy/stat/dygn, precis som 720 fördelat på
Torns fyra stats. Specialisering, havstid och missad återhämtning ändrar jämförelsen.

1 440 är en teoretisk gräns, inte ett rimligt standardantagande för alla spelare.
Hundraminutstaket gör antalet inloggningar betydelsefullt. Med åtta timmars sömn,
tom mätare vid läggdags och optimalt uttag resten av dygnet kan högst cirka
1 060 återhämtad Energy användas under ett sådant dygn i hamn, utan extra källor.

## Vald kurva

En enkel, egen kurva som kan ge den önskade känslan utan ett permanent procentpåslag:

`normal gain per 5 Energy ≈ M × (1 + S / 1 000)^0,6`

Implementationens exakta algoritm räknar en Energy i taget, avrundar till sex decimaler
och höjer den virtuella staten före nästa enhet. Se [exakt beräkning](../TRAINING_FOUNDATION.md#exakt-beräkning).

- S är permanent värde i just den tränade staten. Utrustning och tillfälliga
  stridsbonusar ska inte blåsa upp basen för permanent träning.
- M är övningens eller workshopens effektivitet.
- Implementerade tio nivåer: 1,00; 1,15; 1,35; 1,55; 1,80; 2,05; 2,30;
  2,55; 2,80; 3,00.
- Crew behåller tills vidare 1 % Perfect Drill, separat från normalökningen.
- Energy förblir heltal. Statfraktioner sparas, även för Crew.
- Värdena 1 000 och 0,6 är justerbara balansparametrar, inte uppgifter om Torn.

| Befintlig stat | Första nivån, M = 1 | Sista nivån, M = 3 |
| ---: | ---: | ---: |
| 10 | +1,01 | +3,02 |
| 100 | +1,06 | +3,18 |
| 1 000 | +1,52 | +4,55 |
| 10 000 | +4,22 | +12,65 |
| 100 000 | +15,94 | +47,84 |
| 1 000 000 | +63,13 | +189,41 |

Tabellen visar normalpass utan Perfect Drill och är avrundad för läsbarhet.
Ökningen blir större med staten, medan ökningen i procent minskar.
Sista nivån är inte tillgänglig för en ny spelare; kolumnen isolerar nivåns effekt.

Detta är medvetet en mjukare kurva än ren proportionell statökning.
Vid höga värden ger tio gånger större stat ungefär fyra gånger större gain,
inte tio gånger. Inget nytt balansmässigt stattak har införts; den befintliga tekniska gränsen kvarstår.

Happy bör inte införas som ytterligare resurs samtidigt med denna första ändring.
Ett framtida Morale-system kan fylla en liknande roll, men behöver egen ekonomi
och ett begränsat bidrag. Crew Health bör inte återanvändas som Morale, eftersom
förlorad strid då också kan ge sämre framtida träning.

## Reproducerbar illustration av tempot

Kör:

`node scripts/analysis/training-balance.mjs`

Simuleringen läser nuvarande startstats, XP-krav, priser och Perfect Drill-inställning.
Den jämför den tidigare fasta nivåtrappan, lagrad uttryckligen i analysverktyget,
med den implementerade statberoende modellen.

Antaganden:

- Den angivna dagsbudgeten är Energy som faktiskt går till träning, efter andra
  aktiviteter och missad återhämtning.
- Alla åtta stats tränas jämnt, hälften av Energy till vardera spåret.
- Nivåer köps så snart XP tillåter; guld antas finnas. Priserna är inte ombalanserade.
- Ship räknas i block om 5 Energy utan väntan eller kalenderförskjutning.
  Inget påstående görs om exakt jobbplanering eller kalenderprognos.
- Perfect Drill ersätts med sin genomsnittliga bonus. Det är en deterministisk
  approximation, inte en exakt förväntan för en slumpmässig sammansatt kurva.
- Varje normal Energy-enhet avrundas till sex decimaler. Inga items, buffar eller strider modelleras.

Resultat för **en Crew-stat**, inte summan av alla stats:

| Energy till träning per dygn | Efter 30 dagar | Efter 1 år | Efter 3 år |
| ---: | ---: | ---: | ---: |
| 300 | 385 | 20 987 | 302 997 |
| 600 | 937 | 107 759 | 1 742 646 |
| 1 000 | 1 972 | 395 656 | 6 286 901 |

Vid 600 Energy/dygn ger den tidigare nivåtrappan cirka 2 582 827 i en Crew-stat efter
ett år, mot den nya kurvans 107 759 under samma antaganden. Det är inte bevis för att
ett visst absolut stattal är bättre. Det visar hur kraftig den tidigare trappan var.

Vid 600 Energy/dygn uppnår båda spåren XP-kravet för sista nivån omkring dag 334.
Ett spår som får all Energy når kravet tidigare. Guld och tillgänglig hamntid kan
fördröja köp; simuleringen är ingen garanti om faktisk utveckling.

### Känslighet och ekonomisk betydelse

Vid 600 Energy/dygn, jämn fördelning och omedelbara nivåköp:

| Exponent | Crew-stat efter 1 år | Efter 3 år |
| ---: | ---: | ---: |
| 0,5 | 61 512 | 599 030 |
| 0,6 | 107 759 | 1 742 646 |
| 0,7 | 233 924 | 8 503 316 |

En liten parameterändring ger stor långtidseffekt. Därför är 0,6 en vald utgångspunkt att
utvärdera, inte en redan bevisat balanserad siffra.

Utan något nivåköp ger samma budget med exponent 0,6 cirka 17 545 efter ett år.
Med alla nivåköp blir det cirka 107 759. Guld påverkar alltså även framtida
statökningar genom den redan uppbyggda staten, inte bara dagens multiplikator.

Om all Energy i stället går till Crew Attack blir den cirka 17 352 908 efter ett
år, medan övriga stats står kvar på 10. Det är inte samma sak som stridsstyrka:
en sådan karaktär saknar tränad träffsäkerhet, försvar och skepp. Ensidig,
tvåstats- och balanserad träning måste ändå provas i riktiga stridssimuleringar.

Nuvarande priser kommer från en 1 500-faldig nivåtrappa och bör inte antas vara
rimliga för en trefaldig trappa. Prisnivåerna behöver kopplas till faktisk
guldintjäning och önskad tid mellan köp. Den modellen saknas ännu i analysen.

## PvP och planerad hälsoprogression

Den långsiktiga designen utgår från att Crew Health och Ship Health kan växa
från 100. Träningskurvan behöver därför inte begränsas för att passa ett
permanent tak på 100 HP. Tabellen nedan beskriver enbart dagens implementation.

[Nuvarande skadefunktion](../../supabase/templates/gameplay/combat.sql) växer med
Attack även när Defense ökar lika mycket. Mot 100 HP blir skadan per lyckad träff:

| Attack och Defense | Skada | Lyckade träffar till utslag |
| ---: | ---: | ---: |
| 10 | 32 | 4 |
| 100 | 56 | 2 |
| 1 000 | 87 | 2 |
| 10 000 | 125 | 1 |

Redan omkring 2 239 i båda heltalsstats kan en lyckad träff ge minst 100 skada.
Detta gäller lika Attack/Defense; träffchans och stridsförlopp är separata frågor.

Föreslaget balansmål när hälsoprogressionen utformas: jämnstarka spelare med
jämförbar utrustning bör normalt tåla flera lyckade träffar genom hela utvecklingen.
Prova exempelvis 4-8 som arbetsintervall, men verifiera också ammunition, boarding,
maxrundor, försvararens samtidiga motattack och flera angripare innan det fastställs.

När hälsoprogressionen införs kalibreras dess kurva mot statutveckling, utrustning
och skada. Den exakta hälsomekaniken lämnas till ägarens kommande plan. Träningens
implementation kan utvecklas separat; slutlig PvP-balans behöver sedan verifieras
med den faktiska hälsoprogressionen.

Sea distance är en positionsregel, inte en garanti om likvärdig stridsstyrka.
Skydd för nya spelare och vilka möten spelet uppmuntrar behöver därför bedömas
separat. Flerårig beständig progression ger ofrånkomligen veteraner ett försprång.

## Implementation och kvarstående balansarbete

Kurva, decimaler, lås, sparade kvitton/jobb och gränssnitt är implementerade.
XP-krav och priser behålls tills en faktisk intjäningsmodell finns. Punkten om
PvP-simuleringar och hälsoprogression är fortsatt framtida arbete. Ursprunglig checklista:

1. Kalibrera gainkurva, XP och nivåpriser tillsammans. Behåll åtta stats och
   separata Crew-/Ship-spår; XP kommer från betald Energy, inte från erhållna stats.
2. Prova jämn fördelning, flera specialiseringar, olika Energy-budgetar och
   sena nybörjare i stridssimuleringar över månader och år.
3. Spara statfraktioner med bestämd precision eller en beständig rest. Att avrunda
   varje +1,01 till +1 tar bort tidig skalning; Energy och Gold förblir heltal.
4. Beräkna allt auktoritativt under befintliga karaktärs-/stridslås.
   Spara utfall, slumpresultat och regelversion i originalkvittot.
5. Perfect Drill måste lagras som eget faktiskt slumputfall. Dagens jämförelse
   `gain > tier.stat_gain` blir fel när normala pass själva skalar med staten.
6. För Ship: samma interna Energy-enhet måste användas för små och stora jobb,
   med omräkning av den virtuella staten mellan enheterna. Då ska 100 Energy ge
   samma normala utbyte som tio jobb om 10 under identiska villkor. En enda
   beräkning på startstaten gånger E gör annars småjobb mer lönsamma.
7. Jobbets beräknade belöning och koefficienter sparas vid start. Nivåköp eller
   balansändring före färdigställande får inte räkna om ett redan betalt arbete.
8. Visa förväntad gain per stat i gränssnittet. Nu visas samma tier.statGain
   för alla Crew-stats, vilket inte fungerar med statberoende ökning.
9. Behåll gamla stats, kvitton och jobb. Ändra bara nya handlingar och skapa
   nya migrationer; kör även idempotens-, samtidighets- och avrundningstester.

Analysverktyget har körts om med avrundning och omräkning per Energy. Aktuell
verifiering av implementation, bevarad data och tester redovisas i
[implementationsstatus](../IMPLEMENTATION_STATUS.md).
