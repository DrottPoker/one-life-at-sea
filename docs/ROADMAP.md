# Framtida funktioner och öppna beslut

Detta dokument samlar kvarstående riktning. Det är inte en beskrivning av levererad funktion eller ett uppdrag att införa allt nedan. Aktuellt läge finns i [Status](IMPLEMENTATION_STATUS.md).

## Befintliga ytor som väntar på funktion

- Inventory har läsning, handel, Trash, Equip och Unequip. Use och aktiva itemeffekter kräver egna spelregler.
- Utrustningens Temporary-plats och kultyper är implementerade. Sällsynthet och bonusar är uppskjutna.
  Källor för munitionen (butik, crafting eller loot) återstår. Se [utrustning](EQUIPMENT.md).
- Hideout har Crafting; Cooking och hemuppgraderingar är ännu framtida funktioner. Mat ska ge Crew Morale,
  inte hälsa (ägarens beslut 2026-09-25).
- Shipyard är en platshållare. Fler aktiviteter på havsplatser, PvE och intjäningssystem behöver design.
- Fraktionsmedlemskap, behörigheter och utskick till hela fraktionen är inte implementerade. Kraven på beständiga batchade utskick finns i [Brevpost](MESSAGES.md).

## Forum

Forumets första och andra etapp finns, se [Forum](FORUMS.md). Ägaren godkände 2026-09-25 att resten byggs i etapper: Torns styrkor tas med och Torns svagheter får egna lösningar.

- Etapp 3, trygghet och karma, krävs före offentlig drift: rapportknapp med moderatorskö, forumavstängning med tidsgräns, notisen `forum.moderation`, spelarmoderatorer som admin utser och ihopfällda inlägg från spelare på ignore-listan. Karma följer Torn: minsta inläggslängd, ingen karma i låsta trådar, Graveyard eller Trading Post, nya karaktärers röster räknas inte, ett tak per författare och dygn och aldrig under noll. Nya karaktärer kan inte rapportera under sina första 24 timmar.
- Karma vid radering (ägarens beslut 2026-09-25): ett raderat inlägg räknas som en helhet. Låg det totalt på minus står minuset kvar; låg det på plus försvinner plusset. Raderingen tar bara bort innehållet för spelare, så moderatorer kan fortfarande granska inlägget.
- Etapp 4, senare: besättningsforum när fraktioner finns, modererade av besättningens ledare. Omröstningar, "Popular threads", signaturer, bilder via Storage med moderering och notiser som delas ut i bakgrunden om prenumerationerna växer.

## Beslut som ska bevaras

Permanent karaktärsdöd har ersatts av [Hospital](HOSPITAL.md); historiska dödsförslag ska inte återinföras som om de vore aktuella.
HP-progression finns genom Crew Battling och Ship Battling, se [Skills](SKILLS.md#combat-xp-and-battling-health).
Återhämtningen är en andel av maxhälsan per intervall, se [Combat](COMBAT_SYSTEM.md#hälsa-och-återhämtning).
Guldbyte från PvP, särskilt boarding, är en framtida mekanik och finns inte i nuvarande stridsutfall.

Hunger och andra offlineberoende system behöver fortfarande avgöranden om tempo och frånvaro.
Äldre diskussioner innebär inte ett krav på daglig inloggning.

## Före offentlig drift

Hosted miljö, produktionsmejl, redirectinställningar, driftsövervakning och belastning måste kvalificeras i den verkliga målmiljön. Lokala godkända tester är inte en produktionsverifiering.

Se [arkiverade planer](archive/README.md) och [träningsresearch](research/TRAINING_BALANCE_RESEARCH.md) för beslutsbakgrund. Funktionsdokument och aktuell kod gäller framför ersatta förslag.
