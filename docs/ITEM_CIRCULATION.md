# Item Circulation

Implementerat lokalt 2026-09-19.

## Spelarens vy

- Circ. i itemets utfällda detaljer visar antalet exemplar av samma itemdefinition
  i hela spelvärlden. Stackar räknas efter antal, utrustning per exemplar oavsett stats.
- Diagramknappen öppnar/stänger historiken under bild och egenskaper, före nästa itemrad.
- Perioderna är Last month, Last 3 months, Last 6 months, Last year, Last 3 years och
  All time. Ett nyöppnat diagram börjar på All time.
- Vänsterkant är periodens början, eller första kända registrering om historiken är
  yngre. Högerkant är serverns observationstid. Diagrammet uppdateras med den befintliga
  inventarieuppdateringen, normalt inom 15 sekunder medan sidan är synlig.
- Muspekare och tryck väljer närmaste registrerade punkt och visar datum, tid i UTC
  och exakt antal. Tangenterna vänster/höger samt Home/End fungerar när diagrammet har fokus.
- Bild och stats behåller sin tidigare utformning. Diagrammet ligger över hela
  detaljpanelens bredd, även på mobil.
- Historiken börjar vid införandet med befintligt antal. Inga äldre värden konstrueras.
  Ett item med kort historik visar därför samma startdatum för flera periodval.
- Värdena hålls konstanta mellan registrerade ändringar. Längre, täta historiker
  visas med tidsmässigt jämnt fördelade stickprov; tooltipen visar värdet vid själva
  stickprovets tid, aldrig ett interpolerat antal.
- Vid periodbyte ligger kurvan kvar tills den nya är klar. Diagramytan behåller sin
  höjd och DOM-nod, vilket bevarar scroll, fokus och uppmätt bredd även vid långsam hämtning.
  Laddningsstatus, fel och information om stickprov visas ovanpå diagramytan.
- Fel vid hämtning ger Retry och behåller en eventuell senast hämtad kurva.
  Feltexten anger vilken tidigare period som fortfarande visas.
  Diagrammet får läsas i Hospital. Det ger ingen ny item-handling.

## Databas

private.item_circulation innehåller total, initial_total, tracked_since och updated_at
per itemdefinition. private.item_circulation_history sparar en slutlig observation
per itemdefinition och databastransaktion. Ägaridentiteter finns inte i historiken.

Statement-triggers för INSERT, UPDATE och DELETE på item_stacks och item_instances
summerar delta och behandlar item-ID:n i sorterad ordning. Räknare och historik ändras
i samma transaktion som innehavet. Misslyckade handlingar och rollbacks lämnar ingen
ändring. Ett idempotent Trash-återförsök skriver ingen ny ändring.

Ägar- eller statändringar påverkar inte antalet. Kontoraderingens kaskader minskar
antalet. Ett nytt item i katalogen får automatiskt en nollpunkt. Framtida lager måste
kopplas till samma cirkulationsmodell innan de kan lagra items utanför de befintliga
innehavstabellerna. Batchoperationer över flera SQL-satser ska behålla konsekvent
låsordning; befintliga spelarhandlingar har transaktionsåterförsök vid deadlock.

Globalt antal är numeric(30,0), skickas som decimalsträng och formateras med BigInt.
Det gör att världens totalsumma inte avrundas när den överstiger JavaScripts säkra
heltalsgräns. Ägda stackmängders tidigare gränser är oförändrade.

RLS är aktiverat och direkträttigheter är återkallade för båda tabellerna.
Registrerade spelare kan bara läsa den offentliga totalprojektionen via
get_item_circulation(target_item, period). Wrappern är security invoker; den privata
funktionen autentiserar spelaren och returnerar bara totaler och tider.
Anonyma och utloggade användare nekas. Triggerfunktionerna kan inte anropas av klienten.

list_inventory inkluderar circulation för varje rad. Historiken hämtas först när
diagrammet öppnas. Vid periodbyte avbryts den äldre hämtningen.

## Prestanda och konfiguration

inventory.historyMaxPoints i config/gameplay.json begränsar interna diagrampunkter,
standard 500, plus två ändpunkter. Små historiker returnerar alla ändringar.
Stora historiker använder högst 500 indexerade uppslag efter senaste kända antal
vid varje stickprovstid. Indexet börjar med item_id och recorded_at.
Den fullständiga transaktionshistoriken bevaras även när diagrammet visar stickprov.

Schema och baseline skapas atomärt under lås på innehavstabellerna. Triggers installeras
innan låset släpps, så ändringar mellan migrationerna inte tappas.

- [20260919091606_item_circulation_history.sql](../supabase/migrations/20260919091606_item_circulation_history.sql)
- [20260919091933_central_gameplay_config_ad98e4868b86.sql](../supabase/migrations/20260919091933_central_gameplay_config_ad98e4868b86.sql)
- [gameplay.sql](../supabase/templates/gameplay.sql) är fortsatt källan för funktionerna.
- [circulation.ts](../src/lib/circulation.ts) innehåller typer och diagramberäkningar.
- [item-circulation-chart.tsx](../src/components/item-circulation-chart.tsx) hämtar och visar historiken.

Triggrarnas beteende följer [PostgreSQL CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html)
och [Supabase Postgres Triggers](https://supabase.com/docs/guides/database/postgres/triggers).

## Kontroller

Databastester täcker åtkomst, summor över flera ägare, separata utrustningsexemplar,
Trash/replay, rollback, kontokaskader, stora heltal, nollvärden, periodgränser,
vänstervärdet från tiden före vald period, sortering och begränsade stora svar.
Historiska testdata skapas i en transaktion som rullas tillbaka.

Enhetstester täcker heltalsprecision, punktval, axlar, tomma totalsummor, konstanta
värden och tidpunkter inom samma millisekund. Webbläsartestet täcker diagramknappen,
alla periodval, mus/tangentbord, flera skärmbredder, två samtidiga ägares raderingar,
uppdatering, nätverksfel/Retry och Hospital.
