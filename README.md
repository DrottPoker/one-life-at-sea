# One Life At Sea

Ett browserbaserat, socialt pirat-RPG med beständig karaktär och progression.

Kodens ansvarsfördelning och fortsatt utveckling beskrivs i [kodstrukturen](docs/CODE_MAINTENANCE.md).

## Spelfunktioner

- Registrera med karaktärsnamn, e-post och lösenord. Konto och karaktär skapas samtidigt.
- Karaktärsnamn ska vara ifyllt och unikt, utan siffror eller mellanslag. Svenska bokstäver, symboler och emoji fungerar. Se [namnregler](docs/CHARACTER_NAMES.md).
- Exakt en karaktär per konto. Du loggas in direkt och kommer till **The Harbor**.
- Ingen e-postbekräftelse krävs i utvecklingsversionen.
- Enkla lösenord fungerar: minst 6 tecken, utan krav på stora bokstäver, siffror eller specialtecken.
- Karaktären sparas i PostgreSQL och finns kvar efter utloggning och omstart.
- Karibisk pixelart, havsblå paneler och kompakt vänstermeny.
- **Dag/natt**: bakgrunden växlar automatiskt till nattbild 21:00-06:00 server time (UTC), även på en öppen sida. Se [dag/natt-cykeln](docs/DAY_NIGHT_CYCLE.md).
- Hamnens vyer delar samma spellayout. Vid sidbyten ligger menyn och resursmätarna kvar,
  med en liten laddningsindikator i innehållet medan serverdata hämtas.
- **Marketplace**: Torn-inspirerat itemrutnät med Most Popular för senaste 12 timmarna,
  kategorier, utfällbara detaljer och köp. Lägg upp flera items, välj antal/styckpris
  och återta osålda listings. Försäljningar betalar 5 % avgift avrundat nedåt.
  Se [marknaden](docs/MARKETPLACE.md).
- **Item Value**: viktat snittpris från genomförda köp under 12 timmar, bredvid Circ.
  Senaste Value behålls när inga nya köp finns i tidsfönstret.
  Samma utfällbara historikdiagram i Inventory och Marketplace. Se [värdehistoriken](docs/ITEM_MARKET_VALUE.md).
- **Shipyard** är en klickbar platshållarvy.
- **Set sail**: lämna hamnen för 5 Energy, öka Sea distance med 1 per minut och välj mellan två sparade platstyper.
  **Return to The Harbor** tar Sea distance gånger en minut. Resan fortsätter offline och Energy återhämtas med 5 var tionde minut till havs.
- **Max sea distance** på profilen visar ditt längsta nådda avstånd och sparas även när du återvänder till hamnen.
  Skeppsarbete och strid måste vara klara före avfärd. Fler platsaktiviteter införs senare.
- **Scout nearby ships** kostar 5 Energy och sparar alla andra kaptener på samma Sea distance.
  Klicka på ett namn för profil och Attack. Målet måste fortfarande vara kvar; stridsstart kostar separat 10 Energy.
  Se [resesystemet](docs/SEA_TRAVEL.md).
- The Harbor visar kaptener som är i hamnen, med namn, antal och realtidsuppdatering.
  Listan omfattar även utloggade kaptener och har 20 namn per sida.
- **Players**: sök kaptener på namn eller publikt nummer från 100001. Använd exempelvis #100001 för exakt ID-sökning. UUID behålls internt. Se [spelar-ID:n](docs/PLAYER_IDS.md).
- **My Profile** öppnar din karaktärsprofil. Klicka på ett namn i hamnen för att se en annan kaptens profil.
- **Inventory** i sidopanelens Harbor-meny: kategorier, namnsökning, itemrader med egna bilder och stats,
  utfällbara detaljer och fungerande Trash. Equip och Use väntar på nästa etapp.
  Inventory kan läsas i Hospital och på havsplatser, men items kan bara förstöras i hamnen.
  **Circ.** visar globalt antal med [historikdiagram](docs/ITEM_CIRCULATION.md), sex perioder
  och datum/antal när man pekar på kurvan.
- **Gold Coins** visas ovanför resursmätarna. Nya karaktärer börjar med 0.
- **Bank** i The Harbor visar banksaldo och låter dig sätta in och ta ut Gold Coins. Endast pengar på karaktären kan användas till köp.
- **Hospital**: fem minuters återhämtning när crew dör eller skeppet sjunker. Spelhandlingar är låsta tills du skrivs ut med full hälsa. Karaktär och progression behålls. Patientlistan visar även offlinekaptener. Profiler är tillgängliga under vistelsen och visar sjukhusstatus med återstående tid för andra spelare.
- **Energy**, **Ship Health** och **Crew Health** visas i hamnen, med maxvärdet 100.
- **Crew Morale** visas bredvid resurserna: -100 till +100, med noll i mitten.
  Crew-träning kostar 0,5 moral per Energy och varje femminuterstick flyttar moralen 5 mot 0.
  Moralen ger upp till ±5 % på Crew-stats i strid och på träningsökningar.
