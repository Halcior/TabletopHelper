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

## Remote playtesting

The app is intended to be testable through a hosted Vercel URL as well as locally. `vercel.json` keeps React Router deep links SPA-safe, so refreshing routes such as `/battle/setup` does not return a hosting 404.

When the GitHub repository is connected to Vercel, pushes to feature branches can be shared as Vercel Preview Deployments. Testers should normally open the app from the root URL and create/import their own local data. Battle sessions and imported armies are stored in IndexedDB on each browser/device, so sending somebody a `/battle/<id>` URL does not transfer that battle state to another device.

The shared-session flow is different: one player creates a shared room and the other players join it with the six-character room code so all devices replicate the same battle state.

The files in `test-data/` are immutable external New Recruit fixtures.
