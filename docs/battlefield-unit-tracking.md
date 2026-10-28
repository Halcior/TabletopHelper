# Battlefield Unit Tracking & Tactical Replay 1.0

Open **Objectives → Tactical Map → Enable Unit Tracking**. Existing and new battles remain opt-in; no complete deployment is required. Tracking does not validate movement, range, line of sight, Reinforcements, scoring or objective control.

## Playing

- Expand **Deployment & Reserves** and select an Unplaced or In Reserves unit. Drag with a mouse, or tap once to select before a touch drag. **Move unit** followed by a map tap and coordinate inputs provide alternatives. Arrow keys move a focused token by 1% of the displayed map; Shift uses 5%.
- **Unplaced** means no recorded position, not an automatic Reserves assignment. **Return to Reserves** and **Set as Unplaced** remove the current marker without destroying models. Actual destruction/restoration comes from Combat Log and existing correction controls.
- Icons are 24px with 44px interaction targets. Duplicate names receive ordinal suffixes. Nearby units form a count badge with a bounded, scrollable selection list. Display offsets leave objectives accessible; small dots and dashed guides identify saved locations. Offsets never modify stored positions.
- Army visibility, labels, selection, rotation and playback are local display settings. Player colours distinguish all four Doubles commanders. The tray is collapsible and bounded on mobile.
- Disabling tracking clears active positions but preserves recorded history. Re-enabling does not backfill positions. Restored units return to Unplaced for explicit placement.

## Architecture

`GameState.unitTracking` is optional for backward compatibility. `UNIT_TRACKING_CHANGED` and `UNIT_MAP_CHANGED` use the existing engine, action IDs, history, undo/redo, IndexedDB, exports and shared event stream. A map command contains an owner/unit tuple, status, normalized source coordinates and the expected prior revision. One completed gesture emits one event; pointer previews remain local inside `TacticalUnits`, without dashboard/store writes.

The engine rejects unknown units, invalid coordinates and direct placement of destroyed units. Canonical projection ignores a stale revision instead of overwriting an accepted update. Disabling tracking and unit lifecycle changes advance revisions too. Stale commands remain explicitly labelled in history. Reconnect recovers only the restoring seat's own pending events, and retries use existing event IDs. Authorized local commands are attributed to the submitting seat before persistence, including when a non-captain Doubles commander advances a captain's phase. Existing remote history is never reattributed.

`BattlefieldBoard` remains the single board renderer, with a shared map canvas for objectives, terrain and unit overlays. `groupUnitMarkers` and `placeUnitMarkers` operate only in display pixels. The existing quarter-turn/180° transformations convert pointer positions back into source coordinates.

Chronicle adds a **Movement** filter; normal moves stay out of Highlights, while entry from Reserves is highlighted. **Show on Tactical Map** opens the corresponding replay event. Both Chronicle and replay derive combat positions immediately before the real combat event, using the same engine history. Missing positions stay missing. Model losses and eliminations come from the actual before/after combat state; no duplicate destruction event is emitted.

Replay adds Play/Pause, previous/next event, timeline, speed, round jumps and an event picker. Frames include unit state and optional position history. Replay is read-only and never dispatches events. Attack lines and elimination rings use historical positions rather than current markers. Battle Clock is not passed, paused or restarted by map commands.

## Multiplayer and deployment

Each commander controls their own army in Duel, FFA and four-seat Doubles. Allied armies remain read-only. The existing room host can correct positions and toggle tracking. Client authorization and PostgreSQL RLS both enforce this distinction.

Schema **12** requires `supabase/migrations/20261027140525_battlefield_unit_tracking.sql` on the backend used by the preview before online testing. The migration tightens the existing INSERT policy and updates the version RPC; it adds no tables and rewrites no rooms, rosters, events or scores. Older clients ignore the new event types, so all participants in a tracked battle must use this preview/version to see and protect unit positions consistently.

The SQL runner and browser PostgreSQL fixture execute the same migration. Hosted Supabase Auth/PostgREST and physical devices are separate from the embedded PostgreSQL/HTTP-routing fixture; do not represent fixture coverage as live multi-phone verification.

## Validation

- TypeScript, full Vitest suite, PostgreSQL RLS suite, production build and production/offline browser checks.
- Unit coverage: legacy saves, coordinate validation, deployment/reserves/unplacement, persistence reconstruction, undo/redo, model destruction/restoration/corrections, historical combat positions, source/display transforms, stale revisions, deduplication, concurrent different units, team ownership and unchanged scoring/clock state.
- Browser coverage: desktop and touch dragging, single-event commits, rotation, refresh, historical combat/replay controls, 60 duplicate-name units on an objective, exact saved coordinates, bounded group selection and phone layouts.
- Three independent browser clients cover FFA synchronization, opponent read-only controls, offline movement, reload and a lost acknowledgement without duplicate events.
- Duel and four-seat Doubles browser flows use actual PostgreSQL policies/RPCs through the existing fixture, including concurrent positions, per-army ownership and reconnect. The non-captain Doubles seat advances a phase offline, reloads while event uploads remain blocked, then reconnects with exactly one canonical phase event.

Before a real game, open the same preview on two/four physical devices; deploy one unit each, enter from Reserves, rotate one view, disconnect/reconnect one phone, record casualties, then inspect the combat event in replay. Confirm objective taps and scrolling on the actual touchscreens. No physical-device benchmark or automatic rules validation is claimed.
