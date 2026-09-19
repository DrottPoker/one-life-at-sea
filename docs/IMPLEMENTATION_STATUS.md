# Centrerade popupfönster, 2026-09-19

Alla modala dialoger centreras som standard i skärmens synliga yta, om ingen särskild
placering anges. Trash och adminpanelens dialoger använder ett gemensamt litet kryss
uppe till höger. Krysset stänger utan att skicka formuläret; Trash behåller befintligt
skydd mot stängning medan en radering pågår.

Verifierat: lint och produktionsbygge med TypeScript passerade. Båda befintliga
Trash-webbläsartesterna passerade. En separat webbläsarkontroll bekräftade centrering,
kryss, Escape, återställt fokus och oförändrat itemantal efter avbrytning.
Trash kontrollerades vid 1280, 375 och 320 px bredd, och admin vid 1280 och 375 px,
även med sidan scrollad. Skärmbilder granskades på desktop och mobil.

# Energy-slider för skeppsarbete, 2026-09-19

Work size använder nu en slider från 5 till aktuell Energy, i steg om 1.
En Energy tar en minut. Förhandsvisningen uppdaterar tid, kostnad och statökning direkt.
Slidern följer ändrat saldo och arbete går inte att starta med mindre än 5 Energy.
Första workshopen ger fortsatt 1 stat per 5 Energy; exempelvis ger 6 Energy +1,2 stats.

- RPC tar energy_amount och validerar heltal, minimum, tak och aktuellt återhämtat saldo.
- Skeppsstatistik och sparade jobb använder numeric för att bevara decimaler.
- Befintliga jobb behåller sina kostnader, belöningar och sluttider. Crew-balansen är oförändrad.
- Nya jobb använder en fast statökning per Energy så att uppdelning inte ger avrundningsbonus.
- Två migrationer applicerade lokalt utan återställning av databasen.

Verifierat: lint, typkontroll, 121 enhetstester och produktionsbygge passerade.
724 databasassertioner och 49 kontroller med alternativ konfiguration passerade.
Fem webbläsartester för träning passerade, inklusive saldoförändringar, minimum,
decimalbelöningar, återförsök, samtidighet och automatisk färdigställning i flera flikar.
Slidern kontrollerades visuellt på desktop och mobil; 320 px ger ingen horisontell overflow.
Supabase security advisors rapporterade inga problem. Localhost svarade HTTP 200.

# Adminpanel implementerad, 2026-09-19

[Adminpanelen](ADMIN_PANEL.md) finns på `/admin`, med Ludorex som lokal administratör.
Funktionalitet har prioriterats enligt ägarens instruktion.

- Spelarsökning, resurs-/stat-/saldoändringar och träningsprogression.
- Itemgenerering med antal och individuella utrustningsstats, mängdändringar och radering.
- Databasvy för samtliga 25 nuvarande spel-/admintabeller med sökning,
  exakta filter, kolumntyper, fullständiga värden och 50 rader per sida.
- Utskrivning från Hospital, avslut av strid utan extra skaderunda och avbrytning
  av skeppsjobb utan återbetalning. Adminvyn fungerar även vid egna spellås.
- Databasägd behörighet, HTTP 403 för inloggade icke-administratörer och skydd
  i både serverfunktioner och RPC:er. Ingen service-nyckel behövs.
- Orsak, förhandsgranskning, samtidighetskontroll och atomär före/efter-logg.
  Sparade anrops-ID:n kan återanvändas efter nätverksfel och omladdning.
- Resursändringar sätter nya återhämtningstider. Gamla tidsankare kan därför inte
  omedelbart återställa manuellt ändrad Energy eller hälsa.
- Tre adminmigrationer är applicerade lokalt utan databasåterställning.
  Kataloger, projektioner, historiska kvitton och audit är skrivskyddade i panelen.
  Kontoborttagning, behörighetstilldelning och schemaändringar är fortsatt ägaroperationer.

Verifierat:

- Lint, typkontroll, 105 enhetstester och produktionsbygge passerade.
- 698 databasassertioner passerade, varav 81 för administration.
  Tre nya resurstester misslyckades före den sista korrigeringen och passerade efteråt.
- 49 kontroller med alternativ konfiguration passerade och rullades tillbaka.
- Hela webbläsarsviten passerade: 37 av 37 scenarier i samma körning.
  Efter den sista resursmigrationen passerade alla fyra adminscenarier igen.
  De täcker även förlorat svar följt av omladdning, samtidiga tilldelningar,
  stale edits, återkallad behörighet, stridslogg och avbrutet skeppsjobb.
- 320, 375, 768 och 1280 px kontrollerades utan sidöverflöde.
  Dator- och mobilbilder granskades visuellt.
- Supabase security advisors rapporterade inga problem. Samtliga befintliga
  public/private-tabeller har en post i adminvyns tillåtna tabellregister.
- Audit-testet avgränsar numera till sitt eget konto, eftersom tidigare auditposter
  avsiktligt finns kvar efter kontoborttagning.
  Diagramtestet inväntar färdigrenderat periodbyte och använder ett bestämt HTTP
  503-svar vid test av API-fel och Retry.
- Den vanliga lokala utvecklingsservern kör på port 3000 och har adminrutten.

Next.js rapporterar fortfarande den tidigare dokumenterade diagnostiken för
avbrutna RSC-strömmar. Vid avsiktligt avbrutna anrop förekommer också en
MaxListenersExceededWarning från serverns Gzip-ström. Dessa har inte dolts;
ovanstående funktionstester passerar. Ingen commit eller publicering har gjorts av agenten.

# Stabilt periodbyte i cirkulationsdiagrammet, 2026-09-19

- Felet reproducerades på 1280 och 375 px: ett nytt periodval tog bort diagrammets
  DOM-nod medan hämtningen pågick, vilket krympte sidan och flyttade scrollpositionen.
- Den senaste kurvan ligger nu kvar tills ersättningen kommer. Plotten behåller
  samma DOM-nod och uppmätt bredd. Laddning, fel och stickprovsindikator ligger
  ovanpå en stabil diagramyta; bildtextens höjd ändras inte vid periodbyte.
- Retry bevarar tidigare data och anger vilken period som fortfarande visas om
  den nya hämtningen misslyckas. Avbrutna svar kan fortfarande inte skriva över nya val.
