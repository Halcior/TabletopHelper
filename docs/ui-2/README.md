# TabletopHelper UI 2.0 — Tactical Command Interface

The battle interface now keeps the current round, phase, active commander, Rival,
VP and CP readable on a phone. Five mobile destinations replace the compressed
six-tab strip, and battle creation is divided into Rules, Commanders and
Battlefield & Start. Existing game commands and recorded battle data remain the
source of truth.

Baseline: `main` at `8d16254`, including merged Chronicle PR #21 and battlefield
PR #22. Review date: 2026-10-13. Captures use the actual React components, the
real event engine and Dexie with synthetic demonstration armies and events.
They are not static mockups or a record of a played match.

## Changes by screen

| Screen | Result |
| --- | --- |
| Home | Command Hub prioritizes Resume/New Battle, Host or Join and Army Library. Saved rosters and recent games use consistent cards. |
| Battle Setup | Three persistent steps preserve every existing choice. Moving between steps creates no session. Name, army, deployment, turn-order and Fixed-card errors identify and focus the owning field. |
| Shared Sessions | Clear room code, seat and Ready states; compact healthy connection status; errors and retry remain prominent. The QR invite uses the shared dialog. |
| Army Import | Larger readable headings, roster totals and file control with the existing import/confirmation flow. |
| Dashboard | Compact HUD, a fully readable current phase, three scores in one phone row and the existing fixed Next Phase action. |
| Scoreboard | CP opens a small keyboard-accessible control sheet. Existing CP and score-adjustment commands and ownership checks are retained. |
| Navigation | Battle, Army, Objectives, Cards and More on phones. More exposes Chronicle, Replay, Report, session details and diagnostics. Desktop retains direct Chronicle/Report tabs. |
| Context Command Centre | Phase priorities and mandatory responses remain prominent. Optional timing explanations expand on demand; the heading no longer covers the first priority card. |
| Objectives | Board/List/OC remain available. Neutral markers use a distinct dashed shape without repeated `None` text. Display labels avoid collisions; crowded labels remain accessible below the board. |
| FFA Layout Editor | A distinct edit surface with the same touch/keyboard dragging, dimensions, locking, Save and Cancel. Drafts survive tab switches; Replay waits until edits are saved or cancelled. |
| Official Duel Board | Existing A/B/C geometry and Attacker/Defender mapping are retained. Source and table instructions expand on demand; unplaced saved objective IDs remain visible. |
| Primary | Readable mission headings, Rival information and expandable full rules. All existing scoring inputs are retained. |
| Chapter Approved Secondary | Card identity, timing, Rival, maximum VP and current status are prominent. Full rules and actions expand; required choices/scoring and currently available Mission Actions are exposed automatically. Completed/discarded cards remain inspectable. |
| Army Tracker | Live models/wounds, losses, restoration and KO stay directly accessible. Reference profiles and timing explanations use details. Combat attribution and Mission Actions retain their existing workflows. |
| Chronicle | Filters and event hierarchy distinguish kills, control changes, large VP awards and changes of leader from routine entries. |
| Battle Report / Performance | Ranking, three recorded highlights, VP history, standout-unit shortcuts and consistent KPI cards precede the existing complete report and export tools. Scores remain provisional while live. |
| Replay / Finished Battle | Replay stays read-only and is available from Objectives and More. Finished battles continue to expose their Report and recorded battlefield replay. |
| Dialogs / Motion | CP, objective control, menus and dialogs share focus, Escape, outside-dismiss and focus-return behavior. Menus support arrow/Home/End keys. Short motion respects reduced-motion and existing quiet reload/reconnect behavior. |

## Visual system and state

`src/visualSystem.css` keeps the existing layer order and adds `command` last:

```css
@layer foundation, feature, focus, responsive, polish, command;
```

`src/tacticalCommand.css` owns the shared tokens and final presentation:

| Token group | Choice |
| --- | --- |
| Surfaces | Graphite background, inset surfaces and restrained elevation |
| Text | 15px body, 12–13px supporting labels, 20px sections, 26px headings/VP |
| Player colors | Existing gold `#d3ad56`, blue `#67a8d5`, red `#ce716a` |
| Spacing | 4, 8, 12, 16, 24 and 32px |
| Corners | 8, 12 and 16px |
| Motion | 180, 240 and 320ms; reduced-motion handling |
| Touch controls | 44px minimum for ordinary controls; the fixed phase action is 54px |

Unused header selectors and competing presentation `!important` declarations
were removed where the final layer replaces them. Feature-specific layouts and
the remaining legacy styles were retained rather than purged without evidence.
No dependency was added.

Visited battle panels stay mounted and are hidden when inactive, preserving
local card/action forms, editor drafts, filters and scroll positions. This is
presentation state only. Scores, units, objectives and replay snapshots still
come from the existing store/event projections. Leaving the Board closes its
control sheet without discarding an editor draft.

Primary and Chapter Approved Secondary forms retain drafts only within the same
scoring context. Changing the battle, player, active turn, round, phase or Primary
review window remounts the transient form. Previous checks, award selections,
discard selections and action drafts cannot carry into another player's turn or
another scoring window. Confirmed choices and awards still come from the event log.
This also applies when a previously visited Cards panel is hidden during a transition.

