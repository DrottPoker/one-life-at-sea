# Karaktärsnamn

Aktuell regel från 2026-09-21: nya karaktärsnamn ska vara ifyllda och unika,
utan siffror eller blanksteg. Regeln gäller både registrering och äldre konton
som slutför karaktärsskapandet. Administrativa namnbyten följer samma regel.

- Svenska och andra Unicode-bokstäver fungerar, exempelvis Åsa och 李小龍.
- Alla Unicode-tal avvisas, även arabiska siffror, fullbreddssiffror och upphöjda tal.
- Mellanslag, tabbar, radbrytningar, hårda blanksteg och BOM avvisas.
  Inmatningen trimmas inte för att kringgå regeln.
- Symboler, bindestreck, apostrof, understreck och emoji är fortsatt tillåtna.
  Ingen ny spellängdsgräns har införts.
- Namn normaliseras till NFC. Unikhet är fortsatt skiftlägesokänslig.
- Befintliga namn behålls. Ett gammalt namn med siffror eller mellanslag hindrar
  inte spelhandlingar eller uppdateringar av andra värden.

## Implementation

`src/lib/validation.ts` delar validering mellan registreringsformuläret,
karaktärsformuläret och serverhandlingarna. Formulären visar regeln och fel direkt.

Migrationen `character_names_without_numbers_or_spaces`, numera en del av baslinjen `20260923111042_baseline.sql`,
införde `private.is_valid_character_name` och en trigger på nya eller ändrade namn.
Databasen skyddar även direktanrop till Auth och Data API. Signup och karaktär
skapas i samma transaktion, så ett ogiltigt namn lämnar inget konto kvar.
Tillgänglighetsfunktionen returnerar false för ogiltiga namn.

SQL använder explicita Unicode 16.0-intervall för kategorierna Number och
White_Space samt U+FEFF. De motsvarar JavaScript-regeln
`/[\p{N}\p{White_Space}\uFEFF]/u` utan beroende av databasens locale.
Vid en framtida Unicode-uppgradering ska regeln hållas lika i båda lagren
genom en ny migration.

Det publika [spelar-ID:t](PLAYER_IDS.md) och interna UUID:t påverkas inte av namnbyten.
Äldre numeriska namn går fortfarande att hitta i Players.

## Verifiering

Enhets-, databas- och webbläsartester täcker giltiga Unicode-namn, olika typer
av siffror och blanksteg, kringgång av formulärvalidering, direkt API-åtkomst,
atomisk registrering, äldre namn och ofärdiga konton. Körresultat finns i
[implementationsstatus](IMPLEMENTATION_STATUS.md).