- Lint och produktionsbygge inklusive TypeScript passerade. Det fullständiga
  cirkulationsflödet samt två regressionstester passerade i samma körning.
  Regressionstesterna håller tillbaka nätverkssvaret och mäter sidans höjd,
  scrollposition och plottnod varje bildruta före, under och efter bytet.
  Ingen uppmätt scrollförflyttning över 1 px och ingen höjdändring tilläts.
- De två nya regressionstesterna misslyckades på versionen före fixen.

# Item Circulation implementerat, 2026-09-19

[Item Circulation](ITEM_CIRCULATION.md) är implementerat och applicerat lokalt.

- Circ. visar det globala antalet per itemtyp. En diagramknapp öppnar historiken
  direkt under itemets detaljer, före nästa itemrad.
- Sex perioder finns, med All time förvalt. Vänsterkant följer verklig historik
  och vald period; högerkant är aktuell observationstid.
- Hover, tryck och tangentbord visar datum/tid i UTC samt Total in circulation.
- Räknare och historik uppdateras atomärt med skapande, ändrade mängder,
  Trash och kontoradering. Ägar-/statändringar och idempotenta återförsök räknar
  inte extra. Historiken börjar vid införandet med det befintliga innehavet.
- Stora globala antal behåller sin precision. Stora historiksvar begränsas
  genom indexerade stickprov; den fullständiga historiken sparas.
- Diagrammet kan läsas under sjukhusvistelse och hanterar avbrutna hämtningar,
  periodbyten och Retry. Tooltipen begränsas till diagrammets bredd även under resize.

Verifierat:
- Lint, typkontroll, 102 enhetstester och produktionsbygge passerade.
  De nio diagramtesterna och berörda lintkontroller kördes också efter sista ändringen.
- 617 databasassertioner passerade, varav 49 för cirkulation.
- 49 kontroller av alternativ config passerade och rullades tillbaka.
- Alla sju inventoryscenarier passerade tillsammans, inklusive det nya fullständiga
  cirkulationsflödet, två samtidiga ägare, nätverksfel, Hospital och mobil.
- Skärmbredder 320, 375, 768 och 1280 px klarade kontrollen utan horisontellt överflöde.
  Slutresultatet inspekterades visuellt på dator och mobil.
- Supabase security advisors fann inga problem. Samtliga sex globala totalsummor
  jämfördes med faktiskt innehav och stämde.
- Localhost svarar med HTTP 200. Inga commits eller publiceringar har gjorts.

Den sedan tidigare dokumenterade Next.js-diagnostiken vid avbrutna RSC-strömmar
förekommer i testserverns logg; samtliga spel- och diagramflöden passerade.

# Inventory och items implementerat, 2026-09-19

[Inventory](INVENTORY.md) är implementerat enligt den första etappen i
[inventoryplanen](INVENTORY_PLAN.md).

- Inventory finns i sidopanelens Harbor-meny med sex kategorier, namnsökning och sidindelning.
  Panelen fyller innehållsytans bredd; itemradernas grundhöjd är 36 px på dator och 45 px på mobil.
  En tunn, indragen avskiljare ligger mellan miniatyren och namnet.
  Detaljbildens yta är högst 280 × 190 px och 180 px hög på mobil.
- Kompakta itemrader visar egna bilder, namn, stackantal och individuella stats.
  Klick öppnar beskrivning, effekttext och större bild direkt under raden.
  Detaljernas egenskaper visas i två kolumner: Category/Quantity och Damage/Accuracy,
  bredvid bilden på dator och under bilden på mobil.
- Crew-vapen och kanoner är separata exemplar. Förbrukningsvaror och material stackas.
- Trash har antal, bekräftelse, ägarkontroll, atomär radering och beständiga kvitton.
  Återförsök efter ett förlorat svar förstör inte fler items, även om sista raden försvunnit.
- Andra flikar uppdateras. Öppen bekräftelse visar senaste tillgängliga mängd.
- Inventory kan läsas i Hospital. Trash är spärrat där och för aktiva angripare.
  Profiler, sjukhusnedräkning och övriga navigationslås fungerar fortsatt.
- Equip och Use är synliga men inaktiva. Medicinska effekter, träningsbuffar,
  utrustningsbonusar och value återstår. [Cirkulation och historik](ITEM_CIRCULATION.md) är tillagt.
- Katalogen följer central config. Tidigare definitioner kan inte tas bort eller
  ändra typ/utrustningsplats genom synk; befintliga innehav och stats bevaras.
- Två nya migrationer är applicerade lokalt utan reset:
  20260919072355_inventory_foundation.sql och
  20260919072801_central_gameplay_config_60b2d2217835.sql.
- Vanliga karaktärer har tomt inventory. Ett verifierat lokalt fixturekommando finns
  för en uttryckligt vald testkaraktär. Provitems har därefter lagts på Ludorex på ägarens begäran.
- Sex egna transparenta PNG-bilder finns i public/images/items. Prompter och ursprung
  är dokumenterade i [ITEM_ART.md](ITEM_ART.md).

Efter justeringen av bredd, bildstorlek och menylänk passerade lint, typkontroll,
produktionsbygge och samtliga sex inventoryscenarier igen. Dator- och mobilbilder
kontrollerades visuellt; Inventory förblev tillgängligt under sjukhusvistelse.

Verifierat vid grundimplementationen:

- Lint, typkontroll, 93 enhetstester och produktionsbygge passerade.
- 568 databasassertioner passerade, inklusive 61 nya för inventory.
- 49 kontroller med alternativ config passerade i en återställd transaktion.
  De täcker även beständiga itemstats, oförändrade stackar, sidstorlek,
  avaktiverade definitioner, citattecken och förbjudna katalogändringar.
- Alla 11 relevanta webbläsarscenarier passerade i samma körning: sex för inventory,
  fyra för Hospital/profiler och ett för navigation. Inventory täcker flera flikar,
  återinloggning, medicinsk kategori i Hospital, stridslås, nätverksavbrott,
  samtidiga raderingar, tomt innehav och radering av sista resultatsidan.
- 320, 375, 768 och 1280 px kontrollerades utan horisontellt överflöde.
  Miniatyrerna ryms inom raderna och alla sex bilder laddas.
