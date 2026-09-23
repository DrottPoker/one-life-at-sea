# Inventory

Implementerat lokalt 2026-09-19 enligt första etappen i [inventoryplanen](INVENTORY_PLAN.md).

## Spelarens vy

Inventory finns som egen länk i sidopanelens Harbor-meny på /inventory.
Länken är tillgänglig även under sjukhusvistelse.

- Kategoriikoner högst upp: All items, Crew Weapons, Cannons, Medical, Boosters,
  Materials och Miscellaneous. Aktiv kategori har en tydlig markering.
- Namnsökning fungerar tillsammans med kategorin. Sökning är skiftlägesokänslig
  och behandlar exempelvis procenttecken som vanlig text.
- Rader visar miniatyr, namn, stackantal och eventuella individuella stats.
  Panelen fyller innehållsytans bredd. Radernas grundhöjd är 36 px på dator
  och 45 px på mobil, med utrymme att växa vid radbrutna namn. En tunn, indragen
  avskiljare skiljer miniatyren från namnet. Detaljbildens
  yta är högst 280 px bred och 190 px hög (180 px hög på mobil).
- Klick på en rad öppnar beskrivning, effektbeskrivning, stor bild och detaljer under
  raden. Egenskaperna visas i två kolumner med en tunn avskiljare: Category/Quantity
  och Damage/Accuracy. På mobil ligger kolumnerna under bilden.
  En rad är öppen åt gången. Handlingsknappar öppnar inte detaljpanelen.
- Vapen och kanoner har egna sparade Damage- och Accuracy-värden per exemplar.
  Förbrukningsvaror och material samlas i stackar.
- Equip och Use är synliga för rätt itemtyp men inaktiva i denna etapp.
  Passiva items har ingen sådan knapp.
- Trash fungerar direkt. Bekräftelsen visar itemnamn, eventuella individuella stats
  och valt antal. Radering ger inga Gold Coins.
- Listan har 25 rader per sida. Kategorier, sökning och sidnummer finns i adressen.
  Om den sista sidan töms visas den sista kvarvarande sidan.
- Inventory kan läsas i Hospital. Trash är spärrat där. Medicinsk Use är ett
  planerat undantag när faktiska Use-effekter införs.
- Aktiva angripare har kvar sitt navigations- och handlingslås till striden.
  Försvarare kan läsa, söka, filtrera och inspektera items men inte ändra dem.
  Trash och öppna bekräftelser/återförsök låses vid attackstart. Framtida Equip och Use
  omfattas också av stridens handlingslås.

[Cirkulation och historik](ITEM_CIRCULATION.md) visar världens antal per itemtyp med
utfällbart diagram, sex perioder och datum/antal vid pekaren.

Handel sker genom [Marketplace](MARKETPLACE.md). Listade items tas ur inventory och
återkommer vid avbruten listing; köpta items hamnar i köparens inventory.
Utrustning behåller sitt exemplar-ID och sina stats. Cirkulationen är oförändrad.

[Value och historik](ITEM_MARKET_VALUE.md) visar det antalsviktade snittpriset från
genomförda köp under 12 timmar, i hela Gold Coins, till vänster om Circ.
Saknas köp i fönstret behålls senaste Value; bara aldrig sålda items visar N/A.
Båda använder samma diagram med sex perioder.

Utrustningsbonusar och faktiska consumable-effekter ingår inte ännu. Nuvarande stridsnamn Cutlasses och Basic cannons är fortfarande
stridsvyns grundetiketter och representerar inte utrustade inventoryexemplar.

## Material för skeppsarbete

Oak Planks och Iron Nails används av [Ship Upgrades](TRAINING_FOUNDATION.md).
Ett jobb förbrukar 1 av varje per påbörjade 5 Energy. Båda är stackbara, handelsbara
material. Endast innehavet i inventory kan användas; marknadslistade items räknas inte.
Avdrag, Energy, jobb och kvitto sparas atomiskt. Cirkulationen minskar när material
förbrukas, och ett återförsök förbrukar inget extra.

Iron Nails har lagts till i katalogen med placeholderbild. Något nytt recept eller
lootflöde för spikarna ingår inte. Oak Planks tillverkas fortsatt av 5 Oak Logs.

## Datamodell och behörigheter

Fem nya tabeller ligger i private och har RLS aktiverat:

| Tabell | Ansvar |
| --- | --- |
| item_categories | Kategori-ID, namn och ordning. |
| item_definitions | Stabil itemdefinition, kategori, text, bild, typ, stackbarhet, framtida utrustningsplats, aktivflagga och handelsbarhet. |
| item_stacks | Ett positivt heltalsantal per karaktär och stackbar definition. |
| item_instances | Separat ID och sparade Damage/Accuracy-värden för varje utrustningsexemplar. |
| inventory_requests | Privata kvitton som hindrar upprepad radering vid återförsök. |

Klienten har ingen direkt läs- eller skrivrätt till dessa tabeller.
Registrerade spelare använder publika security-invoker-funktioner som anropar
privata funktioner med uttrycklig ägarkontroll.

list_inventory tar kategori, söktext och sida. Ägaren bestäms av den autentiserade
spelaren, aldrig av ett inskickat karaktärs-ID. Alla filter gäller hela det egna
innehavet, och svaren är begränsade till sidstorleken. Sorteringen är stabil på
namn, definition, exemplar-ID och posttyp.

trash_inventory_item tar post-ID, posttyp, antal och request_id. Funktionen tar
befintliga ordnade karaktärs-/stridslås före innehavslåset, avslutar förfallna
sjukhusvistelser, kontrollerar handlingsrätt och genomför radering samt kvitto
i samma transaktion. Samma request_id med samma innehåll returnerar det sparade
resultatet. Ändrat innehåll nekas. Bekräftelse av en redan slutförd begäran kan
göras även om spelaren därefter hamnat i Hospital.

