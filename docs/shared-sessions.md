# Shared sessions MVP

The first shared-session milestone keeps the existing event-driven Battle Engine and adds a network replication layer around it.

## What works in this milestone

- One device hosts an existing active battle.
- Host chooses which player seat belongs to that device.
- A six-character room code is generated.
- Two other devices can find the room and claim the remaining player seats.
- New battle events are uploaded to the shared room and polled by every connected client.
- Remote clients rebuild the local BattleSession from the creation snapshot plus server-ordered events.
- Presence heartbeats show roughly how many commanders are connected.
- Phase progression follows the active player seat: each commander advances their own turn from their own device.
- The host retains battle lifecycle administration (end / abandon) but cannot drive another player's normal phase flow.
- Each commander manages their own CP controls in shared mode.
- Reaction-window USE / PASS controls belong to the responding player's device; the other devices show a waiting state.
- Local IndexedDB persistence remains active on every device.
- If polling temporarily fails, local changes remain visible and publishing/polling retries.

This version intentionally uses the Supabase REST API with ~900 ms polling instead of adding a large realtime SDK. The `SharedSessionTransport` interface is isolated so it can later be replaced with Supabase Realtime/WebSocket without changing the Battle Engine or UI flow.

## Supabase setup

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

The SQL policies are deliberately permissive for private tabletop testing. They must be replaced with authenticated/capability-validated mutations before a public production deployment.

## Test on three phones on one Wi-Fi network

On the development PC:

```powershell
npm run dev -- --host 0.0.0.0
```

Use `ipconfig` to find the PC IPv4 address, for example `192.168.1.50`, then open on each phone:

```text
http://192.168.1.50:5173
```

Windows Firewall may ask to allow Node/Vite on private networks.

### Flow

1. On the host device, create/import armies and start a normal Cauldron battle.
2. Open **Shared**.
3. Select the host player's seat and choose **Create shared room**.
4. Give the room code to the other two players.
5. Each guest opens **Shared**, enters the code, chooses an available player seat, and joins.
6. Open the battle on all devices.
7. On Player A's turn, verify only Player A has the active `Next phase` control.
8. Finish Player A's turn and verify phase ownership moves to Player B's phone, then Player C's.
9. Verify each player can change only their own CP from the scoreboard.
10. Open a reaction window and verify only the responding player gets USE / PASS controls.
11. Test objective control, casualties, Secondary progress and Stratagem use across all devices.

## Current multiplayer constraints

- The active player owns normal phase progression; host-only administration is limited to ending or abandoning the shared battle.
- Undo/redo is disabled in shared sessions because event deletion is not yet represented as a synchronized compensating event.
- CP and reaction controls now have client-side ownership, but the rest of the battle-state permissions are still cooperative. Server-side authorization comes later.
- Objectives remain intentionally shared-edit state for now.
- Army casualty/wound ownership is not yet enforced; the UI still allows cooperative corrections where the existing tracker exposes them.
- Seat claims are persisted in the backend and stale seats can be reclaimed after disconnect.
- The room stores a creation snapshot plus all later materialized Battle Events. Long-running room snapshot compaction is a later optimization.

## Next multiplayer milestones

1. Make each phone open its own army/personal status by default while still showing shared battle context.
2. Add own-army state ownership with an explicit host/admin correction path.
3. Replace polling with realtime push while keeping the same transport contract.
4. Add synchronized compensating undo.
5. Delegate special decisions such as Rival target selection directly to the responsible player's phone.
6. Add QR/deep-link room joining.
7. Harden backend policies before any public deployment.
