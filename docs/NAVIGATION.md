# Navigation and loading

The game changes its main content area as soon as a normal game link becomes
pending. It does not wait for the next server response to show feedback. The harbor
menu immediately selects the destination, keeps its icons visible and remains
usable. The previous page is hidden and inert while the content loader is visible.

## Implementation

- `src/components/game-navigation.tsx`: provider, Next.js link wrapper, optimistic
  menu path and content switch. Only the active link can clear pending state.
- `src/components/content-loading.tsx`: shared loading status and refresh hold.
- `src/components/game-refresh.tsx` / `app-frame.tsx`: defer background updates
  while a navigation or loading boundary is active.
- `(game)/layout.tsx`: keeps the sidebar, resources and economy request journal
  mounted across game views.
- `src/lib/supabase/server.ts`: shares one authenticated client within a server
  render using React cache, without sharing sessions across requests.

Use `GameLink` for links inside the game shell. It preserves Next.js Link props,
prefetch choices, Ctrl-click, keyboard activation, redirects and browser history.
Outside the game provider it behaves as a regular Next.js Link. The content switch
does not unmount old components before the router commits; pending economy actions
can still record their result. The durable economy journal also survives navigation.

## Cache and freshness

The router reuses layout segments, downloaded code and prefetched loading boundaries.
Dynamic private data is not assigned an arbitrary cache lifetime. Inventory, Gold
Coins, market stock, hospital state and combat locks still use current server checks,
mutation invalidation, realtime notifications and fallback reconciliation.

React cache here is scoped to a server render. It is not a global authenticated
client, a cross-user response cache or a change to the proxy's private no-store
headers. Independent server checks run in parallel, while state-changing reads
still wait for authentication and gameplay revision validation.

Automatic prefetching is a production feature. Development mode on localhost also
pays compilation costs, so compare actual navigation speed using a production build.

## Regression coverage

Navigation tests deliberately hold server responses, including all prefetch responses
for a cold route. They check content-only loading, stable menu icons, immediate
destination selection, keyboard interruption, late responses, Ctrl-click and profile
links. Existing coverage checks sidebar/resource identity, focus refresh during
navigation, browser back/forward, mutation freshness, direct deep links, mobile
overflow and reduced motion.

The shared layout and server client affect all game features, so changes require
the full browser suite in addition to lint, types, unit tests and build. Run results
are recorded in `IMPLEMENTATION_STATUS.md`.
