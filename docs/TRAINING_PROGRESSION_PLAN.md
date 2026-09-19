# Plan: Crew Training och Ship Upgrades

Datum: 2026-09-19.

Status: **Kärnan implementerad lokalt 2026-09-19 enligt den senare avgränsningen utan items.**

Aktuella regler, tio provisoriska nivåer och den faktiska datamodellen finns i
[träningssystemet](TRAINING_FOUNDATION.md). Tester och resultat finns i
[implementationsstatus](IMPLEMENTATION_STATUS.md). Plantexten nedan bevarar även framtida
itemförslag; dessa delar är inte implementerade.

Senare ändring 2026-09-19: Small/Medium/Large har ersatts av en slider från 5 till aktuell
Energy, med en minut per Energy och proportionella decimalstats. Reglerna i
[träningssystemet](TRAINING_FOUNDATION.md) gäller framför de äldre storlekarna nedan.

Första itemetappen implementerad 2026-09-19: [Inventory](INVENTORY.md) innehåller
beständigt innehav, visning och Trash. Equip, Use och träningsbuffar kommer senare.
Avgränsningen utan items nedan gäller den redan levererade träningskärnan.

> Balansändring 2026-09-19: Energy återhämtas nu med +5 var femte minut.
> Äldre antaganden om +1 och 288 Energy per dygn nedan är historiska; aktuell balans finns i träningssystemet.

## Aktuell ordning efter ägarens förtydligande

Gold Coins och en enkel bank har införts som ett separat steg före denna plan.
Se [Gold Coins och banken](GOLD_COINS_AND_BANK.md). Träningsimplementationen
återanvänder karaktärens gold_coins för köp; bank_gold_coins får aldrig räknas
som tillgängligt köpsaldo. Nya karaktärer börjar med 0.

**Items skjuts upp.** Inventarium, materialkostnader och consumable-buffar nedan
är framtida tillägg, inte krav för den första träningsleveransen. Crew kan införas
med 1 % Perfect Drill utan items. Övningar och workshops köps för guld. Alla tester
och UI-delar som förutsätter items aktiveras först i den senare itemetappen.

Målet är enkel, långsiktig progression med olika spelkänsla: crew tränas direkt
med chans till Perfect Drill, medan skeppet utvecklas genom tidsstyrda arbeten.
Samma kapten, skepp, besättning och åtta stats behålls. Gränssnittet är på engelska.

## 1. Beslutad grund

| Regel | Crew Training | Ship Upgrades |
| --- | --- | --- |
| Spelarens val | Välj Attack, Defense, Speed eller Accuracy och träna. | Välj stat och storlek på arbetet. |
| Energy | Ett vanligt pass kostar 5 Energy. | Energy betalas för hela arbetet när det startas. |
| Resultat | Stats och tränings-XP direkt. | Stats och uppgraderings-XP när arbetet är färdigt. |
| Progression | XP låser upp nästa övning, som köps för guld. | XP låser upp nästa workshop, som köps för guld och kan kräva material. |
| Bättre steg | Fler stats för samma Energy. | Fler stats för samma Energy och arbetsstorlek. |
| Egen mekanik | 1 % grundchans till Perfect Drill med dubbla stats. | Ett pågående arbete åt gången, som fortsätter även offline. |
| Consumables | Höjer chansen tillfälligt; därefter återgår den till 1 %. | Ingen motsvarande slumpbonus ingår. |

- Crew och skepp har varsin gemensam XP-mätare för gruppens fyra stats.
- XP bygger på investerad Energy, inte hur många statpoäng som delas ut.
- Perfect Drill ger extra stats men ingen extra XP.
- Kort och långt skeppsarbete ger samma utbyte per Energy vid samma workshop.
- Ett färdigt arbete tillgodoräknas automatiskt. Spelaren behöver inte hämta belöningen.
- Spelaren kan fortsätta spela medan ett skeppsarbete pågår.
- Ingen bonus var tionde skeppsuppgradering och ingen permanent höjning av Perfect Drill-chansen genom consumables.
- Talangträd, träningsinriktningar och ytterligare stridsfärdigheter ingår inte.

## 2. Arbetsförslag för första implementationen

Följande detaljer fyller ut sådant som inte uttryckligen bestämdes i samtalet.
De ska skiljas från besluten ovan och hållas justerbara.

