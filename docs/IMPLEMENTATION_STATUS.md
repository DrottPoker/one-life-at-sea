# Startstats på 10, 2026-09-16

- Nya karaktärer börjar med 10 i Attack, Defense, Speed och Accuracy för både skepp och crew.
- Migration 20260916064805_combat_stats_start_at_ten.sql är applicerad lokalt och ändrar alla åtta kolumndefaults.
  Befintliga karaktärers progression och pågående striders snapshots behålls.
- Träning ger fortfarande +1 för 5 Energy. Skadeformeln är oförändrad:
  nya karaktärer med lika stats 10 gör nu 32 skada per träff.
- Registrerings- och träningstester verifierar samtliga startvärden samt 10 till 11 efter träning.
  Stridsregressioner använder uttryckliga referensstats för att isolera sina scenarier från startbalansen.
- README, TRAINING_FOUNDATION, COMBAT_SYSTEM, COMBAT_AND_PROGRESSION_DESIGN och ARCHITECTURE är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 347 assertioner. Alla sju Playwright-scenarier för träning och strid
passerade tillsammans. Supabase security advisors rapporterade inga problem och git diff --check passerade.
Den tidigare dokumenterade Next.js-varningen om avbrutna RSC-strömmar syntes vid navigation;
samtliga webbläsarscenarier passerade.

# Torn-inspirerade statkurvor med justerad Defense, 2026-09-16

- Samma serverberäkningar används för skepp, crew och automatiska motattacker.
- Accuracy / motståndarens Speed ger träffchans från 0 till 100 %. Lika stats ger 50 %;
  64 gånger högre Speed ger garanterade missar, 64 gånger högre Accuracy garanterade träffar.
- Attack / Defense styr skadan via en logaritmisk kurva. Ägaren valde **25 gånger Defense**
  för full blockering i stället för Torns 14. Lika stats ger fortfarande 50 % skademinskning.
- Grundskadan växer med absolut Attack, med statskalan anpassad så att nya kaptener ger 15 skada per träff.
- Minst 1 skada vid träff under 25-gränsen förhindrar för tidig full blockering genom avrundning.
  Vid gränsen och över ges 0 skada. Tidigare tak på 40 skada är borttaget.
- Combat log skiljer mellan Missed och Blocked · 0 damage; en blockerad träff räknas som träff.
- Utrustningsmodifierare och övriga stridsregler ingår inte i ändringen.
- Migration 20260916051659_torn_style_combat_curves.sql är applicerad lokalt utan reset.
  Nästa order använder de nya kurvorna, även i pågående strider; historiska händelser bevaras.
- COMBAT_SYSTEM, ARCHITECTURE, COMBAT_AND_PROGRESSION_DESIGN och README är uppdaterade.
  Referenser, Torn-approximationernas begränsningar och våra anpassningar finns i COMBAT_SYSTEM.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 339 assertioner, inklusive 66 nya kurv- och gränskontroller.
Alla fem Playwright-scenarier i tests/e2e/combat.spec.ts passerade tillsammans, inklusive miss/blockering
i båda faserna. Supabase security advisors gav inga problem; git diff --check passerade.
Utvecklingsserverns /login svarade HTTP 200. Den tidigare kända Next.js-varningen om avbrutna
RSC-strömmar kvarstår vid navigation; inga webbläsarscenarier misslyckades.

# Delbara attacker och tydligare stridsloggar, 2026-09-16