- **Tavern**: en måltid ger +25 moral för 1 000 Gold Coins utan Energy-kostnad. Se [Crew Morale](docs/CREW_MORALE.md).
- **Crew Training**: övningar med XP, guldköp och 1 % Perfect Drill. Första övningen ger cirka +1,01 för 5 Energy vid neutral moral.
- **Ship Upgrades**: välj stat och 5-100 Energy. Varje 5 Energy tar 30 sekunder, alltså högst 10 minuter. Ett arbete åt gången; skeppet stannar i hamnen tills jobbet är klart. Arbetet fortsätter även offline. XP och köpta workshops ger större ökningar.
- Båda har tio justerbara nivåer. Nya karaktärer börjar med 10 i varje stat.
- Energy är alltid heltal: +5 vid fasta klockslag var femte minut i hamnen och var tionde minut till havs, även under resor och offline, upp till 100. Återhämtningstakten visas när du håller musen över Energy-baren. Se [Energy](docs/ENERGY_RECOVERY.md).
- Lösenordsåterställning, valideringsfel och skyddad åtkomst mellan konton.
- **Attack**: fullskärmsvy med kanonstrid och boarding. Dela `/attack/<motståndarens-publika-nummer>` så kan andra ansluta mot gemensam hälsa. Adressen är samma före och under striden.
- Aktiva angripare stannar i sin strid tills de vinner, förlorar eller lämnar. Försvarare kan läsa sidor och inventory, men alla handlingar som flyttar eller ändrar karaktären är låsta under striden. Hälsa och handlingslås uppdateras i realtid.
- Torn-inspirerade statkurvor: Accuracy mot Speed för träffchans, Attack mot Defense för skada. Extrem Speed kan undvika alla träffar; 25 gånger Defense blockerar all skada.
- **Combat log**: offentligt delbar logg med servertid, final blow, assist och separata värden för Ship damage och Crew damage. Alla deltagarnamn länkar till profiler.

Spelets gränssnitt är på engelska. [Inventory](docs/INVENTORY.md) har införts med visning och Trash.
Platsaktiviteter, fler intjäningssystem, aktiva itemeffekter och PvE
kommer i senare etapper. Permanent karaktärsdöd har tagits bort och ersatts av [Hospital](docs/HOSPITAL.md). Gold Coins, banköverföringar och köp av träningsnivåer är implementerade. Se [träningsregler och balans](docs/TRAINING_FOUNDATION.md).

## Adminpanel

