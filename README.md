# One Life At Sea

Ett browserbaserat, socialt pirat-RPG med ett liv per karaktär.

## Första grunden

- Registrera med karaktärsnamn, e-post och lösenord. Konto och karaktär skapas samtidigt.
- Exakt en karaktär per konto. Du loggas in direkt och kommer till **The Harbor**.
- Ingen e-postbekräftelse krävs i utvecklingsversionen.
- Karaktären sparas i PostgreSQL och finns kvar efter utloggning och omstart.
- Karibisk pixelart, havsblå paneler och kompakt vänstermeny.
- **Marketplace** och **Shipyard** är klickbara platshållarvyer.
- Lösenordsåterställning, valideringsfel och skyddad åtkomst mellan konton.

Spelets gränssnitt är på engelska. Expeditioner, ekonomi, strid och permadöd
kommer i senare etapper.

## Starta lokalt

Kräver Node.js 22.14 eller senare, npm och Docker Desktop med Linux-containrar.

```powershell
npm ci
npm run db:start
npm run setup:local
npm run dev
```

Öppna [spelet](http://127.0.0.1:3000).
`setup:local` skapar `.env.local` utan att skriva ut nycklar och skriver aldrig över
en befintlig fil. Vid följande starter räcker `db:start` och `dev`.

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

## Kontroller

```powershell
npm run check
npm run test:db
npm run test:e2e
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
- [Arkitektur och åtkomstregler](docs/ARCHITECTURE.md)
- [Bildstil och karibisk färgriktning](docs/design/STYLE_REFERENCE.md)
- [Gränssnittsriktning](docs/design/UI_DIRECTION.md)
- [Strid och färdigheter: designunderlag under diskussion](docs/COMBAT_AND_PROGRESSION_DESIGN.md)
