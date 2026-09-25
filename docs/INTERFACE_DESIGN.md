# Nautical interface foundation

The September 2026 owner-supplied mockup is a visual reference, not a new feature
specification. Existing game behavior, route loading, travel locks and authoritative
resource/economy state remain in place.

## Frame and artwork

- The centered game frame is at most 1240px wide, with a 232px desktop sidebar.
- `public/images/harbor-background.webp` is an optimized copy of the owner's
  `ChatGPT Image 21 sep. 2026 03_31_20 (1).png` (1672 x 941).
  The original file in Downloads is unchanged.
- At 21:00-06:00 UTC, the backdrop uses the supplied matching night artwork
  in `public/images/harbor-background-night.webp` (1672 x 941, 341932 bytes).
  Server time selects the first render and an open page changes automatically.
  See [day and night](DAY_NIGHT_CYCLE.md).
- A decorative fixed `body::before` layer draws the background behind the frame.
  The document has a single scrollbar; the game content moves and the scenery
  stays in place. No scroll listeners, parallax script or nested game scroller.
- Below the wide breakpoint, the decorative backdrop is omitted to prioritize
  content. The compact layout uses the full screen with a three-column navigation.
- The existing local harbor illustration remains the welcome artwork: 180px
  desktop, 140px compact. Slimmer header/caption padding gives the image
  24px more space on desktop and 20px
  on compact screens, preserving the card's total height and text wrapping.
  Other short banners and authentication artwork keep their own height rules.

## Visual language

Deep navy surfaces, warm gold accents, cyan links, thin borders and restrained
serif headings follow the supplied reference. Dense tables, forms and item
details retain sans-serif text. The harbor welcome header and caption use the
same navy surfaces as the surrounding panels; the owner removed the parchment
bands above and below the artwork on 2026-09-21.
The captain's identity and live resources share one sidebar card. A vector anchor
emblem provides a neutral placeholder for future supplied character artwork.
Crew Morale shares this card with Energy and health. Its bar has a fixed midpoint
at zero, green fill to the right for positive values and coral fill to the left
for negative values. A signed one-decimal value and an accessible meter expose
the exact state. The four resource bars form a two-by-two grid on mobile.

Resource descriptions appear in short tooltips on hover, keyboard focus or touch.
The tooltip stays open when hovered and can be dismissed with Escape or an
outside tap. Desktop hints sit beside the bar; mobile hints open above it.
Recovery text and next-tick timestamps are omitted from the card. Server deadlines
still drive automatic resource updates. Health hints reflect combat and hospital
recovery rules; morale shows the current stats and training effect.

Harbor departures stay prominent below the compact welcome card. The captain
directory and harbor destinations sit side by side on wide screens, then stack
at narrower widths. Marketplace is correctly labelled Open.

There are no placeholder messages, quests, daily objectives, market quotes or
other invented data from the mockup.

## Links and names

Links and linked player names never use text underlines, including hover, focus,
active and visited states. This applies across authentication, gameplay, notifications,
combat reports and administration. Text-style buttons follow the same convention.
Links retain their existing colors, hover feedback and visible keyboard-focus outlines.
Keep this rule in the shared interface template and the admin stylesheet.

Profile headings use a compact bold `Name [ID]` with a 12px live presence dot before
the name. A subtle vertical gradient darkens the lower edge for depth in every
status color. Presence is shown by the dot, with a tooltip and accessible label, instead
of a separate detail row. Long names wrap without splitting the bracketed number.
The Players directory shows names without separate public number badges.
The connection indicator and unread notification dots share the same shading.
Read notification markers remain transparent.

## Maintenance

Edit `config/theme.css` for palette, typography, frame size, sidebar width,
banner height and the day/night background image paths (`--o-background-image`, `--o-night-background-image`).
Edit `config/interface.css.template` for component layout, then run
`npm run config:sync`. Do not hand-edit the generated stylesheet.
Shared rendering is in `shell.tsx`, the game layout and `resource-bars.tsx`.

