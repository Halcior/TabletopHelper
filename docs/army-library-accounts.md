# Army Library 2.0 — deployment and verification

## What changed

`/armies` is the standalone roster library. Import New Recruit or a TabletopHelper JSON backup; open, edit, duplicate, rename, export, delete and use a list in battle. Search, faction filtering, sorting and sync status work on mobile and desktop. `/account` adds optional Supabase email login, an email-code entry form, session restoration, sign-out and explicit guest-roster migration. Google is shown only when explicitly enabled after provider configuration.

The editor works with the existing `Army` / `UnitDefinition` types. It changes names, limits, supported detachment names, model-group counts, custom unit points, Leader assignments and Warlord. Removing or copying units repairs references; copying a roster remaps its unit IDs and relationships. Unit totals are recomputed. Homebrew stays labelled through copying. Save as copy and Discard changes preserve the original. Invalid or stale saves keep the draft for recovery.

The imported loadout remains available for inspection. Alternative equipment profiles, upgrade prices, datasheet restrictions and enhancement eligibility are not present in the imported selection, so the editor does not invent a loadout catalogue or claim that a list is legal. Change those choices in New Recruit and import a variant. Bundled community detachment names are suggestions, not verification of the current edition.

## Architecture audit and decisions

- Dexie versions 1 and 2 and their existing `armies`, `battles` and `visualMedia` data are preserved. Version 3 adds `accountArmies` and `libraryPreferences`, without rewriting existing armies or battles.
- `src/persistence/storage.ts` owns the database. `features/armyLibrary/repository.ts` is the single roster-access layer used by Home, Import, Library, Editor, Appearance and Battle Setup. Existing persistence imports remain compatible.
- Guests keep stable imported IDs. Each account has a compound `[ownerId+id]` cache key. Import/migration maps a guest ID deterministically to a UUID scoped to that account; `source_local_id` is persisted remotely too, so re-running migration on a second device is idempotent. Matching names never cause a merge.
- A cache record contains both the roster and its durable pending mutation, written atomically. Revisions are server generated; mutation UUIDs make response-loss retries idempotent. The client never uses a device timestamp to choose a winner.
- `save_user_army` checks the expected revision under a row lock. A competing local edit is preserved as an independently identified conflict copy. A stale delete restores the newer cloud version with a review notice; it does not delete that newer edit.
- Deletions are permanent tombstones, retained in the cache and cloud. Physical DELETE is not granted to browser roles. An old device cannot resurrect a deleted ID; recovered edits get a new ID.
- Auth changes switch the active cache scope immediately. Late requests can only acknowledge their captured owner's cache. Local drafts have an account guard. No account cache is implicitly uploaded into another account.
- Guest originals remain in their existing table after migration. While signed into that account the mapped originals are hidden behind the account version; sign out to access the untouched local originals. Explicitly migrating the guest original into a different account is a user-selected action.
- The current account's cached lists remain usable offline, including after a reload with an expired session. Cached identity only chooses local data; it never authorizes a network request. Supabase Auth and RLS still authorize all cloud operations.
- New battle sessions deep-clone selected armies. Existing and legacy battle loading remains compatible. CP, VP, combat and room transport do not query cloud rosters.
- The Auth SDK uses a separate client and storage key. `supabaseRestTransport.ts`, multiplayer capability headers, room IDs, seat ownership and event protocol are unchanged.
- Photos are copied locally and atomically into the new list/unit namespace. Account photo namespaces also include the owner, even if two accounts have the same roster UUID. Photo blobs and local photo namespaces are excluded from cloud writes and JSON exports. No Storage bucket is created.
- Production service-worker installation precaches generated JS/CSS assets, including lazy editor/library/setup routes. Offline navigation works even when a route was not opened before the connection was lost.

## Database migrations

Apply these in order, once:

1. `supabase/migrations/20261021124245_private_user_armies.sql`
2. `supabase/migrations/20261021125543_enforce_roster_mutation_inputs.sql`

The first creates `user_armies`, owner-scoped RLS, the version guard and the invoker-rights CAS RPC. The second enforces a non-null expected revision and rejects a missing JSON roster identity. Both are additive to the existing multiplayer schema. They have already been applied to the connected `mingpauhiknymgdprsxq` project for this preview.

Use a linked Supabase project and its migration tooling after inspecting migration history, or apply the two reviewed SQL files in the SQL Editor in that order. Do not re-run SQL for migrations already recorded in that environment. Existing multiplayer migration filenames differ in places from remote history, so do not blindly push every historical file.

