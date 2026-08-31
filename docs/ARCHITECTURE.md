# Tabletop Companion architecture

The application keeps source adapters, domain state, ruleset guidance, persistence, and UI separate:

```text
New Recruit JSON
    -> importers/newRecruit
    -> domain/army
    -> domain/battle event engine
    -> rulesets
    -> stores + React UI
    -> Dexie / IndexedDB
```

- `src/importers/newRecruit` owns permissive New Recruit schemas and conversion. Raw New Recruit objects never enter the battle engine.
- `src/domain/army` contains immutable roster definitions and mutable per-battle unit-state types.
- `src/domain/battle` contains the UI-independent event/replay engine, transitions, snapshots, undo/redo, serialization, selectors, and log descriptions.
- `src/rulesets/cauldronFFA3` owns Cauldron configuration, Rival rotation, immutable ruleset snapshots, net casualty valuation, Operational Plans, reminders, Primary review, and round commits. React only calls this module and renders its results.
- `src/persistence` stores accepted armies and self-contained battle sessions in IndexedDB.
- `src/stores` coordinates UI actions, pure engine calls, and ordered persistence writes.
- `src/components` and `src/pages` render the mobile-first command console and dispatch domain events.

Each battle stores unique army definitions once in `BattleSetup.armies`. Players reference those definitions by `armyId` and receive independent mutable unit state. This keeps a resumed battle self-contained without tripling a shared development roster.

Combat resolution is deliberately outside the architecture. Imported weapon data is reference-only.
