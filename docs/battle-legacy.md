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

B review fixes: atomic missing-only backfill cannot revive a withdrawn battle. Sync pulls first, tracks the last acknowledged mutation, refreshes clean records and retains both conflicting versions. Users can choose cloud/local; one conflict does not block other battles. Two transport tests cover a second device edit/withdrawal and both recovery choices.

## C — rematch and battle presets

Play Rematch opens the existing setup wizard for review. Participants, rosters,
format, rules source, force dispositions, team assignments, clock and battlefield
can be reviewed or changed. Original roster definitions are retained under new
snapshot IDs, so deleted/changed library entries are never substituted silently.
The form labels missing and changed originals and offers current library versions.
Incompatible format/mission changes use the new setup's default battlefield.
Online rematches create a new waiting lobby; commanders still bring their own
rosters. A recorded online mode is retained when available; older saves default
to the editable local/online selector.

Presets save the reviewed current form in account-scoped IndexedDB v5. They are
available in Battle Archive. Only setup fields are retained. A new session is
created through the existing engine, with freshly initialized Secondary decks,
normal starting CP and zero VP/damage. Clock budgets and tracking positions reset.
Original sessions remain untouched. No backend migration.

Validation: two domain rematch tests plus a browser flow using deleted roster
snapshots, reviewing commanders, starting a new session and checking zero VP,
restored models, a new ID and exact preservation of the source save. TypeScript,
production build, existing rules/clock tests and PostgreSQL suite pass.

C review fixes: online rematches await the first connected clock snapshot before
configuring it. Failure still navigates to the created room with a visible clock
review notice. All restored player IDs have valid default Fixed pairs and strategy
settings. Named presets retain the recorded FFA Primary balance (including legacy
absence meaning original). Snapshot-only rosters do not show broken library edit
links. Two connection lifecycle tests and two browser regressions (Tactical →
Fixed/preset balance; delayed initial PostgreSQL clock poll) pass.

## D — narrative campaigns

Campaigns support 2–6 explicit participants, 3–12 fictional locations, faction
control, strategic values, links, optional progressive unlocks and points/territory
victory targets. Rules are separately declared for 1v1/FFA/2v2. A unique winning
side earns win points × location value per winner; tied leaders earn draw points
without control transfer. Doubles winners form a coalition. VP is never mixed
across formats. Campaign effects follow confirmation order and never alter battles.

Only reliable archived results with every identity linked can be assigned. Each
battle affects a campaign once. Revocation is another campaign event; projection
recomputes control and points, preserving the timeline. Dependent results at a
newly locked location are explicitly marked suppressed. Source event/identity
signatures detect changed results without sharing the underlying private history.
Manual fiction is clearly labelled separately from recorded battle facts.

IndexedDB v6 stores host-owned campaigns. Explicit cloud sync supports revision
conflicts and lost acknowledgements. Shared participant views are memory-only,
refreshed through permission-checked reads and cleared offline. Hosts can link or
revoke account access and sync that change. Only aggregate result facts and campaign
text are shared; rosters, raw events, private notes and hidden cards are excluded.

Migration `20261103105654_narrative_campaigns_private.sql` is deployed after a
fresh history/schema check. Owner/member read policies, host-only writes and an
access-membership derivation trigger are enabled; anonymous privileges revoked.
Shared game schema remains 12; advisors have no new findings.

Validation: full 711-unit suite plus the added unlock-dependency regression (712
now), TypeScript, production build, PostgreSQL/RLS including member revocation and
anonymous denial. Browser tests cover mobile creation, conquest, fiction, refresh,
revocation; two account contexts verify actual PostgreSQL RPC, member read-only
view, no persistent shared cache, and access removal. PL mobile/desktop screenshots
reviewed; real group/phone playtest remains necessary.

## E — War Chronicle and PDF

War Chronicle is available from each archived battle, outside active Battle Focus.
Three offline styles (Tactical Report, War Chronicle and Campaign Chronicle) use
canonical net engagement contributions, confirmed partial damage, final scores,
recorded movements/reserve entries and objective control. Unknown sources and
coordinates remain unknown; restorations do not become fictional eliminations.
Faction and unit names replace player names in generated text. Incomplete legacy
history is labelled unverified and does not produce inferred unit statistics.
Campaign context uses the actual assigned result, control transition and points.

Titles and narrative are editable, with private draft persistence and one-step
restore after regeneration. A source signature warns about revised results;
mutation checks retain text instead of overwriting concurrent archive edits.
Editorial text is explicitly separated from recorded facts and unit statistics.
The existing deterministic Battle Report remains available.

Export opens a self-contained A4 print preview; the browser's Print / Save as PDF
creates the PDF. Dark/gold and printer-friendly variants include the narrative,
factual highlights, unit contributions and up to three selected replay snapshots.
Only recorded unit coordinates are drawn, with grouped numbered markers and a
separate legend. Output escapes user content, preserves Polish glyphs and uses no
external artwork or assets. Generated example PDFs were inspected page by page.

No external AI provider is configured. The optional panel previews and copies a
minimal factual brief for manual use; the application sends nothing. It excludes
account/player identities, private notes, raw rosters, hidden cards and the edited
story. Provider integration, server-side keys and call limits remain future work.

No database migration or shared-session schema change is required for E. Drafts
use the archive's existing owner-private metadata and explicit synchronization.
Validation includes 719 passing unit tests, PostgreSQL/RLS, TypeScript and a
production build. Browser coverage exercises offline generation/edit/save/reload,
source immutability, PL/EN, mobile overflow and both PDF variants with real recorded
maps. The full browser suite passed 100 cases (two production-only cases skipped),
then both production-offline cases passed. A final targeted regression verifies
restoration/removal of campaign context across reload and archive Chronicle links
opening the requested map event; TypeScript and all seven narrator tests passed
again after these changes. CI for stages A–D is green.
Physical checks: several phones during a real game, campaign administration with
the group, dense tracked-unit maps, and PDF pagination in each target browser.

## Optional F — future league design

A league should reference archive game IDs rather than clone session/results. Use
private group membership, immutable season rules per format and a derived table
of completed, non-withdrawn results. FFA placement points and Doubles team points
must be explicitly configured before combining season standings. Awards should
reference measured archive facts and preserve unknown data. This optional module
is deferred until the main campaign flow has been tried during real games.

Deployed migration identity map: archive `20261103104136`, archive grant hardening `20261103104248`, campaign `20261103133943`. These are the deployed equivalents of the repository migration files; do not reapply them under their local filenames.
