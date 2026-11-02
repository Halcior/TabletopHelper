# Battle Experience 3.0

## Audit and integration boundaries

The default Battle Dashboard already composes ContextCommandCentre, official mission panels, shared player perspective, BattleQuickStatus and the existing clocks. CombatControls owns atomic wound/model allocations; CombatSourcePicker owns attribution. Quick damage reuses both, rather than adding a new casualty reducer. End Turn Review already commits Primary once and collects the turn summary; it remains the only scoring flow.

SharedEventPolicy permits army owners to maintain their own units and active attackers to record attributed enemy damage. It does not permit opponent healing, allied edits or arbitrary off-turn damage. The new panel mirrors these existing permissions; every write still passes the store and shared policy.

PR #39 (`feat/battlefield-unit-tracking`, reviewed at `dceb968`) remains open. It adds TacticalUnits, movement events, historical positions and map/Chronicle integration, plus separate synchronization fixes. No code from that PR is copied into this stage. Map shortcuts use the existing ObjectivesPanel; later presentation can compose BattlefieldBoard without assuming tracking is merged. PR #40 supplies the shared FFA scope components used here.

## Stage A — Gameplay UX

- Battle Focus adds phase-specific priorities and direct Quick damage, map/objective, mission-card and end-turn actions. Movement/Charge/Fight use relevant compact mission summaries instead of the complete scoring forms. Full cards remain available in Cards. Required Command and Shooting choices stay directly accessible.
- A global Damage button opens a single-unit panel from any battle tab. Receiving army/unit and attacker are retained for this battle and viewer. Recent units are sampled when opening so the list cannot reorder under a finger. Destroyed targets remain selected with disabled controls. Unknown wounds and mixed profiles follow CombatControls' existing rules; Leaders remain their own unit.
- Quick Wounds/Models and a visible batch input dispatch the existing UNIT_COMBAT_RESOLVED exactly once. Attribution reaches Chronicle and reports through the existing engine.
- End-turn cards are grouped as Ready to Score, Needs Confirmation, or Carry Over / Discard. Only computed/explicitly confirmed FFA awards qualify as ready. Manual Duel awards remain Needs Confirmation. Empty opponent panels are omitted. No score is committed by grouping or rendering.

Changed areas: BattleFocus, QuickDamagePanel, battleExperience.css; optional batch UI in CombatControls; locked attacker selector in CombatSourcePicker; BattleDashboard integration; grouping in OfficialSecondaryPanel and SecondaryEndTurnReview. Existing combat-logging E2E and sharedEventPolicy unit tests now assert real event/state changes, exact batch count, attribution, selection retention, reload and stable controls.

Validation: TypeScript, 653 Vitest tests, production build, 18 targeted browser scenarios: FFA at 375/1440px, Duel, mixed-profile casualties and attribution, Quick damage, two/three/four-context multiplayer, clocks, reconnect and card choices. Screenshots inspected. Browser contexts emulate phones; physical playtest remains necessary for tap reach, grouping flow and elapsed interaction time.

The subsequent stages remain separate: guarded compensating corrections in Stage B; read-only Table Mode and presentation-only PL/EN preferences in Stage C. None of these stages automatically merges main or PR #39.

## Stage B — Multiplayer reliability

Host-only Quick Undo is available on the latest Chronicle event and the Quick damage confirmation. It uses the existing STATE_CORRECTED event, restoring a precise before value/profile snapshot instead of negating an amount. Only a single isolated, undoable action qualifies. Grouped scoring, automatic casualty consequences, flow, clock and unknown model allocations open the existing explicit correction form.

The optional quickUndo payload contains the expected latest event and action IDs. Canonical replay applies it only while that predecessor still matches. Concurrent corrections, a repeated acknowledgement, or an offline inverse rebased after another action cannot overwrite newer state. A stale correction remains in Chronicle with an explicit skipped result; no events are removed or reordered. Successful compensation retracts the reversed action's outstanding Secondary kill credit and turn-summary delta without changing ordinary scoring rules or historical entries. Skipped corrections do not affect scoring audit or performance attribution.

Permissions remain the existing host-only correction policy; army ownership is not expanded. No database tables, RLS changes or migrations are needed. Participants must use this preview version together: older application builds do not understand the optional quick-undo guard. Battle Clock state/history is independent and never reversed.

Changed areas: domain/battle/correctionGuard, quickCorrections and their tests; optional payload in types; guarded projection and matching Chronicle visitor; scoring-audit/performance/Secondary-kill/turn-summary treatment of successful or skipped compensation; QuickUndoAction in Chronicle and Quick damage. Existing three-context E2E now verifies exact canonical correction count after an acknowledgement-loss retry and actual synchronized CP totals, with the original action retained.

Validation: TypeScript, 663 Vitest tests, embedded PostgreSQL authorization/integration suite, production build, and targeted browser coverage for Chronicle, combat, three-context offline/retry, FFA and clocks including the two-context PostgreSQL RPC fixture. Ten correction cases cover exact restoration, capped CP/VP, unknown allocation, automatic consequences, concurrent inverses, retry, reload, host authorization, stale no-op and net scoring/kill credit. Physical devices and a mixed-version hosted room were not tested.
