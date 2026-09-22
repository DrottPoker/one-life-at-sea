# Publika spelar-ID:n

Infört 2026-09-21.

Varje karaktär har ett permanent publikt `player_number`, med nummerföljden
100001, 100002 och uppåt. UUID i `characters.id` och kontots `user_id` behålls.
Databasrelationer, spelhandlingar, Realtime-filter och kvitton använder fortsatt UUID.
Nummer-ID:t är en identifierare, inte en behörighet eller ett mått på antalet spelare.

## Tilldelning och beständighet

PostgreSQL tilldelar numret med en bigint identity och unik constraint.
Befintliga karaktärer numreras i ordning efter `created_at`, med UUID som
utslagsgivare vid lika tid. Nya registreringar fortsätter därefter.

Numret ändras inte vid namnbyte. Identity-kolumnen avvisar explicita nummer,
och en trigger blockerar även UPDATE till DEFAULT. Klienter saknar skrivåtkomst
till numret och åtkomst till sekvensen. Adminpanelen visar numret som skrivskyddat.

Sekvensen cyklar inte och återställs inte vid borttagning. Avbrutna transaktioner
och testkonton kan lämna luckor, vilket är avsiktligt. Siffrornas antal är inte
begränsat till sex. Maxvärdet är 9007199254740991 så att API- och JavaScript-värden
förblir exakta heltal. Ändra inte startvärdet eller befintliga nummer via config.

## Sökning och länkar

- **Players** i menyn öppnar `/players`, med 20 resultat per sida enligt hamnens sidstorlek.
- Namnsökning är skiftlägesokänslig och matchar delar av namnet.
- Ett vanligt nummer söker både efter exakt ID och efter äldre namn som innehåller siffrorna.
- `#100001` söker endast efter det exakta publika numret. Detta skiljer ID:n från äldre numeriska namn. Nya namn följer [namnregeln](CHARACTER_NAMES.md).
- Procenttecken och understreck i namn behandlas bokstavligt, inte som jokertecken.
- Den kanoniska profilen finns på `/players/<player-number>`.
- Attackadressen är `/attack/<player-number>` före, under och efter stridsstart.
- Gamla `/characters/<uuid>` och `/attack/<uuid>` fortsätter fungera och omdirigerar till nummeradresser.
- Combat log behåller stridens UUID i sin adress.

Profilrubriken visar en automatiskt uppdaterad statusprick följd av `Namn [ID]`
på både den egna och andras profiler. Den separata ID-raden i profilen är borttagen.
Players-listan visar bara namn; sökning med publikt nummer och profillänkar fungerar fortsatt.

Publika nummer visas i sidopanel, profil, hamnlista, patientlista, scouting,
marknadsannonser och stridsvyer. Adminsidan visar både publikt nummer och interna
UUID:n. Äldre stridssnapshots kompletteras med nummer vid läsning utan att ändra
historiska namn, skador eller sparade spelvärden.

## Åtkomst och implementation

Katalogen och profilerna kräver registrerad inloggning. Sökfunktionen
`search_players` använder SECURITY INVOKER och befintlig RLS på
`character_profiles`; den returnerar endast karaktärens UUID, publikt nummer och
namn. E-post, kontorelationer, resurser och stats ingår inte.

Players och profiler kan läsas i Hospital och på en stillastående havsplats.
Aktiv resa respektive egen pågående attack behåller sina navigationsspärrar.
Att känna till ett nummer kringgår inte scouting, platskontroller eller stridsregler.

`src/lib/player-identity.ts` hanterar publika adresser och validering.
`src/lib/player-profile.ts` löser nummer eller äldre UUID till profil på servern.
`supabase/templates/gameplay/player-directory.sql` äger sökfunktionen.
Nummeruppslag använder unika index och namnsökning ett trigramindex.

Schemat införs av migrationen `20260921034729_public_player_numbers.sql`.
Gameplay-funktionerna följer projektets ordinarie configgenerering. Applicera
migrationerna med `npm run db:migrate` utan databasåterställning.

## Verifiering

Databastester täcker unik tilldelning, skydd mot ändring, namnbyte, borttagning,
sökning, numeriska namn, literal sökning, sidgränser och åtkomstregler.
Webbläsartester täcker sökflödet, profiler, äldre länkar, attackadresser,
samtidiga registreringar och mobilbredder. Aktuella körresultat finns i
[implementationsstatus](IMPLEMENTATION_STATUS.md).
