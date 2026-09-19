# Plan: Inventory och items

Datum: 2026-09-19.

Status: **Första etappen implementerad lokalt 2026-09-19.** Aktuella regler och datamodell
finns i [Inventory](INVENTORY.md). Dokumentet nedan bevarar planen; Equip och Use
samt Value är fortfarande framtida etapper. Cirkulation med historikdiagram är nu
implementerat, se [Item Circulation](ITEM_CIRCULATION.md).

## 1. Beslutad första etapp

Första etappen är ett beständigt inventory med kategorier, itemrader och utfällbara
detaljer. Trash fungerar direkt. Equip och Use visas för rätt itemtyp, men är
inaktiva tills deras spelmekanik införs.

| Område | Beslut |
| --- | --- |
| Lista | Bild och namn till vänster, aktuella itemstats i mitten, handlingar till höger. |
| Kategorier | Varje item tillhör en kategori. Kategorier filtreras högst upp. |
| Detaljer | Klick fäller ut beskrivning, effekt och större bild direkt under raden. |
| Utrustning | Crew-vapen och kanoner är de första utrustningstyperna. |
| Consumables | Har Use som handling. Effekten kopplas in i en senare etapp. |
| Övriga items | Ingen Equip- eller Use-knapp. |
| Trash | Förstör ett valt item eller valt antal ur en stack. Ingen ersättning i guld. |
| Hospital | Inventory får läsas. När Use införs får medicinska items användas där. |
| Cirkulation | Implementerat efter första etappen, se [Item Circulation](ITEM_CIRCULATION.md). |
| Senare | Value och värdediagram. |

Medicinska items är alltså läsbara även på sjukhuset i första etappen. Deras Use
blir funktionell samtidigt som övrig faktisk itemanvändning införs. Utrustning,
icke-medicinsk användning och Trash är spärrade under sjukhusvistelsen.

## 2. Förlagan från Torn

Ägarens sju bilder är referensen för den kompakta listan, kategoriikonerna,
antalet efter namnet och detaljpanelen som skjuter ned efterföljande rader.
Den utrustade raden kan senare markeras på samma tydliga sätt.