| Område | Föreslagen startregel |
| --- | --- |
| XP | 1 XP per förbrukad Energy. Ett crew-pass ger 5 XP; skepps-XP delas ut vid färdigställande. |
| Upplåsning | Kumulativ XP förbrukas inte vid köp. Endast nästa steg kan köpas; högsta köpta steg används automatiskt. |
| Första steg | Första övningen och workshopen ägs från början och ger +1 per 5 Energy. |
| Arbetsstorlekar | Small: 5 Energy / 5 minuter. Medium: 25 Energy / 25 minuter. Large: 50 Energy / 50 minuter. |
| Arbetsutbyte | Antal basenheter gånger workshopens utbyte: 1, 5 respektive 10 enheter. Ingen mängdbonus. |
| Buffar | En aktiv träningsbuff åt gången. Ny användning under aktiv buff nekas utan itemförbrukning. |
| Bufftid | Verklig tid från aktivering; utloggning, strid och sidbyte pausar inte tiden. |
| Workshopbyte | Tillåtet under pågående arbete. Den nya workshopen gäller nästa arbete. |
| Arbetskö | Ingen avbrytning, automatisk upprepning eller kö i första versionen. Kostnad, utbyte och sluttid visas före start. |
| Strid | Befintlig spärr för aktiva angripares manuella träning gäller även jobbstart, köp och buffaktivering. Redan startat arbete fortsätter. Försvarare använder hamnen som idag. |
| Befintliga kaptener | Behåll stats, resurser och stridshistorik. Nya XP-spår börjar på 0 med första övningen/workshopen ägd. |

Arbetstider och XP-takt är startförslag, inte färdig balans. Workshopens nivå
höjer i första versionen utbytet, inte arbetshastigheten. Korta arbeten behöver
inte förlora effektivitet för att stora arbeten ska vara praktiska.

## 3. Verifierad utgångspunkt och beroenden

Kontrollerat genom kodläsning 2026-09-19:

- config/gameplay.json anger gemensamt energyCost: 5 och statGain: 1.
- src/components/training-panel.tsx används av båda vyerna med samma direkta flöde.
- src/app/training-actions.ts anropar train_stat(group, stat) och bygger meddelandet från den fasta ökningen.
- supabase/templates/gameplay.sql är den underhållbara källan för träning, resurser och delar av stridslogiken.
- Databasen äger tid, Energy och statökningar. Träning använder samma ordnade deltagarlås som strid.
- get_game_state() och GameStateProvider hanterar serverstyrda tidsgränser och uppdatering vid återkomst till fliken.
- Striden sparar deltagarnas stats när de går in i mötet. Försvararens stats delas av mötets angripare.
- Gold Coins och banköverföringar har införts separat efter denna kartläggning. Inventarium, consumables och intjäningsvägar återstår.
- Stats lagras idag som PostgreSQL integer, vilket behöver granskas för långsiktig tillväxt.

Gold Coins på karaktären och banken är nu implementerade. Återanvänd dessa
saldon i stället för att skapa en parallell plånbok. Köp debiterar endast
karaktärens saldo. Inventarium och materialkostnader väntar till itemetappen.
En intjäningsväg för guld återstår för publik progression.

För lokal provspelning föreslås ett uttryckligt utvecklingskommando som tilldelar
testkaptener guld, material och consumables. Det ska vara begränsat till projektets
lokala testmiljö och aldrig exponeras som en spelar-RPC. En vanlig spelares källa
till dessa resurser måste väljas innan systemet räknas som färdigt för publik
spelprogression. Den källan är fortfarande ett öppet produktbeslut.

## 4. Konfiguration och balans

Utöka den centrala konfigurationen med kataloger under gameplay.training.crew
och gameplay.training.ship samt en liten föremålskatalog.

- Crew-övning: stabilt ID, engelskt namn, ordning, kumulativt XP-krav, guldpris och stats per baspass.
- Workshop: motsvarande uppgifter samt materialkostnader per föremåls-ID.
- Arbetsstorlek: stabilt ID, basenheter och tid. Energy och utbyte härleds från basenheterna.
- Perfect Drill: grundchans 100 baspunkter av 10 000 och multiplikator 2.
- Consumable: stabilt ID, extra baspunkter och varaktighet i sekunder. Exempelvis innebär +400 baspunkter att 1 % blir 5 %, inte en relativ ökning med 4 %.
- Buffen påverkar bara sannolikheten, inte normalutbyte, XP eller Energykostnad.
- Priser, tider, XP-krav, namn och utbyten ändras genom config, inte i UI-komponenterna.

