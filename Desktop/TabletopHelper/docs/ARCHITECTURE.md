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
- `src/rulesets` contains contextual rule data. The current module is generic guidance; Cauldron will be added here rather than in components.
- `src/persistence` stores accepted armies and self-contained battle sessions in IndexedDB.
- `src/stores` coordinates UI actions, pure engine calls, and ordered persistence writes.
- `src/components` and `src/pages` render the mobile-first command console and dispatch domain events.

Combat resolution is deliberately outside the architecture. Imported weapon data is reference-only.