Future 2D artwork can be added without rebuilding the navigation or game logic.
Keep original uploads intact and use optimized local assets for the application.

## Verification

`tests/e2e/design.spec.ts` covers fixed scenery versus scrolling content,
compact banner height, responsive overflow, live resource visibility and
navigation through inventory, market, crew and ship views. Screenshots are
written to ignored `.local/design-*.jpg` files for visual inspection.
Existing interaction suites cover the underlying functionality.

## Combat presentation

The attack route has its own navy-and-brass frame, separate from the administrative
frame. It retains the fixed harbor backdrop on wide screens and has no regular
game navigation during combat.

- `CombatHeading` shows Energy, the current participant's phase and round, and
  the server-anchored order deadline. The timer uses the existing countdown hook.
- `CombatStage` is shared by preparation and active combat. Own and opposing
  captain panels flank the artwork on desktop. The artwork moves above the two
  panels below the combat breakpoint; mobile order buttons stack vertically.
- `public/images/combat-sea-broadside.webp` and `combat-boarding-duel.webp` are the
  owner's 1774 x 887 scene artwork (2026-09-24): two pirate ships in side profile, and
  two duelists on a boarding plank. The attacker is always drawn left, the defender
  right. New artwork gets a new file name so image caches never serve the old version.
- The artwork doubles as the hit display (`CombatScene`). The viewer's latest own round
  plays on it: cannon fire, Chain Shot, Grape Shot, melee, firearm, Grenado and Smoke Pot
  each have their own effect built from square pixels. Damage rises from the impact, and a
  label under the struck side keeps the result until the next round. The label is text on
  the artwork, not a box: the zone in small caps in the display serif, then the damage as a
  larger number in the result's colour (red, gold for a critical hit with a gold Critical in
  front, white Blocked, blue Blinded, grey italic Miss), over a soft shadow with a thin rule
  in the same colour fading out beneath. On scenes narrower than 420 px each label keeps to
  its own edge. Misses splash beside the ship, are parried between the blades, or land
  beside the target. The attacker's strike plays first, then the defender's.
- A hit lands at a random spot inside the struck zone's area, such as any sail for Sails
  and rigging or either leg for Legs, and the effect plays there. The spot is seeded by the
  round, so a reload shows it in the same place. Every strike leaves a small reticle like
  Torn's that locks on where it landed: red for damage, gold for a critical hit, white for a
  blocked hit, blue for Smoke Pot and grey for a miss. Misses land around the target rather
  than in one spot: cannon shot in the water along the ship's side, off the bow, behind the
  stern or farther out; firearm shots in the space around the captain (above the head, beside
  the head and waist, between the legs); swings are either parried between the blades, with
  sparks, or dodged beside the captain; throws land along the plank. Earlier
  strikes of the viewer's rounds in the same phase stay as smaller rings with a dot in the
  same colours, fading with age, on whichever side they were aimed at.
- Only rounds that arrive while the page is open animate; a reload shows the marks and
  labels still. A round that changes phase finishes on its own artwork before the new phase
  fades in. Other attackers' rounds stay in the log.
- Effects use small pixels (about 10-14 artwork pixels, 3-4 on screen) so they match the
  artwork's detail; blasts are dense clouds that are hottest in the middle. Damage numbers
  rise just after and above the impact so the blast stays visible.
- The round that ends the encounter plays out in full. 0.5 seconds after its effects fade
  (`FINALE_DELAY` in `combat-scene.tsx`) the artwork darkens, the VS badge fades out and a
  centered box shows the outcome (Victory, Defeat, You withdrew or Draw) with a Leave button
  that takes focus. The combat log opens only when the player chooses Leave; the order panel
  and the heading's back link are gone meanwhile. When the final round is not new to this
  view, such as another attacker's final blow, the box follows after the same short pause.
