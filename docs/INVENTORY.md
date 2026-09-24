# Inventory

Implementerat lokalt 2026-09-19 enligt första etappen i [inventoryplanen](archive/plans/INVENTORY_PLAN.md).
Equip och Unequip tillkom 2026-09-24. Regler för platser, Quality och stridseffekter finns i [utrustning](EQUIPMENT.md).

## Spelarens vy

Inventory finns som egen länk i sidopanelens Harbor-meny på /inventory.
Länken är tillgänglig även under sjukhusvistelse.

- Kategoriikoner högst upp: All items, Crew Weapons, Crew Armor, Cannons, Ship Parts, Munitions, Medical, Boosters,
  Materials och Miscellaneous. Aktiv kategori har en tydlig markering.
- Utrustningen ligger i en egen, kompakt panel ovanför föremålslistan. Små rutor visar
  besättningens sju och skeppets tre platser med föremålets bild, eller platsens ikon när
  den är tom. Föremål utan egen bild visar platshållarens kubsymbol utan extra ram. Vald ruta
  visas i en fokusruta med fast storlek: bild, platsnamn och Unequip på första raden, namnet på
  en rad (förkortat vid behov) och Quality och stats som ikoner i ett rutnät med två rader.
  Tomma vapenplatser visar Fists och Basic cannons. Rubriken visar maximal Ship Health.
  En ny Equip eller Unequip väljer den platsen. Lyckade byten syns i rutorna och fokusrutan;
  bara fel visas som text under panelen. Panelen ändrar alltså inte storlek när man byter
  plats. Första raden växer till knapphöjden för smala skärmar och pekskärmar. På mobil
  ligger fokusrutan överst och rutorna fyra per rad.
- Namnsökning fungerar tillsammans med kategorin. Sökning är skiftlägesokänslig
  och behandlar exempelvis procenttecken som vanlig text.
- Rader visar miniatyr, namn, stackantal, Equipped-märke och för utrustning två huvudstats.
  Quality visas först i detaljerna. Stats ligger i två fasta kolumner och handlingskolumnen har
  fast bredd med lika breda Equip-, Unequip- och Use-knappar, så alla rader linjerar.
  Panelen fyller innehållsytans bredd. Radernas grundhöjd är 36 px på dator
  och 45 px på mobil, med utrymme att växa vid radbrutna namn. En tunn, indragen
  avskiljare skiljer miniatyren från namnet. Detaljbildens
  yta är högst 280 px bred och 190 px hög (180 px hög på mobil).
- Klick på en rad öppnar beskrivning, effektbeskrivning, stor bild och detaljer under
  raden. Detaljerna rullas ut nedåt på 0,1 sekunder (ingen animation vid reducerad rörelse).
  Egenskaperna visas i två kolumner med en tunn avskiljare: Category samt Slot, Quality och
  exemplarets stats. Antalet står redan på raden och upprepas inte. Value och Circ. delar
  alltid sista raden; vid udda antal egenskaper fyller Category en egen rad. På mobil ligger
  kolumnerna under bilden. En rad är öppen åt gången. Handlingsknappar öppnar inte detaljpanelen.
- Varje utrustningsexemplar har en egen Quality. Stats räknas fram från definitionens intervall.
  Förbrukningsvaror och material samlas i stackar.
- Equip och Unequip fungerar i The Harbor utanför strid och Hospital. Equip ersätter
  föregående exemplar i samma plats. Temporaries utrustas från sin stapel och kan ändå
  handlas och slängas. Use är synlig för övriga consumables men inaktiv. Kultyper har
  varken Equip eller Use; de väljs som order i sjöstriden.
  Passiva items har ingen sådan knapp.
- Trash fungerar direkt för allt som inte är utrustat. Bekräftelsen visar itemnamn,
  eventuell Quality och stats samt valt antal. Radering ger inga Gold Coins.
- Listan har 25 rader per sida. Kategorier, sökning och sidnummer finns i adressen.
  Om den sista sidan töms visas den sista kvarvarande sidan.
- Inventory kan läsas i Hospital. Trash är spärrat där. Medicinsk Use är ett
  planerat undantag när faktiska Use-effekter införs.
- Aktiva angripare har kvar sitt navigations- och handlingslås till striden.
  Försvarare kan läsa, söka, filtrera och inspektera items men inte ändra dem.
  Trash, Equip, Unequip och öppna bekräftelser/återförsök låses vid attackstart. Framtida Use
  omfattas också av stridens handlingslås.

[Cirkulation och historik](ITEM_CIRCULATION.md) visar världens antal per itemtyp med
utfällbart diagram, sex perioder och datum/antal vid pekaren.