- Lokalt fixturekommando verifierades med ett separat testkonto: sju poster skapas
  och en upprepning bevarar redan ändrade mängder. Testkontot togs bort.
- Supabase security advisors rapporterade inga problem. Localhost svarar med HTTP 200.

Den tidigare dokumenterade Next.js-diagnostiken "The destination stream closed early"
förekommer fortfarande vid avbrutna RSC-strömmar. De verifierade flödena passerar;
diagnostiken döljs inte.

# Inventory: implementationsplan, 2026-09-19

[Inventoryplanen](INVENTORY_PLAN.md) är klar. Ingen inventoryfunktion är implementerad ännu.

- Första etappen är beständiga items, kategorifilter, kompakta rader och utfällbara detaljer.
- Crew-vapen och kanoner är de första utrustningstyperna.
- Equip och Use visas men väntar med faktisk spelpåverkan till nästa etapp.
- Trash fungerar i första etappen, med antal och bekräftelse.
- Inventory får läsas på sjukhuset. Medicinska items får användas där när Use införs.
  Trash och andra itemhandlingar är spärrade under sjukhusvistelsen.
- Value och antal i cirkulation införs senare.
- Planen bygger på ägarens referensbilder, förtydliganden och Torns officiella wiki.
- Detta är en dokumentationsändring. Inga migrationer, itemtilldelningar eller speländringar har gjorts.

# Profiler tillgängliga under sjukhusvistelse, 2026-09-19

- My Profile är alltid tillgänglig. Sjukhuspatienter kan läsa sin egen och andra spelares profiler.
- Patientnamnen i Hospital länkar till profilerna. Tillbaka-länken på profilen leder till Hospital under vistelsen.
- Profiler visar Hospital, In hospital och en nedräkning för alla registrerade spelare.
  Statusen uppdateras vid intagning och tas bort efter utskrivning, även när patienten är offline.
- Sjukhussidan och profilen delar samma nedräkningskomponent. Databastid styr återstående tid.
- get_hospital_status läser den befintliga RLS-skyddade patientprojektionen och lämnar bara
  sluttid och observationstid. Profilens fyra identitetsfält och privata karaktärsrader är oförändrade.
- Sidundantaget delas av proxy och klientens navigationsskydd. Aktiva stridslås gäller fortfarande.
- Träning, uppgraderingar, bank, attack och ändring av försvarsorder förblir spärrade i databasen.
  Attack och försvarsformulär är också inaktiva där de visas på profilerna.
- Migration 20260919061624_central_gameplay_config_ac5f1398a9f8.sql är applicerad lokalt.

Verifierat: lint, typkontroll, 71 enhetstester, produktionsbygge, 507 databasassertioner
och samtliga 10 webbläsarscenarier för strid, sjukhus och profiler passerade.
Profilscenariot täcker två spelare, liveintagning, nedräkning, direktlänk, omladdning,
ny flik, egna/andras profiler, fortsatt handlingsspärr samt online- och offlineutskrivning.
320, 375 och 1280 px kontrollerades utan överflöde; desktop och mobil granskades visuellt.
Security advisors rapporterade inga problem. Dokumentlänkar och git diff --check passerade.
Den tidigare dokumenterade Next.js-diagnostiken vid avbrutna RSC-strömmar finns kvar.
Localhost svarar på http://127.0.0.1:3000/login.

# Hospital och beständig karaktär, 2026-09-19

[Hospital](HOSPITAL.md) är implementerat i Harbor-panelen och ersätter den tidigare
idén om hardcore och permanent karaktärsdöd.

- Noll Crew Health ger fem minuter i Hospital. Noll Ship Health sätter också Crew Health till 0.
- Alla nya spelhandlingar spärras i både gränssnitt och databas: crew-träning, skeppsarbete,
  nivåköp, banköverföringar, försvarsorder och strid. Patienter kan inte attackeras.
- Direktlänkar, cachad navigation, nya flikar och återinloggning leder tillbaka till sjukhuset.
- Sjukhuset visar alla aktuella patienter, även offline, med paginering och liveuppdateringar.
- Utskrivning sker automatiskt med full hälsa, även offline. Karaktär, stats, progression och pengar behålls.
- Passiv Energy och redan påbörjade skeppsjobb fortsätter under vistelsen.
- Intagningen täcker både PvP och andra serverstyrda skadeorsaker. Extern död under ett aktivt
  möte frigör deltagarna utan att tilldela en påhittad PvP-seger.
- hospital.durationSeconds är 300 i config. Redan sparade sluttider ändras inte av configbyte.
- Migrationerna 20260919052625_hospital_recovery.sql,
  20260919053041_central_gameplay_config_87100bb68e0a.sql och
  20260919053954_central_gameplay_config_6a8bd1163a61.sql är applicerade lokalt utan reset.
- Tidigare designbeskrivningar av permanent död är ersatta eller markerade historiska.

Verifierat:

- Lint, typkontroll, 71 enhetstester och produktionsbygge passerade.
- 501 databasassertioner och 39 kontroller med alternativ config passerade.
  Alternativkonfigurationen återställdes genom rollback.
- Hela dåvarande webbläsarsviten passerade: 22 scenarier. Efter slutjusteringarna passerade
  alla sex bank- och sjukhusscenarier, inklusive det nya fallet där en frisk besökare
  besegras medan sjukhussidan redan är öppen.
- Ett befintligt navigationstest hade timingberoende antaganden om förladdning.
  Det kontrollerar nu både Nexts innehållsladdare och dess länkindikator utan
  ögonblicksbilder som kan bli inaktuella. Testet passerade tre upprepningar i följd.
  Det jämför också bevarad faktisk träningsstat så att Perfect Drill inte orsakar ett slumpfel.
- Sjukhusvyn kontrollerades vid 320, 375, 768 och 1280 px utan horisontellt överflöde.
  Desktop- och mobilskärmbilder granskades visuellt.
- Supabase security advisors rapporterade inga problem.
- Dokumentlänkar och git diff --check passerade. Localhost svarar på http://127.0.0.1:3000/login.

Den redan dokumenterade Next.js-diagnostiken "The destination stream closed early"
förekommer vid avbrutna navigationer/förladdningar. Den döljs inte och gav inga
JavaScript-fel i de verifierade sjukhusflödena.

# Träningsprogression visas endast i procent, 2026-09-19