- The caption under the artwork states the round in words, for example "Round 3: You hit
  their sails and rigging for 12 and slowed their ship. Bo missed.", and is announced
  politely to screen readers. XP from the round shows in the shared XP drop, described below. With reduced motion, marks and labels appear without effects.
  The VS badge sits in the sky at the top center, clear of the effects.
- Hit areas (one or more ellipses per zone, deck, splash and landing spot) and anchor points
  for guns, hands and labels live in `src/lib/combat-scene-anchors.ts`, in the artwork's own
  pixels. Recalibrate them when the artwork changes; unit tests check that every configured
  hit zone has an area inside the artwork and that hits always land inside it.
  `src/lib/combat-scene.ts` turns a round into strikes, labels and the caption. Effect
  colors are the `--o-fx-*` tokens in `config/theme.css`.
- The scene follows the current attacker's authoritative phase, including a
  return to sea after Disengage. It does not infer phase from the last clicked
  button or another attacker's phase.
- Health, equipment and the relevant ship/crew stats remain visible. Opponent
  stats and ammunition remain concealed; opponent equipment is unknown before
  joining. The pennants are decorative neutral icons, not player/faction data.
- Primary attacks use gold, boarding/disengagement blue, and retreat muted red.
  All controls retain text labels, keyboard focus, pending states and disabled
  ammunition/start conditions. Boarding offers Crew attack, Disengage and Retreat.
- The compact log and people panels keep timestamps, contributions, participant
  conditions and profile links.
- The combat log reads as a timeline in both the attack view and the public report: a
  marker per entry on a vertical line (flag for the start, ship for cannon combat, crossed
  swords for boarding, heart for hospital), blue or gold headings by phase, and each order
  as aligned captain, order and result columns. Hits are gold, criticals bold gold, misses
  and blocked hits muted, and the deciding entry is highlighted. Narrow screens put the
  captain on its own line and let a long result drop below the order.
- The public report (`/combatlog/<id>`) opens with a banner of the artwork of the phase that
  decided the encounter, the outcome as its headline, who landed the final blow, when it was
  fought and how long it lasted, and Copy public link. Below it the attackers face the
  defender as cards with a VS between them: role, result badge, hits and damage as large
  numbers, and Ship and Crew Health bars after the fight. The full timeline follows without
  an inner scroll, and the PvP survival note closes the page.

Combat artwork is served through Next Image with explicit dimensions and
responsive sizes. No image generation or external asset dependency is required.
Edit the combat colors in `config/theme.css`, then sync generated styles.

The existing `tests/e2e/combat.spec.ts` exercises preparation, both phase images,
real orders, reloads, public reports and widths from 320 to 1680px. It writes
ignored `.local/attack-*.jpg` screenshots. With guaranteed hits it checks the scene's
zones, labels and caption for chain, grape, grenado, pistol and melee strikes and the
boarding hand-over, and freezes the round animation to write `.local/scene-*.png` frames.
The combat action-lock suite covers
defender restrictions independently of the presentation.

Stamina appears after Energy in the condition sidebar, using a green track and the same accessible
hover/focus/touch tooltip as the other resources. Its tooltip shows only the recovery rule and purpose.

Profiles display public Character Level alongside Player ID. Only the owner receives the
Skills section: seven compact cards with level, XP and progress to the next level, in two
columns on desktop and one on mobile. Maxed skills display Maximum level. Crew Battling and
Ship Battling add a row with their maximum health bonus and what the next level adds. Other players
receive neither these cards nor their underlying private data.