Handel sker genom [Marketplace](MARKETPLACE.md). Listade items tas ur inventory och
återkommer vid avbruten listing; köpta items hamnar i köparens inventory.
Utrustning behåller sitt exemplar-ID och sin Quality. Utrustade exemplar måste tas av
innan de kan listas. Cirkulationen är oförändrad.

[Value och historik](ITEM_MARKET_VALUE.md) visar det antalsviktade snittpriset från
genomförda köp under 12 timmar, i hela Gold Coins, till vänster om Circ.
Saknas köp i fönstret behålls senaste Value; bara aldrig sålda items visar N/A.
Båda använder samma diagram med sex perioder.

Faktiska consumable-effekter ingår inte ännu.

## Material för skeppsarbete

Oak Planks och Iron Nails används av [Ship Upgrades](TRAINING_FOUNDATION.md).
Ett jobb förbrukar 1 av varje per påbörjade 5 Energy. Båda är stackbara, handelsbara
material. Endast innehavet i inventory kan användas; marknadslistade items räknas inte.
Avdrag, Energy, jobb och kvitto sparas atomiskt. Cirkulationen minskar när material
förbrukas, och ett återförsök förbrukar inget extra.

Iron Nails har lagts till i katalogen med placeholderbild. Något nytt recept eller
lootflöde för spikarna ingår inte. Oak Planks tillverkas fortsatt av 5 Oak Logs.

## Datamodell och behörigheter

Tabellerna ligger i private och har RLS aktiverat:

| Tabell | Ansvar |
| --- | --- |
| item_categories | Kategori-ID, namn och ordning. |
| item_definitions | Stabil itemdefinition, kategori, text, bild, typ, stackbarhet, utrustningsplats, statintervall, aktivflagga och handelsbarhet. |
| item_stacks | Ett positivt heltalsantal per karaktär och stackbar definition. |
| item_instances | Separat ID och Quality för varje utrustningsexemplar. |
| character_equipment | Ett utrustat exemplar per kapten och plats. |
| character_temporary | Vald Temporary-typ per kapten. |
| inventory_requests | Privata kvitton som hindrar upprepad radering, Equip och Unequip vid återförsök. |

Klienten har ingen direkt läs- eller skrivrätt till dessa tabeller.
Registrerade spelare använder publika security-invoker-funktioner som anropar
privata funktioner med uttrycklig ägarkontroll.

list_inventory tar kategori, söktext och sida. Ägaren bestäms av den autentiserade
spelaren, aldrig av ett inskickat karaktärs-ID. Alla filter gäller hela det egna
innehavet, och svaren är begränsade till sidstorleken. Sorteringen är stabil på
namn, definition, exemplar-ID och posttyp. Svaret innehåller också loadout och maximal Ship Health.

equip_item tar exemplar-ID och request_id, unequip_item tar plats och request_id.
Båda följer samma låsordning och kvittomodell som Trash. Ett utrustat exemplar kan
inte raderas eller marknadslistas (ITEM_EQUIPPED).

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
kontrollerar unika ID:n, kategorireferenser, typer, utrustningsplatser, statintervall per plats och lokala bildvägar.

Adminpanelen kan skapa och redigera föremål. De raderna får managed_by_admin=true och
bevaras vid senare configsynk. Ursprungliga, oredigerade definitioner uppdateras fortsatt
från config. ID, typ och utrustningsplats är beständiga. Se [Admin](ADMIN_PANEL.md).
För att sluta erbjuda en definition sätts active till false; ägda exemplar förblir
läsbara. Text, kategoritillhörighet och statintervall kan ändras utan att skriva över
individuell Quality, mängder eller ägare. Flaggan tradable styr marknadens säljbarhet och
ändrar inte möjligheten att läsa redan ägda items.

- Migrationen `inventory_foundation` skapade tabeller, index och begränsningar.
- Den genererade migrationen `central_gameplay_config_60b2d2217835` installerade katalogen och funktionerna från [gameplay.sql](../supabase/templates/gameplay.sql).
- Båda ingår numera i [baslinjen](../supabase/migrations/20260923111042_baseline.sql). Befintliga karaktärer, saldon, stats och innehav bevaras.

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

Sex egna, transparenta PNG-bilder finns i [public/images/items](../public/images/items).
Samma original används för miniatyr och stor bild genom Nexts bildoptimering.
Den gemensamma placeholder.svg används när bild saknas eller inte kan laddas.
Admin kan ladda upp egna bilder till Supabase Storage. Dessa visas via den begränsade
/api/item-images-rutten; originalbilderna i public optimeras fortfarande av Next. Produktionsprompter och ursprung
finns i [itembilderna](ITEM_ART.md).

- [inventory-panel.tsx](../src/components/inventory/inventory-panel.tsx): kategorier, rader och Trash-flöde.
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

Gemensam lagring, kontobindning och återhämtning mellan flikar beskrivs i [ekonomiintegritet](ECONOMY_AUDIT.md).
