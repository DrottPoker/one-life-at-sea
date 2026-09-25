# Ekonomigranskning, 2026-09-21

Granskningen omfattar inventory, marknadens förvar, listning, köp, återtagning,
Trash, banken, nivåköp, träningskvitton, administratörsändringar, kontoradering,
cirkulation och marknadsvärdets historik. Serverregler, databasrättigheter,
klienternas återförsök och lokala utvecklingsverktyg ingår.

## Rättade fel

1. **Förlorade kvitton efter omladdning.** Klienterna behöll tidigare request-ID
   enbart i komponentminnet. Om servern hann genomföra en handling men svaret
   försvann kunde en omladdning följas av en ny handling med ett nytt ID.
   Ekonomihandlingar sparas nu före första anropet i localStorage, per karaktär.
   Samma begäran kan kontrolleras efter navigation, omladdning och omstart.
   Web Locks serialiserar webbläsarens skrivningar mellan flikar. En olöst
   begäran måste kontrolleras innan en annan ekonomihandling kan skickas.
   Ändringar i localStorage når andra flikar asynkront, ibland efter att låset
   släppts. En sparad begäran räknas därför som olöst först om den finns kvar en
   sekund efter att det delade låset tagits, och låset hålls under tiden.
   Ingen begäran körs automatiskt efter återkomst.
2. **Fel karaktär efter kontobyte.** Serverhandlingarna kontrollerar nu att den
   inloggade karaktären fortfarande är den som formuläret visades för. En gammal
   flik kan inte debitera en annan inloggad karaktär. Ett osäkert kvitto behålls
   tills rätt konto återkommer.
3. **Utrustningsdubbletter från utvecklingsverktyget.** Det lokala
   inventoryverktyget kontrollerade tidigare endast inventorytabellens ID.
   Utrustning i en aktiv listing kunde därför återskapas med samma ID.
   Verktyget låser nu berörda itemtyper och hoppar över utrustning i marknadens
   förvar. Redan såld utrustning förblir hos köparen.
4. **Blinkande återhämtningsruta under vanliga handlingar.** En sparad begäran
   är först pågående, inte obekräftad. Återhämtningsvyn väntar på karaktärens
   Web Lock och läser journalen igen efter att anropet är färdigt. Ett lyckat
   eller definitivt nekat anrop visar aldrig rutan, heller inte i andra flikar
   eller efter omladdning av en annan flik. Saknas bekräftelse, även efter att
   ursprungsfliken stängts, erbjuds samma säkra kontroll av det sparade kvittot.
   Nya handlingar är fortfarande spärrade medan en begäran finns sparad.
5. Bankens webbläsartester använder gemensamma kontohjälpare och städar sina
   egna konton även när ett test misslyckas.

Inga databasregler för priser, avgifter eller utfärdande av vanliga items har
ändrats. Historiska migrationer är orörda.

## Skydd som kontrollerats

- Bara serverns transaktioner flyttar Gold Coins och items. Vanliga användare
  saknar direkt skrivrätt till ekonomi- och inventorytabellerna.
- Identiteten kommer från inloggningen. Administratörsrättigheter kontrolleras
  mot serverns medlemskap, inte användarstyrd metadata.
- Ordnade karaktärs-/stridslås och radlås serialiserar konkurrerande handlingar.
  Återförsök vid serialiseringsfel/deadlock behåller samma request-ID.
- Items lämnar inventory och hamnar i escrow i samma transaktion. Köp flyttar
  pengar, överlämnar items, tar avgift och sparar kvitto atomiskt.
- Återtagning returnerar endast återstående antal. Fullt inventory eller
  överskriden saldogräns rullar tillbaka hela ändringen.
- Utrustning behåller identitet, stats och skapandetid vid köp.
- Priser och mängder är positiva heltal. Pengar räknas exakt även nära
  maxgränsen; procentavgiften avrundas nedåt kumulativt per listing.
