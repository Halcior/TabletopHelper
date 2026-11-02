# FFA Rival clarity

Primary displays the Current Rival for the current round. Target-based Chapter Approved Secondary cards display their own saved target, draw round, scoring window and a neutral explanation when that target differs. The same compact scope component is used by the draw reveal, live cards, own-player multiplayer perspective and End Turn Review.

Scope comes from the existing `enemyScope`, `usesSecondaryRival` and `scoreAt` definitions. Beacon, Burden of Trust, Defend Stronghold and Display of Might distinguish an assigned scoring-time rival from a condition that checks battlefield state or both enemies. No rotation, draw, scoring, event or synchronization rules change. No database migration is required. Missing target IDs in historical saves are presented as unrecorded; existing legacy engine behavior remains intact.

A 15-second, nonblocking notification appears only for an appended round event that changes the viewed commander's rival. Initial load, refresh, ordinary updates, undo and unchanged rival mappings are quiet. Help uses the existing InfoDisclosure on Primary, Secondary, setup and the shared waiting room. Full rules are collapsed separately from scoring choices. Damage logging no longer implies that only the Current Rival can satisfy a Secondary.

## Changed areas

- `src/components/battle/RivalClarity.tsx`, `rivalPresentation.ts`, `rivalClarity.css`: shared identity, scope and help.
- `src/components/battle/RivalRotationNotice.tsx`: transient local feedback derived from canonical round events.
- `OfficialPrimaryPanel`, `OfficialSecondaryPanel`, `SecondaryDrawReveal`, `SecondaryEndTurnReview`, `SharedPlayerPerspective`, `TurnSecondaryFocus`, `RivalDamagePanel`: consistent presentation.
- `src/pages/BattleDashboard.tsx`, `BattleSetup.tsx`, `SharedSessions.tsx`: integration and setup help.
- `src/rulesets/cauldronFFA3/secondary.ts`: presentation strings only; separate timing rival from condition scope.
- Existing `officialSecondaryFFA.test.ts`, `rivalRotation.test.ts`, `e2e/ffa-secondary-balance.spec.ts`, `e2e/official-ffa-rival.spec.ts`: scope, mixed draw rounds, replay, rotation, multiplayer and viewport coverage.

## Verification

TypeScript typecheck, all 652 unit tests, production build, and targeted Playwright coverage of FFA, Duel, Doubles, three/four browser contexts, Chronicle, reports and Secondary choices. Screenshots inspected at 375px and 1440px; no horizontal overflow in cards or review. Playwright emulates devices; this is not a physical-phone playtest.

At the table, check that each player can identify their Primary Rival, each card's target or enemy scope, and the reason those targets can differ. In particular, carry a target card from round 1 into round 2 alongside a newly drawn card, and review an all-enemy card at its saved timing rival's turn end.