`supabase/tests/user_armies_rls.sql` is a rollback-only integration test. Run as the database owner, for example using psql against a test database:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/user_armies_rls.sql
```

It creates two temporary Auth identities inside the transaction, switches to the real `authenticated` and `anon` roles, and rolls everything back. It checks cross-account SELECT/INSERT/UPDATE/DELETE, owner edits and tombstones, ownership and revision spoofing, malformed input, CAS conflicts, idempotent retries and resurrection attempts. Browser roles intentionally cannot physically delete even their own rows.

## Supabase Auth checklist for the owner

1. In [Auth → URL configuration](https://supabase.com/dashboard/project/mingpauhiknymgdprsxq/auth/url-configuration), set **Site URL** to the real production origin. Add exact redirects ending in `/account` for the production origin, this PR's Vercel preview URL and `http://localhost:5173/account` / `http://127.0.0.1:5173/account`. Add the relevant localhost port if using another port. Prefer exact preview URLs; a wildcard, if needed, must be restricted to this project's trusted Vercel domain pattern.
2. Email authentication and new signups were enabled when checked. Configure SMTP / sender settings for the intended audience; Supabase's default email sender can restrict recipients and rate-limit delivery. Verify the sender and email template before inviting players.
3. The app uses PKCE. Open a Magic Link in the same browser/device where it was requested. For an email code, include `{{ .Token }}` in the Magic Link email template; users then enter that code with their email in **Enter email code**. The code UI cannot make a link-only email include a code.
4. For Google, create a Google Cloud OAuth web client. Configure its authorized origin(s) for the app and the Supabase callback `https://mingpauhiknymgdprsxq.supabase.co/auth/v1/callback` as an authorized redirect URI. Configure consent-screen publishing/test users as appropriate.
5. Enable Google in [Supabase Auth providers](https://supabase.com/dashboard/project/mingpauhiknymgdprsxq/auth/providers) and enter its Client ID and secret there. Keep the Google client secret out of Vite and Git.
6. Only after the provider works, set `VITE_GOOGLE_AUTH_ENABLED=true` for the intended Vercel Preview/Production environment and rebuild that environment. Google was **disabled** on the connected project when checked; the button is hidden by default.
7. Both environments need `VITE_SUPABASE_URL` and a public `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy anon is supported). Never put a service-role or secret key into a `VITE_*` variable. Missing or malformed account configuration leaves the local library usable.
8. Finish a real email login on the deployed preview, confirm a roster appears on a second device, sign out, sign into a different account and verify isolation. Repeat Google login after enabling that provider.

Official references checked for this implementation: [passwordless login](https://supabase.com/docs/guides/auth/auth-email-passwordless), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and the [Supabase changelog](https://supabase.com/changelog).

## Verification evidence

- TypeScript and production Vite build passed.
- Vitest: 602 tests across 71 files passed, including 18 new repository/sync tests.
- New phone browser scenarios cover guest editing and independent copies, JSON round trips, explicit migration, two isolated browser contexts, bidirectional sync, offline edits, session restoration, refresh tokens, sign-out/account switching and invalid login recovery.
- Production-only browser checks use the actual built service worker. Run `npm run test:e2e:offline` to test previously unopened offline routes and an expired account session with cached private rosters.
- `supabase/tests/user_armies_rls.sql` passed against the **real connected database**, using the real database roles. Supabase security advisors returned no findings after both migrations.
- Real database verification covers SQL ownership/RLS, CAS/versioning and tombstones. Browser Auth and two-device sync tests use a deterministic mocked Auth/REST backend. They do **not** prove real email delivery, OAuth setup or production authentication. No real sign-in email was sent during implementation.

Development browser checks run with `npm run test:e2e`. A custom installed Chromium can be selected using `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and optional JSON `PLAYWRIGHT_CHROMIUM_ARGS`; normal CI uses Playwright's installed browser. This execution environment required a packaged Chromium because Playwright's browser-download CDN returned incomplete files.

## Remaining scope

Photo cloud sync, an authoritative datasheet/points catalogue, a complete roster builder, and Bring Your Army inside multiplayer lobbies are separate work. Cloud rosters are polled at 20-second intervals and retried after a local save, manual sync or reconnection; this is not realtime list collaboration. Clearing browser site data deletes guest lists, local photos and pending edits that have not reached the server, so export backups before doing that.
