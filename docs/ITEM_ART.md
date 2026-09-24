# Itembilder

Skapade 2026-09-19 med det inbyggda image_gen-verktyget. Sex nya, egna
illustrationer för inventory. Torns bilder har använts som UI-referens i planen,
inte som bildfiler i spelet.

Originalen kopierades oförändrade till public/images/items/ och behåller sin
transparens. De är 1254 x 1254 px. Next Image levererar storleksanpassade versioner.
Ingen CLI-/API-reservlösning användes.

## Gemensam produktionsprompt

Byt [SUBJECT] mot den exakta motivtexten för respektive fil nedan:

```text
Use case: stylized-concept. Asset type: individual pirate game inventory item illustration. [SUBJECT] Realistic painterly 3D game prop render, detailed believable materials, restrained colors, soft studio lighting from upper left. Square composition, centered item occupies about 78 percent of canvas with generous clear margins. Truly transparent background with alpha, no backdrop or floor, no cast shadow beyond the object, no scenery, no frame, no text except subtle compass markings if relevant, no watermark. Readable silhouette at small thumbnail sizes, polished enough for a large item detail panel.
```

## Motiv och slutliga filer

- [cutlass.png](../public/images/items/cutlass.png): One weathered steel pirate cutlass with a gently curved blade, brass hand guard and dark leather grip. Entire sword shown diagonally from lower left handle to upper right blade tip.
- [cannon.png](../public/images/items/cannon.png): One short naval iron cannon on a compact weathered oak four-wheel gun carriage, viewed three-quarter from the side. Entire object fully visible.
- [bandages.png](../public/images/items/bandages.png): One small rolled linen bandage with a loose folded end, and a second tidy folded linen pad beside it. Eighteenth century medical supplies, clean cream cloth.
- [tonic.png](../public/images/items/tonic.png): One squat emerald green glass apothecary bottle with cork stopper and a small plain unmarked parchment label. Subtle amber liquid visible.
- [timber.png](../public/images/items/timber.png): Three weathered oak shipbuilding planks bundled with a simple hemp rope. Entire bundle fully visible at a three-quarter angle.
- [compass.png](../public/images/items/compass.png): One open brass mariner's compass with a dark face and a simple clear compass rose, lid hinged behind it, viewed three-quarter above.

Utrustningen som tillkom 2026-09-24 (Flintlock Pistol, fyra rustningsdelar, Oak Hull Sheathing och
Heavy Canvas Sails) använder tills vidare den gemensamma platshållarbilden. Se [utrustning](EQUIPMENT.md).

Bildernas användning och itemkatalog beskrivs i [Inventory](INVENTORY.md).