- Attackvyn använder /attack/<character-id>, med motståndarens ID. Adressen är samma före start och under striden.
- En kopierad adress visar mottagarens egen kapten och Join battle när målet redan angrips.
- Möte och deltagarroll hämtas från servern. Att öppna länken ansluter inte spelaren eller förbrukar Energy.
- Det beständiga sidlåset, reload och separat stridsfas per angripare fungerar med den nya adressen.
- När mötet avslutas öppnas samma offentliga rapport för angriparna. Ett nytt besök på målets länk visar förberedelsen.
- Combat log visar servertid (UTC), utan lokala rundnummer eller summerat antal rundor.
- Deltagarnas skada visas som Ship damage och Crew damage, inklusive försvararens motattacker.
- Alla namn i stridsvyn, händelserna, deltagarlistan och resultatet länkar till profiler.
- Äldre query-länkar omdirigeras till den nya adressen.
- Migration 20260916044300_combat_damage_breakdown.sql är applicerad lokalt. Befintliga händelser summeras utan reset eller omskrivning av historiken.
- README, ARCHITECTURE och COMBAT_SYSTEM är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och produktionsbygge.
npm run test:db passerade med 273 assertioner. Supabase security advisors rapporterade inga problem.
Webbläsarregressionen omfattar 14 scenarier. 13 passerade i hela körningen; det nya testet för gemensamt
stridsslut läste först serverstatus för tidigt. Efter korrigerad väntan passerade även detta test separat.
Tester täcker kopierad länk mellan konton, rätt egen kapten, dold utrustning före join, energikostnad,
livehälsa, sidlås, reträtt, final blow/assist, rapportövergång, profillänkar, servertid och skadevärden.
Den tidigare dokumenterade Next.js-varningen om avbrutna RSC-strömmar kvarstår.


# Förenklade karaktärsnamn, 2026-09-16

Karaktärsnamn behöver bara vara ifyllda och unika. Kraven på 3-24 tecken och endast
bokstäver har tagits bort från formulär, servervalidering och databas. Siffror,
symboler, emoji och namn på ett enda tecken fungerar. Namn normaliseras fortfarande
och unikhet kontrolleras utan hänsyn till stora och små bokstäver.

Migration 20260916042055_relax_character_names.sql har applicerats lokalt utan reset.
Befintliga konton och namn bevaras. README, arkitektur och byggplan är uppdaterade.

Verifierat: npm run check passerade med lint, typkontroll, 24 enhetstester och
produktionsbygge. npm run test:db passerade med 264 assertioner. Två riktade
webbläsartester passerade: registrering med långt namn, siffror, understreck och
emoji samt samtidiga registreringar med samma namn. Supabase security advisors
rapporterade inga problem. git diff --check passerade.

# Förenklad lösenordspolicy, 2026-09-16

På ägarens begäran har utvecklingsversionens lösenordskrav sänkts från 12 till 6 tecken.
Ingen teckenblandning krävs. Formulär för registrering och återställning, servervalidering
och lokal Supabase Auth använder samma miniminivå. Bekräftelsefältet kontrollerar fortfarande
att lösenorden matchar. Den tekniska inmatningsgränsen på 128 tecken finns kvar.

supabase/config.toml anger minimum_password_length = 6 och password_requirements = "".
Konfigurationen laddas genom en vanlig lokal omstart, utan databasreset.
Befintliga konton och lösenord ändras inte.

npm run check passerade: lint, typkontroll, 21 enhetstester och produktionsbygge.
Lokal Supabase har startats om med policyn. Två riktade webbläsartester passerade:
registrering/inloggning samt lösenordsåterställning med lösenord på sex små bokstäver.


# Lokala testfönster, 2026-09-16

- npm run dev:players öppnar tre separata Edge-profiler för samtidig testning med olika konton.
- Antalet kan väljas med --count 1-6; endast lokala speladresser tillåts.
- Sparade profiler ligger i den Git-ignorerade katalogen .local/player-browsers.
- Separata konton, reload, återstart med bibehållen inloggning och oberoende utloggning har verifierats med riktiga lokala konton.
- Spelets produktionskod, autentisering och databas har inte ändrats i denna leverans.
- Instruktioner finns i [DEVELOPMENT_TEST_WINDOWS.md](DEVELOPMENT_TEST_WINDOWS.md).

# Senaste leverans: gemensam PvP, 2026-09-16

Implementerat och migrerat i den lokala utvecklingsmiljön:

- Gemensam /attack-route för förberedelse och pågående strid, utan hamnens sidopanel.
- Start battle / Join battle med 10 Energy per angripare och idempotent debitering.
- Beständig serverkontrollerad navigationsspärr för aktiva angripare.
- Flera angripare med egna rundor och faser mot delad försvararhälsa.
- Atomisk final blow och assist, individuella reträtter och nederlag.
- Realtidsuppdatering för angripare och onlineförsvarare. Försvararen använder spelet som vanligt.
- Offentlig /combatlog/<id> med deltagare, träffar, skada och logg, även utan inloggning.
- Migration 20260916022241_shared_attack_encounters.sql applicerad utan reset. Totalt tio migrationer.
- Ingen molndatabas, publicering eller Git-historik har ändrats.

