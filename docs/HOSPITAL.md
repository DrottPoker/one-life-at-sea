# Hospital

Implementerat lokalt 2026-09-19. Detta ersätter idén om hardcore och permanent karaktärsdöd.

## Spelregler

- Hospital finns i Harbor-panelen och visar alla aktuella patienter, även utloggade spelare.
- Noll Crew Health skickar karaktären till Hospital, oavsett om orsaken är PvP eller annan skada.
- Noll Ship Health innebär att besättningen också dör: Crew Health sätts till 0.
- Vistelsen är fem minuter i utvecklingsversionen, styrd av hospital.durationSeconds (300).
- Karaktären kan inte träna crew, starta skeppsarbete, köpa nivåer, sätta in eller ta ut pengar,
  ändra försvarsorder eller attackera under vistelsen.
- Patienten kan se sjukhussidan, läsa patientlistan, besöka sin egen och andra spelares profiler och logga ut.
  My Profile fungerar under hela vistelsen, och patientnamnen länkar till profilerna.
  [Inventory](INVENTORY.md) får läsas, filtreras och öppnas via direktlänk. Trash är spärrat.
  Medicinsk itemanvändning kommer i nästa etapp; Use är ännu inaktivt.
  Andra spelare kan inte attackera patienten.
- Profilen visar Hospital, In hospital och en nedräkning för alla inloggade spelare.
  Statusen uppdateras vid intagning och försvinner efter utskrivning, även för offlinepatienter.
- Efter sluttiden skrivs karaktären ut automatiskt med full Ship Health och Crew Health.
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
strider och skriver ut förfallna patienter. private.assert_can_act kontrollerar nya
bank-, tränings-, uppgraderings-, nivåköps- och försvarshandlingar. Stridsstart och
order har motsvarande spärr. Klienten kan inte ändra sjukhustid eller anropa privata
utskrivningsfunktioner. Återspelning av ett redan sparat transaktionskvitto gör ingen ny handling.

Om en framtida extern skadeorsak slår ut en deltagare mitt i en strid avslutas mötet som
oavgjort och låsen släpps; ingen påhittad PvP-seger tilldelas. Rapporten anger sjukhusintagning.
Vanliga PvP-segrar behåller befintliga regler för final blow och assist. Vid ömsesidig
utslagning hamnar båda på sjukhus även om angriparen får final blow.

## Åtkomst och patientlista

Proxy använder get_navigation_lock och prioriterar Hospital framför ett stridslås.
Profiler är tillåtna läsvyer under sjukhusvistelse; övriga sidlås och databasens handlingsspärrar kvarstår.
Servervyer, rotlayout, liveuppdateringar och inaktiva knappar stöder samma regel även
för direkta länkar, gamla flikar, omladdning och återinloggning. Databasen spärrar
handlingar oberoende av gränssnittet.

public.hospital_patients är en begränsad publik projektion med karaktärs-ID, namn och sluttid.
Registrerade spelare får läsa aktuella patienter; kontodata, stats och saldon publiceras inte.
Anonyma besökare och anonyma auth-konton saknar åtkomst. Klienter får inte skriva till listan.

list_hospital_patients returnerar 20 namn per sida i stabil alfabetisk ordning och filtrerar
bort utgångna vistelser med databastid. Därför försvinner även offlinepatienter i rätt tid
utan bakgrundsjobb. get_hospital_status läser samma RLS-skyddade projektion för en profil
med sluttid och databastid som enda fält. Privata karaktärsvärden exponeras inte.
Ägarens hälsa sparas vid nästa serveråtkomst. Realtime, närmaste utskrivning,
fokus/återanslutning och reservkontroll uppdaterar gränssnittet.

## Konfiguration och källor

- [gameplay.json](../config/gameplay.json): hospital.durationSeconds.
- [gameplay.sql](../supabase/templates/gameplay.sql): auktoritativ logik och RPC.
- [hospital_recovery.sql](../supabase/migrations/20260919052625_hospital_recovery.sql): kolumner, projektion, RLS och Realtime.
- [hospital-panel.tsx](../src/components/hospital-panel.tsx): nedräkning och patientlista.
- [hospital.test.sql](../supabase/tests/hospital.test.sql): databasregler och behörighet.
- [hospital.spec.ts](../tests/e2e/hospital.spec.ts): webbläsarflöden, PvP och offlineutskrivning.

Configbyten påverkar nya intagningar. En redan sparad sluttid ändras inte.
