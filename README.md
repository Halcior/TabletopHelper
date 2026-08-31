# Tabletop Companion

An offline-first tabletop battle co-pilot built with React, strict TypeScript, Vite, Zustand, Zod, Dexie, and Vitest.

Current capabilities:

- import real New Recruit JSON into an internal army model;
- preview and persist imported armies locally;
- configure a Cauldron FFA 3 battle with three saved armies, deployment zones, fixed turn order, and Operational Plans;
- track automatic Rival rotation, snapshots, phases, turns, rounds, CP, objectives, attributed casualties, wounds, abilities, and an event log;
- review and automatically commit Cauldron Primary scoring, including all five Operational Plans;
- undo/redo actions and resume active battles from IndexedDB.

Development commands:

1. `npm install`
2. `npm run dev`
3. `npx tsc --noEmit`
4. `npm test -- --run`
5. `npm run build`

The files in `test-data/` are immutable external New Recruit fixtures.
