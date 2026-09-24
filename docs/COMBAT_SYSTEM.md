> Config 2026-09-17: justerbara värden har sin källa i [config/gameplay.json](../config/gameplay.json). Värdena nedan beskriver nuvarande standardbalans. Se [konfigurationsguiden](CONFIGURATION.md) för hur ändringar appliceras.

# PvP och gemensamma attacker

Uppdaterat 2026-09-24. Detta dokument beskriver den implementerade versionen.
Vapen, rustning, träffzoner och Quality beskrivs i [utrustning](EQUIPMENT.md).
[FIRST_COMBAT_PLAN.md](archive/plans/FIRST_COMBAT_PLAN.md) är den historiska planen för version 1.

## Flöde och sidlås

- Attack på en profil öppnar /attack/<player-number>. Adressen identifierar motståndaren och kan delas.
- Motståndarens publika nummer används i adressen. Gamla UUID-adresser omdirigeras och interna stridsanrop behåller UUID. Se [spelar-ID:n](PLAYER_IDS.md).
- Förberedelse är gratis. Båda deltagarna visas sida vid sida. Motståndarens utrustning är Unknown.
- Start battle kostar 10 Energy. Om målet redan försvarar ett möte visas Join battle, med samma kostnad.
- Adressen ändras inte vid start eller join. Varje besökare ser sin egen förberedelse eller pågående attack.
- En delad länk ger Join battle när målet redan angrips. Att bara öppna länken kostar ingen Energy och ansluter inte automatiskt.
- Aktuellt möte hämtas från spelarens serverdata. Strids-ID finns endast i rapportadressen, /combatlog/<battle-id>.
- När mötet avslutas skickas överlevande deltagare i attackvyn till rapporten. Besegrade deltagare skickas till Hospital. Ett nytt besök på målets attacklänk visar åter förberedelsen.
- Attackvyn använder hela spelutrymmet utan hamnens sidopanel, masthead eller footer. Energy och båda hälsomätarna finns i vyn.
- Före start kan spelaren gå tillbaka fritt.
- En aktiv angripare skickas tillbaka till sitt sparade möte vid andra sidbesök, reload, ny flik och bakåtnavigering. Proxy kontrollerar serverns lås; rotlayouten fångar även klientens cachade navigation.
- Alla vanliga spelmutationer nekar aktiva stridsdeltagare, även försvarare och direkta API-anrop.
- Vinst, nederlag, reträtt, rundgräns eller timeout frigör deltagaren. Stängd flik avslutar inte striden direkt.
- Avslutade möten har /combatlog/<battle-id>. Alla med länken kan läsa rapporten utan konto.
- Äldre /attack?target=<id>&battle=<id>, /combat/prepare/<id> och /combat/<id> är enbart kompatibilitetsomdirigeringar.


## Stridsvyn

Designen följer ägarens combat-referenser från 2026-09-21. På desktop ligger
kaptenens och motståndarens hälsa, utrustning och relevanta stats på varsin sida
om en gemensam stridsbild. På mindre skärmar flyttas bilden ovanför kaptenskorten
och orderknapparna staplas när utrymmet kräver det.

Bilden byts mellan sjöstrid och boarding utifrån den egna deltagarens sparade
stridsfas. Disengage återställer sjöbilden. Energy, runda och serverförankrad
nedräkning visas i sidhuvudet. Motståndarens privata stats och ammunition är
fortsatt dolda. Orderregler, kostnader, timeout, samtidighet och idempotens är
oförändrade. Se [designgrund](INTERFACE_DESIGN.md) för komponenter och bildkällor.

## Flera angripare

Mötet har en försvarare med gemensam Ship Health och Crew Health. Varje angripare har egna:

- Hälsovärden, stats och ammunition.
- Runda, stridsfas och inaktivitetsdeadline.
- Startbegäran, orderhistorik, träffar och utdelad skada.

En angripare kan boarda medan en annan skjuter. Försvararen svarar automatiskt i respektive angripares fas.
Den ena angriparens fasbyte eller runda ändrar inte den andras.

Servern behandlar handlingar atomiskt under mötets deltagarlås. Den första accepterade träffen som
sänker försvararens skepp eller besättning till noll avslutar hela mötet. Angriparen får Final blow;
andra angripare som fortfarande deltar får Assist. En redan flydd eller besegrad deltagare får ingen assist.
Sena order kan inte göra mer skada eller ändra vinnaren.

