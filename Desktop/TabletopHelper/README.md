# Tabletop Companion

An offline-first tabletop battle co-pilot built with React, strict TypeScript, Vite, Zustand, Zod, Dexie, and Vitest.

Current capabilities:

- import real New Recruit JSON into an internal army model;
- preview and persist imported armies locally;
- run a generic event-driven three-player guided battle;
- track phases, turns, rounds, VP, CP, objectives, unit casualties, wounds, abilities, and an event log;
- undo/redo actions and resume active battles from IndexedDB.

Development commands:

1. `npm install`
2. `npm run dev`
3. `npx tsc --noEmit`
4. `npm test -- --run`
5. `npm run build`

The files in `test-data/` are immutable external New Recruit fixtures.
