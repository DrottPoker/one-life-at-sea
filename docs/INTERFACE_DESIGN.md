# Nautical interface foundation

The September 2026 owner-supplied mockup is a visual reference, not a new feature
specification. Existing game behavior, route loading, travel locks and authoritative
resource/economy state remain in place.

## Frame and artwork

- The centered game frame is at most 1240px wide, with a 232px desktop sidebar.
- `public/images/harbor-background.webp` is an optimized copy of the owner's
  `ChatGPT Image 21 sep. 2026 03_31_20 (1).png` (1672 x 941).
  The original file in Downloads is unchanged.
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

Harbor departures stay prominent below the compact welcome card. The captain
directory and harbor destinations sit side by side on wide screens, then stack
at narrower widths. Marketplace is correctly labelled Open.

There are no placeholder messages, quests, daily objectives, market quotes or
other invented data from the mockup.

## Maintenance

Edit `config/theme.css` for palette, typography, frame size, sidebar width,
banner height and the background image path (`--o-background-image`).
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
- `public/images/combat-sea.webp` and `combat-boarding.webp` are optimized copies
  of the owner's `skepvs.png` and `voardingvs.png`. Both retain their 1774 x 887
  dimensions and full composition. The original uploads are unchanged.
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
  conditions and profile links. Public reports retain their existing layout.

Combat artwork is served through Next Image with explicit dimensions and
responsive sizes. No image generation or external asset dependency is required.
Edit the combat colors in `config/theme.css`, then sync generated styles.

The existing `tests/e2e/combat.spec.ts` exercises preparation, both phase images,
real orders, reloads, public reports and widths from 320 to 1680px. It writes
ignored `.local/attack-*.jpg` screenshots. The combat action-lock suite covers
defender restrictions independently of the presentation.
