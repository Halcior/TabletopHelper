# Cloud Media + Lobby-first online setup (PR #37)

## Online user flow

1. Select **Online multiplayer** and a format (Duel 1v1, FFA 3, Doubles 2v2).
2. Pick the shared rules preset and select **Create lobby** directly on the format step. There is no separate pre-lobby player-name, Force Disposition or turn-order wizard.
3. Host shares QR/invite/code. Players claim seats and submit their own rosters; their account nickname is resolved from their Supabase profile.
4. Every relevant player selects Force Disposition for their own seat. In Doubles the team captain sets it for the force.
5. In the waiting room the **host-only panel** sets the whole turn order with up/down arrows. In Doubles the host chooses Team Alpha's partner (the two scoring captains remain on opposing teams); this determines both team rosters. Save resets all players' Ready.
6. Every commander stages their own roster and marks Ready. Once all are present and ready, host starts; the server freezes the roster, account display names, Force Dispositions, teams and turn order into the same canonical snapshot. Initial TURN_STARTED and TURN_SNAPSHOT_CAPTURED events are rewritten consistently to support event-sourced reconnect.
7. Existing local wizard and legacy multiplayer sharing a running local battle remain unchanged.

**Compatibility:** The existing battle creation engine still needs a temporary army to initialize a waiting room. The online path constructs an in-memory dummy CHARACTER for this purpose if the host has no saved roster; temporary units/armies are removed from the published room. No actual battle is saved until Start.

**Doubles design limit:** The two designated team captains remain on opposing teams; the host can assign the other two commanders to either force. Swapping captain identities or changing four-seat format after room creation is not yet supported.

## Cloud Media

Private Supabase Storage bucket `army-media`, 2 MB per object, WebP only. Paths are `<owner UUID>/<roster UUID>/<SHA256(slot)>.webp`; no unsafe raw unit names in object paths. Authenticated owner may upload/update/remove. An accepted friend may download only when that exact roster is marked **Share with Friends** and still exists. No global public read policies or service-role credentials.

Custom banner and portrait uploads retain their IndexedDB offline copy and queue a best-effort private cloud upload. The Account screen includes **Sync my existing photos** to backfill older device-only media without overwriting newer files. Friend-shared army viewers resolve the owner's cloud namespace and use a private authenticated Storage download with thematic fallback.

**Scope:** Cloud imagery from a friend is visible while viewing the friend's shared roster. Unauthenticated guests and non-friends do not receive private Storage objects. The battle snapshot intentionally contains no public media URL; displaying a friend's own custom images on *other* players' battlefield cards or copying their artwork into a new roster requires an explicit separate permission/projection workflow and is not yet implemented. Photos are excluded from JSON exports.

## Deployment

Requires additive migrations:

- `supabase/migrations/20261022142000_cloud_army_media.sql`
- `supabase/migrations/20261022142100_host_lobby_settings.sql` (schema version 9)

**Do not replay v7 or v8 historical migrations.** Schema v9 must be deployed to the connected Supabase environment before the new online setup works. No new deployment secret is required; Supabase Storage remains private.

Test two signed-in browsers with different rosters and profile names. For Doubles test two captains, swap the two partner seats, reverse team turn order, ensure everyone must Ready again, Start, and reload clients to verify setup and first-turn event consistency. For photos, have A upload an army banner and portrait, share only that army with B, verify B sees both after refresh; ensure stranger C cannot access them and friendship revocation/Make Private immediately revokes new cloud reads. Confirm guest/local/offline still work.
