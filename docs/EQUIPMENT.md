> Config: platsgränser, reservvapen, träffzoner och föremålens statintervall har sin källa i [config/gameplay.json](../config/gameplay.json) under `equipment` och `inventory.items`. Värdena nedan beskriver standardbalansen.

# Utrustning

Uppdaterat 2026-09-24. Etapp 1 är implementerad lokalt. Underlaget finns i
[Torn-researchen](research/TORN_EQUIPMENT_RESEARCH.md).

## Platser

Varje kapten har en uppsättning för besättningen och en för skeppet.
Ett utrustningsexemplar passar alltid i precis en plats, som bestäms av dess definition.

| Grupp | Plats | Funktion |
| --- | --- | --- |
| Crew | Firearm | Skjutvapen med ett begränsat antal skott per strid |
| Crew | Melee | Närstridsvapen utan begränsning |
| Crew | Head, Body, Legs, Feet | Rustning för respektive träffzon |
| Ship | Cannons | Skeppets kanoner |
| Ship | Hull | Rustning för skrov och vattenlinje, samt extra Ship Health |
| Ship | Sails | Rustning för segel och rigg, samt extra Ship Speed i strid |

Tom Melee-plats ger Fists och tom Cannons-plats ger Basic cannons. Båda har neutral
Damage och Precision, så en kapten utan utrustning slåss som före utrustningssystemet.
Tom Firearm-plats ger inga skott. Tomma rustningsplatser ger inget skydd.

Temporary-plats för besättningen och kultyper för kanonerna hör till etapp 2.
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

## Order i boarding

| Order | Vapen | Regel |
| --- | --- | --- |
| Fire firearm | Firearm | Kräver kvarvarande skott. Ett skott per order. |
| Melee attack | Melee eller Fists | Alltid tillgänglig. |
| Disengage, Retreat | - | Oförändrade. |

Skotten laddas från skjutvapnets Shots vid start eller anslutning. Försvararen får samma
antal per angripare, som med kanonsalvorna. Försvararen skjuter automatiskt så länge
skott finns och använder därefter närstrid. Sjöstriden är oförändrad utöver att Fire
cannons använder utrustade kanoner.

## Utrusta

- Equip och Unequip görs från Inventory, i The Harbor, utanför strid och Hospital.
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
- Exemplar som fanns före Quality fick 50,00 %. Äldre marknadsposter behåller sina
  historiska Damage- och Accuracy-värden bredvid den nya Quality-kolumnen.

## Datamodell

| Tabell eller kolumn | Ansvar |
| --- | --- |
| `item_definitions` statintervall | Min och max för varje stat som platsen kräver. Övriga stats är tomma. |
| `item_instances.quality` | Exemplarets Quality. |
| `character_equipment` | En rad per kapten och plats med exemplarets ID. |
| `combat_participants.defender_shots` | Försvararens skott mot en viss angripare. |

`character_equipment` har RLS och saknar klienträttigheter. Ägarskapet säkras med en
sammansatt främmande nyckel mot exemplarets ägare. `equip_item` och `unequip_item` är
publika funktioner som anropar privata funktioner med ägarkontroll. Loadouten läses
tillsammans med inventory genom `list_inventory`.

## Etapp 2

- Temporary-plats för besättningen med engångsföremål som förbrukas vid användning.
- Kultyper för kanonerna, till exempel Round, Chain och Grape shot, som väljs per salva
  och förbrukas från inventory.