Verifierat: npm run check passerade inklusive lint, typkontroll, 21 enhetstester och produktionsbygge.
npm run test:db passerade med 258 assertioner. Hela npm run test:e2e passerade: 13 av 13 webbläsartester, inklusive alla tre combat-scenarier.
De verifierar också navigation bort, bakåtknappen, ny flik, reload, anonym rapportåtkomst,
samtidig start, dubbla order, konkurrerande sluthits, separata faser och livehälsa.

De äldre balanseringsvärdena gäller: 25 rundor per angripare, två minuters inaktivitet, tio minuter per möte.
Guld, XP, inventarium, ammunitionsekonomi och PvE återstår. Detaljer finns i COMBAT_SYSTEM.md.

Känd begränsning: Next.js 16.3.5 kan logga "The destination stream closed early" vid avbrutna
RSC-navigationer. Detta inträffade även under de passerande testerna; inget browser pageerror uppstod
i det verifierade attackflödet. Den tidigare dokumenterade framework-begränsningen kvarstår.
Slutlig manuell skärmbildsgranskning kunde inte slutföras på grund av verktygsfel; layoutbredd
och tillgängliga order verifierades i webbläsare vid 320, 375, 768 och 1280 px.

## Tidigare implementationshistorik

Avsnitten nedan beskriver tidigare leveranser. Vid skillnader gäller COMBAT_SYSTEM.md och senaste leveransen ovan.

# Implementation status

Verified locally on 2026-09-15.

## Delivered

- Registration with character name, email and password creates both account and
  character in one transaction, then opens The Harbor. Email confirmation is
  disabled for development, following the owner's decision.
- Login, logout and password recovery through Supabase Auth.
- Character name selection inside registration, validation and case-insensitive
  unique names. No separate character step for new accounts.
- One saved character per account, starting in The Harbor.
- The approved Caribbean illustration, blue panels and compact game layout.
- Left navigation on desktop, navigation above content on narrow screens.
- Marketplace and Shipyard placeholder views with persistent navigation.
- Real local PostgreSQL persistence, migrations and row-level access rules.
- Reproducible setup and verification commands in the README.

## Original foundation verification

| Check | Result |
| --- | --- |
| `npm run check` | Passed: lint, TypeScript, 21 unit tests and production build. |
| `npm run test:db` | Passed: 29 pgTAP assertions against local PostgreSQL. |
| Browser tests against the production build | All five scenarios passed in a single run against the updated application. |
| Atomic registration and one character per account | Passed: simultaneous signup with the same name creates one winner; the other account is rolled back and can retry. Extra character inserts are rejected. |
| Local database lint | No schema errors in `public` and `private`. |
| Local Supabase advisors | No issues reported. |
| Dependency audit during installation | Zero known vulnerabilities reported. |
| Visual inspection | Updated desktop/mobile registration screenshots and the harbor layout reviewed. |
| Keyboard review | Passed: skip link, field order, password visibility toggle, visible focus and navigation to login. |
| Actual web server restart | The existing session and saved character remained available after restarting Next.js. |

The browser scenarios cover registration with immediate character creation and
no confirmation email, invalid and taken names, retrying with the same email,
reload, logout/login, menu navigation, password recovery
through the local Mailpit inbox, old-password rejection, unauthorized routes,
invalid callbacks and rejected external callback destinations.

Direct API checks cover two-account isolation, anonymous access, concurrent
registration, second-character rejection, ignored metadata changes and attempted
owner/location manipulation. Failed signup with a missing name or taken name
leaves no account that can log in. Database checks separately
exercise constraints, privileges and row-level policies. Responsive checks cover
1280, 768, 375 and 320 pixel viewport widths. The separate visual smoke run reported
no browser JavaScript errors and confirmed persistence across a web server restart.

Tests create isolated, generated accounts under `example.test` in local Supabase.
They do not run against a hosted project. Unit and database tests do not require
email delivery; browser recovery tests read only the local test inbox.

## Environment and remaining limits

