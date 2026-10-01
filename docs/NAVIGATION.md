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
  while navigation, a loading boundary or a gameplay action is active. Realtime
  events already covered by the current snapshot revision need no extra refresh.
  When the realtime channel connects, the frame reads the stored event revision
  and refreshes only if something changed after the server render; a failed read
  refreshes anyway. It used to refresh on every connect, which cost one full server
  render per page load.
- `src/proxy.ts` / `src/lib/direct-redirects.ts`: full page loads of routes that
  only forward (`/`, legacy `/characters/<uuid>` and `/attack/<uuid>`,
  `/messages/<number>`, `/combat/prepare/<id>`, `/forums/posts/<id>` and
  `/forums/threads/<id>?unread=1`) get a real HTTP redirect before rendering. A
  redirect from inside a page would first stream its loading state. Client
  navigations and Server Actions, which fetch RSC data, still follow the page's own
  redirect, and the pages remain the fallback that shows "not found".
- `(game)/layout.tsx`: keeps the sidebar, resources and economy request journal
  mounted across game views.
- `src/lib/supabase/server.ts`: shares one authenticated client within a server
  render using React cache, without sharing sessions across requests.

Use `GameLink` for links inside the game shell, including the masthead and `Pagination`.
`AppFrame` holds the navigation provider, so a masthead link such as Messages shows the
same loading view and holds background refresh like a sidebar link. It preserves Next.js Link props,
prefetch choices, Ctrl-click, keyboard activation, redirects and browser history.
Outside the game provider it behaves as a regular Next.js Link. The content switch
does not unmount old components before the router commits; pending economy actions
can still record their result. The durable economy journal also survives navigation.

## Player identities

Profiles use `/players/<player-number>` and attacks use `/attack/<player-number>`.
Legacy UUID links resolve to those routes on the server, as HTTP 308 redirects for full page loads. Hospital and sea navigation
allow the directory and numeric profiles under the same rules as existing profiles.
Battle locks carry both the internal target UUID and the public number, so an old
attack link can reach its canonical redirect without a navigation loop.

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

The lightweight navigation RPC still settles due combat, hospital and travel under
the existing locks, without loading full resources, training or combat history.
See [server performance](PERFORMANCE.md) for the broader audit and repeatable measurements.

## Forums

The sidebar **Forums** link and every forum route (`/forums`, `/forums/search`, `/forums/subscriptions`, `/forums/moderation`, `/forums/settings`, `/forums/boards/<id>`,
`/forums/boards/<id>/new`, `/forums/threads/<id>` and `/forums/posts/<id>`) are available in Hospital, at sea and while traveling. The
active-attacker navigation lock still applies. Forum pages are dynamic server renders refreshed by the normal
game refresh; reading a thread is acknowledged only by the mounted, visible page. See [Forum](FORUMS.md).

## Player messages

`/messages` and its compose, mail and ignore routes are available in Hospital, at sea
and while traveling. The existing active-attacker navigation lock still applies. The
masthead provides Messages and Notifications links with unread badges; neither appears
in the location sidebar. Old player-number mail links redirect to Compose.

Mail detail links retain the selected folder, search and page. The shared mail workspace
loads the folder and the requested letter concurrently through owner-scoped RPCs. Reading
an outbox deep link without its folder redirects to its canonical outbox URL. Desktop
keeps the list beside the letter; narrow layouts switch between the list and letter.
Mail-row navigation uses Next links with an inline pending indicator, retaining the
current desk until navigation commits and holding background refreshes during the change.
No mail body is fetched by link prefetch or marked read by a server read. Only the mounted,
visible letter acknowledges reading. See [Messages](MESSAGES.md) for mail behavior.
