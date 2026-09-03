# Tabletop Companion

An offline-first tabletop battle co-pilot built with React, strict TypeScript, Vite, Zustand, Zod, Dexie, and Vitest.

Current capabilities:

- import real New Recruit JSON into an internal army model;
- preview and persist imported armies locally;
- configure a Cauldron FFA 3 battle with three saved armies, deployment zones, fixed turn order, and Operational Plans;
- track automatic Rival rotation, snapshots, phases, turns, rounds, CP, objectives, attributed casualties, wounds, abilities, and an event log;
- manage all 15 Cauldron Secondaries and Mission Actions, including automatic Sabotaż evaluation;
- review and automatically commit Cauldron Primary scoring, with a detailed scoring audit;
- share one battle across three commander devices with offline retry and host-only recorded corrections;
- export a privacy-safe diagnostic report when a playtest problem occurs;
- install the hosted build as a PWA and reopen the previously visited app shell offline;
- use a one-handed phone battle surface with one-tap Fast Mode progression, collapsed reminders, readable objective ownership, and recent-unit damage controls;
- use a restrained tactical-console visual system with semantic player colours, icon-led navigation, accessible state contrast, and reduced-motion support;
- undo/redo actions and resume active battles from IndexedDB.

## Visual language

The interface uses a dark tactical-console theme rather than decorative parchment or heavy glow. Gold is reserved for the current phase and primary action; red marks blockers, green confirms completed state, and gold/blue/red consistently identify the three commanders. Operational screens use compact system typography and 44px-or-larger mobile controls. `src/tacticalTheme.css` is the canonical final visual layer over the feature-specific stylesheets.

Development commands:

1. `npm install`
2. `npm run dev`
3. `npm run generate:rules-data` after updating `@alpaca-software/40kdc-data`
4. `npx tsc --noEmit`
5. `npm test -- --run`
6. `npm run build`

## Remote playtesting

The app is intended to be testable through a hosted Vercel URL as well as locally. `vercel.json` keeps React Router deep links SPA-safe, so refreshing routes such as `/battle/setup` does not return a hosting 404.

When the GitHub repository is connected to Vercel, pushes to feature branches can be shared as Vercel Preview Deployments. Testers should normally open the app from the root URL and create/import their own local data. Battle sessions and imported armies are stored in IndexedDB on each browser/device, so sending somebody a `/battle/<id>` URL does not transfer that battle state to another device.

The shared-session flow is different: one player creates a shared lobby directly from battle setup or the battle header. The other phones scan its QR invite (or enter the six-character code), claim their seats, mark ready, and enter the synchronized battle together when the host starts it.

The files in `test-data/` are immutable external New Recruit fixtures.