- Crew Training och Ship Upgrades visar en 0-100 %-mätare i stället för synliga XP-tal.
- Intjänad XP, krav, återstående XP och XP-belöningar är dolda i gränssnittet och statusmeddelandena.
- Mätarens tillgänglighetsvärden använder också procent. 100 % visas först vid upplåsning eller slutnivån.
- Intern XP, priser och köpkrav är oförändrade.
- Lint, typkontroll, 71 enhetstester och produktionsbygge passerade.
- Alla fyra webbläsarscenarier för träning passerade, inklusive båda vyerna, köp och återförsök.
- Crew-vyn granskades visuellt och git diff --check passerade.

# Energy +5 var femte minut, 2026-09-19

- Energy återhämtas nu med 5 per helt femminutersintervall, även offline, till max 100.
- Mängden styrs av resources.energyRecoveryAmount. Tidsankaret följer intervall, inte poäng.
- Sidopanelen, träningstexten och dokumentationens progressionstider är uppdaterade.
- Migration 20260919020734_central_gameplay_config_f70b531a82c5.sql är applicerad lokalt.
- Typkontroll, 71 enhetstester, 443 databasassertioner och 38 kontroller med alternativ config passerade.
- Kontrollerna täcker intervallgränsen, offlineåterhämtning, kvarvarande delintervall och klippning vid full Energy.
- Denna ändring har inte krävt en ny full webbläsarkörning.

# Träningsprogression implementerad, 2026-09-19

Kärnan i [träningsplanen](TRAINING_PROGRESSION_PLAN.md) är implementerad lokalt enligt
ägarens senare avgränsning utan items. Aktuella regler och balans finns i
[träningssystemet](TRAINING_FOUNDATION.md).

- Crew tränas direkt, får XP och har 1 % Perfect Drill med dubbla stats.
- Crew och skepp har separata XP-spår och tio köpta övningar/workshops.
- Endast Gold Coins på karaktären betalar nivåköp. XP förbrukas inte och nivåer kan inte hoppas över.
- Skeppet har ett arbete åt gången: 5/25/50 Energy och 5/25/50 minuter. Stats och XP ges automatiskt vid färdigställande.
- Arbeten fortsätter offline och under strid. Ett workshop- eller configbyte ändrar inte ett sparat jobb.
- Förfallna arbeten tillgodoräknas även för offlineförsvarare före ny stridssnapshot.
  Pågående strider behåller sina snapshots.
- Databasen styr tid, ägare, kostnad, XP och slump. Gemensamma deltagarlås och privata kvitton skyddar samtidighet och återförsök.
- Ändringssignaler uppdaterar andra flikar; sidans tidsstyrda uppdatering fångar jobbets sluttid.
- Befintliga karaktärsvärden bevaras. Progression börjar på första nivån med 0 XP, utan retroaktiv uppskattning.
- Statkolumner och XP använder säkra bigint-värden. Gamla public/private train_stat är borttagna.
- Migrationerna 20260919013000_training_progression.sql och 20260919013751_central_gameplay_config_26c391f022e6.sql är applicerade lokalt utan reset.
- Items, consumables, material och intjäning ingår inte. HP och stridsformler är oförändrade.
  Nivåpriser och XP-trappa är justerbara första balansvärden.

Verifierat efter implementation:

- Lint, typkontroll, 70 enhetstester och produktionsbygge passerade.
- 441 databasassertioner passerade. Bland annat: kontoavskiljning, RNG-gräns,
  guldköp, återförsök, säker heltalsgräns, offlineförsvarare och oförändrade aktiva snapshots.
- 37 kontroller med alternativ config passerade i transaktion. Originalconfig återställdes.
  Ändrade katalogvärden påverkar inte befintliga saldon eller jobbets kostnad, gain, XP och tid.
  Katalogtext med apostrof och dollaravgränsare verifierades.
- Hela webbläsarsviten passerade i samma körning: 20 av 20 scenarier.
  Träningen omfattar två flikar, alla arbetsstorlekar, automatisk färdigställning,
  ut-/inloggning, samtidiga anrop och ett förlorat crew-svar utan ny debitering eller slumpning.
- Ett etikettproblem på storleksvalet hittades och rättades innan den gröna slutkörningen.
- Skärmbilder för crew och skepp granskade på desktop och mobil. Layoutkontroller vid 320, 375, 768 och 1280 px passerade.
- Supabase security advisors rapporterade inga problem.
- 53 dokumentlänkar, git diff --check och slutlig config:check passerade.
- Localhost svarar på http://127.0.0.1:3000/login.

Den tidigare dokumenterade Next.js-diagnostiken "The destination stream closed early"
förekommer fortfarande vid avbrutna svar/navigation. Alla scenarier passerar.
Inga molnändringar, commits eller pushar har gjorts.

Följande avsnitt är historiska leveransanteckningar.

# Gold Coins och banken, 2026-09-19

Implementerat och migrerat lokalt före träningsprogressionen:

- Gold Coins på karaktären visas ovanför resursmätarna.
- Bank finns i Harbor med separat banksaldo, ett beloppsfält samt Deposit och Withdraw.
- Nya och tidigare karaktärer får 0 i de nya saldona. Befintliga stats, resurser och historik bevaras.
- Endast gold_coins är tillgängligt för framtida köp. bank_gold_coins kräver uttryckligt uttag.
- Positiva heltal, saldokontroller, säkra heltalsgränser och atomiska överföringar.
- Privata kvitton gör återförsök idempotenta. Ett förlorat svar kan kontrolleras med Retry transfer utan dubbel debitering.
- Ägarskyddade ändringssignaler uppdaterar saldo i andra flikar.
- Items, material, consumables och intjäning har inte införts. Träningsplanen är uppdaterad med den nya ordningen.
- Migrationerna 20260919010606_add_gold_coins_and_bank.sql och 20260919010900_central_gameplay_config_6f7dc499f0c0.sql är applicerade utan reset.
- Lokal databas och utvecklingsserver är igång på http://127.0.0.1:3000.

Verifierat:

