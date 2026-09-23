> Historiskt underlag. Beslut och förslag nedan hör till den daterade planen. För aktuellt beteende, se [dokumentationsindex](../../README.md) och [nuläge](../../IMPLEMENTATION_STATUS.md).

# One Life At Sea: gränssnittsriktning

Datum: 2026-09-15. Designriktning v0.8. Grundlayouten är implementerad i den lokala appen.

## Uppdrag

Ägaren vill ha ett genomarbetat gränssnitt med inspiration från Torn och andra
browserspel. Tidigare beslut gäller: engelska, endast karaktärsnamn, The Harbor,
vänsterpanel med valt innehåll till höger och den valda pixelartstilen.
Senaste färgbeslut: karibiskt ljusblått hav, sandstrand och gröna palmer.
Gränssnittets helhet ska upplevas blå.

## Granskade referenser

### Torn

- [Officiell dokumentation om vänstermenyn](https://wiki.torn.com/wiki/Sidebar).
  Menyn är organiserad i namngivna grupper för olika slags funktioner.
- [Officiell dokumentation om City](https://wiki.torn.com/wiki/City).
  Beskriver både en grafisk stadsvy och kategoriserade snabblänkar till platser.
- [Offentlig skärmbild i en spelares artikel från 2020](https://wgma.ca/blog/2020-01-18/torncity),
  med [själva skärmbilden](https://wgma.ca/images/torn-screen.png).
  Visuellt granskad: smal vänsterkolumn, information nära spelarnamnet, täta
  navigationsrader, små rubriklister och informationsrader i panelerna.

Skärmbilden är historisk och innehåller DOCTORn-moduler. Vi använder dess
informationsstruktur som inspiration; alla visade moduler är inte Torn-standard.
Ingen inloggning eller kontroll av dagens privata spelgränssnitt har gjorts.

### Tribal Wars

- [InnoGames pressmaterial från 2015](https://newsroom.innogames.com/innogames-publishes-tribal-wars-as-canvas-app-on-facebook),
  med [officiell översiktsbild](https://cdn.uc.assets.prezly.com/e8c8e4e6-458a-4c06-ae14-4c6eae4ff684/Tribal_Wars_Ingame_Overview_English.jpg).
- [Officiell dokumentation om kartan](https://support.innogames.com/kb/TribalWars/en_DK/1208).

Den historiska skärmbilden visar en illustration integrerad i en tydligt avgränsad
spelyta, kompakta menyer och en sammanhängande material- och färgkänsla. Bilden
utgör en strukturreferens, inte en verifiering av det aktuella gränssnittet.

## Översättning till One Life At Sea

| Observation | Förslag för vårt spel |
| --- | --- |
| Spelarinformation har en fast plats nära menyn. | Namn, plats och skapandedatum i vänsterpanelens Character-sektion. |
| Menyer består av rader i tydliga grupper. | Character, Harbor och Account, med 34 px höga navigationsrader på dator. |
| Rubriklister avgränsar innehåll. | Små sektionsrubriker, tunna ramar och tätare avstånd. |
| Bilder och systeminformation delar samma spelram. | Hamnbilden ligger i en inramad innehållssektion, följd av kort text och platslänkar. |
| Materialkänslan stödjer temat. | Havsblå paneler, sandfärgade accenter och ljus läsbar text, med gröna palmer i bilden. |

Spelets begränsade första omfattning ska synas ärligt. Täthet skapas genom layout
och hierarki. Den motiverar inte att fylla skärmen med påhittade spelvärden.

## Gränssnittets struktur

### Gemensam ram

- Kompakt sidhuvud med en egen typografisk logotyp och diskret ankarsymbol.
- Cirka 184 px bred vänsterkolumn på dator.
- Mellanrum mellan kolumner och innehållssektioner: cirka 12 px.
- Vänsterpanelens grupper ligger nära varandra och har tydliga rubriklister.
- Innehållet använder samma kanter och rubriklister genom alla vyer.

### Vänsterpanel

- **Character:** karaktärsnamn, Captain, plats och skapandedatum.
- **Harbor:** The Harbor, Marketplace och Shipyard.
- **Account:** Log out.
- Aktiv plats visas med bakgrund, accentlinje och programmatisk vald-markering.
- Karaktärsinformationen finns kvar när platsen i hamnen växlar.

### The Harbor

- Smal platsrad och innehållsrubrik.
- Den nya karibiska hamnillustrationen i ett tydligt bildfält, cirka 340 px högt på dator.
- Kort välkomsttext.
- **Around the harbor:** två kompakta länkrader till Marketplace och Shipyard.
  Båda är markerade **Coming later**.

### Marketplace och Shipyard

- Egen rubrik och kort miljötext.
- Samma hamnbild används som kontext med en annan visningsbeskärning.
- Tydligt besked om att respektive spelfunktion kommer senare.
- Ingen försäljning, ekonomi, utrustning eller skeppshantering simuleras.

### Konto och karaktär

- Registrering och inloggning använder en kompakt formulärpanel bredvid bilden.
- Lösenordsvisning och lösenordsåterställning finns med i designstudien.
- Registreringen innehåller karaktärsnamnet och går direkt till The Harbor utan e-postbekräftelse.
- Lösenordsåterställning använder samma panelstruktur.
- Namnfält och förhandsvisning finns i samma formulär som e-post och lösenord.
- Konto och karaktär skapas samtidigt. Varje konto har en karaktär.
- Den historiska designstudien använder exempeldata. Den implementerade appen
  använder riktiga lokala Supabase-konton och sparad karaktärsdata.

## Visuella regler

| Del | Huvudförslag |
| --- | --- |
| Typsnitt | Arial för UI och brödtext; Georgia för logotyp och enstaka berättande rubriker. |
| Brödtext på dator | 13-14 px, tydlig radavstånd och kontrast. |
| Små etiketter | 11-12 px, aldrig för huvudsakliga handlingar. |
| Formulär på mobil | Minst 16 px i inmatningsfält. |
| Hörn | I huvudsak raka, högst cirka 2 px rundning. |
| Kanter | Tunna, konsekventa ramar och radavdelare. |
| Paneler | Havsblå grund, ljusare blå ytor och blå rubriklister. |
| Accent | Ljus havsblå markering av valt menyval; varma sandtoner i namn, länkar och primära knappar. |
| Bild | Detaljerad pixelart med blått hav, tropiskt dagsljus, sandstrand och gröna palmer. |
| Dekoration | Diskret struktur i sidhuvudet och återhållsam materialkänsla i rubriklisterna. |

Designstudien erbjuder också ljusa sandfärgade innehållspaneler med blå rubriklister
som ett jämförelsealternativ. En temaväljare i det färdiga spelet ingår inte därmed i planen.

## Mobil och tillgänglighet

- Meny och kort karaktärsinformation flyttas över innehållet på smala skärmar.
- Samma val och aktuell plats är fortsatt tillgängliga.
- Tryckytor blir minst 44 px på pekskärmar.
- Log out finns kvar när kontogruppen inte visas i mobilens kompakta meny.
- Tangentbordsfokus är synligt och knapparna använder vanliga HTML-kontroller.
- Rubriker, vald-markering, fältetiketter och bildbeskrivningar finns med.
- Layouten kontrolleras vid både smala och breda visningsbredder.

## Bildhantering och avgränsning

[Den tidigare bilden](../../design/harbor-style-reference.png) är bevarad oförändrad.
[Det nya karibiska bildförslaget](../../design/harbor-caribbean-reference.png) sparas separat.
Skissen använder en WebP-kopia av den nya bilden med samma bildmått och motiv.
Visningsbeskärningen görs i layouten och ändrar inte originalet.

Palett i huvudförslaget: bakgrund `#15364d`, panel `#214b66`, rubriklist `#2d607f`,
ljus havsblå accent `#91ddf7` och sandfärgad länk `#eedaad`. Grönt hör främst
hemma i illustrationens växtlighet.

Inga illustrationer, ikoner, logotyper eller CSS-filer från referensspelen har
lagts in i projektets design. Deras skärmbilder har endast granskats som referenser.

Den lokala appen och databasen är byggda enligt denna riktning. Den historiska
designstudien finns kvar för jämförelse. Drift i molnet är inte konfigurerad.
