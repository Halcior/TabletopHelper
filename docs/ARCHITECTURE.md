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

Shared phone
    -> capability-scoped REST transport
    -> Supabase RLS + canonical event sequence
    -> replay into the same battle engine
```

- `src/importers/newRecruit` owns permissive New Recruit schemas and conversion. Raw New Recruit objects never enter the battle engine.
- `src/domain/army` contains immutable roster definitions and mutable per-battle unit-state types.
- `src/domain/battle` contains the UI-independent event/replay engine, transitions, snapshots, undo/redo, serialization, selectors, and log descriptions.
- `src/rulesets/cauldronFFA3` owns Duel/FFA configuration, Rival selection, immutable ruleset snapshots, final-casualty attribution, Operational Plans, reminders, Primary review, and turn/round commits. React only calls this module and renders its results.
- `src/persistence` stores accepted armies and self-contained battle sessions in IndexedDB.
- `src/stores` coordinates UI actions, pure engine calls, and ordered persistence writes.
- `src/multiplayer` owns seat capabilities, permission checks, the offline publish queue, canonical replay, and the versioned Supabase preflight.
- `src/components` and `src/pages` render the mobile-first command console and dispatch domain events.
- `e2e` runs separate mobile browser contexts against a deterministic Supabase REST double. It covers Duel layout, a three-seat lobby, synchronization, offline work, reconnect, and idempotent duplicate submission.

Each battle stores unique army definitions once in `BattleSetup.armies`. Players reference those definitions by `armyId` and receive independent mutable unit state. This keeps a resumed battle self-contained without tripling a shared development roster.

Combat resolution is deliberately outside the architecture. Imported weapon data is reference-only.
