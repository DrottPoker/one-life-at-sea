# Crafting

Crafting finns på `/hideout/crafting` och nås via länken Crafting i Hideouts workshop. Recepten visar
ingredienser, kaptenens tillgängliga lager, resultatet och om mer material behövs. Varje klick tillverkar
ett recept direkt och lägger resultatet i Inventory. Det finns inget jobb och ingen väntetid.

## Första receptet

- Oak Plank (`oak_plank`): förbrukar **5 Oak Logs** (`oak_logs`) och skapar **1 Oak Plank** med den
  befintliga itemdefinitionen och stacken `oak_planks`. Receptet ligger i `gameplay.crafting.recipes`.
- Den enda kostnaden är ingredienserna. Inga Gold Coins, ingen Energy och ingen Stamina dras. Varje lyckat
  craft ger **10 Crafting XP**, oavsett hur många föremål det skapar. Det bekräftade resultatet listar vad
  som skapades och vilka material som gick åt; XP:n och eventuell nivåhöjning i Crafting visas i den
  gemensamma [XP drop](SKILLS.md#xp-drop).
- Oak Logs är ett nytt stapelbart och handelsbart material. Befintliga plankor behåller sina ID:n och
  antal. Bilden för Oak Logs är inventoryns standardplatshållare.
- Logging ger Oak Logs från loot table Woodland Logging, se [Loot tables](LOOT_TABLES.md#woodland-logging)
  och [Activities](ACTIVITIES.md). Med standardinnehållet ger fem lyckade försök ingredienserna till en
  planka. Spelare kan också handla Oak Logs på Marketplace.

## Konfiguration och ägarskap

`gameplay.crafting.recipes` innehåller ID, namn, ingredienser, resultat och aktiv status.
`gameplay.crafting.xpGain` styr XP per craft (10). Configvalideringen kräver kända stapelbara föremål,
positiva säkra heltal som antal, unika recept- och ingrediens-ID:n och att inget recept förbrukar sitt eget
resultat. Den stöder upp till 100 recept och 16 ingredienser per recept. Configsynkningen behåller recept
och kvitton, inaktiverar recept som saknas i config och uppdaterar ingredienser i en transaktion.

De privata RLS-skyddade tabellerna är `crafting_recipes`, `crafting_ingredients` och `crafting_requests`.
Spelare har ingen direkt tabellåtkomst. Den autentiserade RPC:n `list_crafting_recipes()` returnerar aktiva
recept med aktuell itemmetadata och bara anroparens egna inventoryantal. Föremål i Marketplace-escrow räknas
inte som tillgängligt lager. Otillgängliga eller icke stapelbara definitioner tar bort ett recept ur den
aktuella listan.

## Transaktion och återställning

`craft_item(recipe_id, expected_version, request_id)` hämtar karaktären från Auth, tar de gemensamma låsen
för karaktär och strid och letar efter ett befintligt kvitto. En exakt återspelning returnerar kvittot även
om receptet har ändrats eller karaktären har rest, lagts in på Hospital eller hamnat i strid. Återanvänds
ett ID med ändrat innehåll misslyckas anropet. Ny crafting tillåts bara i The Harbor och utanför strid och
Hospital.

Receptversionen är en SHA-256-hash av in- och utvärdena och XP-belöningen. Inaktuella erbjudanden
misslyckas utan att något dras. Transaktionen validerar varje ingrediens och utrymmet för resultatet innan
lagret ändras, låser cirkulationsräknare i föremålsordning, tar bort tomma ingrediensstackar, slår ihop
resultatet med inventory och sparar resultatet. Lager, cirkulationshistorik, Crafting XP, härledd skillnivå
och Character Level, Last action och spelets uppdateringshändelse committas tillsammans. Gamla kvitton utan
XP-belöning är oförändrade; en återspelning ger aldrig XP i efterhand och drar aldrig kostnaden igen. Den
vanliga omförsöksfunktionen för databasen hanterar tillfälliga lås- och serialiseringsfel.

Crafting använder den gemensamma ekonomijournalen i webbläsaren och Web Locks. Den exakta begäran sparas
innan den skickas och behålls när utfallet är osäkert. Efter omladdning eller navigering kan den återställas
med **Check saved action**; en annan ekonomisk handling kan inte ersätta den. Aktuellt lager kommer från
färska ögonblicksbilder från servern, aldrig från ett gammalt kvitto. Revalidering och den befintliga
spelhändelsen för spelaren uppdaterar andra flikar.

## Verifiering

- Databastester täcker behörighet, privat ägarskap, exakta kostnader och resultat, återspelning och
  konflikter, otillgängliga recept och föremål, överskridna tak, återrullade transaktioner, cirkulation, XP och
  nivåhöjningar, Last action, borttagna stackar och spärrar för Hospital, resor och strid.
- Tester med alternativ config ändrar både ingredienskostnad och resultat, lägger till en andra ingrediens
  och kontrollerar att historiska kvitton och lager är oförändrade efter ett nekat anrop.
- Webbläsartester täcker tangentbordsnavigering från Hideout, direkt crafting, inaktiverade knappar vid
  materialbrist, uppdateringar i en andra flik, beständighet i inventory, återställning efter omladdning,
  parallella duplicerade och unika anrop samt Marketplace-escrow.
- Responsiva kontroller täcker 1440/768/375/320 px och granskar skärmbilder för desktop och mobil.