Older unfinished development accounts retain a one-time name selection path.
Existing characters were preserved by the new migration.

The application currently runs at <http://127.0.0.1:3000> with real Supabase
services in Docker. It has not been publicly deployed.

Creating the requested Supabase Free project in Auxron was rejected because the
owner's two active Free project slots were already occupied. Existing projects
were not changed. A hosted slot is needed before connecting this application to
Supabase Cloud. The local setup allows the agreed foundation to be used now.

External email delivery, public hosting and production abuse controls remain
future setup work. Registration intentionally does not verify email ownership.
Password recovery currently uses the local Mailpit inbox.

TypeScript and ESLint use versions compatible with the installed Next.js plugins.
ESLint 9 is past upstream support; the compatibility limitation and upgrade work
before public release are recorded in [ARCHITECTURE.md](ARCHITECTURE.md).

Ship and crew stats, three resource bars and Energy-based training are now
implemented as the next bounded gameplay step. No economy, inventory, combat,
player-to-player actions or permanent-death mechanics have been implemented.
The Harbor now has a shared captain directory with realtime updates.

The current [gameplay design](COMBAT_AND_PROGRESSION_DESIGN.md) records the
owner's decisions about the persistent personal ship and crew, Crew Health,
eight upgradeable combat stats, equipment, PvP outcomes and separate skill
progression. The [training foundation](TRAINING_FOUNDATION.md) defines the
implemented subset. Hunger and unresolved combat details remain proposals or
open questions. The original verification results above are historical.

## Resource and training verification

Verified during the training implementation on 2026-09-15:

- Lint and TypeScript checks passed.
- All 21 existing unit tests passed.
- The production build passed, including both new training routes.
- The fourth migration was applied to local Supabase without resetting data.
- All 74 pgTAP checks passed, including 45 resource/training checks.
- Local database advisors reported no issues.
- All seven browser/API scenarios passed against the production build.
- The two training scenarios passed again after adding an open-page recovery
  check: Energy changes from 4 to 5 and training becomes available automatically.
- Twenty-five simultaneous requests produce exactly twenty paid upgrades and
  five insufficient-energy rejections.
- Desktop and mobile screenshots were reviewed; layout checks passed at
  1280, 768, 375 and 320 pixels with no horizontal overflow.
- Progress persists across reload, logout and login. No browser errors were recorded.

Resources start at 100/100 and stats at one. Five Energy buys one stat point.
Energy recovers one point every five minutes, including offline time, capped at
100. Ship and crew health are persisted indicators; damage and healing are future
work. Training currently has no material cost or skill-XP reward.

## Harbor roster verification

Verified during the roster implementation on 2026-09-15:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All 99 pgTAP checks passed, including 25 roster checks.
- Local database advisors reported no issues.
- The fifth migration is applied; Realtime is enabled and its container is healthy.
- All eight browser/API scenarios passed against the production build.
- The roster updates after arrivals, removals and returns without reloading.
- Changes missed during a network interruption are recovered after reconnecting,
  and subsequent realtime events continue to arrive.
- Received WebSocket records contain only character IDs and display names.
- Offline captains remain listed; anonymous access and private character access
  are rejected, and pagination is verified.
- Desktop and mobile screenshots were reviewed. Layout checks passed at
  1280, 375 and 320 pixels with no horizontal overflow or browser JavaScript errors.

Scope and data boundaries are recorded in [the roster specification](HARBOR_ROSTER.md).

## Navigation and loading verification

Verified during the navigation implementation on 2026-09-15:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All nine browser/API scenarios passed against the production build.
- Actual automatic prefetch responses were observed before navigation.
- With a navigation response deliberately held, the content displays its loading
  indicator and the original sidebar and resource-bar DOM elements remain mounted.
- Choosing another destination interrupts the pending navigation successfully.
- Training updates Energy and stats without replacing the shared resource bars.
- Navigation, training and browser back/forward issue no browser document requests.
- Opening a deep link directly still restores the correct view and saved stats.
- Desktop and mobile loading screenshots were reviewed. The mobile check has
  no horizontal overflow, and reduced-motion settings stop the spinner animation.
- The new scenario reported no browser JavaScript errors.
- The local development app remains available on port 3000.