- Lint, typkontroll, 64 enhetstester och produktionsbygge passerade.
- 398 databasassertioner passerade, inklusive 51 bankkontroller.
- 26 kontroller med alternativ gameplayconfig passerade i en transaktion; originalkonfigurationen återställdes.
- Hela webbläsarsviten passerade: 18 av 18 scenarier i samma körning.
- Banktester täcker insättning, deluttag, helt uttag, överdrag, flera flikar, samtidiga anrop, förlorat svar, ut-/inloggning och kontoavskiljning.
- Beloppsfältets etikett rättades efter den första webbläsarkörningen. Slutligt bygge och hela sviten passerade efter rättningen.
- Mobil/desktop-skärmbilder granskade; ingen horisontell överströmning vid 320, 375, 768 eller 1280 px.
- Supabase security advisors: inga anmärkningar. Dokumentlänkar och git diff --check passerade.

Den tidigare dokumenterade Next.js-diagnostiken om avbrutna RSC-strömmar förekommer
fortfarande i strids-/navigationsregressionen; samtliga scenarier passerar.
Inga molnändringar, commits eller pushar har gjorts.

[Systembeskrivning](GOLD_COINS_AND_BANK.md).

# Plan för träningsprogression, 2026-09-19

[Implementationsplanen](TRAINING_PROGRESSION_PLAN.md) beskriver den accepterade
grunden: köpta crew-övningar, 1 % Perfect Drill med tillfälliga consumable-effekter,
samt köpta workshops och tidsstyrda skeppsarbeten. Den skiljer ägarens beslut
från föreslagna balansvärden och beskriver ekonomi/inventarium, offlinefärdigställande,
stridsintegration, migration och verifiering i fem etapper.

Detta är en dokumentationsleverans. Ingen spelkod, config eller databas har ändrats.
Grunddesignen är accepterad; implementationsplanens detaljer är arbetsförslag.
Implementationskontrollerna i planen är framtida arbete och har inte körts i detta planarbete.

Verifierat för dokumentleveransen: git diff --check passerade. En separat dokumentkontroll
verifierade 39 lokala länkar i fem filer och åtta kontroller av planens struktur och centrala regler.

# Central konfiguration och organiserade källor, 2026-09-17

- config/ samlar gameplay, frontend, tema/CSS, auth, server, Supabase, Next.js och testinställningar.
- Hemligheter, anslutningar och miljöspecifik SITE_URL ligger i ignorerad .env.local, enligt ägarens instruktion.
- Appen läser gemensamma publika JSON-värden; serverinställningar hålls bakom server-only.
- SQL-funktionernas underhållbara källa finns i supabase/templates/gameplay.sql.
  Configvalidering och generering skapar nya migrationer med samma gameplayvärden som UI använder.
- Migration 20260917060236_central_gameplay_config.sql är applicerad lokalt. Balans, startstats,
  befintliga karaktärer, tidigare migrationer, behörigheter och stridshistorik bevaras.
- Resource bars, texter, träningsknappar, validering och stridsvisning följer nu configvärdena.
- Native verktygsfiler är adaptrar. CSS- och Supabasefiler som genereras kontrolleras mot källorna.
- Serverns gameplayrevision jämförs med databasens före resursläsningar och spelhandlingar.
- config:sync är idempotent och skriver aldrig om tidigare configmigrationer.
- config/README.md och docs/CONFIGURATION.md beskriver filindelning, exempel, omstarter och deployordning.
- Ett tidigare navigationstest förväntade stat 2 efter träning. Det har korrigerats till 11 enligt startstats 10.

Verifiering:
- npm run check passerade: lint, typkontroll, 43 enhetstester och produktionsbygge.
- npm run test:db passerade med 347 assertioner.
- Alternativ gameplayconfig: 23 faktiska databaskontroller passerade i en transaktion;
  ändringarna rullades tillbaka och den installerade configrevisionen återställdes.
- Enhetstester renderar dessutom UI med alternativa kostnader, ökningar, HP-/Energymax och återhämtningstider.
- Hela Playwright-körningen klarade 14 scenarier; navigationstestets föråldrade förväntningar rättades
  och det femtonde scenariot passerade separat. Samtliga 15 scenarier är därmed verifierade.
- Supabase security advisors rapporterade inga problem. config:check och git diff --check passerade.
- Upprepad config:sync skapade ingen extra migration.
- Den tidigare dokumenterade Next.js-varningen om avbrutna RSC-strömmar kvarstår vid navigation.

Tillämpning: ändra config, kör config:sync och applicera genererad gameplaymigration med db:migrate.
Frontend-/Nextändringar behöver nytt produktionsbygge; lokala Supabaseinställningar kräver omstart.
Resursmax kan inte sänkas under sparade värden utan en separat, avsiktlig datamigration.
Inga hemligheter flyttades in i config, inga molnändringar gjordes och inget har committats eller pushats.

# Startstats på 10, 2026-09-16

- Nya karaktärer börjar med 10 i Attack, Defense, Speed och Accuracy för både skepp och crew.
- Migration 20260916064805_combat_stats_start_at_ten.sql är applicerad lokalt och ändrar alla åtta kolumndefaults.
  Befintliga karaktärers progression och pågående striders snapshots behålls.
- Träning ger fortfarande +1 för 5 Energy. Skadeformeln är oförändrad:
  nya karaktärer med lika stats 10 gör nu 32 skada per träff.
- Registrerings- och träningstester verifierar samtliga startvärden samt 10 till 11 efter träning.
  Stridsregressioner använder uttryckliga referensstats för att isolera sina scenarier från startbalansen.
- README, TRAINING_FOUNDATION, COMBAT_SYSTEM, COMBAT_AND_PROGRESSION_DESIGN och ARCHITECTURE är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 347 assertioner. Alla sju Playwright-scenarier för träning och strid
passerade tillsammans. Supabase security advisors rapporterade inga problem och git diff --check passerade.
Den tidigare dokumenterade Next.js-varningen om avbrutna RSC-strömmar syntes vid navigation;
samtliga webbläsarscenarier passerade.

# Torn-inspirerade statkurvor med justerad Defense, 2026-09-16

- Samma serverberäkningar används för skepp, crew och automatiska motattacker.
- Accuracy / motståndarens Speed ger träffchans från 0 till 100 %. Lika stats ger 50 %;
  64 gånger högre Speed ger garanterade missar, 64 gånger högre Accuracy garanterade träffar.
- Attack / Defense styr skadan via en logaritmisk kurva. Ägaren valde **25 gånger Defense**
  för full blockering i stället för Torns 14. Lika stats ger fortfarande 50 % skademinskning.