The XP drop is a RuneScape-like card at the bottom right: a brown stone panel with a dark rim
and a light bevel, the skill icon in a round badge, the skill name in orange, the gain in large
yellow text with a short pop, a green bar on dark red, and the level, total XP and XP to the
next level in white with a one-pixel black shadow. A level-up adds a yellow line and a pulsing
badge. The card slides in, stays for five seconds and fades; a new gain replaces it. It ignores
the pointer, and reduced motion keeps only the fade. Its colours are the `--o-xp-*` tokens in
`theme.css`. See [Skills](SKILLS.md#xp-drop) for when it appears.

Activities is a sidebar destination and a harbor directory entry. Three rows show a themed
icon, description, skill level/XP progress, reward and action button. Desktop uses a three-column
row; mobile places the action below the details. Result text stays inline with reserved space.
Normal activity requests use the existing journal without flashing the recovery banner.

Admin now has task-oriented navigation, overview shortcuts, an item catalog and dedicated item/loot/activity forms. Loot preview shows percentages per successful catch. Responsive cards, readable field labels and grouped database resources replace the database-first starting point. Review screens show human-readable values with technical JSON collapsed. In-flight admin saves do not show the recovery banner.


## Crew Training, September 23

The owner's night training-deck banner and four transparent gold icons are optimized
WebP assets in `public/images/training/`. The original supplied artwork is unchanged.
A panoramic header leads into the live six-part overview and four colored stat cards.
The same configured Energy cost appears discreetly inside each card. Cards show current
stats and text-only Train buttons, without gain previews. Each card has an inline live
result above its button, reserved to avoid layout movement. Confirmed server receipts
supply actual gains and Perfect Drill outcomes. Pending/error/retry feedback stays in the
same card, with no shared training result panel. No Energy selector or batch quantity is
introduced. The economy journal continues to lock all drills during an unresolved request.
Compact card spacing puts Energy directly below the description with a 5px gap. Stat
art is 98px; confirmed gains use prominent 20px semibold green text. The result slot
keeps the buttons aligned without adding blank space before the Energy cost. Since
September 24 every card row has a fixed size, so a result never changes the card height: the
description reserves two lines, the result slot is a fixed 38px single line (gain text
scales with the page and truncates, pending/error text clamps to two lines), stat values stay
on one line, a Perfect Drill shows as a badge in the card corner and a retry button replaces
the Train button. Crew and ship cards therefore measure the same at every width. Matching
18px corner accents frame all four corners.

Drill Schools displays all ten configured tiers with active, owned and locked states,
percentage progress and the next available purchase. The highest purchased tier remains
automatically active. The adjacent guide uses the real Energy, morale and Perfect Drill
settings. Stable training forms retain pending locks, purchase results and retry recovery.
Container breakpoints change four cards to two, then one, and collapse the overview and
schools without horizontal scrolling.

## Ship Upgrades, September 24

Ship Upgrades uses the Crew Training layout through shared components in
`src/components/training/training-layout.tsx` and `training-tiers.tsx`, with the generic
`o-training-*` classes. The header, overview, stat cards, Shipyard Workshops and guide
mirror the crew page. Both pages build every card body with `TrainingStatBody`: a cost note,
the reserved one-line result slot and the card action, so all cards keep one height in every
state. Ship stat cards are selectable radio cards; the Work Order below holds the Energy
slider, gain preview, materials and Start work. During a job the card for that stat shows
the expected gain in its result slot and the countdown in place of the button, and the Work
Order is replaced by the running job.
The artwork currently reuses the crew training images as placeholders, defined in one
constant in `ship-upgrade-panel.tsx`.

## Page banners, September 24

The Harbor, Hideout, Crew Training, Ship Upgrades, Activities, Inventory, Hospital, Tavern,
Bank and Marketplace open with the same banner (`PageHero` in `src/components/page-hero.tsx`, classes `o-page-hero-*`):
artwork, the page's `h1`, a short lead and an icon. The banner has one fixed height (158px, 168px
on narrow containers) on every page and is its own size container, so it looks the same inside
and outside the training layout. The banner replaces the former panel title on those pages, and on The Harbor it replaces the
former welcome art panel (the "Welcome ashore" greeting is now the banner lead);
`Panel` renders without a title bar when none is given. Marketplace keeps its link row below the
banner on every marketplace route. Pages without dedicated artwork use `PLACEHOLDER_HERO`
(`public/images/headers/harbor-placeholder.webp`, the owner's harbor scene re-encoded to about
295 KiB) and their navigation icon; replace the `image` prop per page when final art exists.
