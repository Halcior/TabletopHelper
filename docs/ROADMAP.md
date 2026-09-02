# Roadmap

## Completed foundation

- strict domain model and reliable real-fixture New Recruit import;
- event-driven battle engine with immutable snapshots, local undo/redo, and IndexedDB resume;
- mobile-first dashboard, three army trackers, objectives, reactions, Stratagem timing, and event log;
- compact phone flow with a single primary advance action, progressive reminder disclosure, color-coded objective ownership, and recent-unit quick damage controls;
- compact generated `40kdc-data` runtime snapshot and route-level code splitting;
- installable PWA shell with same-origin runtime caching.

## Completed Cauldron FFA 3 core

- three-player A/B/C setup, fixed turn order, automatic Rival rotation, and all five Operational Plans;
- automatic Round/Turn Start snapshots, casualty attribution, Wyniszczenie, Primary review, caps, and plan changes;
- all 15 Secondary cards, deck lifecycle, automatic/assisted evaluators, and scoring history;
- Mission Actions for Secure Data, Scan Signal, and automatic Sabotaż plan evaluation;
- scoring audit derived from committed Battle Events.

## Completed shared-play hardening

- seat ownership, presence, capability-scoped Supabase RLS, offline queue, reconnect, and idempotent retry;
- direct invite links and resumable shared membership;
- host-only exact state corrections preserved as immutable Battle Events;
- downloadable diagnostic report without room-code or client-ID capabilities;
- deterministic three-client convergence test covering permissions, automatic scoring, offline retry, and corrections.

## Next milestone: live playtest findings

- run the documented three-phone tabletop flow and turn findings into reproducible tests;
- add browser-level Playwright coverage when the test-browser dependency is available;
- add synchronized inverse/compensating actions if host corrections prove too slow for common mistakes;
- improve result and post-game statistics based on real playtest needs.

## Later milestones

- QR invite display, host transfer, snapshot compaction, and optional realtime transport;
- authenticated identity or stronger server-side room capability before public production use;
- Twists, dedicated table mode, and broader rulesets.
