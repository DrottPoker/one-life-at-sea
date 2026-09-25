# Dokumentation

Detta index leder till de aktuella beskrivningarna. Balansvärden ägs av [config](../config/README.md); ett funktionsdokument beskriver regeln och dess begränsningar. [Arkivet](archive/README.md) bevarar äldre beslut och körresultat utan att utge dem för dagens beteende.

## Projekt och utveckling

| Dokument | Användning |
| --- | --- |
| [Projektstart](../README.md) | Installation och lokala kommandon |
| [Aktuell status](IMPLEMENTATION_STATUS.md) | Implementerat, verifierat och kvarstående |
| [Arkitektur](ARCHITECTURE.md) | Systemgränser, data och ansvar |
| [Kodunderhåll](CODE_MAINTENANCE.md) | Filplacering, ändringsregler och kontrollnivåer |
| [Konfiguration](CONFIGURATION.md) | Generering, migrationer och balansändringar |
| [Projektgranskning](PROJECT_AUDIT.md) | Fynd och verifiering från helhetsgranskningen |
| [Framtida funktioner](ROADMAP.md) | Skiljer accepterad riktning från öppna förslag |
| [Testfönster](DEVELOPMENT_TEST_WINDOWS.md) | Flera lokala inloggningar |
| [Navigation](NAVIGATION.md) och [Prestanda](PERFORMANCE.md) | Laddning, uppdateringar och mätmetod |

## Spelsystem

| Område | Dokument |
| --- | --- |
| Identitet | [Namn](CHARACTER_NAMES.md), [spelar-ID](PLAYER_IDS.md), [profiler](CHARACTER_PROFILES.md), [hamnlista](HARBOR_ROSTER.md), [närvaro](PLAYER_PRESENCE.md) |
| Resurser | [Energy](ENERGY_RECOVERY.md), [Stamina](STAMINA.md), [Crew Morale](CREW_MORALE.md), [Hospital](HOSPITAL.md) |
| Progression | [Träning](TRAINING_FOUNDATION.md), [Skills](SKILLS.md), [Activities](ACTIVITIES.md), [Hideout](HIDEOUT.md), [Crafting](CRAFTING.md) |
| Resa och strid | [Havsresor](SEA_TRAVEL.md), [Scouting](SEA_SCOUTING.md), [Combat](COMBAT_SYSTEM.md), [Utrustning](EQUIPMENT.md) |
| Ekonomi och föremål | [Gold/Bank](GOLD_COINS_AND_BANK.md), [Inventory](INVENTORY.md), [Marketplace](MARKETPLACE.md), [cirkulation](ITEM_CIRCULATION.md), [marknadsvärde](ITEM_MARKET_VALUE.md) |
| Kommunikation | [Brevpost](MESSAGES.md), [Forum](FORUMS.md), [Notiser](NOTIFICATIONS.md) |
| Administration | [Adminpanel](ADMIN_PANEL.md), [Loot](LOOT_TABLES.md), [ekonomiövervakning](ECONOMY_MONITORING.md), [spelarstatistik](PLAYER_STATISTICS.md) |
| Ekonomiintegritet | [Kvitton, återförsök och integritetskontroll](ECONOMY_AUDIT.md) |

## Form och underlag

[Gränssnittsdesign](INTERFACE_DESIGN.md) och [dag/natt](DAY_NIGHT_CYCLE.md) beskriver den implementerade presentationen.
[Stilreferens](design/STYLE_REFERENCE.md), [konstprompt](design/CARIBBEAN_IMAGE_PROMPT.md) och bilder i `docs/design/` bevarar ursprung och avsikt. [Item artwork](ITEM_ART.md) beskriver föremålsbilder.
[Träningsresearch](research/TRAINING_BALANCE_RESEARCH.md) och [Torns utrustning](research/TORN_EQUIPMENT_RESEARCH.md) är underlag, inte alternativa regelspecifikationer.

Uppdatera befintligt funktionsdokument när beteendet ändras. Lägg daterad leveranshistorik i arkivet och undvik att kopiera samma regler till README, arkitektur och status.
