# Friends, shared armies and Bring Your Army

## User flow

1. Sign in using the existing Account screen. Player Profile creates a backend-generated 128-bit friend code, with an editable display name and optional initials. Copy this code for another commander. Display names need not be unique.
2. Open **Friends**, enter the exact friend code and send a request. The recipient accepts or declines in Incoming Requests. Requests can be cancelled; accepted friends can be removed after confirmation. Reciprocal requests remain one pending relationship until the recipient explicitly accepts.
3. In **My Armies**, choose **Share with Friends** for an individual synced roster. Every existing/new/imported/copied roster defaults to **Private**. Sharing changes access metadata, not roster contents or revision. Select **Make Private** to revoke future reads.
4. **Friends → View Armies** opens a read-only viewer: faction, detachment, points, models, leaders, Warlord and imported equipment/abilities/enhancements. Private and deleted lists are excluded. Local photos are not uploaded; the existing faction artwork is used. Missing importer data is not invented.
5. In New Battle, choose the format/rules and enable **Each player chooses their own army in the lobby (Bring Your Army)** before creating the lobby. The host needs only their own saved list; the setup form can reuse that list for the provisional seats. None of these placeholder rosters is sent to the room. Existing shared play with host-selected rosters remains available when this option is off.
6. The host shares the existing QR/code, or selects a friend in the lobby and presses **Invite to Game**. Friends also exposes Invite to Game when a waiting host lobby is open. Incoming invitations appear in Friends with Join/Decline; senders can cancel them there.
7. Join revalidates the invitation, then opens the existing seat picker. Invitations never claim a seat automatically. Each commander selects their own saved army, then marks Ready. Guests use the local library; signed-in commanders select a roster synced to their account. Changing the submitted selection clears Ready. Identical retries preserve Ready.
8. The host starts only after every required seat is online, ready and has an army. The server freezes those rosters into the room creation snapshot. Every client reprojects state from that exact setup. Library edits/deletions, sharing revocation and loss of friendship cannot change a started battle.

Duel has two seats, FFA three, and Doubles four with the existing two force memberships/shared turns/CP/VP. Army IDs are namespaced by seat to support two commanders selecting lists with identical source IDs. Doubles preserves the configured team Warlord if that unit remains in its selected army; otherwise the server chooses a staged Warlord/CHARACTER in that force (deterministic preference for an explicitly marked Warlord). A team with neither is blocked at Start. Team composition/eligibility remains the players' responsibility.

## Architecture and security

- Existing Supabase Auth, `user_armies`, Dexie account scopes, outbox/CAS/revisions, tombstones and guest storage are unchanged. No parallel account system or second persistent library exists.
- `player_profiles` stores public identity fields only. Direct profile reads are owner-only. Exact code lookup and friendship roster access use the RPC projection; no email search or global user directory exists.
- `friendships` uses an ordered `(user_a,user_b)` primary key and a sender/status pair. An advisory transaction lock serializes all transitions for one pair. Only the recipient can accept; direct relationship writes are not granted. Duplicate/reverse requests do not create two friendships or implicitly accept.
- `army_sharing` is per-owner/per-army metadata with a composite FK to the existing private roster. It defaults to private when no metadata exists. It does not rewrite the versioned roster. No friend SELECT/UPDATE/DELETE policy is added to `user_armies`.
- `social_action` is an invoker wrapper; the definer implementation is isolated in the non-exposed `social_private` schema with an empty search path, explicit `auth.uid()` checks and narrow EXECUTE grants. Shared DTOs exclude roster revision/mutation/tombstone metadata, local photo namespaces and importer source metadata. Anonymous and anonymous-Auth identities cannot call social actions.
- `game_invites` is scoped to sender/recipient plus an existing host room capability and an accepted friendship. Requests are idempotent for a room/sender/recipient. Invitations expire after two hours; cancelled, declined, unfriended, started or closed lobby invitations fail resolution. The normal room-code/QR capability remains a separate, intentional joining path: cancelling a social invitation cannot make an already-disclosed room code unknown.
- Account requests capture the owner's JWT and set Authorization explicitly. A generation guard rejects late results after sign-out/account changes, including A → B → A. Social data never enters IndexedDB/localStorage/service-worker caches. Shared-army screens discard data when refreshing, offline or denied; unmount/account change discards the entire view. Network refresh is 15 seconds plus manual refresh, visibility return and reconnect. Revocation is immediate at the database; an already-open screen learns remote changes on its next refresh.
- A BYA room opts into `bring_your_army`; legacy rooms retain `false`. `shared_rosters` is temporary room-owned staging, not a library. No direct roster write grants exist. `stage_shared_roster` verifies room code, claimed client/seat, waiting status and input. Authenticated requests additionally read only the caller's non-deleted cloud roster and reject a selection that changed during sync. Guests submit their validated local roster over the existing private-room capability.
- Room-row locking serializes selection/readiness/start. A seat change clears the old seat's staged selection and readiness. Backend triggers block Ready without a roster and battle event publication before a BYA start. The existing dynamic 2/3/4-seat start trigger remains in place.
- A server trigger constructs `setup.players`, `setup.armies` and valid Doubles Warlord references before the first Start. Direct replacement of a BYA snapshot, resetting Start or switching protocols is rejected. Clients rehydrate the final setup and preserve canonical event replay/reconnect. Combat event authorization is unchanged.
- Host departure closes a waiting BYA lobby; guest departure clears readiness/presence and the existing reclaim rules apply. A temporarily offline commander blocks Start through the existing server presence window. Host transfer is still unsupported.