- Grundskadan växer med absolut Attack, med statskalan anpassad så att nya kaptener ger 15 skada per träff.
- Minst 1 skada vid träff under 25-gränsen förhindrar för tidig full blockering genom avrundning.
  Vid gränsen och över ges 0 skada. Tidigare tak på 40 skada är borttaget.
- Combat log skiljer mellan Missed och Blocked · 0 damage; en blockerad träff räknas som träff.
- Utrustningsmodifierare och övriga stridsregler ingår inte i ändringen.
- Migration 20260916051659_torn_style_combat_curves.sql är applicerad lokalt utan reset.
  Nästa order använder de nya kurvorna, även i pågående strider; historiska händelser bevaras.
- COMBAT_SYSTEM, ARCHITECTURE, COMBAT_AND_PROGRESSION_DESIGN och README är uppdaterade.
  Referenser, Torn-approximationernas begränsningar och våra anpassningar finns i COMBAT_SYSTEM.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 339 assertioner, inklusive 66 nya kurv- och gränskontroller.
Alla fem Playwright-scenarier i tests/e2e/combat.spec.ts passerade tillsammans, inklusive miss/blockering
i båda faserna. Supabase security advisors gav inga problem; git diff --check passerade.
Utvecklingsserverns /login svarade HTTP 200. Den tidigare kända Next.js-varningen om avbrutna
RSC-strömmar kvarstår vid navigation; inga webbläsarscenarier misslyckades.

# Delbara attacker och tydligare stridsloggar, 2026-09-16

- Attackvyn använder /attack/<character-id>, med motståndarens ID. Adressen är samma före start och under striden.
- En kopierad adress visar mottagarens egen kapten och Join battle när målet redan angrips.
- Möte och deltagarroll hämtas från servern. Att öppna länken ansluter inte spelaren eller förbrukar Energy.
- Det beständiga sidlåset, reload och separat stridsfas per angripare fungerar med den nya adressen.
- När mötet avslutas öppnas samma offentliga rapport för angriparna. Ett nytt besök på målets länk visar förberedelsen.
- Combat log visar servertid (UTC), utan lokala rundnummer eller summerat antal rundor.
- Deltagarnas skada visas som Ship damage och Crew damage, inklusive försvararens motattacker.
- Alla namn i stridsvyn, händelserna, deltagarlistan och resultatet länkar till profiler.
- Äldre query-länkar omdirigeras till den nya adressen.
- Migration 20260916044300_combat_damage_breakdown.sql är applicerad lokalt. Befintliga händelser summeras utan reset eller omskrivning av historiken.
- README, ARCHITECTURE och COMBAT_SYSTEM är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 273 assertioner. Supabase security advisors rapporterade inga problem.
Webbläsarregressionen omfattar 14 scenarier. 13 passerade i hela körningen; det nya testet för gemensamt
stridsslut läste först serverstatus för tidigt. Efter korrigerad väntan passerade även detta test separat.
Tester täcker kopierad länk mellan konton, rätt egen kapten, dold utrustning före join, energikostnad,
livehälsa, sidlås, reträtt, final blow/assist, rapportövergång, profillänkar, servertid och skadevärden.
Den tidigare dokumenterade Next.js-varningen om avbrutna RSC-strömmar kvarstår.


# Förenklade karaktärsnamn, 2026-09-16

Karaktärsnamn behöver bara vara ifyllda och unika. Kraven på 3-24 tecken och endast
bokstäver har tagits bort från formulär, servervalidering och databas. Siffror,
symboler, emoji och namn på ett enda tecken fungerar. Namn normaliseras fortfarande
och unikhet kontrolleras utan hänsyn till stora och små bokstäver.

Migration 20260916042055_relax_character_names.sql har applicerats lokalt utan reset.
Befintliga konton och namn bevaras. README, arkitektur och byggplan är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och
produktionsbygge. npm run test:db passerade med 264 assertioner. Två riktade
webbläsartester passerade: registrering med långt namn, siffror, understreck och
emoji samt samtidiga registreringar med samma namn. Supabase security advisors
rapporterade inga problem. git diff --check passerade.

# Förenklad lösenordspolicy, 2026-09-16

På ägarens begäran har utvecklingsversionens lösenordskrav sänkts från 12 till 6 tecken.
Ingen teckenblandning krävs. Formulär för registrering och återställning, servervalidering
och lokal Supabase Auth använder samma miniminivå. Bekräftelsefältet kontrollerar fortfarande
att lösenorden matchar. Den tekniska inmatningsgränsen på 128 tecken finns kvar.

supabase/config.toml anger minimum_password_length = 6 och password_requirements = "".
Konfigurationen laddas genom en vanlig lokal omstart, utan databasreset.
Befintliga konton och lösenord ändras inte.

npm run check passerade: lint, typkontroll, 21 enhetstester och produktionsbygge.
Lokal Supabase har startats om med policyn. Två riktade webbläsartester passerade:
registrering/inloggning samt lösenordsåterställning med lösenord på sex små bokstäver.


# Lokala testfönster, 2026-09-16

- npm run dev:players öppnar tre separata Edge-profiler för samtidig testning med olika konton.
- Antalet kan väljas med --count 1-6; endast lokala speladresser tillåts.
- Sparade profiler ligger i den Git-ignorerade katalogen .local/player-browsers.
- Separata konton, reload, återstart med bibehållen inloggning och oberoende utloggning har verifierats med riktiga lokala konton.
- Spelets produktionskod, autentisering och databas har inte ändrats i denna leverans.
- Instruktioner finns i [DEVELOPMENT_TEST_WINDOWS.md](DEVELOPMENT_TEST_WINDOWS.md).

# Senaste leverans: gemensam PvP, 2026-09-16

Implementerat och migrerat i den lokala utvecklingsmiljön:

- Gemensam /attack-route för förberedelse och pågående strid, utan hamnens sidopanel.
- Start battle / Join battle med 10 Energy per angripare och idempotent debitering.
- Beständig serverkontrollerad navigationsspärr för aktiva angripare.
- Flera angripare med egna rundor och faser mot delad försvararhälsa.
- Atomisk final blow och assist, individuella reträtter och nederlag.
- Realtidsuppdatering för angripare och onlineförsvarare. Försvararen använder spelet som vanligt.
- Offentlig /combatlog/<id> med deltagare, träffar, skada och logg, även utan inloggning.
- Migration 20260916022241_shared_attack_encounters.sql applicerad utan reset. Totalt tio migrationer.
- Ingen molndatabas, publicering eller Git-historik har ändrats.