Sista itemet tar bort stackraden. Antal måste vara positiva heltal inom
JavaScripts säkra heltalsgräns. Ett utrustningsexemplar kan bara raderas med antal 1.

Ägarskyddade player_game_events meddelar andra flikar. Befintlig uppdatering vid
återanslutning, fokus och intervall används också. Bekräftelsedialogen visar
aktuellt tillgängligt antal. Den centreras i skärmens synliga yta, även när sidan är
scrollad. Ett kryss uppe till höger stänger utan att förstöra items, liksom Cancel
eller Escape. Under pågående radering är stängning låst tills svaret kommit.
Vid oklart nätverkssvar behålls samma begäran för
Retry; dialogen kan stängas och öppnas igen utan att skapa en ny radering.

## Konfiguration och migrationer

Den ursprungliga katalogen, kategorier och sidstorlek finns under inventory i
[gameplay.json](../config/gameplay.json). Schema och semantisk validering
kontrollerar unika ID:n, kategorireferenser, typer, utrustningsplatser och lokala bildvägar.

Adminpanelen kan skapa och redigera föremål. De raderna får managed_by_admin=true och
bevaras vid senare configsynk. Ursprungliga, oredigerade definitioner uppdateras fortsatt
från config. ID, typ och utrustningsplats är beständiga. Se [Admin](ADMIN_PANEL.md).
För att sluta erbjuda en definition sätts active till false; ägda exemplar förblir
läsbara. Text och kategoritillhörighet kan ändras utan att skriva över individuella
stats, mängder eller ägare. Flaggan tradable styr marknadens säljbarhet och
ändrar inte möjligheten att läsa redan ägda items.

- [20260919072355_inventory_foundation.sql](../supabase/migrations/20260919072355_inventory_foundation.sql)
  skapar tabeller, index och begränsningar.
- [20260919072801_central_gameplay_config_60b2d2217835.sql](../supabase/migrations/20260919072801_central_gameplay_config_60b2d2217835.sql)
  installerar katalogen och funktionerna från [gameplay.sql](../supabase/templates/gameplay.sql).
- Båda är applicerade lokalt. Befintliga karaktärer, saldon, stats och innehav bevaras.

## Lokala provitems

Vanliga karaktärer börjar med tomt inventory. Lyckat Shore Fishing kan nu ge fem sorters
fisk och en Silver Ring genom [lootsystemet](LOOT_TABLES.md).

För en uttryckligt vald lokal testkaraktär:

```powershell
node scripts/inventory-fixture.mjs "Character name"
```

Kommandot använder endast projektets lokala Supabase-container. Det lägger till:

- Två Sailor's Cutlass med olika stats.
- En Deck Cannon.
- Linen Bandages x10, Drill Tonic x3, Oak Planks x20 och Brass Compass x1.

Befintliga stackmängder och testexemplars stats skrivs inte över vid upprepning.
Kommandot fyller åter på helt borttagna testposter. Det är ingen publik spelar-RPC
och ändrar varken Gold Coins eller tränade stats.
Webbläsartester skapar separata testkonton och tar bort dem efteråt.

## Bilder och klientkod

Sex egna, transparenta PNG-bilder finns i [public/images/items](../public/images/items/).
Samma original används för miniatyr och stor bild genom Nexts bildoptimering.
Den gemensamma placeholder.svg används när bild saknas eller inte kan laddas.
Admin kan ladda upp egna bilder till Supabase Storage. Dessa visas via den begränsade
/api/item-images-rutten; originalbilderna i public optimeras fortfarande av Next. Produktionsprompter och ursprung
finns i [itembilderna](ITEM_ART.md).

- [inventory-panel.tsx](../src/components/inventory-panel.tsx): kategorier, rader och Trash-flöde.
- [item-details.tsx](../src/components/inventory/item-details.tsx): expanderade detaljer och cirkulationsdiagram.
- [item-image.tsx](../src/components/inventory/item-image.tsx): gemensam bildvisning och fallback.
- [inventory.ts](../src/lib/inventory.ts): typer, filter och heltalsvalidering.
- [inventory-actions.ts](../src/app/inventory-actions.ts): autentiserad serverhandling.
- [hospital.ts](../src/lib/hospital.ts): gemensamt undantag för att läsa inventory.
- [inventory.test.sql](../supabase/tests/inventory.test.sql): ägare, mängder, replay och handlingsspärrar.
- [inventory.spec.ts](../tests/e2e/inventory.spec.ts): visuella flöden, beständighet, flera flikar,
  nätverksavbrott, samtidighet, Hospital och paginering.

Se [implementationsstatus](IMPLEMENTATION_STATUS.md) för genomförda kontroller.

## Resor

Inventory är läsbart på stillastående havsplatser. Trash och andra spelmutationer
är spärrade utanför hamnen, även via direkta API-anrop. Under resans vänteläge
omdirigeras inventorysidan till /sea. Se [resor](SEA_TRAVEL.md).

## Beständiga återförsök

Ekonomihandlingar sparar request-ID före anropet och kan återhämtas efter
omladdning eller navigation. Pågående handlingar visar ingen återhämtningsruta.
Först när anropet har avslutats utan säker bekräftelse visas **Unconfirmed action**
med **Check saved action**. Detta gäller även mellan flikar och efter omladdning.
Samma karaktär måste vara inloggad.
Se [ekonomigranskningen](ECONOMY_AUDIT.md) för skydd, tester och avgränsning.
