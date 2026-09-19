# Central konfiguration

Datum: 2026-09-17. Genomfört och verifierat lokalt. Se CONFIGURATION.md och IMPLEMENTATION_STATUS.md för arbetsflöde och körresultat.

## Omfattning

- Samla gameplay, auth, frontend, tema, server och testinställningar under config/.
- Bevara nuvarande spelbalans, privata kontodata och migrationshistorik.
- Låt appen importera publika JSON-värden och generera SQL från samma gameplaykälla.
- Flytta underhållbara SQL-funktioner till mallar; migrationer är oföränderliga leveransögonblicksbilder.
- Validera värden och genererade filer före utveckling, bygge och migrering.
- Kontrollera appens och databasens gameplayversion vid serverläsningar och handlingar.
- Dokumentera hur ändringar appliceras samt vilka inställningar som kräver omstart.
- Verifiera standardbalans, alternativ config, rättigheter, registrering, träning, strid och navigation.

## Avgränsning

Lösenord, nycklar och miljöspecifika anslutningar ligger kvar i ignorerad .env.local.
Rutter, statusmaskiner, behörighetsregler och matematiska enhetsomvandlingar är kod.
Config tillför inte spelmekanik som inte finns idag.
