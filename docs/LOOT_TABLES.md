# Loot tables och insamling

Implementerat lokalt 2026-09-22. Innehållet hanteras under Admin > Items, Loot tables och Activities. Det
finns inga sällsynthetskategorier. Inventorykategorier som Materials och Miscellaneous ordnar föremål men
påverkar inte chansen.

## Försökets ordning

1. Servern kontrollerar villkoren och drar aktivitetens Stamina-kostnad.
2. Skillnivån läses innan försökets XP delas ut. Fångstchansen beräknas från aktivitetens startchans,
   masterychans och masterynivå.
3. Fångstslaget slås. En miss ger inget föremål och en lägre [failure XP](ACTIVITIES.md#failure-xp).
4. Vid en fångst reserverar fasta poster sina exakta procentsatser först.
5. De viktade posterna delar på den återstående procentsatsen. Exakt en post väljs och dess konfigurerade
   antal delas ut. Varje utrustningsföremål slår sin egen Quality från 0 till 100 %
   (se [Utrustning](EQUIPMENT.md)); posterna sparar inte längre fasta stats.
6. Inventory, cirkulation, XP, Stamina och det beständiga kvittot committas tillsammans.

Den publika RPC:n tar varken emot slumptal eller belöningsföremål. Upprepade anrop använder sitt sparade
resultat och slår eller delar aldrig ut igen. Ombalansering, namnbyte på föremål, avstängning eller en
borttagen koppling till en tabell ändrar inte gamla kvitton. Om ett föremål inte kan delas ut, till exempel
för att stacken är full, rullas hela handlingen tillbaka, inklusive Stamina och XP.

## Sannolikhetsmodell

För nivå L och masterynivå M:

```text
t = clamp((L - 1) / (M - 1), 0, 1)
catch chance = starting chance + (mastery chance - starting chance) × t
item weight = starting weight + (mastery weight - starting weight) × t
weighted item chance per successful catch =
  (100 - sum of fixed percentages) × item weight / sum of weights
```

Masterynivån kan vara 2-100, separat för varje kopplad aktivitet. Över masterynivån står fångstchans och
vikter kvar på sina masteryvärden. Fasta föremål använder inte skillnivån. En fast 1 % betyder i genomsnitt
ett föremål per 100 fångster. Vid 30 % fångstchans är chansen per försök 0,3 %; vid 90 % är den 0,9 %.

Flera fasta föremål använder disjunkta intervall i ett och samma slag, inte separata oberoende slag i följd
som späder ut senare poster. Serverns kumulativa slag lägger de fasta intervallen före den normaliserade
viktade resten. Varje fångst väljer en post.

En tabell innehåller 1-50 olika föremål. De fasta procentsatserna summerar till högst 100 %. Om de inte
summerar till exakt 100 % måste de viktade posterna ha positiv sammanlagd vikt vid båda ändpunkterna.
Procentsatser och vikter tar upp till fyra decimaler. Antalet är 1-100; föremålens ägandetyper och
statbegränsningar är fortfarande auktoritativa.

## Harbor Shore

Shore Fishing är kopplad till Harbor Shore. Varje försök kostar Stamina, se [Stamina](STAMINA.md). En
fångst ger full Fishing XP och en miss ger [failure XP](ACTIVITIES.md#failure-xp). Fångstchansen stiger
linjärt från 70 % på nivå 1 till 90 % på nivå 100 (masterynivå 100), och Woodland Logging seedas med samma
kurva. Kurvan är inte config: den seedas en gång från `supabase/templates/gameplay/content-seed.sql`, och
administratörer kan ändra den per aktivitet under Admin > Activities.

| Föremål | Regel | Startvikt | Masteryvikt | Chans på nivå 1, per fångst | Chans på nivå 100, per fångst |
| --- | --- | ---: | ---: | ---: | ---: |
| Sprat | Viktad | 40 | 10 | 39,6 % | 9,9 % |
| Sardine | Viktad | 30 | 15 | 29,7 % | 14,85 % |
| Mackerel | Viktad | 20 | 30 | 19,8 % | 29,7 % |
| Sea Bass | Viktad | 9 | 30 | 8,91 % | 29,7 % |
| Red Snapper | Viktad | 1 | 15 | 0,99 % | 14,85 % |
| Silver Ring | Fast | - | - | 1 % | 1 % |

Varje fångst ger ett föremål. Fiskarna är passiva Materials; ringen är ett passivt samlarföremål i
Miscellaneous. Alla sex är stapelbara och handelsbara, använder den gemensamma standardbilden och har ännu
ingen förbruknings-, matlagnings- eller stridseffekt. Det här är redigerbara startvärden, inte fasta
balansregler. Foraging ger bara XP.

## Woodland Logging

Logging är kopplad till Woodland Logging (`woodland_logging`). Dess enda post är Oak Logs (`oak_logs`) med
antal 1 och en fast andel på 100 % av lyckade försök. Fångstslaget gäller ändå, med den seedade kurvan ovan.
Kostnad och XP följer samma regler som för Shore Fishing: Stamina per försök, full Logging XP vid fångst och
failure XP vid miss. Oak Logs är ingrediens i receptet Oak Plank, se [Crafting](CRAFTING.md).

Tabellen och aktivitetskopplingen seedas en gång, enligt samma mönster som Harbor Shore. Senare
adminändringar av antal, chans, tabellinnehåll eller koppling behålls av configmigrationer, även en
avsiktligt borttagen koppling mellan Logging och tabellen.

## Administration och lagring

`private.loot_tables` äger tabellens identitet, namn, beskrivning, aktiv status och ett versions-UUID.
`private.loot_entries` har främmande nycklar till tabellen och föremålet, med en rad per föremål.
`private.activity_loot` kopplar befintliga aktivitets-ID:n till en tabell och dess svårighetskurva.
Migrationen för nivåtaket flyttade gamla kopplingar med mastery 99 till 100 en gång; egna lägre
masteryvärden och senare adminändringar är oförändrade. Tabellerna använder RLS utan direkta
klientbehörigheter. Adminpanelens läs- och skrivendpoints kontrollerar själva aktuellt medlemskap i
databasen. Inga service role-nycklar når webbläsaren.

Innehåll sparas via `admin_mutate` med request-UUID, motivering, audit, ögonblicksbilder före och efter samt
optimistisk versionskontroll. Administrativa innehållsändringar serialiseras under ett innehållslås. Spelet
låser karaktären först, sedan kopplingen, tabellen och det valda föremålet. Adminändringar av en tabell
låser tabellen innan posterna ersätts, så varje försök ser en komplett version. Innehållsredigerare tar
aldrig karaktärslås.

Starttabellen seedas bara om den saknas. Admininnehåll överlever senare configmigrationer. Föremålsrader
som admin äger markeras `managed_by_admin`; den ursprungliga föremålskatalogen är fortfarande seed för
orörda standardvärden. ID:n och ägandeformer är permanenta.

Saknade bilder använder `public/images/items/placeholder.svg` i admin, inventory och Marketplace. Valfria
bilder lagras i den publika Storage-bucketen `item-images`, där bara administratörer kan ladda upp.
Befintliga bilder och granskade referenser raderas inte automatiskt.

## Verifiering

Testerna täcker exakta fasta chanser på alla 100 nivåer, normaliserade viktade sannolikheter, platsens
svårighet, fullständig tabellvalidering, privat åtkomst, omedelbart återkallad adminbehörighet, granskade
och inaktuella ändringar, reservbilder, att en miss avgörs före fast loot, konfigurerade antal, inventory
och cirkulation, återrullning när taket överskrids, återspelade kvitton samt borttagna kopplingar och ombalansering.
Webbläsartesterna går igenom att skapa innehåll, ladda upp, koppla, riktiga fångster, samtidiga
återförsök, mobillayout och återställningsbannerns beteende. Se
[implementationsstatus](IMPLEMENTATION_STATUS.md) för körda resultat.
