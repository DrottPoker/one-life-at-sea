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

Inga avgifter, ränta, väntetider eller Energykostnader. Aktiva angripares befintliga
hamnspärr gäller även banken. Patienter i [Hospital](HOSPITAL.md) kan varken sätta in
eller ta ut pengar. En försvarare kan använda banken tills hen besegras. Sjukhusvistelse
ändrar inte något av guldsaldona.

Items, material, consumables och nya sätt att tjäna pengar ingår inte i detta steg.
Marketplace är fortsatt en platshållare. Kommande köp måste kontrollera och debitera
gold_coins i en databastransaktion; de får aldrig summera in bank_gold_coins eller
automatiskt ta pengar från banken.

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