scripts/config/core.mjs stöder idag skalära SQL-tokens. Katalogerna kräver
deterministisk generering av validerade katalograder med säker citering. Ta med
katalogerna i gameplayrevisionen. Behåll stabila ID:n och inaktivera gamla
definitioner vid behov i stället för att radera köpt innehåll eller referenser
från pågående arbeten. Tysta omtolkningar av stegordningen ska nekas.

Validera unika ID:n, stigande XP-krav och utbyte, giltiga materialreferenser,
heltalskostnader, positiva tider, sannolikheter inom 0-100 % och att samtliga
arbetsstorlekar ryms inom Energytaket. Första stegen ska vara kostnadsfria och
tillgängliga vid 0 XP. Sänkta gränser får inte skriva över befintlig progression.

Före balanslåsning ska en tabell beskriva varje stegs XP, pris, utbyte och
uppskattade speltid. Den ska omfatta start, mellanspel och steg som når minst
tusentals stats per baspass. Jämför normal träning, Perfect Drill och consumable,
samt fördelning av Energy mellan crew, skepp och strid.

Med nuvarande återhämtning produceras högst 288 Energy per dygn, plus eventuell
Energy som redan finns vid start. Det motsvarar 57,6 baspass i genomsnitt om all
återhämtning tas till vara. Full mätare, strid och inloggningsmönster sänker faktisk
träning. Planera mot detta, inte ett antaget obegränsat antal klick.

Priser, fullständig steglista, buffstyrka, bufftid och resursförsörjning är ännu
inte fastställda. Tidigare exempel som +1, +2, +4, +7 och +12 är illustrationer.

## 5. Datamodell och migration

Föreslagna privata tabeller, kopplade till public.characters.id:

| Data | Innehåll och invariant |
| --- | --- |
| training_progress | En rad per kapten: crew-XP, ship-XP, aktuell övning och workshop. |
| training_purchases | Ägda övningar/workshops och betalda kostnader. Unikt köp per kapten, typ och steg. |
| Befintliga gold_coins / bank_gold_coins | Återanvänd karaktärens saldon. Endast gold_coins får debiteras för köp. |
| character_inventory | Icke-negativ mängd per kapten och föremåls-ID för material och consumables. |
| crew_training_effects | En aktiv effekt per kapten, sparad styrka, start och sluttid samt förbrukat item-ID. |
| ship_upgrade_jobs | Stat, storlek, betald Energy, start, finishes_at, sparat stat-/XP-utbyte, workshop, configrevision och applied_at. |
| training_requests | Kapten, request-ID, handling, normaliserad payload och sparat resultat för engångsdebitering och återförsök. |
| Katalogtabeller | Validerade definitioner av övningar, workshops och föremål, genererade från config. |

Ett partiellt unikt index säkrar högst ett ej bokfört skeppsarbete per kapten.
Ett tidsmässigt färdigt arbete bokförs innan ett nytt skapas. Indexvillkoret ska
bygga på sparad status, inte en föränderlig jämförelse med aktuell tid.

Föreslagen talrepresentation: bigint för stats, XP, guld och föremålsantal med
explicit övre gräns inom JavaScripts säkra heltalsområde. Behåll JSON-tal i det
befintliga TypeScript-kontraktet och kontrollera även summeringar/multiplikationer.
Granska alla integer-kast i RPC:er och stridskod; bredare kolumner ensamma räcker
inte. Overflow ska avbryta hela handlingen utan kostnad eller förlorad belöning.

Skapa strukturen i nya migrationer med Supabase CLI. Uppdatera SQL-mallen och
generera därefter en ny configmigration via npm run config:sync. Äldre migrationer
skrivs inte om. Verifiera både ny testdatabas och uppgradering av befintlig data.
Nya kaptener får grundrader i befintlig skapandetransaktion. Befintliga kaptener
fylls på utan att stats återställs. Tidigare XP ska inte gissas från stats,
eftersom tillförlitlig historik över gamla träningspass saknas.

## 6. Serverhandlingar och samtidighet

Föreslagna separata RPC:er:

