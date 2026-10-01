# Hospital

Implementerat lokalt 2026-09-19. Detta ersätter idén om hardcore och permanent karaktärsdöd.

## Spelregler

- Hospital finns i Harbor-panelen och visar alla aktuella patienter, även utloggade spelare.
- Noll Crew Health skickar karaktären till Hospital, oavsett om orsaken är PvP eller annan skada.
- Noll Ship Health innebär att besättningen också dör: Crew Health sätts till 0.
- Vistelsens längd styrs av `gameplay.hospital.durationSeconds`, standard 300 sekunder (fem minuter).
- Karaktären kan inte utföra spelhandlingar under vistelsen, till exempel träning, handel, avfärd
  eller attack. Hela listan finns under [Server och samtidighet](#server-och-samtidighet).
- Patienten kan se sjukhussidan, läsa patientlistan, besöka sin egen och andra spelares profiler och logga ut.
  My Profile fungerar under hela vistelsen, och patientnamnen länkar till profilerna.
  Players-sökningen och nummerbaserade profiler fungerar också under vistelsen.
  [Messages](MESSAGES.md), [Forums](FORUMS.md), [Notifications](NOTIFICATIONS.md) och stridsrapporter
  (`/combatlog/<battle-id>`) är öppna.
  [Inventory](INVENTORY.md) får läsas, filtreras och öppnas via direktlänk. Trash, Equip och Unequip är spärrade.
  Medicinsk itemanvändning kommer i nästa etapp; Use är ännu inaktivt.
  Andra spelare kan inte attackera patienten.
- Profilen visar Hospital, In hospital och en nedräkning för alla inloggade spelare.
  Statusen uppdateras vid intagning och försvinner efter utskrivning, även för offlinepatienter.
- Efter sluttiden skrivs karaktären ut automatiskt med full Ship Health och Crew Health.
  Full Ship Health följer aktuell utrustning och Ship Battling-nivå, se [utrustning](EQUIPMENT.md#ship-health-från-hull).
  Full Crew Health följer Crew Battling-nivån, se [Skills](SKILLS.md#combat-xp-and-battling-health).
  Den öppna sjukhusvyn återgår till Harbor. Tiden fortsätter även offline.
- Karaktär, skepp, besättning, tränade stats, progression och båda guldsaldona behålls.
  Det finns ingen permanent död, omstart eller ersättningskaraktär.
- Passiv Energyåterhämtning och redan påbörjade skeppsarbeten fortsätter. Hälsa läker inte
  stegvis under vistelsen; full hälsa återställs vid utskrivning.

Dessa regler gäller framtida skadeorsaker också. Inventory och Trash har införts separat;
PvE, hunger och aktiva itemeffekter återstår. Enbart skador som faktiskt sätter en hälsomätare till 0
utlöser sjukhusvistelse; migrationen skriver inte om befintliga karaktärer.

## Server och samtidighet

public.characters sparar hospital_started_at och hospital_until. En privat hälsotrigger
täcker alla serverstyrda skadeuppdateringar och sänker Crew Health till 0 när skeppet sjunker.
PvP sparar samma värden i stridsögonblicksbilderna och beräknar sjukhusets sluttid från
den faktiska rundans tid, även vid efterbehandlad timeout. Upprepade nollhälsouppdateringar
förlänger inte en redan sparad vistelse.

private.settle_combat_context tar de befintliga ordnade deltagarlåsen, hanterar utgångna
strider och skriver ut förfallna patienter. `private.assert_can_act` i `hospital.sql` skriver
först ut en förfallen patient och nekar sedan med `IN_HOSPITAL`, `IN_COMBAT` eller `NOT_IN_HARBOR`.
Funktionen är den gemensamma spärren för sjukhus, strid och plats. Den används av:

- Crew Training, skeppsarbete och nivåköp (`training.sql`).
- Aktiviteter (`activities.sql`) och crafting (`crafting.sql`).
- Bankens Deposit och Withdraw (`bank.sql`) och tavernans måltid (`tavern.sql`).
- Equip och Unequip (`equipment.sql`) samt Trash (`inventory.sql`).
- Marketplace: köp (`marketplace-buy.sql`), nya listings och återtagning (`marketplace-sell.sql`).
- Försvarsorder (`hospital.sql`).

Avfärd, vidare resa, hemresa och scouting gör egna kontroller av sjukhus och strid i
`sea-travel.sql` och `sea-scouting.sql`. Stridsstart och order har motsvarande spärr i
`combat.sql`. Klienten kan inte ändra sjukhustid eller anropa privata
utskrivningsfunktioner. Återspelning av ett redan sparat transaktionskvitto gör ingen ny handling.

Om en framtida extern skadeorsak slår ut en deltagare mitt i en strid avslutas mötet som
oavgjort och låsen släpps; ingen påhittad PvP-seger tilldelas. Rapporten anger sjukhusintagning.
Vanliga PvP-segrar behåller befintliga regler för final blow och assist. Vid ömsesidig
utslagning hamnar båda på sjukhus även om angriparen får final blow.

## Åtkomst och patientlista

Proxy använder get_navigation_lock och prioriterar Hospital framför ett stridslås.
Attacksidan släpps igenom av proxyn men skickar själv en inlagd spelare till Hospital. Undantaget är den
avslutade striden mot samma mål i fliken där striden pågick: där spelas den sista rundan klart och resultatet
ligger kvar tills spelaren väljer Leave till rapporten. Andra besök på adressen skickas vidare till Hospital
av klienten. Databasen nekar ändå nya attacker.
Tillåtna sidor under sjukhusvistelse är Hospital, Inventory, Players, profiler, Messages, Forums,
Notifications och stridsrapporter (`isHospitalAccessiblePath` i `src/lib/hospital.ts`); övriga sidor
skickas till Hospital och databasens handlingsspärrar kvarstår.
Servervyer, rotlayout, liveuppdateringar och inaktiva knappar stöder samma regel även
för direkta länkar, gamla flikar, omladdning och återinloggning. Databasen spärrar
handlingar oberoende av gränssnittet.

public.hospital_patients är en begränsad publik projektion med karaktärs-ID, namn och sluttid.
Registrerade spelare får läsa aktuella patienter; kontodata, stats och saldon publiceras inte.
Anonyma besökare och anonyma auth-konton saknar åtkomst. Klienter får inte skriva till listan.

list_hospital_patients returnerar `gameplay.harbor.pageSize` namn per sida i stabil alfabetisk ordning och filtrerar
bort utgångna vistelser med databastid. Därför försvinner även offlinepatienter i rätt tid
utan bakgrundsjobb. Profilen hämtar aktuell plats och Hospital-deadline genom
get_character_status. Den äldre get_hospital_status finns kvar för kompatibilitet.
Privata karaktärsvärden exponeras inte.
Ägarens hälsa sparas vid nästa serveråtkomst. Realtime, närmaste utskrivning,
fokus/återanslutning och reservkontroll uppdaterar gränssnittet.

## Konfiguration och källor

- [gameplay.json](../config/gameplay.json): `hospital.durationSeconds` och patientlistans `harbor.pageSize`.
- [hospital.sql](../supabase/templates/gameplay/hospital.sql): auktoritativ logik och RPC.
- [Baslinjen](../supabase/migrations/20260923111042_baseline.sql): kolumner, projektion, RLS och Realtime, ursprungligen från migrationen `hospital_recovery`.
- [hospital-panel.tsx](../src/components/hospital-panel.tsx): nedräkning och patientlista.
- [hospital.test.sql](../supabase/tests/hospital.test.sql): databasregler och behörighet.
- [hospital.spec.ts](../tests/e2e/hospital.spec.ts): webbläsarflöden, PvP och offlineutskrivning.

Configbyten påverkar nya intagningar. En redan sparad sluttid ändras inte.

## Resor och administrativ skada

Avfärd är spärrad under sjukhusvistelsen. Om en administrativ hälsoändring på havet
utlöser intagning avbryts resan och alternativen tas bort. Kaptenen är i hamnen;
intjänad Energy räknas i havets takt fram till intagningen, eller en tidigare faktisk
hemkomst, och därefter i hamnens takt. Detta följer
Hospital-regeln och inför ingen räddningshandling för spelaren. Se [resor](SEA_TRAVEL.md)
och [Energy](ENERGY_RECOVERY.md).

## Meddelanden

Messages och konversationer fungerar under hela sjukhusvistelsen. Spelaren kan
skicka och läsa privata meddelanden utan resurskostnad. Send message finns på
andra spelares profiler. Se [meddelandesystemet](MESSAGES.md).
