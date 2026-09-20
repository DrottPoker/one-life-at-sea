# Gold Coins och banken

Implementerat lokalt 2026-09-19.

## Spelarens pengar

Gold Coins är spelets valuta. Varje karaktär har två separata saldon:

- Gold Coins på karaktären visas som en siffra ovanför Energy, Ship Health och Crew Health.
- Gold Coins på banken visas på Bank-sidan i The Harbor.
- Endast karaktärens saldo är tillgängligt för köp. Bankpengar måste tas ut först.
- Nya karaktärer börjar med 0 på karaktären och 0 på banken, enligt ägarens beslut.
- Befintliga karaktärer får dessa nya saldon utan ändrade stats, resurser eller historik.

Bank finns i hamnmenyn och hamnens lista över platser. Sidan visar båda saldona,
ett beloppsfält och knapparna Deposit och Withdraw. Hela eller delar av tillgängligt
saldo kan överföras direkt. Endast positiva heltal accepteras.

Inga avgifter, ränta, väntetider eller Energykostnader. Både aktiva angripare och
försvarare spärras från överföringar. Försvarare kan fortfarande läsa sina saldon;
öppna formulär låses när attacken börjar. Patienter i [Hospital](HOSPITAL.md) kan varken
sätta in eller ta ut pengar. Sjukhusvistelse ändrar inte något av guldsaldona.

På [Marketplace](MARKETPLACE.md) används enbart burna Gold Coins. Ett köp debiterar
köparens gold_coins och krediterar säljarens gold_coins efter 5 % försäljningsavgift.
Avgiften räknas på en listings sammanlagda försäljning, avrundat nedåt, så delade
köp inte ändrar totalavgiften. Pengar, items och kvitto sparas atomiskt. Varken
bank_gold_coins eller Energy debiteras för köp, publicering eller återtagning.

## Beständighet och transaktioner

public.characters har gold_coins och bank_gold_coins som bigint. Båda är
icke-negativa och begränsade till JavaScripts säkra heltalsområde. De befintliga
ägarskydden gäller: andra spelare ser inte saldona och klienten kan inte skriva dem.

public.transfer_gold(direction, amount, request_id) använder registrerat konto
för att hitta rätt karaktär. Privat serverlogik kontrollerar riktning, heltalsbelopp,
plats, stridslås, källsaldo och destinationsgräns. Båda saldona ändras i samma
transaktion under projektets befintliga ordnade deltagarlås.

private.bank_transfers sparar kvittot per karaktär och request-ID. Ett upprepat
anrop returnerar samma kvitto utan en ny överföring. Samma ID med ändrat belopp
eller riktning nekas. Kvittot och pengarna sparas atomiskt. Bankvyn återanvänder
request-ID vid ett osäkert nätverksresultat och visar Retry transfer.

get_game_state returnerar aktuella saldon. Ägarskyddade player_game_events signalerar
ändringar till andra flikar. Endast en ändringssignal publiceras, inte bankdata.
Utloggning, omladdning och omstart nollställer inte pengar.

## Konfiguration och källor

- config/gameplay.json: economy.initialGoldCoins och economy.maxGoldCoins.
- Startvärdet gäller nya karaktärer; ändrad config skriver inte om befintliga saldon.
- Bankens startvärde är 0. En sänkt maxgräns som krockar med sparad data avvisas.
- supabase/templates/gameplay.sql: serverregler, saldoläsning och konfigurerade gränser.
- src/lib/bank.ts: beloppsvalidering, formattering och banktyper.
- src/app/bank-actions.ts och src/components/bank-panel.tsx: formulär och serverhandling.
- src/app/(game)/harbor/bank/page.tsx: banksidan.
- src/components/resource-bars.tsx: karaktärens saldo över mätarna.

Strukturen infördes i 20260919010606_add_gold_coins_and_bank.sql.
Den genererade gameplaymigrationen är 20260919010900_central_gameplay_config_6f7dc499f0c0.sql.
Historiska migrationer och befintliga karaktärer har bevarats.

Verifieringsresultat finns i [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).

Banken kräver hamnposition. Under hela [havsvistelsen](SEA_TRAVEL.md), inklusive
ut- och hemresa, är både insättning och uttag spärrade även via RPC.

## Beständiga återförsök

Ekonomihandlingar sparar request-ID före anropet och kan återhämtas efter
omladdning eller navigation. Olösta handlingar visas som **Unconfirmed action**
och kontrolleras med **Check saved action**. Samma karaktär måste vara inloggad.
Se [ekonomigranskningen](ECONOMY_AUDIT.md) för skydd, tester och avgränsning.