- Ett återanvänt request-ID kan inte genomföra en ny affär. Ändrad payload nekas.
- Strid, Hospital och havsposition kontrolleras på servern för nya handlingar.
  Tidigare genomförda kvitton kan fortfarande kontrolleras.
- Kontoradering tar enligt befintlig regel bort kontots kvarvarande innehav och
  osålda listings. Andra spelares köpta items, köpkvitton och anonymiserad
  försäljningshistorik bevaras.
- Admin kan avsiktligt skapa/ändra/radera items och pengar. Dessa behöriga
  operationer loggas; de är inte normal spelarhandel.

## Återkörbar integritetskontroll

Kör `npm run audit:economy` mot den lokala Supabase-databasen. Kontrollen läser
ett konsekvent, skrivskyddat snapshot och returnerar felstatus vid avvikelse.
Den ändrar ingen speldata och skriver inte ut spelaridentiteter.

Åtta kontroller jämför saldogränser, cirkulation mot faktiskt innehav inklusive
escrow, utrustnings-ID mellan inventory och escrow, itemtyp, listingens
antal, kumulativa avgifter, försäljningar mot listingräknare och hela
marknadsvärdesprojektionen mot ursprungliga köp.

`scripts/economy-integrity.sql` är en full genomgång av tabellerna, avsedd
för underhåll och verifiering. Den ska inte köras vid varje sidvisning.

## Tester och avgränsning

- Databastester provar bland annat atomiska batchfel, fullt inventory,
  säljarens saldogräns, misslyckad återtagning och köpkvitto efter kontoradering.
- Webbläsartester tappar verkliga serversvar efter commit, laddar om och
  kontrollerar samma händelse. Andra flikar ser den sparade begäran.
- Regressionstester håller kvar lyckade serversvar för crew-träning, nivåköp,
  skeppsarbete, bank, Trash och marknadslistning. En DOM-observatör upptäcker även
  mycket korta blinkningar i båda flikarna. Omladdning under ett pågående anrop
  och stängning av ursprungsfliken efter commit provas också.
- Blandade samtidighetstester kombinerar korsvisa köp, dubbla anrop med samma ID,
  banköverföringar, återtagning och Trash. Items och total mängd Gold Coins
  inklusive avgifter måste stämma efter varje omgång.
- Ett regressionstest kör utvecklingsverktyget medan utrustning ligger till salu
  och efter att den bytt ägare.
- Enhetstester täcker trasig eller blockerad webbläsarlagring och fel karaktär.

Aktuella körresultat finns i [implementationsstatus](IMPLEMENTATION_STATUS.md).
Verifiering kan inte bevisa frånvaro av alla framtida fel. Den här granskningen
gäller nuvarande flöden och lokala tester, inte produktionslast, backupåterställning
eller framtida itemfunktioner. Use är ännu inte implementerat. Utrustade exemplar kan varken
raderas eller listas förrän de tagits av.

Sparade klientbegäranden kräver localStorage och Web Locks på en säker origin
(HTTPS eller localhost). Om lagringen är blockerad skickas ingen ny ändring.
Databasens kvitton är beständiga även om webbläsardata rensas, men automatisk
koppling till den ursprungliga begäran kräver att klientens sparade ID finns kvar.
Kvittona är fortfarande domänspecifika; den gemensamma klientkoden hanterar bara
lagring och återhämtning. Inga autentiseringsuppgifter lagras i kvittojournalen.

## Tavernans moralaktivitet

Måltider använder samma karaktärslås och beständiga klientjournal. Servern validerar
pris och effekt, debiterar 1 000 burna Gold Coins och tilldelar högst +25 moral
i samma transaktion. Full moral, otillräckligt saldo, resa, strid eller Hospital
nekar ett nytt köp utan debitering. Gamla kvitton kan återhämtas även under spärr.
Samtidiga anrop, tappat svar efter commit och återförsök efter omladdning testas.