The [navigation architecture](ARCHITECTURE.md#navigation-and-loading) describes
the shared layout and nested loading boundaries. Automatic prefetching is assessed
in the production build; development mode does not enable it.

## Stable frame width verification

Verified during the scrollbar layout fix on 2026-09-15:

- Reproduced the horizontal shift with classic scrollbars enabled in Edge.
  The long harbor view shifted the frame by 7.5 pixels at a 1280-pixel viewport;
  at 1100 pixels its frame was 15 pixels narrower than the shorter views.
- Added a stable scrollbar gutter to the root scroll container.
- Measured all five harbor views at viewport widths of 1280, 1100, 375 and
  320 pixels. Frame and content widths and horizontal positions now match
  exactly between views at each viewport size.
- The production build and its TypeScript check passed.

The focused browser measurements used an isolated local test account, which was
removed afterward. Headless browser measurements with hidden scrollbars did not
reproduce the original problem; verification explicitly enabled classic scrollbars.

## Character profile verification

Verified during the profile implementation on 2026-09-16:

- Lint, TypeScript, all 21 unit tests and the production build passed.
- All 123 pgTAP assertions passed, including 24 profile access and synchronization checks.
- Local database advisors reported no issues.
- The sixth migration was applied locally without resetting character data.
- All ten browser/API scenarios passed. Profile and roster checks passed again
  after restricting roster-link prefetching to hover/focus.
- The viewer can open their own profile from the sidebar and another captain's
  profile from the harbor roster, including a logged-out captain.
- Normal links, keyboard access, browser history and direct URLs passed.
- The original viewer sidebar remains mounted. Its resources are not replaced
  by the viewed captain's values. No full document loads occur during link navigation.
- Anonymous profile reads and client writes are rejected. Only four public identity
  fields are returned, and the other captain's private state remains inaccessible.
- Invalid UUIDs and missing characters show a local not-found panel with a working
  link to The Harbor. Logged-out profile visits redirect to login.
- Desktop/mobile screenshots were reviewed. Checks passed at 1280, 768, 375 and
  320 pixels; the frame retains its width and horizontal position with classic scrollbars.
- No browser JavaScript errors were reported. The server stream-cancellation
  diagnostic is recorded in ARCHITECTURE.md for upstream follow-up.

See [the implemented profile scope](CHARACTER_PROFILES.md).

## Combat implementation and verification

Implemented and verified locally on 2026-09-16.

- Profile Attack opens free preparation; Start fight begins persistent two-party PvP.
- Cannon combat, boarding, disengagement, retreat, reports and offline defence work.
- Defence orders on the own profile apply to the next encounter.
- Full health is not required. Both health meters need at least one point.
- Incoming protection does not block outgoing attacks; starting a fight relinquishes it.
- Health damage persists, with automatic offline recovery after the encounter.
- No gold, XP, permanent death or inventory economy was added.
- Migrations seven through nine are applied locally without resetting existing data.
- Existing profile privacy and the shared game frame are preserved.

Verification:

| Check | Result |
| --- | --- |
| npm run check | Passed: lint, TypeScript, 21 unit tests, production build. |
| npm run test:db | Passed: 214 assertions, including 91 combat assertions. |
| npm run test:e2e | Passed: all 12 scenarios in one run against the production build. |
| Local database advisors | No warning/error issues reported. |
| Visual review | Desktop preparation, active encounter and mobile screenshots reviewed. |
| Layout and navigation | No horizontal overflow at 768, 375 or 320 px; classic-scrollbar frame position and width preserved; no document navigation between profile, preparation and rounds. |
| Concurrency | Competing starts produce one encounter; duplicate orders produce one round and one charge. |
| Interrupted play | Reload restores the saved round; timeout performs a counterattacked retreat and recovery starts at its deadline. |
| Privacy | Enemy equipment absent before start; enemy training stats absent afterward; outsiders cannot read reports; anonymous sessions cannot participate. |

The existing Next.js stream-cancellation diagnostic still appears during the
rapid invalid-profile test. That scenario and all other browser checks pass;
the previously documented upstream limitation remains in ARCHITECTURE.md.

See [the implemented PvP system](COMBAT_SYSTEM.md) and
[the approved plan with the health correction](FIRST_COMBAT_PLAN.md).