Verifierat: npm run check passerade inklusive lint, typkontroll, 21 enhetstester och produktionsbygge.
npm run test:db passerade med 258 assertioner. Hela npm run test:e2e passerade: 13 av 13 webbläsartester, inklusive alla tre combat-scenarier.
De verifierar också navigation bort, bakåtknappen, ny flik, reload, anonym rapportåtkomst,
samtidig start, dubbla order, konkurrerande sluthits, separata faser och livehälsa.

De äldre balanseringsvärdena gäller: 25 rundor per angripare, två minuters inaktivitet, tio minuter per möte.
Guld, XP, inventarium, ammunitionsekonomi och PvE återstår. Detaljer finns i COMBAT_SYSTEM.md.

Känd begränsning: Next.js 16.3.5 kan logga "The destination stream closed early" vid avbrutna
RSC-navigationer. Detta inträffade även under de passerande testerna; inget browser pageerror uppstod
i det verifierade attackflödet. Den tidigare dokumenterade framework-begränsningen kvarstår.
Slutlig manuell skärmbildsgranskning kunde inte slutföras på grund av verktygsfel; layoutbredd
och tillgängliga order verifierades i webbläsare vid 320, 375, 768 och 1280 px.

## Tidigare implementationshistorik

Avsnitten nedan beskriver tidigare leveranser. Vid skillnader gäller COMBAT_SYSTEM.md och senaste leveransen ovan.

# Implementation status

Verified locally on 2026-09-15.

## Delivered

- Registration with character name, email and password creates both account and
  character in one transaction, then opens The Harbor. Email confirmation is
  disabled for development, following the owner's decision.
- Login, logout and password recovery through Supabase Auth.
- Character name selection inside registration, validation and case-insensitive
  unique names. No separate character step for new accounts.
- One saved character per account, starting in The Harbor.
- The approved Caribbean illustration, blue panels and compact game layout.
- Left navigation on desktop, navigation above content on narrow screens.
- Marketplace and Shipyard placeholder views with persistent navigation.
- Real local PostgreSQL persistence, migrations and row-level access rules.
- Reproducible setup and verification commands in the README.

## Original foundation verification

| Check | Result |
| --- | --- |
| `npm run check` | Passed: lint, TypeScript, 21 unit tests and production build. |
| `npm run test:db` | Passed: 29 pgTAP assertions against local PostgreSQL. |
| Browser tests against the production build | All five scenarios passed in a single run against the updated application. |
| Atomic registration and one character per account | Passed: simultaneous signup with the same name creates one winner; the other account is rolled back and can retry. Extra character inserts are rejected. |
| Local database lint | No schema errors in `public` and `private`. |
| Local Supabase advisors | No issues reported. |
| Dependency audit during installation | Zero known vulnerabilities reported. |
| Visual inspection | Updated desktop/mobile registration screenshots and the harbor layout reviewed. |
| Keyboard review | Passed: skip link, field order, password visibility toggle, visible focus and navigation to login. |
| Actual web server restart | The existing session and saved character remained available after restarting Next.js. |

The browser scenarios cover registration with immediate character creation and
no confirmation email, invalid and taken names, retrying with the same email,
reload, logout/login, menu navigation, password recovery
through the local Mailpit inbox, old-password rejection, unauthorized routes,
invalid callbacks and rejected external callback destinations.

Direct API checks cover two-account isolation, anonymous access, concurrent
registration, second-character rejection, ignored metadata changes and attempted
owner/location manipulation. Failed signup with a missing name or taken name
leaves no account that can log in. Database checks separately
exercise constraints, privileges and row-level policies. Responsive checks cover
1280, 768, 375 and 320 pixel viewport widths. The separate visual smoke run reported
no browser JavaScript errors and confirmed persistence across a web server restart.

Tests create isolated, generated accounts under `example.test` in local Supabase.
They do not run against a hosted project. Unit and database tests do not require
email delivery; browser recovery tests read only the local test inbox.

## Environment and remaining limits

Older unfinished development accounts retain a one-time name selection path.
Existing characters were preserved by the new migration.

The application currently runs at <http://127.0.0.1:3000> with real Supabase
services in Docker. It has not been publicly deployed.

Creating the requested Supabase Free project in Auxron was rejected because the
owner's two active Free project slots were already occupied. Existing projects
were not changed. A hosted slot is needed before connecting this application to
Supabase Cloud. The local setup allows the agreed foundation to be used now.

External email delivery, public hosting and production abuse controls remain
future setup work. Registration intentionally does not verify email ownership.
Password recovery currently uses the local Mailpit inbox.

TypeScript and ESLint use versions compatible with the installed Next.js plugins.
ESLint 9 is past upstream support; the compatibility limitation and upgrade work
before public release are recorded in [ARCHITECTURE.md](ARCHITECTURE.md).

Ship and crew stats, three resource bars and Energy-based training are now
implemented as the next bounded gameplay step. No economy, inventory, combat,
player-to-player actions or permanent-death mechanics have been implemented.
The Harbor now has a shared captain directory with realtime updates.

The current [gameplay design](COMBAT_AND_PROGRESSION_DESIGN.md) records the
owner's decisions about the persistent personal ship and crew, Crew Health,
eight upgradeable combat stats, equipment, PvP outcomes and separate skill
progression. The [training foundation](TRAINING_FOUNDATION.md) defines the
implemented subset. Hunger and unresolved combat details remain proposals or
open questions. The original verification results above are historical.

## Resource and training verification

Verified during the training implementation on 2026-09-15:

- Lint and TypeScript checks passed.
- All 21 existing unit tests passed.
- The production build passed, including both new training routes.
- The fourth migration was applied to local Supabase without resetting data.
- All 74 pgTAP checks passed, including 45 resource/training checks.
- Local database advisors reported no issues.
- All seven browser/API scenarios passed against the production build.
- The two training scenarios passed again after adding an open-page recovery
  check: Energy changes from 4 to 5 and training becomes available automatically.
