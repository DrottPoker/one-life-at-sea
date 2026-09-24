> Config: platsgränser, reservvapen, träffzoner, temporaries, kultyper och föremålens statintervall har sin källa i [config/gameplay.json](../config/gameplay.json) under `equipment` och `inventory.items`. Värdena nedan beskriver standardbalansen.

# Utrustning

Uppdaterat 2026-09-24. Etapp 1 och 2 är implementerade lokalt. Underlaget finns i
[Torn-researchen](research/TORN_EQUIPMENT_RESEARCH.md).

## Platser

Varje kapten har en uppsättning för besättningen och en för skeppet.
Ett utrustningsexemplar passar alltid i precis en plats, som bestäms av dess definition.

| Grupp | Plats | Funktion |
| --- | --- | --- |
| Crew | Firearm | Skjutvapen med ett begränsat antal skott per strid |
| Crew | Melee | Närstridsvapen utan begränsning |
| Crew | Head, Body, Legs, Feet | Rustning för respektive träffzon |
| Crew | Temporary | En stapel engångsföremål som kastas i boarding |
| Ship | Cannons | Skeppets kanoner |
| Ship | Hull | Rustning för skrov och vattenlinje, samt extra Ship Health |
| Ship | Sails | Rustning för segel och rigg, samt extra Ship Speed i strid |

Tom Melee-plats ger Fists och tom Cannons-plats ger Basic cannons. Båda har neutral
Damage och Precision, så en kapten utan utrustning slåss som före utrustningssystemet.
Tom Firearm-plats ger inga skott. Tomma rustningsplatser ger inget skydd.

Sällsynthet och bonusar är uppskjutna.

## Quality och stats

Varje exemplar får en Quality mellan 0,00 och 100,00 % när det skapas. Slaget är
likformigt och görs av databasen. Definitionen anger ett intervall för varje stat, och
exemplarets värde är `min + (max - min) × Quality / 100`. Quality styr alla stats
på samma exemplar.

| Plats | Stats från definitionen |
| --- | --- |
| Firearm | Damage, Precision, Shots (fast antal) |
| Melee, Cannons | Damage, Precision |
| Head, Body, Legs, Feet | Armor |
| Hull | Armor, Ship Health |
| Sails | Armor, Speed |

Exemplaret sparar bara sin Quality. Stats räknas fram från aktuell definition,
så en balansändring i config gäller alla exemplar medan deras inbördes ordning består.
Pågående strider använder värdena från sin ögonblicksbild.

- **Damage** är en multiplikator där 10 motsvarar ×1. Fists och Basic cannons har 10.
- **Precision** justerar träffchansen. 50 är neutralt. Skillnaden får full effekt vid 50 %
  grundchans och ingen effekt vid 0 % eller 100 %, så garanterade träffar och missar består.
- **Armor** är procentuell skademinskning för träffar i den zon plattan täcker.
- **Ship Health** från Hull höjer skeppets maximala hälsa.
- **Speed** från Sails höjer Ship Speed procentuellt i strid, både för undvikande och bordningschans.
  Tränade stats ändras inte.

## Träffzoner

Varje träff slumpar en zon. Zonen ger en skademultiplikator och bestämmer vilken rustning
som skyddar. Standardvikterna ger i genomsnitt samma skada som före zonerna.

| Grupp | Zon | Vikt | Skada | Skydd |
| --- | --- | --- | --- | --- |
| Crew | Head | 10 | ×2,5, kritisk | Head |
| Crew | Body | 50 | ×1 | Body |
| Crew | Legs | 30 | ×0,7 | Legs |
| Crew | Feet | 10 | ×0,4 | Feet |
| Ship | Waterline | 10 | ×2,5, kritisk | Hull |
| Ship | Hull | 60 | ×1 | Hull |
| Ship | Sails and rigging | 30 | ×0,5 | Sails |

## Skada

En träff räknas i denna ordning:

