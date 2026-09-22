# Dag och natt

Infört 2026-09-21. Cykeln följer serverns UTC-tid:

| Period | Server time |
| --- | --- |
| Dag | 06:00 inklusive till 21:00 exklusive |
| Natt | 21:00 inklusive till 06:00 exklusive nästa dag |

Det är en verklig 24-timmarscykel, gemensam för alla spelare. Spelarens tidszon,
sommar-/vintertid och inställning av datorns klocka ändrar inte perioden.

## Nuvarande beteende

Endast den fasta bakgrunden bakom spelramen växlar. Nattbilden är ägarens
levererade `ChatGPT Image 21 sep. 2026 04_06_27.png`, optimerad till
`public/images/harbor-background-night.webp` med samma 1672 x 941 pixlar,
341 932 byte. Originalet i Downloads är oförändrat.

Den ordinarie dagbilden, hamnens välkomstbild, stridsbilder, färger, resurser
och spelregler behålls. Bakgrunden används där den redan visas, även på
inloggnings- och stridssidorna. Den kompakta layouten döljer fortfarande
bakgrundslagret enligt befintlig design.

En öppen sida byter period utan omladdning. Servern anger rätt period redan i
sidans HTML. Efter anslutning räknar klienten vidare med `performance.now()`
från serverns tidsobservation och schemalägger nästa gräns. Klientens `Date.now()`
används aldrig för att avgöra period.

Klockan synkroniseras vid start, var femte minut när sidan är synlig samt vid
återgång till sidan eller nätverket. Ett tillfälligt nätfel stoppar inte cykeln;
den senaste serverobservationen används och synkroniseringen försöks igen.
Efter vila eller en bakgrundsflik korrigeras klockan när sidan åter blir aktiv.

## Ansvar och konfiguration

- `src/lib/world-time.ts` beräknar `period`, `observed_at` och `next_change_at`.
- `src/lib/world-time-server.ts` hämtar aktuell UTC-tid per serverförfrågan.
- `GET /api/world-time` returnerar endast klockdata med `Cache-Control: no-store`.
  Den publika rutten gör inga databasläsningar, använder inga konton och går
  förbi sidnavigationens spelspärrar så att den fungerar även under Hospital,
  resor och strid.
- `src/components/world-clock.tsx` synkroniserar och uppdaterar bakgrundens
  `data-day-period` på body. Den ändrar inga spelvärden.
- `frontend.dayNight` i `config/frontend.json` innehåller starttimmar och
  synkroniseringsintervall. Timmarna är alltid UTC.
- `--o-background-image` och `--o-night-background-image` i `config/theme.css`
  anger bilderna. CSS-regeln finns i `config/interface.css.template`.

Kör `npm run config:sync` efter ändringar. Denna visuella funktion kräver ingen
databasmigration. Ett nytt produktionsbygge krävs för ändrade inställningar.

## Framtida spelregler

Periodberäkningen är fristående från bakgrunden. Nattfiske och andra tidsstyrda
utfall ska avgöras på servern med samma UTC-gränser vid själva handlingen.
När cykeln påverkar databasens spelregler flyttas timinställningarna till
gameplaykonfigurationen och ingår i dess SQL-generering och versionskontroll.
Ett periodvärde från webbläsaren får aldrig ge rätt till en fångst eller belöning.
Inga fiskar, fångstregler eller andra nattbonusar har införts i denna etapp.

## Verifiering

Enhetstester täcker båda exakta gränserna, midnatt, årsbyte, skottdag och
tidsstämpel med annan UTC-offset. Webbläsartester täcker initial HTML utan
JavaScript, öppen sida vid båda växlingarna, felställd datorklocka, annan tidszon,
förlorad tidssynk och klockåtkomst under Hospital.
Se aktuella körresultat i [implementationsstatus](IMPLEMENTATION_STATUS.md).

Server-rendered clock updates now adjust the existing client anchor directly. They
do not restart synchronization or add an HTTP request per gameplay action. Initial,
foreground, interval and offline-retry synchronization remain active.