Objective-label placement and lead-change/highlight ranking are isolated in
presentation helpers. They do not change marker coordinates, Chronicle event
semantics, combat values or scores. The VP chart uses engine replay frames;
its round table shows the latest **cumulative** recorded VP for each round.

No production changes were made in `src/domain`, `src/rulesets`, `src/stores`,
`src/persistence`, `src/multiplayer` or `supabase`. UI 2.0 needs no database
migration. Shared geometry continues to require the existing schema version 6
from PR #22.

## Before / after captures

Phone captures use 390 × 844; desktop uses 1280 × 900. The paired screens use
the same demonstration session. Views are scrolled to the relevant component
where necessary.

| Screen | Baseline | UI 2.0 |
| --- | --- | --- |
| Home | [Before](before/home-mobile.png) | [After](after/home-mobile.png) |
| Dashboard | [Before](before/dashboard-mobile.png) | [After](after/dashboard-mobile.png) |
| FFA Objectives | [Before](before/objectives-ffa-mobile.png) | [After](after/objectives-ffa-mobile.png) |
| Official Duel Objectives | [Before](before/official-duel-mobile.png) | [After](after/official-duel-mobile.png) |
| Secondary cards | [Before](before/secondary-mobile.png) | [After](after/secondary-mobile.png) |
| Army Tracker | [Before](before/army-mobile.png) | [After](after/army-mobile.png) |
| Setup | [Before](before/setup-mobile.png) | [Rules](after/setup-mobile.png) · [Commanders](after/setup-commanders-mobile.png) · [Battlefield](after/setup-battlefield-mobile.png) |
| Army Import | [Before](before/army-import-mobile.png) | [After](after/army-import-mobile.png) |
| Chronicle | [Before](before/chronicle-mobile.png) | [After](after/chronicle-mobile.png) |
| Battle Report | [Before](before/report-mobile.png) | [After](after/report-mobile.png) |
| Desktop Dashboard | [Before](before/dashboard-desktop.png) | [After](after/dashboard-desktop.png) |

Additional UI 2.0 captures: [objective control](after/objective-control-mobile.png),
[FFA editor](after/ffa-editor-mobile.png), [Replay](after/replay-mobile.png),
[waiting lobby](after/lobby-waiting-mobile.png), [ready lobby](after/lobby-ready-mobile.png)
and [QR invite](after/lobby-qr-mobile.png), [Unit Performance](after/performance-mobile.png),
[finished battle](after/finished-battle-mobile.png) and [final report](after/finished-report-mobile.png).

Regenerate current captures with:

```sh
CAPTURE_UI2=1 npm run test:e2e
```

## Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm test -- --run` | 475 tests passed in 62 files |
| `npm run build` | Passed; existing large-chunk warning only |
| `CAPTURE_UI2=1 npm run test:e2e` | Original 31 scenarios passed, including the capture workflow |
| `npm run test:e2e` after review fix | All 33 scenarios passed, including two scoring-context regressions |
| Focused report navigation / print regression | Passed after ensuring standout links reveal a unit excluded by the player filter |
| `git diff --check` | Passed |

The verification scenarios cover:

- All six requested viewport sizes: 360 × 800, 390 × 844, 430 × 932,
  768 × 1024, 1280 × 900 and 1920 × 1080.
- Mobile navigation, menu keys, CP focus/return, saved form and editor drafts,
  unobstructed fixed actions, priority-card placement and nonoverlapping labels.
- Fresh Primary confirmations and Secondary action/discard drafts after changes
  of player, round, phase and scoring window, including transitions while Cards is hidden.
- Setup validation, unique zones/turns, distinct Fixed cards, retained choices
  and the absence of sessions created between steps.
- Compact live combat feedback, Chronicle access, reduced motion and quiet reload.
- Report Markdown/JSON exports and print visibility of ranking, VP chart,
  unit performance and narrative without other mounted game panels.
- Official A/B/C, FFA touch editing/locking/reset, Board/List control, local
  undo/redo, persisted geometry and read-only Replay.
- Two- and three-client turn ownership, both Rival scopes, Primary/Secondary,
  host-only layout changes, offline outbox, lost acknowledgements and reconnect.

Shared browser checks use three independent mobile browser contexts and the
real REST client against the deterministic Supabase API fixture. They do not
represent a new live-database RLS test or a test on three physical phones.
Existing database policies and event permissions are unchanged.

## Existing limits and separate follow-up work

1. **Official objective counts:** some pinned diagrams have fewer physical
   objectives than the existing six-ID official scoring model. All saved IDs,
   including unplaced IDs below the board, remain visible. Reconciling counts
   needs a separately reviewed rules/data migration; UI 2.0 does not hide or
   resolve this existing mismatch. See [battlefield provenance](../interactive-battlefield.md).
2. **Crowded objectives:** coordinates are authoritative. If markers overlap
   or a label cannot fit, named controls remain below the board; their saved
   locations are not silently moved.
3. **Saved setup preferences:** no new cross-session preference persistence
   was introduced. Choices survive step navigation during the current setup.
4. **Performance data:** values depend on recorded attribution; unknown combat
   sources and unrecorded actions cannot be reconstructed by presentation.
5. **Build size:** Vite's existing large-chunk warning remains. Broader rules-data
   bundling changes are a separate optimization task.

Publication of this branch is for review. The UI 2.0 request requires reviewing
the results before merging into `main` or deploying to production.
