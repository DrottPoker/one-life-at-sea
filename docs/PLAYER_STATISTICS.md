# Admin player statistics

`/admin/players` combines community statistics and the searchable player directory.
Only current administrators can read aggregate statistics and directory RPCs. No auth
admin key is sent to the browser, and neither endpoint returns emails, IPs or tokens.

## Definitions

- **Total players** counts existing characters with a registered, nonremoved account.
  The card also reports accounts and accounts without a character.
- **Active players: 24 hours / 7 days / last month** counts unique existing accounts
  that signed in or used an existing authenticated session in the rolling interval.
  Each account counts once, regardless of repeat logins, tabs, devices or visits.
  A month uses a calendar-month interval, not a fixed 30 days. This is not an online-now
  count. Admins and registered accounts without a character are included.
- **New accounts** counts registrations in the rolling interval, including subsequently
  removed accounts whose creation was recorded. Anonymous accounts are excluded.
- **Last month**, **12 months** and **All time** select the chart period. Month and year
  charts cover UTC dates after the corresponding date one or twelve months ago through
  today. All time begins at the first known registration. Today is partial.
- Charts show new accounts, end-of-interval account totals, and unique active accounts.
  They are daily up to 500 days. Longer histories use consecutive intervals, each
  spanning `ceil(days / 500)` days. Chart titles, captions and inspected date ranges
  identify this grouping. No dates are discarded. Unique accounts are deduplicated
  across every day of each interval, never summed from daily unique counts.
- The period summary counts each active account once across the entire selected
  period, even when it appears on many chart days. It retains subsequently removed
  accounts. Current-account cards exclude removed accounts. There are no login-event
  counts or online-now estimates in this dashboard.

Statistics refresh each minute in a visible tab and support manual refresh. Failed
reads retain the previous figures with a warning. Captions identify the displayed
period while another selection loads. Charts support mouse, touch and keyboard.
Directory search does not filter game-wide statistics. The directory filters and
sorts by last activity, with deterministic pagination of 50 players.

## Activity collection and history

Auth registration/sign-in triggers record an account's latest known activity and
upsert one activity row per account and UTC date. Repeat sign-ins update the row,
without counting additional players. Signup's automatic sign-in is included.

`usePlayerActivity` runs inside the authenticated app shell. Opening or returning to
an existing session records activity; visible pages also check once per minute.
Hidden or closed pages do not continually generate activity. No extra game actions,
resource changes, refresh flashes or online-now UI are introduced. Errors are silent
and retry on the next check. Requests time out after ten seconds and are aborted on
sign-out or unmount. The server throttles writes to once per minute across tabs,
except when the UTC date changes or today's row is missing.

`record_player_activity()` accepts no account or timestamp arguments. The server
uses `auth.uid()`, server time, a live nonanonymous/nonremoved account and a matching
unexpired `auth.sessions` row. Revoked or foreign sessions cannot report activity.
Only the authenticated caller's timestamps can change. Private tables have RLS and
no client grants. Admin reads still check live membership on every request.

Full daily activity coverage starts at
`private.player_statistics_config.activity_tracked_since`. Earlier chart days are
null, not zero; the first tracking day/interval is partial. Known latest sign-ins
are imported into latest activity for recent cards and whole-period unique totals.
Those earlier totals are incomplete because continuing sessions were not previously
recorded. No daily activity is invented from an account's latest timestamp.

Registration history begins with accounts that existed when registration monitoring
was installed. Previously deleted accounts cannot be reconstructed. New registrations
and removals are retained thereafter. Hard deletion clears the Auth ID while keeping
timestamp-only history. Soft-deleted accounts leave current totals and the directory.
The retired `player_sign_ins_daily` table is retained privately for migration safety;
it no longer receives events or feeds the dashboard. Config migrations preserve the
tracking start, recorded activity and account history.

## Verification

Canonical SQL: `supabase/templates/gameplay/player-statistics.sql`.

- Database tests cover admin/privacy boundaries, repeated sign-ins, continuing and
  foreign sessions, account deduplication across days, period bounds, long all-time
  history, unknown days, account removal and membership revocation.
- Browser tests exercise actual Auth signup/sign-in/refresh, restored sessions,
  period switches, chart keyboard access, failed reads, search and responsive layouts.
- Test cleanup removes only owned disposable accounts and their analytics rows.
  Real account deletion continues to preserve aggregate history.