## Migration and controlled deployment

New migration:

```
supabase/migrations/20261022082448_friends_shared_armies.sql
```

It creates four social tables, the `shared_rosters` staging table, the optional `shared_rooms.bring_your_army` column, constrained RPCs and lobby guards. It does not delete existing data or change the private `user_armies` policies, CAS RPC or existing battle event policies.

Before implementation, connected project `mingpauhiknymgdprsxq` migration history was inspected read-only. Its latest recorded migration was `20261021125543_enforce_roster_mutation_inputs`; Army Library and four-seat Doubles migrations are present. Some older remote names/timestamps differ from the repository, as already documented for Army Library. Do not blindly replay or push the entire historical migrations folder.

**This change does not apply the migration to production.** For an actually usable hosted preview, first apply only the reviewed new migration to a disposable/staging Supabase project containing the existing schema. Keep `social_private` out of the Data API's exposed-schema list. Run the rollback-only role test against that staging database. Point this branch's Vercel Preview variables at that staging project and rebuild. A Preview using the current unmigrated production project can render the existing app but cannot exercise the new social/BYA endpoints.

Existing account setup still applies: public Supabase URL/publishable key, email provider/SMTP/template, and exact `/account` redirect URLs including the chosen preview. No new secret/service-role key, bucket, OAuth provider or push service is required. Real email delivery/login and hosted PostgREST behavior must be smoke-tested on staging; local tests do not prove those deployment settings.

Once staging is accepted, the owner can schedule the same additive migration for production, then deploy the branch. Do not merge automatically.

## Verification

Commands:

```sh
npx tsc --noEmit
npm test -- --run
npm run test:sql
npm run test:e2e
npm run test:e2e:offline
npm run build
```

- `supabase/tests/friends_shared_armies.sql` provisions A/B/C inside a rollback-only transaction, then executes client operations using the actual `authenticated`/`anon` roles. It checks profile isolation, code lookup/uniqueness, fake/self/duplicate/reverse requests, recipient-only acceptance, cancel/reject/remove, private/Friends access and revocation, no direct writes, metadata minimization, guest and authenticated staging, selection retries/readiness, premature Start, immutable snapshots and invitation resolution/revocation.
- `npm run test:sql` runs this SQL and the unchanged migration bodies in PGlite, an actual embedded PostgreSQL engine with grants/RLS/triggers/PLpgSQL. Only the Auth JWT GUC helpers are supplied by the fixture. This is not a mocked JavaScript permission check, and it is not a test of a deployed Supabase service. The same SQL file can be run using `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/friends_shared_armies.sql` on disposable Supabase/Postgres.
- New browser scenarios route app HTTP requests into those same SQL/RLS/RPC bodies with the caller's real PostgreSQL role. Auth email delivery and the PostgREST HTTP adapter are test fixtures. They cover two separate signed-in contexts, profile editing, accepted friendship, read-only viewing/revocation, game invitation, Duel/FFA/Doubles selections, readiness invalidation, snapshot convergence, reconnect, offline event retry, library edits/deletion after Start and 375/390px layouts. Screenshots are saved to `test-results/` for inspection.
- Unit tests exercise captured-token requests using the real Supabase SDK fetch wrapper, account-switch races, rejected data after sign-out, shared DTO validation and provisional/final snapshot transport behavior. Existing battle/offline/multiplayer tests remain regression coverage.

## Boundaries

No public rosters, chat, push notifications, global directory/rankings, army marketplace, photo cloud sync or shared editing are added. Copying a friend's roster into the library is intentionally omitted (optional scope). BYA remains opt-in for compatibility. Historical/local battles and legacy shared rooms continue using their previous flow. Friend access is online-only; guest libraries and private account caches retain existing offline support. Staging and snapshots deliberately grant the private room's participants access to selected battle rosters independently of future friendship/library visibility.