[Torns officiella itemwiki](https://wiki.torn.com/wiki/Item) beskriver kategorierna
och itempanelernas information om effekter och krav.
[Torns vapenwiki](https://wiki.torn.com/wiki/Weapon) beskriver individuella värden
för Damage och Accuracy. Därför behöver två exemplar av samma vapen kunna visas
på varsin rad med olika sparade stats, medan identiska förbrukningsvaror kan
samlas på en rad med exempelvis x10, som i referensbilderna.

Vi använder detta listbeteende i spelets befintliga blå gränssnitt, med egna bilder
och namn som passar temat. En större stillbild uppfyller den första etappen.

## 3. Gränssnitt

Följande detaljer är arbetsförslag där ägaren inte angett ett exakt val.

- Inventory har en egen sida på /inventory och en länk i sidopanelens Harbor-meny
  (uppdaterat enligt önskemål 2026-09-19).
- Kategoriraden börjar med All och har ikon, tillgängligt namn och tydligt aktivt val.
- Föreslagna startkategorier: Crew Weapons, Cannons, Medical, Boosters, Materials och Miscellaneous.
- Ett litet sökfält filtrerar på namn inom vald kategori. Ingen ekonomisortering behövs.
- Listan sorteras stabilt på namn och item-ID. Stora innehav hämtas i begränsade sidor;
  filtreringen gäller hela innehavet, inte bara redan hämtade rader.

### Itemraden

| Vänster | Mitten | Höger |
| --- | --- | --- |
| Liten bild, namn och xN för en stack. | De stats som det faktiska exemplaret har. | Equip eller Use när det passar, samt Trash. |

Vapen och kanoner visas som separata exemplar. Identiska stackbara items visar
antalet vid namnet. Ett material utan stats får inga tomma statetiketter eller
påhittade nollvärden. Föreslagna första vapenstats är Damage och Accuracy; dessa
är itemvärden och ska hållas skilda från karaktärens tränade stats.

Equip och Use är tydligt inaktiva i första etappen. En gemensam kort upplysning
förklarar att användning och utrustning kommer senare, så knapparna inte ser trasiga ut.

### Utfällda detaljer

Klick på namn, bild eller radens öppningsyta fäller ut en panel under just den raden:

1. Beskrivning och itemkategori.
2. Effekt och eventuella krav, om sådana finns definierade.
3. Förstorad bild till vänster och itemets fullständiga stats/effektuppgifter till höger.

En rad är öppen åt gången. Samma rad eller en stängningsknapp stänger panelen.
Handlingsknappar öppnar inte detaljerna av misstag. Tangentbord och
skärmläsare får motsvarande öppna/stäng-beteende.

På små skärmar staplas detaljbild och information. Namn, stats och knappar ska
förbli läsbara utan att hela sidan kräver horisontell rullning. Saknad bild får
en gemensam reservbild. Gränssnittets texter är på engelska, som övriga spelet.

## 4. Enkel datamodell som håller för nästa etapp

Dela upp vad en itemtyp är från vilka exemplar en karaktär äger.

| Del | Innehåll |
| --- | --- |
| Itemkatalog | Stabilt ID, namn, kategori, bilder, beskrivning, effektbeskrivning, itemtyp och om den är stackbar. |
| Itemstackar | Karaktär, itemtyp och positivt heltalsantal för identiska förbrukningsvaror och material. |
| Itemexemplar | Eget ID, ägare, itemtyp och sparade individuella stats för varje vapen eller kanon. |

Utrustningsdefinitioner anger framtida plats: crew_weapon eller cannons.
Kategori och beteende är separata uppgifter: en kategoris namn ska inte ensamt
avgöra om ett item är utrustning, förbrukningsvara eller passivt.

Individuella stats sparas när exemplaret skapas och lottas inte om vid sidladdning.
Katalogändringar får inte radera innehav eller skriva över redan sparade värden.
Använd stabila ID:n och inaktivera vid behov gamla definitioner i stället för att
ta bort dem. Effekttext i visningsetappen innebär inte att effekten redan är aktiv.

Katalog och dess validering ansluts till projektets centrala konfigurationsflöde.
SQL-funktioner underhålls i [gameplay.sql](../supabase/templates/gameplay.sql).
Tabeller och funktioner införs med nya migrationer enligt
[konfigurationsflödet](CONFIGURATION.md). Äldre migrationer ändras inte.

Innehavet lagras i databasen och kan endast läsas av ägaren. Klienten får inte
skriva direkt i tabellerna. Ägarskydd, begränsade databasbehörigheter och
servervalidering gäller även om någon anropar API:t utanför gränssnittet.

Nya och befintliga karaktärer får som arbetsförslag tomt inventory. För lokal
granskning skapas uttryckliga testdata med två exemplar av samma vapen med olika
stats, en kanon, staplade medicinska items, en booster och ett material.
Testtilldelning ska vara avgränsad till lokal utveckling, inte en spelarhandling.

Spelets nuvarande Cutlasses och Basic cannons är text i stridssnapshots, inte
ägda items. De ska inte tolkas som ett redan implementerat utrustningssystem.

## 5. Trash fungerar från början

- För ett enskilt exemplar visar bekräftelsen namn och vad som förstörs.
- För en stack väljer spelaren ett heltalsantal mellan 1 och det tillgängliga antalet.
- Bekräftelsen anger namn, antal och att handlingen förstör dessa items permanent.
- Servern kontrollerar ägare, antal, sjukhusstatus och befintliga handlingslås.
- Minskning eller radering sker atomärt. Samma begäran får inte förstöra fler
  items vid dubbelklick eller nätverksåterförsök.
- Återanvänd ordnade karaktärs-/stridslås och privata kvitton från befintliga
  spelhandlingar. Lås det berörda innehavet under ändringen.
- Ett ogiltigt antal eller ett redan förbrukat innehav ger ett begripligt fel
  och uppdaterad lista. Delvis genomförda raderingar får inte förekomma.
- Sista exemplaret tar bort raden och stänger dess detaljpanel.
- Ändringen signaleras genom befintliga ägarskyddade player_game_events så att
  andra flikar uppdateras. Återanslutning och omladdning läser färska värden.

Trash ger inga Gold Coins. Det är inte en säljfunktion.

## 6. Hospital och befintliga spelregler

Lägg /inventory i den gemensamma tillåtelsen i
[hospital.ts](../src/lib/hospital.ts), som används av både proxy och klientens
navigationsskydd. Inventorys sidladdning tillåter sjukhusvistelse, precis som profiler.

Läsning, kategoribyte, sökning och utfällning fungerar under sjukhusvistelsen.
Trash nekas i både gränssnitt och databas. När riktiga Use-handlingar införs
får medicinska items ett uttryckligt undantag, inte ett allmänt undantag för items.

Aktiva angripares befintliga stridslås gäller fortfarande. Träning, skeppsarbete,
bank och övriga sjukhusspärrar följer fortsatt [sjukhusreglerna](HOSPITAL.md).

## 7. Implementationsordning

1. **Katalog och databas.** Definiera kategorier, typer och ett litet provsortiment.
   Inför ägarskyddade innehav, individuella stats, typade lässvar och lokala testdata.
2. **Sida och navigation.** Lägg till Inventory, kategorier, namnsökning, itemrader,
   stackantal och tomt tillstånd. Öppna läsåtkomst i Hospital.
3. **Detaljpanel.** Koppla beskrivning, effekt, stor bild och stats till rätt exemplar.
   Anpassa mobilvy, tangentbordsstyrning och laddnings-/feltillstånd.
4. **Trash.** Inför serverhandling, antal, bekräftelse, atomär radering,
   återförsöksskydd och uppdatering mellan flikar.
5. **Verifiering och dokumentation.** Granska gränssnittet och ägarskyddet,
   uppdatera arkitektur, sjukhusregler och faktisk implementationsstatus.

Stegen ovan utgör första leveransen. Ingen fungerande Equip-/Use-handling,
utrustningsbonus, medicinsk effekt eller träningsbuff ingår i denna leverans.

## 8. Nästa etapp: Equip och Use

Detta är nästa avgränsade arbete och genomförs efter visningsetappen.

- En utrustningsplats för crew-vapen och en för kanoner. Equip/Unequip sparas,
  och byte ersätter föregående utrustning utan att förstöra den.
- Utrustade exemplar markeras i listan. Ett utrustat item behöver tas av före Trash.
- Itembonusar hålls skilda från permanenta träningsstats. Nya strider tar med
  utrustningen i sina snapshots; pågående strider behåller sina sparade värden.
- Use förbrukar ett item och utför dess effekt i samma servertransaktion.
  Nekad användning förbrukar ingenting.
- Medicinska items får användas i Hospital. Exakta effekter anpassas till spelets
  nuvarande femminutersvistelse och den befintliga utskrivningen.
  [Torns medicinregler](https://wiki.torn.com/wiki/Medical) visar hälsoåterställning
  och minskad sjukhustid som effekttyper, men är inte våra beslutade balansvärden.
- En framtida träningsconsumable kan höja Perfect Drill-chansen tillfälligt;
  därefter återgår den till 1 %, enligt tidigare beslut.
- Effektstyrka, varaktighet, eventuella cooldowns och kombinationsregler bestäms
  innan dessa effekter aktiveras. Samma effektdata ska styra funktion och beskrivning.

Butik, loot, handel, intjäningsvägar och value är separata
tillägg. Inventoryplanen ändrar inte tidigare beslut om att endast Gold Coins
på karaktären får användas till köp.

## 9. När första etappen är klar

Kontrollerna nedan var acceptanskriterier för första etappen. Genomförda resultat
finns i [implementationsstatus](IMPLEMENTATION_STATUS.md).

- En stack visar rätt antal; två vapen med samma namn visar sina egna sparade stats.
- Kategorier och namnsökning fungerar tillsammans, även över flera resultatsidor.
- Bara relevanta Equip-/Use-knappar visas, och de är inaktiva i denna etapp.
- Rätt detaljpanel öppnas under rätt rad. Trash-klick öppnar inte panelen.
- Trash täcker enskilda exemplar, del av stack, sista itemet, ogiltiga antal,
  samtidig användning från två flikar och återförsök av samma begäran.
- En annan spelares innehav kan varken läsas eller förstöras, även via direkta API-anrop.
- På sjukhuset kan inventory läsas via meny, direktlänk och omladdning; Trash nekas.
  Övriga sjukhus- och stridslås består.
- Innehav består efter omladdning och återinloggning. Andra flikar visar rätt antal.
- Desktop och 320/375/768 px granskas visuellt, inklusive långa namn och stora bilder.
- Kör relevanta databas- och webbläsartester samt projektets lint, typkontroll,
  enhetstester och produktionsbygge. Kontrollera migrationernas behörigheter.

Dokumentera verkliga resultat i [implementationsstatus](IMPLEMENTATION_STATUS.md).