Båda handlingarna i en enskild runda beräknas från samma startläge. Försvararen får utföra sin låsta
motattack även om den avgörande träffen kommer i samma runda. I version 2 behålls final-blow-krediten
även om motattacken samtidigt slår ut angriparen. Detta ersätter version 1:s oavgjort vid ömsesidigt utslag.

Om en angripare flyr eller besegras fortsätter de andra. När sista angriparen lämnar avslutas mötet.
Samma kapten kan inte återansluta till samma möte och därmed återställa ammunition eller rundor.
En kapten kan delta i ett möte åt gången. Försvararen kan läsa vanliga spelsidor, inventory,
profiler och sparade scoutingresultat, men kan inte utföra handlingar som flyttar eller ändrar
karaktären. Resor, scouting, föremålsändringar, träning, nya skeppsarbeten, nivåköp,
banköverföringar, ändrade försvarsorder och separata anfall är spärrade tills mötet avslutas.
Om flera angripare deltar kvarstår låset tills den sista lämnar eller hela mötet avslutas.

## Onlineförsvar och realtid

Försvararen flyttas inte till attackvyn och får inga manuella försvarsval under pågående möte.
Hälsomätarna och handlingslåsen uppdateras i vanliga spelvyer. Redan öppna formulär, inklusive
bekräftelser och återförsök, låses vid attackstart och öppnas igen när striden slutar.
Läsning, filtrering och navigering för försvararen fungerar fortfarande.
Redan startat skeppsarbete och vanlig passiv återhämtning följer sina befintliga regler;
pågående möte använder sin sparade ögonblicksbild.

Servern kontrollerar deltagarskapet under samma ordnade lås som attackstart. Träning,
bank, inventory och försvarsorder använder private.assert_can_act; resor och scouting
kontrollerar samma deltagartabell i sina respektive platsflöden. Tidigare sparade kvitton
kan fortfarande läsas med samma request-ID utan att en ny handling utförs.

Stridens Realtime använder public.player_game_events, en ägarbegränsad revisionssignal.
Hamn- och sjukhuslistorna har separata begränsade namnprojektioner.
Efter en signal hämtar appen auktoritativa serverdata och uppdaterar befintlig vy utan dokumentomladdning.
Alla angripare och försvararen signaleras vid start, anslutning, order och avslut.
Återanslutning, återvunnet fokus och en 15-sekunders reservkontroll stämmer av missade signaler.
Förberedelsen kontrollerar tillgänglighet var femte sekund. Startkommandot avgör alltid atomiskt om
ett nytt möte ska skapas eller ett befintligt anslutas.

Råa karaktärsrader, stats, försvarsförval och stridsögonblicksbilder publiceras inte till Realtime.

## Hälsa och återhämtning

Både angripare och mål behöver minst 1 Ship Health och 1 Crew Health. Full hälsa krävs inte.
Start återställer aldrig hälsa. Permanent karaktärsdöd finns inte, oavsett skadeorsak.
Noll Crew Health ger fem minuter i [Hospital](HOSPITAL.md); noll Ship Health sätter också Crew Health till 0.
Patienter kan inte spela eller attackeras under vistelsen och återkommer med båda hälsomätarna fulla.
Karaktär, skepp, besättning, tränade stats och pengar behålls.

- Ship Health: +1 per 30 sekunder efter deltagarens avslut.
- Crew Health: +1 per 10 sekunder efter deltagarens avslut.
- Överlevande återhämtar båda parallellt, även offline, högst 100. Utrustad Hull höjer maximal Ship Health.
  Sjukhuspatienter får full hälsa enligt aktuell utrustning vid utskrivning.
- Hälsa återhämtas inte för aktiva deltagare. En tillbakadragen angripare kan börja återhämta sig medan mötet fortsätter.
- Energy: +5 vid fasta femminutersticks i hamnen och Hospital, samt vid fasta
  tiominutersticks till havs och under resor. Högst 100, alltid heltal. Se [Energy](ENERGY_RECOVERY.md).
- Fem minuters skydd mot inkommande attacker efter deltagarens avslut.
- Skyddet hindrar inte egna attacker. Ett eget anfall avslutar skyddet.

## Order och förval

