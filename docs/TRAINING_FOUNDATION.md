> Config 2026-09-17: justerbara värden har sin källa i [config/gameplay.json](../config/gameplay.json). Värdena nedan beskriver nuvarande standardbalans. Se [konfigurationsguiden](CONFIGURATION.md) för hur ändringar appliceras.

> Uppdatering 2026-09-16: aktuella stridsregler och implementation finns i [COMBAT_SYSTEM.md](COMBAT_SYSTEM.md). Den nya versionen använder en gemensam /attack-vy, flera angripare, realtid och publika rapporter. Äldre beskrivningar av separata prepare-sidor, exklusiv tvåpartsstrid eller privata slutrapporter nedan är historiska.

# Första spelsteget: resurser och träning

Datum: 2026-09-16. Uppdaterad med koppling till första PvP-systemet.

## Omfattning

- Energy, Ship Health och Crew Health visas i hamnens gemensamma panel.
- Alla tre börjar på 100 av 100. Nya och befintliga karaktärer får dessa startvärden.
- Energy återhämtas med 1 per fem hela minuter, även offline, till högst 100.
- Tid vid full Energy sparas inte som extra framtida återhämtning.
- Crew Training och Ship Upgrades är två nya val i hamnmenyn.
- Båda visar Attack, Defense, Speed och Accuracy. Nya karaktärer börjar på 10 i varje stat. Befintliga karaktärers stats behålls.
- Ett klick kostar exakt 5 Energy och ger exakt +1 i vald stat.
- Uppgraderingar kostar inga material i detta första steg och ger ännu ingen skill-XP.
- Samma skepp och besättning följer karaktären. Spelaren byter inte skepp.
- Stats och resurser sparas i PostgreSQL och följer med mellan inloggningar.

## Gränssnitt

Den befintliga blå hamnlayouten används. Tre mätare visar både färgfält och
aktuellt värde. På mobil visas mätarna ovanför navigationen. Träningsvyerna har
fyra kompakta rader med beskrivning, aktuellt värde och en uppgraderingsknapp.

Knapparna spärras medan en uppgradering sparas, när Energy är under 5 eller
under en aktiv strid. Skada, återhämtning och attackskydd blockerar inte träning.
Resultatet visas med en tillgänglig statusrad. Serverns nästa återhämtningstid
styr uppdateringen av mätarna, och resurserna hämtas också när fliken återfår fokus.

## Databas och samtidighet

Resurserna och de åtta statsen lagras på den befintliga karaktärsraden. Den
befintliga modellen med en karaktär per konto gäller fortsatt. Migrationen lägger
till standardvärden utan att återställa konton eller karaktärer.

`get_game_state()` kontrollerar det registrerade kontot och läser dess resurser
tillsammans med eventuell stridsreservation under samma deltagarlås. Läsningen
kan avsluta en utgången strid. Energy räknas från sparad tid; delar av ett
femminutersintervall bevaras mellan uppgraderingar. Hälsa återhämtas också offline,
men pausas under aktiv strid.

`train_stat(group, stat)` accepterar endast gruppen och statens namn. Databasen
bestämmer ägare, kostnad, ökning och tid. Den låser spelarens rad, räknar fram
återhämtad energi och genomför kostnaden och ökningen i samma transaktion.
Den privata skrivfunktionen kontrollerar det registrerade kontot; det publika
anropet körs med anroparens behörighet. Direkta ändringar av resurser och stats
är inte tillåtna via Data API.

## Avgränsning

Träningen har fortfarande inga materialkostnader, utrustningsbonusar eller
färdighetsnivåer. Strid, skada och automatisk återhämtning har tillkommit i
[första PvP-systemet](COMBAT_SYSTEM.md). Hunger och permadöd är fortsatt framtida
funktioner i [designunderlaget](COMBAT_AND_PROGRESSION_DESIGN.md).

## Verifiering

Utförda kontroller och resultat finns i [implementationsstatus](IMPLEMENTATION_STATUS.md).
