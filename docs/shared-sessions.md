# Shared sessions MVP

The first shared-session milestone keeps the existing event-driven Battle Engine and adds a network replication layer around it.

## What works in this milestone

- One device hosts an existing active battle.
- Host chooses which player seat belongs to that device.
- A six-character room code is generated.
- Two other devices can find the room and claim the remaining player seats.
- New battle events are uploaded to the shared room and polled by every connected client.
- Remote clients rebuild the local BattleSession from the host snapshot plus server-ordered events.
- Presence heartbeats show roughly how many commanders are connected.
- The host owns phase progression and battle lifecycle controls.
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
7. Test CP changes, objective control, casualties and Stratagem use.
8. Advance the phase on the host device and verify all guests follow within roughly one second.

## Current multiplayer constraints

- Host is the only device allowed to advance phases, end the battle or abandon it.
- Undo/redo is disabled in shared sessions because event deletion is not yet represented as a synchronized compensating event.
- Player permissions are currently cooperative: clients can still edit shared battle state where the normal UI allows it. Server-side authorization comes later.
- Seat claims are persisted in the backend; stale-seat takeover/explicit server-side leave is a follow-up task.
- The room stores a creation snapshot plus all later materialized Battle Events. Long-running room snapshot compaction is a later optimization.

## Next multiplayer milestones

1. Replace polling with realtime push while keeping the same transport contract.
2. Add synchronized compensating undo.
3. Add explicit permissions: own army/CP, reaction ownership, host/admin override.
4. Improve presence and stale-seat reclaim.
5. Add QR join links.
6. Add reconnect diagnostics and conflict telemetry.
7. Harden backend policies before any public deployment.