1. Grundchans från Accuracy mot målets Speed enligt [stridskurvan](COMBAT_SYSTEM.md#träffchans).
2. Precision justerar grundchansen: `chans + (Precision - 50) / 100 × (1 - |2 × chans - 1|)`.
3. Grundskada och Defense-minskning enligt [skadekurvan](COMBAT_SYSTEM.md#skademinskning).
4. Skadan multipliceras med `Damage / 10`, zonens multiplikator och `1 - Armor / 100`.
5. Resultatet avrundas med golvet 1. Full Defense-blockering ger fortfarande 0.

Zon och vapen sparas i stridshändelsen. Loggen visar zonen och markerar kritiska träffar som gör skada.
Under striden ser motståndaren namnen på utrustningen men inte dess stats.

## Order

Alla order för fasen visas alltid. En order som inte går att använda är spärrad och
anger orsaken, till exempel att inget skjutvapen är utrustat. Till sjöss finns en enda
Fire cannons-order. Ovanför den väljer spelaren ammunition: Round shot, Chain Shot eller
Grape Shot. En kultyp utan lager är spärrad, och om den valda typen tar slut återgår
valet till Round shot.

| Fas | Order | Regel |
| --- | --- | --- |
| Sea | Fire cannons, Round shot | En salva med utrustade kanoner. Skadar skeppet. |
| Sea | Fire cannons, Chain Shot | En salva och en Chain Shot ur inventory. Träffar alltid riggen med full skada och sänker målets Ship Speed i tre rundor. |
| Sea | Fire cannons, Grape Shot | En salva och en Grape Shot ur inventory. Skadar besättningen med 60 % av skadan, mot besättningens zoner och rustning. |
| Boarding | Fire firearm | Kräver kvarvarande skott. Ett skott per order. |
| Boarding | Throw temporary | Kräver utrustad Temporary med kvarvarande användning. Förbrukar ett föremål. |
| Boarding | Melee attack | Melee eller Fists. Alltid tillgänglig. |
| Båda | Board, Disengage, Retreat | Oförändrade. |

Skotten laddas från skjutvapnets Shots vid start eller anslutning. Försvararen får samma
antal per angripare, som med kanonsalvorna. I boarding kastar försvararen först sin
Temporary, skjuter sedan så länge skott finns och använder därefter närstrid. Till sjöss
skjuter försvararen bara Round shot.

## Temporary och kultyper

Temporary-platsen pekar på en typ av stackbart föremål, inte på ett enskilt exemplar.
Varje kast förbrukar ett föremål ur stapeln, även vid miss. Varje sida får kasta högst
en gång per strid; försvararen får samma tilldelning mot varje angripare så länge
stapeln räcker. Stapeln kan fortfarande handlas och slängas.

| Föremål | Effekt |
| --- | --- |
| Grenado | Damage 25 och Precision 60. Träffar en zon som ett vapen. |
| Smoke Pot | Precision 100. Vid träff multipliceras målets Crew Accuracy med 0,33 i tre rundor. |
| Chain Shot | Kanonammunition, se Order. Förbrukas per salva, även vid miss. |
| Grape Shot | Kanonammunition, se Order. Förbrukas per salva, även vid miss. |

Effekter gäller det mötet mellan angriparen och försvararen och räknas ned efter varje
runda. En ny effekt av samma slag ersätter den gamla. Loggen visar "Crew blinded" och
"Ship slowed", och båda stridskorten visar aktiva effekter med återstående rundor.
Smoke Pot träffar besättningen som helhet och anger därför ingen zon.

## Utrusta

- Equip och Unequip görs från Inventory, i The Harbor, utanför strid och Hospital.
  Temporary utrustas från stapelns rad.
- Equip ersätter föregående exemplar i platsen. Det tidigare exemplaret ligger kvar i inventory.
- Ett utrustat exemplar kan inte slängas eller marknadslistas förrän det tagits av.
- Varje begäran har ett kvitto, så ett återförsök ger samma resultat utan ny ändring.
- Stridens ögonblicksbild tar med utrustningen vid start och anslutning. Senare byten
  påverkar bara nästa strid.

### Ship Health från Hull

Maximal Ship Health är grundvärdet plus utrustad Hulls Ship Health. Vid Equip och Unequip
räknas återhämtad hälsa fram först med det gamla maxvärdet. Unequip sänker aktuell hälsa
till det nya maxvärdet om den är högre. En ny Hull ger alltså inte gratis hälsa, utan
återhämtas i vanlig takt. Hospital skriver ut med full hälsa enligt aktuell utrustning.

## Källor och handel

- [Loot](LOOT_TABLES.md) slår Quality för varje utrustningsexemplar.
- Adminpanelen kan ge exemplar med vald eller slumpad Quality.
- [Marketplace](MARKETPLACE.md) behåller exemplarets ID och Quality.
- Munition (temporaries och kultyper) är vanliga stackbara föremål. De ges i adminpanelen eller
  via loot tables och handlas på Marketplace. Någon butik eller något recept finns ännu inte.
- Exemplar som fanns före Quality fick 50,00 %. Äldre marknadsposter behåller sina
  historiska Damage- och Accuracy-värden bredvid den nya Quality-kolumnen.

## Datamodell

| Tabell eller kolumn | Ansvar |
| --- | --- |
| `item_definitions` statintervall | Min och max för varje stat som platsen kräver. Övriga stats är tomma. |
| `item_instances.quality` | Exemplarets Quality. |
| `character_equipment` | En rad per kapten och plats med exemplarets ID. |
| `character_temporary` | Vald Temporary-typ per kapten. |
| `combat_participants.defender_shots` | Försvararens skott mot en viss angripare. |
| `combat_participants.defender_temporary_uses`, `defender_effects` | Försvararens kvarvarande Temporary och aktiva effekter mot en viss angripare. |

`character_equipment` har RLS och saknar klienträttigheter. Ägarskapet säkras med en
sammansatt främmande nyckel mot exemplarets ägare. `equip_item` och `unequip_item` är
publika funktioner som anropar privata funktioner med ägarkontroll. Loadouten läses
tillsammans med inventory genom `list_inventory`.

