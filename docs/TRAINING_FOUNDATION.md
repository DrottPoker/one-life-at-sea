# Träning och progression

Implementerat lokalt 2026-09-19. Balansen kommer från [gameplayconfig](../config/gameplay.json).
[Implementationsplanen](TRAINING_PROGRESSION_PLAN.md) är designunderlaget; items är uppskjutna.

## Spelregler

Crew och skeppet behåller fyra stats: Attack, Defense, Speed och Accuracy.
Nya karaktärer börjar med 10 i varje stat. Befintliga stats, hälsa, Energy och guld bevaras.
Energy återhämtas med +5 var femte minut, även offline, till högst 100.

- Crew: 5 Energy ger aktuell övnings statökning direkt och 5 XP. Perfect Drill har 1 % chans
  att dubbla statökningen, utan extra XP.
- Skepp: välj stat och Small, Medium eller Large. Betala Energy vid start och få stats/XP
  vid sluttiden. Ett pågående arbete åt gången, utan kö, avbryt eller automatisk upprepning.
- Small: 5 Energy, 5 minuter, en basökning. Medium: 25 Energy, 25 minuter, fem basökningar.
  Large: 50 Energy, 50 minuter, tio basökningar. Samma utbyte per Energy.
- Crew och skepp har separata kumulativa XP-spår. Varje spår delas av gruppens fyra stats.
  Ett XP per investerad Energy. XP förbrukas inte vid köp.
- Nästa övning/workshop kräver både XP och Gold Coins på karaktären. Bankpengar räknas inte.
  Steg köps i ordning och den högsta köpta nivån används automatiskt.
- En workshop kan köpas under ett arbete. Jobbet behåller sin ursprungliga ökning, XP och tid.
- Aktiva angripare och sjukhuspatienter kan inte träna, starta arbete eller köpa nivåer.
  Försvarare kan använda hamnen tills de besegras och hamnar i [Hospital](HOSPITAL.md).
  Redan startat arbete fortsätter under strid, sjukhusvistelse och offline.

Items, material, consumables, intjäning och utrustningsbonusar ingår inte.
Första träningen är gratis utöver Energy, och nya karaktärer börjar med 0 Gold Coins.
Ingen publik funktion för att skapa testpengar har införts.

## Progressionsvisning

Crew och skepp visar endast en progressionsmätare från 0 till 100 % för upplåsning.
Intjänad XP, XP-krav, återstående XP och XP-belöningar visas inte i spelgränssnittet,
inklusive träningsresultat och pågående/färdiga skeppsjobb. Vid slutnivån visas 100 %.
XP räknas fortfarande internt och köpkraven är oförändrade. Mätaren når 100 % först
när nästa nivå är upplåst; tidigare procenttal avrundas nedåt.

## Provisorisk balans

Båda spåren använder följande trappa, men har egna namn och egna XP.
Priserna är per köp. Dagarna visar XP / 1 440 vid maximal daglig Energyåterhämtning,
om all Energy används på ett spår. Startens 100 Energy, missad återhämtning vid full mätare,
annan Energyförbrukning och tid att få tag på guld ingår inte.

| Nivå | XP-krav | Gold Coins | Stats per 5 Energy | Teoretiska dagar |
| --- | ---: | ---: | ---: | ---: |
| 1 | 0 | 0 | 1 | 0 |
| 2 | 100 | 250 | 2 | 0,07 |
| 3 | 500 | 1 000 | 4 | 0,35 |
| 4 | 1 500 | 4 000 | 8 | 1,04 |
| 5 | 4 000 | 15 000 | 20 | 2,78 |
| 6 | 10 000 | 50 000 | 50 | 6,94 |
| 7 | 20 000 | 150 000 | 125 | 13,89 |
| 8 | 40 000 | 500 000 | 300 | 27,78 |
| 9 | 65 000 | 1 500 000 | 750 | 45,14 |
| 10 | 100 000 | 5 000 000 | 1 500 | 69,44 |

Första nivåköpet kan låsas upp med startens 100 Energy, alltså 20 crew-pass.
På nivå 10 ger en Perfect Drill 3 000 stats, och ett Large skeppsarbete 15 000 stats.
Tabellen är en justerbar första balans, inte en färdig ekonomimodell.

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
inte rundor. Den starka sena träningen gör alltså också jämna högstatsstrider korta med dagens
100 HP. HP, skala och skadebalans behöver ett separat balansbeslut före långsiktig lansering.

## Databas och offline

Åtta statkolumner använder bigint med taket 9 007 199 254 740 991, samma säkra heltalsområde
som klienten. XP har samma tak. Kostnader och sammansatta belöningar valideras i config.
Privata tabeller lagrar nivådefinitioner, två progressionsrader per karaktär,
aktionskvitton och skeppsjobb. Befintliga spelare börjar på första nivån med 0 XP;
historiska stats används inte för att hitta på tidigare XP.

Publika RPC:
- train_crew(stat, expected_tier_id, request_id)
- purchase_training_tier(training_group, tier_id, request_id)
- start_ship_upgrade(stat, size_id, expected_workshop_id, request_id)

Alla mutatorer autentiserar kontot, använder stridens ordnade deltagarlås och debiterar atomiskt.
Klienten kan inte välja ägare, kostnad, tid, XP, ökning eller slumpresultat.
Ett återförsök returnerar originalkvittot. Återanvänd request_id med annat innehåll avvisas.
Den tidigare train_stat-funktionen är borttagen i både public och private.

Skeppsjobbet lagrar sluttid och belöningssnapshot. En partiell unik nyckel på karaktären
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
Kvitton behålls för stabila återförsök; ingen rensningspolicy har införts.

Utförda kontroller redovisas i [implementationsstatus](IMPLEMENTATION_STATUS.md).
