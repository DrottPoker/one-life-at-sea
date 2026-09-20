# Item Market Value

Implementerat lokalt 2026-09-20. Värdefönster och bevarat värde uppdaterade 2026-09-21.

## Spelarens vy

**Value** ligger till vänster om **Circ.** i itemets utfällda beskrivning, både i
Inventory och Marketplace. Det visar genomsnittligt marknadspris per exemplar i
hela Gold Coins med valutaikon. Diagramknappen öppnar historiken under samma
bild och egenskaper som Circ. Endast ett av diagrammen visas åt gången.

Diagrammen delar komponent, färger, höjd, periodval och interaktioner.
Informationsrutan visar datum/tid i UTC och **Average market value**.
Mus, tryck, piltangenter och Home/End fungerar som i Circ. En nyöppnad historik
börjar på All time; övriga val är en, tre och sex månader samt ett och tre år.
Periodbyten behåller befintlig kurva under laddning. Nätverksfel ger Retry.

Värdet uppdateras med sidans befintliga uppdatering, normalt inom 15 sekunder
när sidan är synlig. Även när inga nya köp görs ändras värdet när äldre köp
passerar tidsfönstrets gräns. När fönstret blir tomt behålls värdet som gällde
precis före den sista försäljningens utgång. Läsningen ger inga nya spelarhandlingar.

## Beräkning

Det godkända fönstret är de senaste **12 timmarna**, baserat på databasens tid:

`floor(sum(gross) / sum(quantity))`

Bara genomförda köp med `t - 12 timmar < sold_at <= t` ingår. Antalet köpta
exemplar viktar priset, inte antalet affärer. Exempel: ett exemplar för 100 och
nio för 200 ger Value 190. Försäljningsavgiften dras inte av från marknadsvärdet.
Heltalsvärdet avrundas nedåt.

Aktiva, avbrutna och osålda listings påverkar inte Value. Utrustningens olika
stats ingår i samma gemensamma värde för itemtypen. Most Popular behåller sitt
separata fönster på 12 timmar och sorterar fortfarande efter sålt antal.

Utan köp i tidsfönstret behålls **senaste icke-tomma Value**. Samma värde ligger
kvar i både detaljer och diagram, även efter omstart eller lång tid utan läsningar.
**N/A** och tom historik visas bara när itemtypen aldrig har sålts vid observationstiden.
När nya köp kommer används åter bara de köp som ligger inom de senaste 12 timmarna;
gamla försäljningar blandas inte in i det nya snittet.

## Beständig historik och prestanda

`private.market_sales` är källan. Den nya privata projektionen
`item_market_totals` sparar kumulativ mängd och brutto per köp, ordnat efter
item, tid och köp-ID. Två indexerade uppslag och deras differens ger värdet vid
en valfri historisk tid utan att läsa hela handelshistoriken. Om fönstret är tomt
begränsas den nedre gränsen så att de senaste samtidiga köpen ligger kvar. Det
bevarar exakt det rullande värdet precis före sista utgången, inklusive viktningen
av flera köp med samma tidsstämpel, utan att hoppa tillbaka till ett äldre snitt.

Migrationen återanvänder verkliga befintliga köp. Backfill och triggerinstallation
görs i samma transaktion under lås på försäljningstabellen. Pengar, listings och
ägda items ändras inte. En ny normal affär lägger till en projektrad i samma
transaktion som köpet. Rollback och idempotenta återförsök kan inte lämna extra
värdedata. Triggers hanterar också administrativ korrigering och radering av
testaffärer genom att räkna om den påverkade historikens fortsättning.

Lås för karaktärer och listings föregår itemets cirkulationslås. Projektionen
använder samma itemlås; flera berörda itemtyper låses i stabil ordning.
Kontoradering anonymiserar köpens identiteter men behåller marknadsvärdet.

Historikens ändringar kommer både från köptider och från deras utgångstider
12 timmar senare. Ingen cron, webbläsartimer eller ny affär behövs för att
registrera utgången. Värdet rekonstrueras från beständiga köp vid läsning.
Första punkt är periodens start eller första kända köpet, sista är serverns tid.

`marketplace.valueWindowHours` styr fönstret, standard 12.
`inventory.historyMaxPoints` begränsar interna punkter till 500 plus ändpunkter.
Små historiker innehåller varje ändring; stora intervall visar tidsmässigt jämna
stickprov märkta **Sampled values**. Stickprov är exakta vid sina tidsstämplar,
men mycket korta variationer mellan dem kan utelämnas. Kompletta köpdata bevaras.
Ett ändrat värdefönster räknar om även historiska värden från samma köpdata.

Kumulativa summor använder numeric och publika värden skickas som strängar.
Klienten använder BigInt för formatering så stora belopp behåller precisionen.

## Behörigheter och källor

Projektionen har RLS och inga direkträttigheter för klienter.
`get_item_market_value(target_item, period)` kräver en registrerad spelare och
returnerar bara item, tider och gemensamma värden. Köpare, säljare, kvitton och
saldon exponeras inte. Interna beräknings- och triggerfunktioner är spärrade.
Inventory och marknadens itemprojektioner inkluderar `market_value`.

- [Databasgrund](../supabase/migrations/20260920211844_item_market_value_history.sql)
- [Kanonisk uppdatering](../supabase/templates/gameplay/market-value-tracking.sql)
- [Kanonisk läsning](../supabase/templates/gameplay/market-value-history.sql)
- [Gemensam diagramkomponent](../src/components/item-history-chart.tsx)
- [Diagramgeometri och typer](../src/lib/item-history.ts)
- [Databastester](../supabase/tests/market-value.test.sql)
- [Webbläsartest med riktiga köp](../tests/e2e/market-value.spec.ts)
- [Cirkulation](ITEM_CIRCULATION.md) och [Marketplace](MARKETPLACE.md)