Ludorex har adminbehörighet lokalt. Öppna [Admin panel](http://127.0.0.1:3000/admin)
via länken i sidhuvudet.

- Sök spelare och ändra namn, stats, hälsa, Energy, Gold Coins, banksaldo och träningsprogression.
- Generera items med antal och individuella utrustningsstats. Ändra eller ta bort innehav.
- Läs spelets databastabeller med sökning, filtrering och sidindelning.
- Skriv ut patienter, avsluta strider utan extra skada och avbryt skeppsjobb.
- Alla ändringar kräver orsak, kan granskas före sparande och loggas med före/efter-värden.

Configkataloger, automatiskt beräknade tabeller och historiska kvitton är skrivskyddade
i panelen. [Adminpanelens dokumentation](docs/ADMIN_PANEL.md) beskriver åtkomst,
återförsök och lokal behörighetshantering.

## Konfiguration

Justerbara värden finns samlade i [config/](config/README.md): gameplay, frontend, tema, auth, server och tester.
Ändra rätt configfil, kör `npm run config:sync` och applicera eventuella gameplaymigrationer med `npm run db:migrate`.
Hemligheter och miljöanslutningar ligger i den ignorerade `.env.local`.
Se [konfigurationsguiden](docs/CONFIGURATION.md) för exempel, omstarter och hur app/databas hålls i synk.

## Starta lokalt

Kräver Node.js 22.14 eller senare, npm och Docker Desktop med Linux-containrar.

```powershell
npm ci
npm run db:start
npm run setup:local
npm run db:migrate
npm run dev
```

Öppna [spelet](http://127.0.0.1:3000).
`setup:local` skapar `.env.local` utan att skriva ut nycklar och skriver aldrig över
en befintlig fil. Vid följande starter räcker `db:start` och `dev`; efter nya migrationer kör du också `db:migrate`.

- [Supabase Studio](http://127.0.0.1:55323): lokal databasadministration.
- [Testinkorg](http://127.0.0.1:55324): lokala lösenordsåterställningsmejl.
- API: port 55321. PostgreSQL: port 55322.

Testinkorgen tar emot utvecklingsmejl lokalt; inga meddelanden skickas till riktiga
inkorgar. Registrering använder inga mejl alls.

```powershell
npm run db:status
npm run db:stop
```

`db:stop` behåller data. Använd inte `supabase db reset` eller `stop --no-backup`
för att bara starta om utvecklingsmiljön.

För att köra produktionsbygget lokalt:

```powershell
npm run build
npm run start
```

## Testa flera konton samtidigt

Med spelet igång, kör i en separat terminal:

```powershell
npm run dev:players
```

Tre separata Edge-fönster öppnas. Logga in med ett eget konto i varje fönster.
Inloggningarna hålls åtskilda och sparas till nästa gång.

För två fönster: `npm run dev:players -- --count 2`.
Stäng testfönstren före nästa start. Vanliga flikar i samma profil delar fortfarande konto.
[Detaljer och verifiering](docs/DEVELOPMENT_TEST_WINDOWS.md).

## Kontroller

```powershell
npm run check
npm run test:db
npm run test:e2e
npm run audit:economy
```

`check` kör lint, typkontroll, enhetstester och produktionsbygge. Databastesterna
körs med pgTAP mot lokal PostgreSQL. Webbläsartesterna använder Microsoft Edge,
startar produktionsbygget på port 3100 och kräver den lokala Supabase-instansen.
På datorer utan Edge: installera Edge eller välj Playwrights Chromium i konfigurationen.

Webbläsartesterna skapar egna konton under `example.test` och sparar dem enbart i den
lokala testdatabasen. Spårning, video och automatiska skärmbilder är avstängda så
att lösenord och återställningslänkar inte hamnar i testartefakter.

[Verifiering och kvarstående punkter](docs/IMPLEMENTATION_STATUS.md).

## Supabase i molnet

Ett nytt gratisprojekt i **Auxron**, region Stockholm, har begärts. Supabase avvisade
skapandet eftersom kontots två aktiva gratisplatser redan används. Inget annat
projekt har ändrats. Appen använder därför riktig Supabase lokalt tills en plats finns.

Vid nya migrationer: kör `npm run db:migrate` utan att återställa databasen.

För molnanslutning: använd `.env.example`, applicera migrationerna under
`supabase/migrations` och stäng av **Confirm email** för denna utvecklingsversion.
`SITE_URL` ska vara appens adress, och tillåt följande återställningsadress i Auth:
`<SITE_URL>/auth/callback?next=/reset-password`. Inga hemliga nycklar behövs i appen.
Extern e-postleverans och offentlig hosting är ännu inte konfigurerade.

## Teknik och dokument

TypeScript, Next.js, React och Tailwind CSS. PostgreSQL och Supabase Auth.
En Linux-VPS kan användas senare.

- [Omfattning för första bygget](docs/FIRST_BUILD_PLAN.md)
- [Karaktärsprofiler](docs/CHARACTER_PROFILES.md)
- [PvP: kanonstrid, boarding och återhämtning](docs/COMBAT_SYSTEM.md)
- [Godkänd plan för första stridssystemet](docs/FIRST_COMBAT_PLAN.md)
- [Marketplace och itemhandel](docs/MARKETPLACE.md)
- [Gold Coins och banken](docs/GOLD_COINS_AND_BANK.md)
- [Crew Morale och tavernmåltider](docs/CREW_MORALE.md)
- [Resurser och första träningssystemet](docs/TRAINING_FOUNDATION.md)
- [Plan: träningsprogression, tillfälliga crew-bonusar och tidsstyrda skeppsarbeten](docs/TRAINING_PROGRESSION_PLAN.md)
- [Scouting och PvP till havs](docs/SEA_SCOUTING.md)
- [Plan: stegvisa resor till havs](docs/SEA_TRAVEL_PLAN.md)
- [Hamnens spelarlista och realtid](docs/HARBOR_ROSTER.md)
- [Arkitektur och åtkomstregler](docs/ARCHITECTURE.md)
- [Bildstil och karibisk färgriktning](docs/design/STYLE_REFERENCE.md)
- [Gränssnittsriktning](docs/design/UI_DIRECTION.md)
- [Kapten, skepp, besättning, överlevnad och strid: designunderlag under diskussion](docs/COMBAT_AND_PROGRESSION_DESIGN.md)
