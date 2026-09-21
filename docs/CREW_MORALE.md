# Crew Morale

Implementerat och verifierat lokalt. Ägarens regler, 2026-09-21:

- Crew Morale börjar på 0 och ligger mellan -100 och +100, med högst en decimal.
- Bara Crew Training förbrukar moral: 0,5 per Energy, alltså 2,5 per vanligt pass.
- Moralen före passet ger en linjär bonus från -5 % till +5 % på träningsökningen.
  Permanent stat ger grundökningen; moral räknas en gång på hela normalökningen.
  Perfect Drill tillämpas därefter. XP och Energykostnad ändras inte.
- Attack, Defense, Speed och Accuracy för Crew får samma linjära -5 % till +5 %
  i strid. Värdena sparas när deltagaren går in i mötet. Ship och hälsa påverkas inte.
- Var femte serverminut (:00, :05, :10 och så vidare, UTC) flyttas moralen 5 mot 0,
  utan att passera 0. Regeln gäller alla platser, under strid och offline.
- Tavernans måltid ger +25 moral för 1 000 Gold Coins på karaktären, utan Energy.
  Resultatet stannar vid +100. Fullt pris gäller nära taket; vid taket nekas köp.
  Hamnposition krävs och strid/Hospital spärrar nya köp.
- Sidopanelen visar en bar med 0 i mitten, positiv fyllning åt höger och negativ åt vänster.

## Server och lagring

Moralen lagras som exakt numeric med kontroll för en decimal och ett separat
morale_updated_at. Snapshot-beräkningen räknar passerade UTC-gränser, oberoende
av tidpunkten för senaste handling. Inga cron-jobb eller massuppdateringar behövs.
Servern returnerar morale_next_at; klienten hämtar nytt servervärde vid gränsen.

Träning sparar moral före/efter och multiplikator tillsammans med sitt kvitto.
Tavernköp har egen privat kvittojournal, beställnings-ID och förväntat erbjudande.
Databaslås serialiserar köp, träning och stridsstart. Samma ID återger originalkvittot
utan ny kostnad eller moraländring. Den gemensamma klientjournalen bevarar
tavernbeställningen vid tappat svar, navigation och omladdning.

Befintliga karaktärer får neutral moral. Permanenta stats, pågående skeppsjobb,
strider och historiska kvitton bevaras.

## Verifiering

Tester omfattar ticks före/exakt på/efter gränsen, båda tecknen, neutralvärde,
offline, precision, tak, idempotens, samtidighet, behörighet, stridssnapshots,
tavernans pris och klientåterförsök. Barens riktning och mobilutseende kontrolleras.
Aktuella körresultat finns i [implementationsstatus](IMPLEMENTATION_STATUS.md).

Admin kan ändra crew_morale med en decimal. Ett sådant ingrepp loggas och
sätter ett nytt checkpoint; fasta tickgränser behålls. Aktiva strider spärrar
adminändringen enligt befintlig regel. Taverns kvitton kan granskas men inte redigeras.
