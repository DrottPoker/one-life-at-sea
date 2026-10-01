# Hideout

Hideout är varje kaptens hem i The Harbor. Där finns Crafting, och det ska också bli hem för Cooking och
liknande hushållsaktiviteter. Uppgraderingar av själva hemmet och dess arbetsplatser är planerade.

## Nuvarande sida

- `/hideout` nås från den gemensamma navigeringen och hamnens katalog.
- Sidan välkomnar den inloggade karaktären till sin egen enkla bostad.
- **Kitchen** och **Workshop** presenterar Cooking och Crafting. Deras nivå och XP kommer från ägarens
  befintliga privata skillframsteg, samma som på profilen.
- Crafting öppnar `/hideout/crafting` med tillgängliga recept och egna material. Recepten, med början i
  Oak Plank, beskrivs i [Crafting](CRAFTING.md).
- Cooking och Hideout-uppgraderingar är fortfarande märkta **Coming later**. Inga hemnivåer, bonusar
  eller uppgraderingspriser är definierade än.
- Länkar till Inventory och Activities låter spelaren se sina tillhörigheter och samla förnödenheter.
- Layouten följer det befintliga marinblå och guldfärgade gränssnittet, den responsiva navigeringen och
  den fasta sidomenyn. Välkomst- och arbetsplatsikonerna kommer från den gemensamma Lucide-uppsättningen.

## Åtkomst och tillstånd

Server Component-sidan använder `requireCharacter()` och `ownSkillProgress()`. Inloggning och en karaktär
krävs. Karaktärens identitet kommer alltid från det inloggade kontot; det finns ingen publik hemsökning och
ingen ägare som anroparen kan välja. Befintliga navigeringslås för Hospital, havet, resor och angripare
gäller. Navigeringen inaktiverar Hideout utanför The Harbor och på Hospital, och direkta adresser följer
samma regler på servern.

Ett besök hemma flyttar inte karaktären, drar inga resurser, ger ingen återhämtningsbonus och ändrar inte
skill-XP. Vanlig sidnavigering registrerar fortfarande Last action. Hemmet är i dag en vy som hör till
varje karaktär, utan eget föränderligt uppgraderingstillstånd. Själva hemvyn behöver inget föränderligt
tillstånd i databasen; Crafting använder sina egna privata recept och handlingskvitton.

## Senare spelinnehåll

Framtida uppgraderingar ska sparas per karaktär i databasen, med uttryckliga krav och kostnader som
servern bestämmer. Cooking och framtida workshopfunktioner ska använda befintlig inventory,
skillprogression, handlingslås och konventionerna för idempotenta kvitton. Fler recept, XP-belöningar,
krav på arbetsstationer och balans för uppgraderingar återstår att utforma.

## Verifiering

Webbläsartesterna kontrollerar ägarens identitet och privata skills, omdirigering för utloggade,
tangentbordsnavigering och historik, bevarad sidomeny och resurser, användbara länkar, spärrar för
Hospital och havet samt layouter i 1440/768/375/320 px. Engångsfixturer täcker befintlig XP utan att föra
in spelbelöningar på sidan.
