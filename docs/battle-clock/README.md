# Battle Clock 2.0

Optional Hybrid Clock inside TabletopHelper. Disabled by default; historical
battles without a clock remain unchanged. The clock never modifies CP, VP,
phase eligibility, scoring, unit state or tournament penalties.

## How to use

1. Local game: select Battle Clock in **Battlefield & Start**. Online: the host
   selects it in the waiting room and presses **Zapisz zegar** before Ready.
   Changing the online clock clears all Ready confirmations.
2. Presets: **Casual** 120 min, **Competitive** 90 min, **Własny limit** a positive
   custom duration (1 second to 7 days, fractional minutes supported).
3. Clocks start **paused**. Close the first-use guide and press **Uruchom zegar**
   when everyone is ready. Setup and the guide do not consume time.
4. New turns automatically select the existing turn owner. Phases do not switch
   the clock. Use **Przekaż czas** for Overwatch, choosing/activating a unit in
   Fight, or longer allocation and model removal. Routine saves can stay on the
   attacker's clock. Handoffs do not change the game turn.
5. Duel: one tap switches to the opponent. FFA: explicitly choose the recipient.
   Doubles: two force-level budgets cover all four commanders; allies share time.
6. **Pauza / Wznów** controls all clocks. Navigation, refresh and disconnect do
   not pause a running clock. The end/abandon action settles final statistics.
7. Collapse the panel to keep controls and the active time compact. On mobile,
   the collapsed panel sticks below the battle header without covering content.
   Space passes time (FFA requires a selected recipient), except in form
   controls, links, buttons, editable content, menus or dialogs.
8. The 15/5/1 minute warnings and expiry are visual. Overtime continues to be
   recorded. Competitive adds an informational message; agree event rules
   yourselves. No gameplay action is blocked by expiry.

## Architecture

- `features/battleClock/model.ts`: pure projections and local transitions. A
  durable anchor, active budget and running flag determine elapsed time. The
  display interval never subtracts time or writes persistence.
- `BattleSession.battleClock`: independent persisted state. `setup.battleClock`
  stores configuration. Rehydration preserves it separately from replaying
  game events; undo never refunds already spent time.
- `battleStore`: follows actual engine changes in turn, round and lifecycle.
  Local actions use the existing serialized persistence queue. Online actions
  cannot mutate this state through the local clock command.
- `social_private.battle_clocks`: one private row per shared room, not exposed
  through PostgREST. No public table grants, RLS enabled. The public RPC is an
  invoker wrapper; a private definer validates the room capability, client ID
  and the existing 256-bit private seat proof before reading enabled clocks or
  changing them. Public participant IDs alone do not authorize changes.
- Host configuration is only accepted before Start. Start initializes the
  budgets **after** roster/team/turn-order freeze, so the actual team topology
  and profile names are used. Sharing an ongoing local battle initializes
  from its current player and round, starting a fresh paused budget at that point. Newly claimed legacy seats also capture the
  existing transport's proof. Authorized stale-seat claims rotate it after
  Start too, preserving the participant primary key and related metadata. Old disabled rooms without proofs stay compatible.
- Commands serialize with Start/turn changes using room and clock row locks in
  the same order. An expected revision makes retries and competing clicks
  idempotent: a stale action returns the canonical state with `applied=false`
  and is not automatically replayed as a different action.
- Server triggers follow actual `TURN_STARTED`, `ROUND_STARTED`, `GAME_ENDED`
  and `GAME_ABANDONED` inserts. Duplicate inserts cannot fire the AFTER trigger.
  Phase events leave manual ownership untouched. Enabled clock turn events
  additionally require the seat proof. Disabled games skip clock locking.
- Server timestamps are sampled after acquiring locks. Rendering uses the
  server sample + `performance.now()` elapsed time and half-round-trip latency
  compensation, so device wall-clock differences do not charge extra time.
- Clock reads share the existing 900 ms synchronization loop. Own commands apply
  the confirmed RPC response immediately; other devices normally update within
  one poll plus network time. Background browser throttling can delay display,
  but not authoritative accounting. Returning to the app resynchronizes it.
- While disconnected, controls are disabled and time is shown as an estimate;
  the server keeps counting. Clock commands are never queued for later replay.
- Chronicle gets one expandable statistics section; the report, Markdown,
  JSON and Print/PDF contain totals, rounds, remaining time, handoffs and
  overtime. Clock clicks produce no Combat Log/Chronicle event stream.
- Copy is Polish by default, in keyed PL/EN dictionaries. The repository has
  no global localization service; `clockCopy(locale)` is ready for one.

## Database rollout

Apply `supabase/migrations/20261025174428_battle_clock_2.sql`, then
`supabase/migrations/20261025181032_battle_clock_restore_and_current_turn.sql`
before deploying this branch (shared schema version 11). It is additive and preserves existing
battles; it does not enable clocks in existing rooms. New frontend builds fail
preflight clearly if the backend migration is missing. Do not run the base
`shared_sessions.sql` again against existing rooms.

## Verification

Validation covers unit tests, 13 browser scenarios, PostgreSQL integration,
TypeScript, production build and whitespace checks. The existing multi-device
board and official FFA scenarios use the current explicit legacy-sharing flow.

- Unit tests: full five-round Duel through the real engine; phase vs turn
  changes; Overwatch and repeated Fight handoffs; explicit FFA recipients;
  shared Doubles budgets; pause/resume; active reload; expiry and overtime;
  final reports; real store and IndexedDB persistence; online local-mutation guard.
- `npm run test:sql`: real embedded PostgreSQL, executing unchanged migrations,
  grants, RPCs and triggers. Checks host-only setup, Ready invalidation, forged
  client/proof/room rejection, stale CAS commands, persisted reconnect anchors,
  no log spam, phase independence, duplicate event delivery, final freeze and
  FFA/Doubles topology.
- `e2e/battle-clock.spec.ts`: Chromium phone and desktop contexts, actual UI,
  separate storage and one real PostgreSQL backend behind the HTTP fixture.
  Covers handoffs, four-hour device-clock skew, simultaneous requests, offline
  recovery, active refresh, pause, first-use guide, FFA/Space, expired limits,
  disabled games, Chronicle and reports.
- Repository checks: `npx tsc --noEmit`, `npm test -- --run`, `npm run test:sql`,
  `npm run build`, `git diff --check`, relevant existing Playwright scenarios.
  The repository does not define a lint script or ESLint configuration.

Physical phones and hosted-network latency should still be checked through the
Vercel preview before merging. All players in a clock-enabled room should use this build;
older frontends do not submit clock turn proofs. The browser tests use real PostgreSQL but mocked
HTTP/Auth delivery rather than a hosted Supabase project's Auth service.
