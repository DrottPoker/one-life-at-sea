# Flera konton i lokala testfönster

Tillfälligt utvecklingsverktyg, tillagt 2026-09-16.

## Användning

Starta spelet som vanligt:

    npm run dev

Öppna sedan en annan terminal i projektet och kör:

    npm run dev:players

Kommandot öppnar tre separata Microsoft Edge-fönster. Logga in eller registrera
ett eget testkonto i varje fönster. Alla använder samma spel och databas, men
varje fönster har en egen webbläsarprofil och inloggning.

Välj antal fönster, mellan ett och sex:

    npm run dev:players -- --count 2

Annan lokal port:

    npm run dev:players -- --count 3 --url http://127.0.0.1:3100

Använd samma adress konsekvent när sparade inloggningar ska återanvändas.
Verktyget accepterar endast lokala adresser och kräver att spelservern redan kör.

## Beteende

- Fönstren har separata cookies, webbläsarlagring och Supabase-sessioner.
- Reload, navigation och återstart behåller respektive profils inloggning.
- Log out i ett fönster påverkar inte andra kontons inloggningar.
- Profilerna sparas under .local/player-browsers/player-1, player-2 och så vidare.
- Profilmapparna innehåller lokal inloggningsdata och ignoreras redan av Git.
- Stäng fönstren, eller tryck Ctrl+C i startterminalen, för att avsluta.
- Stäng ett tidigare testfönster innan samma profil öppnas igen.
- Vanliga flikar i samma profil delar fortfarande konto. Använd de separata
  fönstren som kommandot skapar för olika konton.
- Detta öppnar Edge på datorn, separat från en inbyggd webbläsare i utvecklingsverktyget.
- Verktyget skapar inga spelkonton automatiskt. Speldata, auth, RLS och
  stridslås fungerar som vanligt. Ingen sessionsisolering har byggts in i produktionen.

## Implementation

scripts/dev-players.mjs använder den befintliga Playwright-installationen och
Microsoft Edge med en beständig profil per spelare. Ingen ny dependency,
databasmigration eller ändring av spelets sessionskod behövs.

API: [Playwright launchPersistentContext](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context).

## Verifiering

Verifierat lokalt med två tillfälliga konton och de faktiska beständiga Edge-profilerna:

1. Olika spelare är inloggade samtidigt.
2. Reload ändrar inte vilket konto respektive fönster använder.
3. Stängning och återstart av första profilen behåller dess inloggning.
4. Utloggning i första profilen lämnar andra profilen inloggad.

Verifieringen tog bort sina egna tillfälliga konton och profiler efteråt.
Användarens testprofiler och konton raderas inte av startkommandot.
