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
