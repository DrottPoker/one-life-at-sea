# Aktuell implementationsstatus

Verifierat lokalt 2026-09-25. Tidigare leveransnoteringar finns i [arkivet](archive/README.md); de är inte dagens kontrollresultat.

## Implementerat

| System | Aktuellt beteende |
| --- | --- |
| Konto och identitet | Supabase Auth, återställning, en beständig karaktär per konto, namnregler, publika nummer och profiler |
| Resurser och progression | Energy, Stamina, Morale, träning, materialbetalda skeppsjobb, Skills med strids-XP och Battling-hälsa, Character Level |
| Resa och PvP | Offlinebeständiga resor, scouting, gemensamma strider med utrustning och träffzoner, Hospital och offentliga combat logs |
| Ekonomi | Gold/Bank, Inventory med Equip, Marketplace, kvitton och pris-/cirkulationshistorik |
| Aktiviteter och hem | Aktiviteter med loot, Hideout och Crafting |
| Kommunikation | Privat brevpost med Inbox/Outbox/Saved, ignore, beständiga återförsök och notiser. Forum med tavlor, trådar, citat, redigering, radering, olästa trådar och moderering |
| Administration | Spelarverktyg, innehåll, loot, revision, ekonomiövervakning och spelarstatistik |
| Presentation | Responsiv spelram, navigation, serverankrade nedräkningar och UTC-baserad dag/natt |

Exakta regler finns i [dokumentindexet](README.md). Helhetsgranskningen rättar fel och underhåll utan att införa nya spelmekaniker.

## Verifiering

| Kontroll | Resultat |
| --- | --- |
| `npm run check` | Godkänd dokumentkontroll, lint utan varningar, typkontroll och produktionsbygge |
| Enhetstester | 504 godkända i 35 filer |
| `npm run test:db` | 2 253 godkända påståenden i 43 filer |
| `npm run test:config:db` | 138 godkända påståenden; alternativ config rullades tillbaka. 20 körningar i rad utan fel efter rättningen av klockberoendet |
| Hela webbläsarsviten | 126 godkända och 1 överhoppad, Edge mot produktionsbygget. Den överhoppade är den opt-in-styrda prestandamätningen, som inte kördes |
| SQL-lint | Inga varningar eller fel |
| Databasens säkerhets-/prestandarådgivare | Inga fynd på varnings- eller felnivå (2026-09-23, inte omkörd) |
| `npm audit` | 0 kända sårbarheter |
| RPC-avtal | Alla 79 typade funktioner finns med rätt parameterlistor |
| Ekonomins integritet efter alla tester | 0 avvikelser i samtliga 8 kontroller |

Alla SQL-migrationer, även forumets, är applicerade lokalt. Next.js 16.3.6, Supabase JS 2.117.1 och Vitest 5.0.1 ingår i verifieringen.
[Granskningsrapporten](PROJECT_AUDIT.md) beskriver fynd, rättningar och kontrollernas omfattning.
[Prestanda](PERFORMANCE.md) innehåller faktiska lokala mätvärden.

## Kvarstående begränsningar och produktarbete

Next.js loggar fortfarande streamfel vid vissa avbrutna sidladdningar och en Gzip-varning om listeners. Detta redovisas i granskningsrapporten och har inte dolts genom loggfilter.

Use och aktiva föremålseffekter, källor för munition, matlagning, hemuppgraderingar, Shipyard, fler platsaktiviteter, PvE och fraktionssystem är inte färdiga. Forumets reaktioner, prenumerationer, sök, rapporter, avstängning och karma är senare etapper.
Se [Roadmap](ROADMAP.md) för fortsatt riktning och öppna beslut.

Lokal verifiering bekräftar inte hosted miljö, produktionsmejl, backupåterställning eller kapacitet vid större samtidig last.
