# Domain model

`Army` and `UnitDefinition` are immutable roster definitions. New Recruit IDs are retained as source metadata, while domain IDs are used everywhere above the adapter.

`UnitState` is created per player when a battle starts. It owns models alive, wounds, destroyed/battle-shocked/reserve flags, and manual ability-use state without mutating the imported unit definition.

`BattleSession` consists of:

- an immutable `BattleSetup` containing players, armies, ruleset, turn order, objectives, and guidance level;
- a projected `GameState` containing the current phase, scores, unit/objective state, snapshots, and event history;
- grouped redo actions.

All mutations are expressed as `BattleEvent` values. State is replayed from setup plus the retained event history, which makes undo/redo deterministic and keeps the battle log authoritative.