| Fas | Order | Regel |
| --- | --- | --- |
| Sea | Fire cannons | En salva även vid miss. Träff skadar Ship Health. Utrustade kanoner eller Basic cannons. |
| Sea | Fire cannons med Chain Shot eller Grape Shot | Ammunition väljs före Fire och tas ur inventory, se [utrustning](EQUIPMENT.md#order). |
| Sea | Board | Ingen egen salva. Bordningsförsök efter motståndarens handling. |
| Boarding | Fire firearm | Kräver skjutvapen och kvarvarande skott. Ett skott per order. Träff skadar Crew Health. |
| Boarding | Throw temporary | Kastar utrustad Temporary, se [utrustning](EQUIPMENT.md#temporary-och-kultyper). |
| Boarding | Melee attack | Närstridsvapen eller Fists. Träff skadar Crew Health. |
| Boarding | Disengage | Ta motattacken och återgå till Sea om besättningen överlever. |
| Båda | Retreat | Ta motattacken och lämna mötet om kaptenen överlever. |

Nederlag avgörs före reträtt och fasbyte. Lyckad boarding börjar crew-strid nästa runda.
Båda som väljer Board lyckas utan slump. Skador följer med mellan faserna.

Cannon focus skjuter så länge ammunition finns och boardar därefter. Boarding focus boardar direkt.
I boarding kastar försvararen först sin Temporary, skjuter sedan så länge skott finns och använder därefter närstrid.
Alla order för fasen visas; otillgängliga order är spärrade med orsaken.

Varje angripare får tio utvecklingssalvor. Försvararen har tio salvor per angriparpar.
Skjutvapnets skott laddas på samma sätt, för angriparen vid start och för försvararen per angriparpar.
Detta är en tillfällig tilldelning utan inventarium eller ammunitionsekonomi.

Bordningschans: clamp(0.70 + 0.30 * (ship_speed - enemy_ship_speed) / (ship_speed + enemy_ship_speed), 0.20, 0.90).
Crew-stats gäller boarding; Ship-stats gäller till sjöss. Speed påverkar undvikande och bordning.

## Statkurvor och skada

Grundmodellen jämför par av stats, inspirerad av Torns offentligt beskrivna kurvor.
Samma funktioner används för angripare och försvarare, både till sjöss och vid boarding.

| Vår stat | Torn-motsvarighet | Funktion |
| --- | --- | --- |
| Attack | Strength | Grundskada och jämförelse mot Defense. |
| Defense | Defense | Minskar skadan från en träff. |
| Accuracy | Speed | Jämförs med målets Speed för träffchans. |
| Speed | Dexterity | Undviker träffar; påverkar även vårt separata bordningsförsök. |

### Träffchans

Sätt r = egen Accuracy / motståndarens Speed. Funktionen returnerar en sannolikhet mellan 0 och 1:

- r <= 1/64: 0.
- 1/64 < r <= 1: (8 * sqrt(r) - 1) / 14.
- 1 < r < 64: 1 - (8 * sqrt(1/r) - 1) / 14.
- r >= 64: 1.

Lika stats ger 50 % träffchans. Dubbelt så hög Accuracy ger cirka 66,74 %.
Vapnets Precision justerar därefter chansen enligt [utrustningsreglerna](EQUIPMENT.md#skada).
64 gånger så hög Speed som inkommande Accuracy ger garanterade missar.
64 gånger så hög Accuracy som målets Speed ger garanterade träffar.
Servern träffar när slumpvärdet i [0, 1) är strikt lägre än sannolikheten.
Det tidigare intervallet 50-95 % används inte längre.

### Skademinskning

Sätt q = motståndarens Defense / egen Attack. Minskningen m är:

- q <= 1/32: 0.
- 1/32 < q <= 1: 0,5 + 0,1 * ln(q) / ln(2).
- 1 < q < 25: 0,5 + 0,5 * ln(q) / ln(25).
- q >= 25: 1.

Full blockering kräver **25 gånger Defense**, enligt ägarens justering från Torns 14.
Endast den övre delen av kurvan har gjorts flackare. Lika stats ger fortfarande 50 % minskning.

| Defense / Attack | Skademinskning |
| --- | --- |
| 1 | 50 % |
| 2 | 60,77 % |
| 4 | 71,53 % |
| 10 | 85,77 % |
| 14 | 90,99 % |
| 20 | 96,53 % |
| 25 eller mer | 100 % |

### Grundskada och avrundning

Sätt x = log10(Attack). Grundskadan är 7*x*x + 27*x + 30.
Detta använder den offentliga Torn-approximationens form med en skalenhet där
en av våra statpoäng motsvarar tio Torn-poäng. Nya karaktärer börjar med 10 i alla åtta stats
och 100 HP. Detta ger 32 skada vid en träff mellan två nya kaptener. Befintliga karaktärers
stats och tidigare träning behålls. Första crew-övningen kostar 5 Energy för +1 stat; köpta nivåer och Perfect Drill kan öka utfallet.

- Vid full blockering (q >= 25): 0 skada.
- Annars: max(1, round(grundskada * (1 - m) * Damage / 10 * zon * (1 - Armor / 100))).
  Fists och Basic cannons har Damage 10 och ger därför grundskadan i en ×1-zon utan rustning.
- Den faktiskt sparade skadan begränsas till målets återstående hälsa.
- Golvet på 1 före full blockering hindrar heltalsavrundning från att ge noll för tidigt.
- Det tidigare taket på 40 skada är borttaget.
- En blockerad träff räknas fortfarande som en träff och visas med zon, till exempel Hull · Blocked · 0 damage.
  En miss visas som Missed. Kanonsalvor förbrukas i båda fallen.

Absolut Attack påverkar alltså grundskadan, medan kvoterna avgör träffchans och minskning.
Vid lika Attack och Defense, neutralt vapen och en ×1-zon utan rustning blir skadan per träff
15 vid stats 1, 32 vid 10, 56 vid 100 och 87 vid 1 000. Skadad hälsa sänker inte dessa stats.

Varje träff slumpar en träffzon. Zonerna, rustningen och kritiska träffar beskrivs i
[utrustning](EQUIPMENT.md#träffzoner). Slumpvariation i skadebeloppet och gruppbonusar ingår inte.

### Referenser och avgränsning

[Torn Wiki: Battle Stats](https://wiki.torn.com/wiki/Battle_Stats) beskriver statrelationer och referenspunkter.
[Proximas ursprungliga undersökning](https://www.torn.com/forums.php?p=threads&t=16199413)
beskriver skadeformeln och dess begränsningar. Det är offentligt undersökta approximationer,
inte tillgång till Torns serverkod. Vår modell använder dessa som grund, med uttryckliga
anpassningar för statskalan och full blockering vid 25 gånger Defense.

## Tidsgränser och rapport

- Högst 25 rundor per angripare, över båda faserna.
- Två minuter utan accepterad order ger automatisk Retreat med motattack.
- Ett möte varar högst tio minuter från första starten; sena anslutningar förlänger inte detta.
- Utgångna deltagare avslutas vid nästa relevanta serverläsning eller handling.
- Återhämtning räknas från deadline, inte från återbesöket.
- Offentlig rapport skapas när hela mötet är avslutat. Den visar starter, anslutningar, order,
  vapen, träffzoner, kritiska träffar, skador, fasbyten, servertid (UTC), final blow, assists och deltagarnas träffar.
  Äldre händelser utan vapen och zon visas som tidigare.
- Attackvyn spelar också upp den egna senaste rundan i stridsbilden, med träffzon, skada och miss
  för båda sidor. Se [gränssnittsdesignen](INTERFACE_DESIGN.md#combat-presentation).
- Loggen visar inga lokala rundnummer eller summerat antal rundor. Det egna rundtaket visas fortfarande i attackvyn.
- Deltagarlistan visar Ship damage och Crew damage separat för både angripare och försvarare.
  Summorna räknas från vilken hälsa varje träff skadade; äldre händelser använder sin fas.
- Alla karaktärsnamn i attackvyn, händelselistan, deltagarlistan och resultatet länkar till profilen.
  Navigationslåset gäller fortfarande under en aktiv attack.
- Rapportens hälsa är historiska slutvärden, inte senare återhämtad hälsa.
- Rapporten avslöjar inga konton, e-postadresser, privata stats, ammunition, försvarsförval eller begärans-ID:n.
- Guld, föremål och XP delas ännu inte ut. PvE och flottuppdrag ingår inte.

## Lagring och behörighet

- private.combats: gemensamt möte, försvararens ögonblicksbild, delad hälsa, resultat och yttersta deadline.
- private.combat_participants: angriparnas egna faser, rundor, snapshots, resultat och bidrag, samt försvararens salvor och skott mot angriparen.
- private.combat_engagements: reservation och roll per aktiv kapten.
- private.combat_rounds: globalt ordnad händelselogg med aktör och lokalt rundnummer.
- public.player_game_events: endast ägarens ändringssignal, skyddad av RLS.

Alla råa stridstabeller har RLS och saknar klienträttigheter. Privata mutatorer kan inte anropas av spelare.
get_combat och preview kräver registrerad spelare och filtrerar bort privata motståndardata.
get_attack_lock returnerar endast den egna aktiva attacken.
get_combat_log är ett separat offentligt läsanrop med explicit fältlista och endast avslutade möten.

Stats, utrustning och försvarsförval snapshots vid start. Motståndaren ser utrustningens namn men inte dess stats. Serverns privata round resolver och pgcrypto äger alla utfall.
Ordnade deltagarlås, idempotenta begärans-ID:n och förväntade lokala rundnummer skyddar mot dubbeldebitering,
samtidiga sluthits och gamla tabbar. Hälsa, logg, resultat och notifieringar sparas i samma transaktion.
Oberoende möten har separata lås. Förändrad deltagargrupp utlöser transaktionsåterförsök.

Migrationen `shared_attack_encounters` införde delade attacker.
`combat_damage_breakdown` lade till separata skadevärden genom att läsa befintliga händelser.
`torn_style_combat_curves` införde de privata statfunktionerna och ersatte beräkningarna i round resolver.
Alla tre ingår numera i baslinjen `20260923111042_baseline.sql`. Befintlig stridshistorik bevaras. Ingen databasreset eller molnändring har gjorts.
De nya kurvorna används för nästa order även i pågående strider; tidigare händelser räknas inte om.

Migrationen `combat_stats_start_at_ten`, också i baslinjen, ändrade endast kolumnernas startvärden för nya karaktärer.

## Verifiering

Verifierat 2026-09-19 med Hospital: lint, TypeScript, 71 enhetstester, produktionsbygge,
501 databasassertioner och 39 kontroller med alternativ config passerade.
Webbläsartester täcker aktiva och delade strider, slutträffar, livehälsa, sjukhusintagning
för båda sidor, spärrade länkar, ut-/inloggning och automatisk utskrivning även offline.
Se [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) för senaste slutkörningen.

Supabase security advisors rapporterade inga problem. Den tidigare dokumenterade
Next.js-diagnostiken om avbrutna RSC-strömmar förekommer vid navigation.

## Administrative interruption

An authorized administrator can end an active encounter through /admin.
The operation holds the existing ordered combat locks, completes all active
participants as draws, closes the encounter and releases engagement rows.
It does not resolve another round, roll damage, change health or assign a winner.
Previous events and snapshots remain intact. A public admin_end log entry
identifies the interruption; the private admin audit retains the reason and actor.
No new protection period is awarded by this administrative operation.

## Koppling till resor

PvP fungerar i hamnen och på havsplatser. Till havs behöver angriparen först
upptäcka målet genom [scouting](SEA_SCOUTING.md) för 5 Energy. Båda måste vara
kvar vid samma Sea distance, oavsett platstyp, och målets besök får inte ha ändrats.
Samma villkor gäller den som ansluter till ett befintligt möte.
Start/join kostar fortfarande separat 10 Energy.

Preview, start och join avvisar resande skepp, andra avstånd och mål som saknas
i angriparens senaste scouting. Förfallna resor färdigställs före prövningen,
även för offlineförsvarare. Profiler använder samma plats- och upptäcktsregel.
Varken angripare eller försvarare kan scouta eller resa under pågående strid.

Gemensamma sorterade deltagarlås gör samtidig attack och avfärd ömsesidigt
uteslutande. Resor skapar inget nytt attackskydd. En överlevande kapten stannar
på havsplatsen med fortsatt återhämtning på fasta tiominutersticks. Nederlag skickar kaptenen till
Hospital i hamnen och bevarar distansrekordet. Se [resor](SEA_TRAVEL.md).

## Crew Morale

Vid start/join multipliceras deltagarens Crew Attack, Defense, Speed och Accuracy
med `1 + morale / 100 * 0,05`. Försvararen använder motsvarande snapshot när
mötet skapas. Moralen återhämtas först till samma observationstidpunkt.
Statsen ligger fast under deltagandet även när moralen senare tickar mot 0.
Permanenta stats, Ship-stats och HP ändras inte. Motståndarens moral exponeras inte.
Historiska strider använder sina befintliga snapshots.
Se [Crew Morale](CREW_MORALE.md).

## Sparade notiser

När hela mötet avslutas får försvararen en samlad notis med alla angripare, även dem
som redan lämnat mötet. Namnen länkar till profilerna och `[view]` till combat log.
Notisen anger om attacken skickade försvararen till Hospital eller om angriparen förlorade (`attacked you but lost`). Notiser och rapporter
kan läsas även i Hospital. Offlineattacker sparas på samma sätt. Se [Notifications](NOTIFICATIONS.md).
