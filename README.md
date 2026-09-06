# Tabletop Companion

An offline-first tabletop battle co-pilot built with React, strict TypeScript, Vite, Zustand, Zod, Dexie, and Vitest.

Current capabilities:

- import real New Recruit JSON into an internal army model;
- preview and persist imported armies locally;
- configure either a two-player Duel 1v1 battle or a Cauldron FFA 3 battle;
- Duel 1v1 supports two saved armies, fixed turn order, five Battle Rounds, configurable objective markers, manual VP scoring, CP, army state, Stratagem timing and reactions;
- Cauldron FFA 3 supports three saved armies, deployment zones, fixed turn order, Operational Plans and the complete Cauldron scoring flow;
- track phases, turns, rounds, CP, objectives, attributed casualties, wounds, abilities, and an event log;
- manage all 15 Cauldron Secondaries and Mission Actions, including automatic Sabotaż evaluation;
- review and automatically commit Cauldron Primary scoring, with a detailed scoring audit;
- share one battle across either two Duel commander devices or three Cauldron commander devices with offline retry and host-only recorded corrections;
- export a privacy-safe diagnostic report when a playtest problem occurs;
- install the hosted build as a PWA and reopen the previously visited app shell offline;
- use a one-handed phone battle surface with one-tap Fast Mode progression, collapsed reminders, readable objective ownership, and recent-unit damage controls;
- use a restrained tactical-console visual system with semantic player colours, icon-led navigation, accessible state contrast, and reduced-motion support;
- undo/redo actions and resume active battles from IndexedDB.

## Duel 1v1

Duel is deliberately mission-pack neutral for now. It provides the complete battle companion around a normal two-player game while leaving Primary and Secondary mission scoring under manual VP control. The setup lets players choose between 1 and 8 objective markers so the objective panel can match the mission being played.

The Duel engine automatically advances from Player 1 to Player 2 and starts the next Battle Round after Player 2 finishes. It uses the same army tracker, phase flow, CP tracker, Stratagem timing, reactions, battle log, corrections, offline persistence and shared-session synchronization as the rest of the app.

## Visual language

The interface uses a dark tactical-console theme rather than decorative parchment or heavy glow. Gold is reserved for the current phase and primary action; red marks blockers, green confirms completed state, and gold/blue/red consistently identify the commanders. Operational screens use compact system typography and 44px-or-larger mobile controls. `src/tacticalTheme.css` is the canonical final visual layer over the feature-specific stylesheets.

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

The shared-session flow is different: one player creates a shared lobby directly from battle setup or the battle header. The other phone(s) scan its QR invite (or enter the six-character code), claim their seats, mark ready, and enter the synchronized battle together when the host starts it.

For an existing Supabase installation that already has the three-seat lobby migration, apply `supabase/migrations/20260906180500_dynamic_shared_lobby_seats.sql` before testing a shared Duel room. It changes the database start guard from a hard-coded three seats to the player count stored in the battle snapshot.

The files in `test-data/` are immutable external New Recruit fixtures.