- Twenty-five simultaneous requests produce exactly twenty paid upgrades and
  five insufficient-energy rejections.
- Desktop and mobile screenshots were reviewed; layout checks passed at
  1280, 768, 375 and 320 pixels with no horizontal overflow.
- Progress persists across reload, logout and login. No browser errors were recorded.

Resources start at 100/100 and stats at one. Five Energy buys one stat point.
Energy recovers one point every five minutes, including offline time, capped at
100. Ship and crew health are persisted indicators; damage and healing are future
work. Training currently has no material cost or skill-XP reward.

## Harbor roster verification

Verified during the roster implementation on 2026-09-15:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All 99 pgTAP checks passed, including 25 roster checks.
- Local database advisors reported no issues.
- The fifth migration is applied; Realtime is enabled and its container is healthy.
- All eight browser/API scenarios passed against the production build.
- The roster updates after arrivals, removals and returns without reloading.
- Changes missed during a network interruption are recovered after reconnecting,
  and subsequent realtime events continue to arrive.
- Received WebSocket records contain only character IDs and display names.
- Offline captains remain listed; anonymous access and private character access
  are rejected, and pagination is verified.
- Desktop and mobile screenshots were reviewed. Layout checks passed at
  1280, 375 and 320 pixels with no horizontal overflow or browser JavaScript errors.

Scope and data boundaries are recorded in [the roster specification](HARBOR_ROSTER.md).

## Navigation and loading verification

Verified during the navigation implementation on 2026-09-15:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All nine browser/API scenarios passed against the production build.
- Actual automatic prefetch responses were observed before navigation.
- With a navigation response deliberately held, the content displays its loading
  indicator and the original sidebar and resource-bar DOM elements remain mounted.
- Choosing another destination interrupts the pending navigation successfully.
- Training updates Energy and stats without replacing the shared resource bars.
- Navigation, training and browser back/forward issue no browser document requests.
- Opening a deep link directly still restores the correct view and saved stats.
- Desktop and mobile loading screenshots were reviewed. The mobile check has
  no horizontal overflow, and reduced-motion settings stop the spinner animation.
- The new scenario reported no browser JavaScript errors.
- The local development app remains available on port 3000.

The [navigation architecture](ARCHITECTURE.md#navigation-and-loading) describes
the shared layout and nested loading boundaries. Automatic prefetching is assessed
in the production build; development mode does not enable it.

## Stable frame width verification

Verified during the scrollbar layout fix on 2026-09-15:

- Reproduced the horizontal shift with classic scrollbars enabled in Edge.
  The long harbor view shifted the frame by 7.5 pixels at a 1280-pixel viewport;
  at 1100 pixels its frame was 15 pixels narrower than the shorter views.
- Added a stable scrollbar gutter to the root scroll container.
- Measured all five harbor views at viewport widths of 1280, 1100, 375 and
  320 pixels. Frame and content widths and horizontal positions now match
  exactly between views at each viewport size.
- The production build and its TypeScript check passed.

The focused browser measurements used an isolated local test account, which was
removed afterward. Headless browser measurements with hidden scrollbars did not
reproduce the original problem; verification explicitly enabled classic scrollbars.

## Character profile verification

Verified during the profile implementation on 2026-09-16:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All 123 pgTAP assertions passed, including 24 profile access and synchronization checks.
- Local database advisors reported no issues.
- The sixth migration was applied locally without resetting character data.
- All ten browser/API scenarios passed. Profile and roster checks passed again
  after restricting roster-link prefetching to hover/focus.
- The viewer can open their own profile from the sidebar and another captain's
  profile from the harbor roster, including a logged-out captain.
- Normal links, keyboard access, browser history and direct URLs passed.
- The original viewer sidebar remains mounted. Its resources are not replaced
  by the viewed captain's values. No full document loads occur during link navigation.
- Anonymous profile reads and client writes are rejected. Only four public identity
  fields are returned, and the other captain's private state remains inaccessible.
- Invalid UUIDs and missing characters show a local not-found panel with a working
  link to The Harbor. Logged-out profile visits redirect to login.
- Desktop/mobile screenshots were reviewed. Checks passed at 1280, 768, 375 and
  320 pixels; the frame retains its width and horizontal position with classic scrollbars.
- No browser JavaScript errors were reported. The server stream-cancellation
  diagnostic is recorded in ARCHITECTURE.md for upstream follow-up.

See [the implemented profile scope](CHARACTER_PROFILES.md).

## Combat implementation and verification

Implemented and verified locally on 2026-09-16.

- Profile Attack opens free preparation; Start fight begins persistent two-party PvP.
- Cannon combat, boarding, disengagement, retreat, reports and offline defence work.
- Defence orders on the own profile apply to the next encounter.
- Full health is not required. Both health meters need at least one point.
- Incoming protection does not block outgoing attacks; starting a fight relinquishes it.
- Health damage persists, with automatic offline recovery after the encounter.
- No gold, XP, permanent death or inventory economy was added.
- Migrations seven through nine are applied locally without resetting existing data.
- Existing profile privacy and the shared game frame are preserved.

Verification:

| Check | Result |
| --- | --- |
| npm run check | Passed: lint, TypeScript, 21 unit tests, production build. |
| npm run test:db | Passed: 214 assertions, including 91 combat assertions. |
| npm run test:e2e | Passed: all 12 scenarios in one run against the production build. |
| Local database advisors | No warning/error issues reported. |
| Visual review | Desktop preparation, active encounter and mobile screenshots reviewed. |
| Layout and navigation | No horizontal overflow at 768, 375 or 320 px; classic-scrollbar frame position and width preserved; no document navigation between profile, preparation and rounds. |
| Concurrency | Competing starts produce one encounter; duplicate orders produce one round and one charge. |
| Interrupted play | Reload restores the saved round; timeout performs a counterattacked retreat and recovery starts at its deadline. |
| Privacy | Enemy equipment absent before start; enemy training stats absent afterward; outsiders cannot read reports; anonymous sessions cannot participate. |

The existing Next.js stream-cancellation diagnostic still appears during the
rapid invalid-profile test. That scenario and all other browser checks pass;
the previously documented upstream limitation remains in ARCHITECTURE.md.

See [the implemented PvP system](COMBAT_SYSTEM.md) and
[the approved plan with the health correction](FIRST_COMBAT_PLAN.md).
