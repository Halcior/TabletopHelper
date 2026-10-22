# Multiplayer Setup 2.0 — player-owned armies

## User flow

1. Open **New Battle**. The play mode selector is at the top of the setup wizard. **On one device** preserves the existing local workflow; **Online multiplayer** creates a waiting room.
2. In Online multiplayer, the host chooses the format (Duel 1v1, FFA 3 or Doubles 2v2), common rules, slots and battlefield. **The host does not choose the other players' armies**.
3. Select **Create lobby**. The room is not a started battle and does not create a local "recent active battle" entry while awaiting players.
4. Share QR / code or invite friends. Each participant claims their own seat, selects a saved roster on their own device, and clicks **I am ready**. The host also chooses their army in the lobby.
5. Choosing a different roster clears that seat's readiness. The server blocks start until all required seats are online, ready and staged.
6. Host starts; Supabase freezes the **actual** selected armies into a canonical game snapshot. Only then is the resulting battle persisted as playable on clients; combat and reconnect use the existing event transport.

## Compatibility and limits

- Existing local setup, battle saves, previously created rooms, QR invitations and friends remain compatible. The new per-seat settings feature requires additive **schema v8 migration** `supabase/migrations/20261022103500_lobby_player_settings.sql` before clients can create new online rooms. Do not replay v7.
- The old way to share an already-active battle is still available under **Legacy: share an existing local battle** on the Host or Join page.
- For compatibility with the current Cauldron game initializer, creating an online room still needs a single locally saved temporary roster. The host's private placeholder is removed by the room transport before the room is created. Other players' real lists are never selected from the host library.
- Currently, a Doubles lobby's temporary roster must contain a CHARACTER to satisfy the existing game initializer. The server replaces this temporary Warlord with a valid staged army's Warlord/CHARACTER at Start. A future dedicated lobby-draft constructor can eliminate this limitation without weakening battle setup validation.
- In new online official Duel rooms each player chooses Force Disposition after claiming their seat, and the profile nickname is loaded from their network account. In Doubles, each captain chooses one shared disposition for the team. The server freezes these into the setup before Start; clients derive the correct official objective set from the final pairing. Other Primary/Fixed mission choices and team parameters still originate in the host wizard.
- New multiplayer games are always Bring Your Army. Legacy rooms keep their recorded BYA setting.
- Guests can continue to join by room code and choose an army from their local device; account syncing is optional.
- A pending lobby is not an ordinary active battle. Restore it using the saved room membership or room code rather than the battle history list.

## Checks before merge

Run `npx tsc --noEmit`, `npm test -- --run`, `npm run test:e2e`, `npm run test:e2e:offline`, `npm run build` and the existing SQL/RLS regression suite.

Smoke test on physical devices: one host with only Custodes saved, second user with **only Necrons** saved, plus a third Death Guard user for FFA. Create the room, verify that there are no Custodes placeholders visible to guests, have every phone select its own army, confirm Ready and Start, and check all clients have the correct final army and retain it on reconnect. Repeat Doubles with four phones and check force Warlords and the shared team scorekeeper. Test both local creation and legacy resume, and ensure an unstarted lobby does not appear as a started game.
