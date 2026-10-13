# Battle Chronicle and Unit Performance

## During a battle

In **Army**, choose the attacking player and optionally an attacking unit once in the Combat attribution panel. All quick-loss controls and full unit cards use that selection until it is changed. Unknown preserves the existing player-level attribution. The most recently recorded unit is suggested again; explicitly choosing Unknown disables that suggestion. A short optional note applies to subsequent recorded losses.

The **Damage opponent** panel also has the optional own-roster selector. Change the source between attacks or opponents for split fire. Healing remains under the victim commander's control. Leaders and bodyguards retain their separate roster IDs and costs.

**Log** opens Battle Chronicle. Highlights omit small wound changes and technical ruleset events. Full History shows the canonical history. Kills, Objectives, VP, player and round filters can be combined. The scoring audit remains available. Long timelines render in batches of 80.

**Report** opens the live report. After ending or abandoning a battle, use **View Battle Report** below the result. Export Markdown or JSON, or use Print / PDF. The default narrative is deterministic and works without AI or network access. Tactical Report and War Chronicle use the same recorded facts; missing position or combat data is never reconstructed.

## Accounting rules

- Enemy points destroyed are **net model value**, estimated as unit cost / starting models. Partial losses are distributed to their recorded attacking units, without granting the whole unit's value to the last attacker.
- The last hit earns one unit kill. A repeated KO on an already destroyed unit earns nothing.
- Restoration or model/wound corrections bringing a target back remove its kill. Restored models retract the most recent outstanding casualty credits across rounds, including unknown-source credits. This is an explicit LIFO convention because individual model identities are not stored.
- Single-model wound decreases record actual logged damage. Healing is retained as combat history; a host wound correction can retract overstated damage. A whole-unit KO does not infer weapon damage. Multi-model wound damage is not inferred.
- Combat ROI = net enemy points destroyed / own starting cost × 100%. Zero-cost units show no ROI.
- Old saves without an attacking unit retain army-level credit and show partial attribution. Unknown player sources are reported separately.
- Generic Mission Actions count only explicit completions. Plunder is recorded as immediately completed. Cleanse uses the existing completed-objective confirmations. Only a single unambiguous acting unit receives its recorded action VP; multi-unit awards are not split. Score corrections make prior action VP attribution uncertain.
- Objective control has no unit identity, so it grants no invented unit-level VP.

Completed battles award Executioner for most net enemy points, Objective Hero for most explicitly completed actions, and Last Stand for a surviving unit with losses and confirmed combat value. Ties share awards. No award is issued without a positive eligible value.

## Persistence and synchronization

The optional `attackerUnitId` and `note` fields extend the existing casualty events. No second persisted history, extra transport or database migration is introduced. Domain dispatch and shared action authorization validate that the source belongs to the attacking player. Existing seat ownership, host corrections, offline retries and canonical event IDs remain authoritative.

Chronicle/analytics use the engine reducers in one read-only pass, deduplicated by event ID. Undo/redo rederive the report from retained history. New state feedback only runs for recent live appends while connected; mounting, reconnect, historical replay and redo are quiet. Reduced motion disables added animation.

## Boundaries and future work

The report describes what was recorded, not every action on the physical table. Fine-grained multi-model damage, unit-level capture identity, AI narration and rich narrative art are outside this MVP. `BattleNarrator` is an optional future adapter; the offline generator stays the default.

The production Supabase database was not changed. Shared flows are verified against the existing mock transport and three browser contexts. No production merge or deployment is performed.