| RPC | Klientens indata | Serverns ansvar |
| --- | --- | --- |
| train_crew | Stat, förväntat övnings-ID, request-ID. | Kontrollera Energy/strid, beräkna aktiv chans, dra slump, ge stats och XP. |
| purchase_training_tier | Crew/ship, steg-ID, request-ID. | Kontrollera föregående köp, XP och tillgångar; debitera och aktivera steget atomiskt. |
| use_training_consumable | Föremåls-ID, request-ID. | Kontrollera innehav och aktiv effekt; förbruka item och spara buffens tid/styrka. |
| start_ship_upgrade | Stat, storleks-ID, förväntat workshop-ID, request-ID. | Bokför färdigt jobb, kontrollera tom arbetsplats/Energy, debitera och skapa jobbet. |
| get_game_state | Ingen spelaridentitet från klienten. | Bokför färdigt jobb och returnera stats, XP, köpstatus, resurser, buff och jobb. |

Servern bestämmer kostnad, utfall, tid och ägare. Klienten får aldrig skicka
slumpvärde, bonuschans eller ett färdigt resultat. Om förväntad övning/workshop
inte längre är aktuell returneras uppdaterat underlag utan debitering.

Varje muterande handling får ett request-ID som skapas en gång per avsiktlig
handling och återanvänds vid återförsök. Samma ID och payload returnerar samma
sparade utfall, även om buffen hunnit löpa ut. Ändrad payload med samma ID nekas.
Två olika avsiktliga klick är två handlingar och kan debiteras var för sig.

Lås först deltagarna med befintlig ordnad stridslåsning, därefter progression,
plånbok, inventarierader och jobb i konsekvent ordning. Fånga servertiden efter
relevanta lås. Saldo, itemförbrukning, XP, stats, sparat resultat och ändringssignal
ska committas tillsammans. Fel får inte lämna en delvis utförd handling.

Perfect Drill använder servergenererad slump enligt samma princip för privat
slumpkälla som striden. En privat deterministisk beräkningsfunktion gränstestas
med givna slumpvärden, men får inte bli anropbar av spelare. Buffen gäller när
starts_at <= observed_at < expires_at. Vid exakt sluttid gäller grundchansen.
Buffstyrkan sparas vid aktivering, så att senare configändringar inte ändrar
ett redan förbrukat föremåls effekt.

Crew-resultatet innehåller faktisk ökning, normalökning, Perfect Drill-status,
förbrukad Energy och XP. UI:t får inte längre anta konstant +1.

Den gamla train_stat(text, text) tas ur bruk i samma leverans som de nya
handlingarna. Återkalla dess körbehörighet och ta bort appanropen. Gamla API-anrop
får aldrig kunna ge omedelbara ship-stats eller kringgå progressionen.

