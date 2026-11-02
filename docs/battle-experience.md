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
