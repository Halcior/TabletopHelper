# Battle Legacy 4.0 — staged integration

## Audit (2026-11-03)

Baseline: main `8d84c019`; PRs #40–43 merged. #39 `dceb968` remains open.
The integration branch merges #39 into current main; conflicts resolved in CI,
Chronicle, BattlefieldBoard, ObjectivesPanel, BattleDashboard and chronicle domain.
The Battle Focus, Quick Damage, correction guards and read-only Table Mode remain.
No Primary/Secondary/CP/VP/clock formulas are changed.

Hosted Supabase `mingpauhiknymgdprsxq`: `shared_schema_version() = 12`.
History contains `20261031224647_battlefield_unit_tracking`, equivalent to repository
`20261027140525_battlefield_unit_tracking.sql`. Do NOT run it again.

## A — replay

Objectives → Tactical Map retains optional unit tracking. Replay supports event,
round and turn selection, step transport, pause, 1×/2×/4× and recorded highlights.
Highlights include recorded eliminations, objective control, >=5 VP changes,
reserve deployments and the final frame. Restored eliminations and successful
quick-undo actions are excluded from highlights; original events remain in full
history. No position means no invented position or attack line. Unknown attacker
unit never receives a synthetic marker. Offline/reconnect uses #39 revision and
idempotency transport, including its saved-author retry fix.

Physical playtest: all clients must use the same build; test reserves and undo,
retained Secondary rivals, Quick Damage, simultaneous teammates and a reconnect.
Phone tap reach and replay pacing require real-device testing.

This is a review branch. Do not merge automatically.

A validation: TypeScript, 688 Vitest tests, PostgreSQL/RLS suite and production build pass. 11 Playwright integration scenarios pass (map desktop/touch, dense 60-unit grouping, reconnect, Duel/Doubles ownership, Quick Damage, PL/EN and Table Mode). Screenshots inspected.

## B — archive, statistics and rivalries

`/archive` is accessible from Home, navigation and Account. IndexedDB v4 adds a
compound `[ownerId+id]` archive key. `saveBattle` atomically persists the session
and its historical snapshot. All derived results use the original canonical
engine and unit-performance ledger; identities are separate explicit metadata.
Old inline-army snapshots are normalized without rewriting their original save.
Legacy saves belong to the guest device archive; a signed-in user can explicitly
copy that archive into their private account and separately sync it.

Statistics only include completed engine histories containing GAME_STARTED and
GAME_ENDED, valid score participants and finite scores. Format filters are
mandatory. Doubles maps every commander to their force's scoring captain; FFA
results refer to the entire match, never an invented pairwise win. VP difference
uses the highest opposing force score. Rivalries expose actual direct engagements
separately. Unknown unit damage remains null; player-only kills stay player-only.
Identical unit names aggregate within faction; repeated squads count as separate
deployments in recorded survival rates. Missing history is labelled and excluded.

Cloud backup is explicit and owner-private, using accountRequest's captured
identity/token and revision/acknowledgement-safe RPC. Migration
`20261103103209_battle_archive_private.sql` is additive and independent of the
shared-session schema version. RLS blocks other users and anonymous access.
Concurrent archive edits are rejected rather than silently overwritten.

Validation: 697 unit tests including format/tie/partial-history/account isolation;
PostgreSQL tests include private read/write, spoofed owner, stale write and lost
acknowledgement. Mobile browser flow covers archive deduplication, identity
assignment, refresh, no-position replay, FFA filtering, account change and overflow.
Physical playtest: confirm player identity assignments after a real online match.

B backend: additive migration applied after checking deployed history. RLS, owner predicates and anonymous denial verified on hosted Supabase; existing shared schema remains 12. Reopening a finished session withdraws its derived result without deleting its canonical history. Private sync propagates this withdrawal.

Hosted migration history: archive `20261103104136_battle_archive_private`; grant hardening has its own follow-up migration. Hosted default anon privileges are explicitly revoked, in addition to owner-only RLS.
