# Shared sessions MVP

The shared-session layer keeps the existing event-driven Battle Engine and replicates its materialized events between player devices.

## Current behavior

- One device hosts an existing active battle and claims one player seat.
- A six-character room code is generated for the table.
- Two other devices can claim the remaining player seats.
- New Battle Events are uploaded to the shared room and consumed in server sequence order.
- Remote clients rebuild the local `BattleSession` from the creation snapshot plus canonical events.
- Presence heartbeats show which commander seats are currently active.
- Phase progression follows the active player seat: each commander advances their own turn from their own device.
- The host retains manual battle lifecycle administration (end / abandon) but cannot drive another player's normal phase flow.
- Automatic `GAME_ENDED` produced by finishing the final turn is allowed for that active commander even when they are not the host.
- Each commander owns their own CP, army state, Mission Actions, active-turn Secondary decisions and Stratagem use.
- Shared objective control remains intentionally writable by any seated commander because it represents common board state.
- A unit owner can record their own casualty even when that same physical action automatically awards an opponent Secondary; the derived scoring stays in the same canonical action group.
- Reaction-window USE / PASS belongs to the responding player device.
- Priority Target's final Rival choice may be made by the responsible Rival rather than the card owner.
- The host can record exact CP, score, unit, and objective corrections for any commander; every correction requires a reason and remains visible in the canonical log.
- Any commander can export a diagnostic JSON without exposing the room code, persistent client ID, or backend row identifiers.
- Undo/redo remains disabled in shared rooms until synchronized compensating actions exist.
- Local IndexedDB persistence remains active on every device.

This version intentionally uses the Supabase REST API with ~900 ms polling instead of adding a large realtime SDK. The `SharedSessionTransport` interface is isolated so it can later be replaced with Supabase Realtime/WebSocket without changing the Battle Engine or UI flow.

## Identity and backend protection

The browser keeps a persistent client ID. Mutating REST requests carry both `x-room-code` and `x-client-id`. Supabase RLS binds writes to the claimed participant row:

- an event write must identify the same player seat in `actor_player_id` and the event payload;
- the participant's room, client ID and player ID must match the request;
- only the host client identity can update room lifecycle state;
- only the host participant can publish a `STATE_CORRECTED` event;
- an active player seat cannot be silently taken by a different device;
- a stale non-host seat can be reclaimed after the presence timeout;
- the host seat is not automatically transferred to a different browser identity.

The app also enforces the same ownership boundaries in the Battle Store before local state is committed. UI disabled states are therefore guidance, not the only permission boundary.

Room-code access is still capability-style private-play protection rather than user authentication. A public production service should add authenticated player identity or a stronger server-side room secret.

## Offline and reconnect behavior

Temporary network loss does not discard local battle events. They remain in the local persisted session and in the pending publish queue. When the browser comes back online, the client retries the same event IDs; the backend's `(room_id, event_id)` uniqueness makes retries idempotent.

If the browser closes while changes are still offline, restoring the saved shared membership compares the local event history with the original room snapshot and reconstructs retry candidates. Canonical polling results are deduplicated by server sequence. Async results from an old room/sync generation are ignored after disconnecting or switching rooms, so a late request cannot overwrite a newly joined session.

## Supabase setup

For a new project:

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/shared_sessions.sql` from this repository.
4. Copy `.env.example` to `.env.local`.
5. Fill in:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

6. Restart Vite after changing environment variables.

For an existing development database, apply the repository migrations instead of rerunning the bootstrap schema blindly.

## Test on three phones on one Wi-Fi network

On the development PC:

```powershell
npm run dev -- --host 0.0.0.0
```

Use `ipconfig` to find the PC IPv4 address, for example `192.168.1.50`, then open on each phone:

```text
http://192.168.1.50:5173
```

Windows Firewall may ask to allow Node/Vite on private networks. The app uses a portable RFC 4122 UUID fallback because `crypto.randomUUID()` may be unavailable on a phone opening a plain LAN HTTP address.

### Functional test flow

1. Host a Cauldron battle and join all three player seats.
2. Verify only the active commander can advance phases and their turn.
3. Verify every commander can adjust only their own CP and army state.
4. Let Player B record one of their own units destroyed by Player A and verify Player A's qualifying automatic Secondary is still scored and synchronized.
5. Change objective control from a non-active phone and verify every device receives it.
6. Open a reaction window and verify only the responsible player can USE / PASS.
7. Put one guest phone offline, record an allowed local action, restore connectivity and verify the action appears once on all devices.
8. Repeat the previous test but close/reopen the guest browser before reconnecting; verify the persisted event is retried.
9. Try to claim an occupied seat from another device; it should remain unavailable while presence is fresh and become reclaimable after the stale timeout for a non-host seat.
10. Finish the last player's final turn with a non-host active commander and verify automatic battle completion succeeds.
11. From the host phone, correct another commander's CP and verify the reason, exact value, and log entry synchronize to all devices.

## Current multiplayer constraints

- Room access is not tied to user accounts; possession of the room code grants read capability and the seat-claim flow grants a player capability.
- Undo/redo is disabled in shared sessions.
- Objectives are intentionally shared-edit state.
- Host transfer to another browser/device is not implemented.
- The room stores a creation snapshot plus later Battle Events. Snapshot compaction is a later optimization.
- Polling is deliberately simple; realtime push can replace the transport later.

## Next multiplayer milestones

1. Add a synchronized compensating-action model for shared undo.
2. Add browser-level multi-context coverage on top of the deterministic three-client convergence test.
3. Add QR display to the existing deep-link invite flow.
4. Consider realtime push after correctness testing proves the event model.
5. Add authenticated identity / stronger room capability before treating the service as public production infrastructure.