Exponera endast smala RPC:er med registrerat konto och ägarkontroll. Privata
tabeller får inga direkta klientskrivrättigheter; interna mutatorer ska inte vara
publika API:er. Behåll fast search_path, explicita grants/revokes och RLS enligt
projektets modell. Se Supabases dokumentation om
[databasfunktioner och exekveringsrättigheter](https://supabase.com/docs/guides/database/functions)
och [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 7. Skeppsarbete, offline och strid

Vid start sparas kostnad, statökning, XP och sluttid. Resultatet räknas inte om
med en senare workshop eller configrevision. Fem små arbeten och ett medelstort
ger samma resultat under samma förutsättningar.

Föreslagen offlinelösning följer samma tidsprincip som befintlig Energy. Jobbet
är spelmässigt färdigt vid finishes_at. En intern funktion, exempelvis
settle_ship_upgrade, bokför resultatet en gång vid nästa relevanta serveråtkomst.
applied_at visar när skrivningen gjordes; den flyttar inte jobbets sluttid.
Webbläsaren ansvarar aldrig för utdelningen.

Funktionen måste anropas före:

- Spelstatus som visar stats, progression eller pågående jobb.
- Nytt arbete och köp som kontrollerar skepps-XP.
- Stridsförhandsvisning och ny stridssnapshot för både angripare och försvarare.

Ta en gemensam servertid för bokföringen och den snapshot som skapas. Läs om
karaktärsraden efter bokföring. Jobb som blir klara medan förhandsvisningen är
öppen ska räknas med vid faktisk stridsstart. En offlineförsvarare får aldrig
sämre stats för att ägaren inte loggat in efter sluttiden.

Jobb får bli färdiga under strid och höja beständiga stats, men ändrar inte
redan sparade stridssnapshots. Ny angripare i samma möte använder dess befintliga
försvararsnapshot. Stridsslut får inte skriva över uppgraderingen. Nästa nya
möte använder aktuella stats.

Ingen separat worker eller schemaläggare behövs för denna första semantik:
öppna vyer hämtar status vid deadline och nästa serveråtkomst ser färdigt resultat.
Om framtida funktioner behöver skicka händelser exakt vid sluttid utan någon
serveråtkomst blir bakgrundskörning en separat utbyggnad.

## 8. Gränssnitt och berörda filer

Crew-vyn visar övning, normalökning, aktuell Perfect Drill-chans, XP, nästa
övnings krav/pris och köpknapp. En liten consumable-del visar innehav, effekt,
varaktighet och återstående tid. Perfect Drill markeras i träningsresultatet.

Ship-vyn visar workshop, XP och nästa köp. Spelaren väljer stat och
Small/Medium/Large och ser Energy, tid, stats och XP före start. Under arbetet
visas målstat, återstående tid och utbyte. Färdigt arbete uppdaterar värdena
automatiskt och frigör plats för nästa.

| Filer | Planerad ändring |
| --- | --- |
| config/gameplay.json, config/schema.json, scripts/config/core.mjs | Kataloger, balansvalidering, SQL-generering och revisionshash. |
| supabase/templates/gameplay.sql, nya migrationer | Lagring, köp, buff, träning, jobb och integration före stridssnapshots. |
| src/lib/game.ts, src/lib/database.types.ts | Separata typer för beständig karaktär och beräknad spelstatus; nya RPC-resultat. |
| src/app/training-actions.ts, ny src/app/ship-upgrade-actions.ts | Tunna serverhandlingar, stabila request-ID:n och faktiska serverresultat. |
| src/components/training-panel.tsx | Dela i crew-training-panel.tsx och ship-upgrades-panel.tsx; återanvänd små visningsdelar. |
| Befintliga sidor under src/app/(game)/harbor/ | Koppla respektive vy till rätt komponent och handlingar. |
| src/components/game-state.tsx, vid behov app-frame.tsx | Buffslut, jobbutgång, fokus/reconnect och uppdatering mellan flikar. |
| src/lib/player.ts | Statberoende vyer ska läsa bokförd spelstatus, inte gamla råvärden från characters. |
| config/interface.css.template | Kompakta paneler i befintlig layout; CSS genereras genom configverktygen. |

Character härleds idag från GameState. Dela typerna innan beräknade buff-/jobbfält
läggs till, så att de inte felaktigt blir tabellkolumner i typkontraktet.
Återanvänd player_game_events för privata ändringssignaler, inte för rådata.
En statusläsning utan förändring får inte skapa en ny refresh-loop.

Nedräkning använder serverns observed_at som referens och hämtar nytt resultat
vid sluttid. Ändrad lokal klocka får varken ge stats eller förlänga buffen.
Behåll tangentbordsstöd, tillgängliga statusmeddelanden och layout ned till 320 px.

## 9. Genomförande i fem etapper

### Etapp 1: Balans och konfigurationskontrakt

- Ta fram steglistor, priser, materialkrav, buffitem och arbetsstorlekar som tydliga provspelningsvärden.
- Beskriv resurstilldelning för lokala testkaptener och vad som återstår för vanliga spelare.
- Utöka configschema, kataloggenerering och revisionskontroll.
- Simulera progression och strid vid start, mellansteg och minst ett steg som ger tusentals stats.

Klart när app och databas använder samma katalog, normal/förstärkt träning är
jämförda och den avsedda progressionstakten är dokumenterad.

### Etapp 2: Lagring och köp med befintliga Gold Coins

- Nya progressionsrader, numeriska gränser och migrering av befintliga kaptener.
- Köp av övning/workshop från gold_coins och request-historik. Banken lämnas orörd.
- Lokalt testguld genom avgränsad utvecklingsfixtur. Inventarium införs senare.

Klart när samtidiga köp bara debiterar en gång, otillräckliga tillgångar inte ger
någon ändring och andra konton inte kan läsa eller ändra privata tillgångar.

### Etapp 3: Crew Training och Perfect Drill

- Serverstyrd träning med XP, 1 % Perfect Drill och sparat utfall.
- Crew-vy, köpflöde och faktiska resultat.
- Consumable-aktivering, inventarium och bufftid skjuts upp till itemetappen.

Klart när grundchansen är 1 %, återförsök aldrig ger en ny slumpdragning och
köpt övning ger högre utbyte. Bankpengar får inte finansiera köp.

### Etapp 4: Ship Upgrades och offlinefärdigställande

- Start, betalning, sparat jobbresultat och automatisk engångsbokföring.
- Integration i spelstatus, workshopköp, stridsförhandsvisning och stridsstart.
- Ship-vy med storleksval, jobbpanel och nästa workshop.

Klart när ett arbete åt gången gäller, kort/långt arbete ger samma utbyte per
Energy och färdigt arbete räknas med efter utloggning, omstart och offlineförsvar.

### Etapp 5: Samlad verifiering och provspelning

- Ta bort det gamla direkta träningsflödet och verifiera att det inte finns någon API-genväg.
- Kör databas-, enhets- och webbläsarregression inklusive strid och configvariationer.
- Provspela från första pass till köpt övning, färdigt jobb och ny workshop. Buffar provas i den senare itemetappen.
- Uppdatera README, TRAINING_FOUNDATION, ARCHITECTURE, CONFIGURATION, COMBAT_SYSTEM och IMPLEMENTATION_STATUS med faktisk leverans och körda kontroller.

Klart lokalt när acceptanskriterierna nedan fungerar med provspelningsresurser.
Publik progression kräver dessutom en spelbar och balanserad källa till guld,
material och consumables. En utvecklingsfixtur räcker inte som den källan.

## 10. Verifiering och acceptanskriterier

### Domän och databas

- Separat crew-/ship-XP, gemensam för respektive grupps fyra stats.
- XP-upplåsning kräver fortfarande betalning; rätt guld/material debiteras exakt en gång.
- Gränser före/vid XP-krav, nästa steg, redan ägt steg och otillräckligt saldo.
- Båda sidor om Perfect Drill-gränsen testas deterministiskt. Inga flakiga krav på exakt andel i slumpmässiga körningar.
- Samma request ger samma utfall; dubbel statbelöning ändrar inte XP eller Energykostnad.
- Buff vid aktivering, före/vid/efter sluttid, efter utloggning och vid samtidig itemanvändning.
- Aktiv buff blockerar nytt item utan förbrukning. Efter sluttiden är chansen exakt 1 %.
- Två samtidiga jobb ger en vinnare. Betalning sker vid start, stats/XP först vid sluttid.
- Samtidig läsning, nytt jobb och stridsstart kan inte ge dubbla belöningar eller kostnader.
- Jobb klart före strid, under strid, vid join, under försvar och efter serveromstart.
- Workshop-/configbyte ändrar inte redan sparade jobb eller aktiva buffar.
- Offlineförsvarare får färdiga stats före ny snapshot; pågående möten och historik behåller sina värden.
- Höga stats och configgränser klarar SQL, JSON, UI och strid utan overflow/precisionstapp.
- Anonyma, andra konton, manipulerade värden och gamla train_stat kan inte kringgå reglerna.
- Befintliga stats, hälsa, Energyankare och stridshistorik bevaras vid migration.

### Webbläsare och hela systemet

- Crew: träna, få XP, köpa övning, använda consumable och se aktiv/utgången effekt.
- Skepp: välja alla storlekar, granska kostnad/utbyte, starta och återkomma efter sluttid.
- Två flikar, dubbelklick, förlorat svar, reload, ut-/inloggning och reconnect.
- Tangentbord, statusuppläsning och bredd 320, 375, 768 och 1280 px.
- Uppdatera äldre tester som förutsätter fast +1 och omedelbara skeppsuppgraderingar.
- Testa tidsgränser med privata fixturer, inte långa väntetider eller publik testbakdörr.

Kontrollkommandon för implementationen:

~~~powershell
npm run config:check
npm run check
npm run test:db
npm run test:config:db
npm run test:e2e
git diff --check
~~~

Kör lokala databasadvisors efter ändrade funktioner, rättigheter och tabeller.
Använd installerad CLI:s --help för rätt kommando. Tester som skriver gemensam
config eller använder samma databasfixturer körs sekventiellt.

Prova höga stats särskilt mot nuvarande 100 HP och växande grundskada. Redovisa
antal träffar till seger vid jämna och ojämna stats. Om HP eller skadebalans behöver
ändras ska det beskrivas separat, inte läggas in som en tyst följd av träningen.

## 11. Verifiering av denna plan

Planen bygger på läsning av aktuella dokument, träningskod, configgenerator,
databasfunktioner och befintliga tester. Planarbetet ändrar inga spelregler eller
databasfunktioner. Dokumentkontroller redovisas i implementationsstatus;
det avsnittet avser det ursprungliga planeringstillfället. Genomförda implementationskontroller
redovisas separat i implementationsstatus. Itemkontroller återstår till itemetappen.
