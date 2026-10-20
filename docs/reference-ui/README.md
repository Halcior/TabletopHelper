# Reference UI implementation

Implementation of the four visual references supplied in `TabletopHelper_UI_Reference_Pack(1).zip`, on top of main `6e94f39`. The reference screenshots themselves are not shipped or committed as production artwork. All controls are real React elements, all board geometry remains SVG/data-driven, and all numbers come from the existing saved game.

## What changed

| Reference | Working implementation |
| --- | --- |
| Battle setup | Scenic introduction, amber selected states, original tactical format symbols, short mode descriptions, Official/Community badges, consistent form and card finishes. The existing three-step form and advanced settings remain available. |
| Live battle | Compact scenic HUD, TabletopHelper wordmark, clear CP/VP hierarchy and persistent inline ±CP controls, cyan completed phases and an amber active phase. Small screens abbreviate inactive phase names while retaining complete accessible labels. |
| Unit cards | Original vector insignia, cold steel cards, consistent status treatments and a fixed-height model-count bar. Existing Wounds, model, Battle-shock, allocation and attribution controls are unchanged. No faction portraits were added. |
| Objectives | Restyled instrument frame, subtle vector texture, clearer markers and ownership controls, an original targeting symbol and the real rules-source badge on the selected objective. No artificial terrain, OC values or VP values were inferred from the mockups. |
| Chronicle and report | Category titles derived from recorded event categories, a connected timeline, distinct confirmed highlights, stronger result cards and performance hierarchy. Missing logged damage is displayed as `—`; scores, kills and awards use the existing calculations. |

The app name in the browser, installed-app manifest, navigation and sharing text is TabletopHelper. Existing database identifiers, save schemas, cache identifiers, multiplayer protocols, rules and scoring are unchanged. No Stratagem UI has been reintroduced. Replacing mockup imagery with original vector symbols is intentional: characters and faction art from the reference pack are not production assets.

## File map

- `src/productPolish.css`: existing final presentation layer, shared tokens and reference finishes. Screen-only decorative rules leave the existing print layout intact.
- `src/appBackground.css`, `src/components/AppBackground.tsx`: existing layered background extended with the original panorama and a responsive WebP source.
- `src/assets/outpost-panorama.webp`, `src/assets/outpost-panorama-mobile.webp`: original background art. See [asset provenance and prompt](ASSETS.md).
- `src/components/ui/FormatGlyph.tsx`: original SVG symbols for the three game formats.
- `src/pages/BattleSetup.tsx`, `src/pages/BattleDashboard.tsx`, `src/components/battle/PhaseStepper.tsx`: setup and live HUD presentation.
- `src/components/battle/ArmyTracker.tsx`, `src/components/battle/CombatControls.tsx`: unit-card identity and model-count bar. The count bar reflects surviving models, not inferred Wounds.
- `src/components/battle/BattlefieldBoard.tsx`: selected-objective presentation; coordinates, interaction targets and control events are unchanged.
- `src/components/battle/BattleLog.tsx`, `src/components/battle/BattleReport.tsx`: chronology and report presentation.
- `e2e/reference-ui.spec.ts`: viewport captures, error checks, image fallback, contrast, long names, rotation and keyboard access.

## Before / after

Screenshots use the same synthetic fixture, saved through the real engine and IndexedDB, on the same 390 × 844 viewport. The baseline was captured from a separate checkout of `6e94f39`. Board, timeline and roster captures scroll to the corresponding content; fixed controls remain mounted. These fixtures are demonstration data and are never inserted into production games.

| Area | Before | After |
| --- | --- | --- |
| Setup | [Before](screenshots/before/390-setup.png) | [After](screenshots/after/390-setup.png) |
| Live HUD | [Before](screenshots/before/390-live.png) | [After](screenshots/after/390-live.png) |
| Objectives | [Before](screenshots/before/390-objectives.png) | [After](screenshots/after/390-objectives.png) |
| Chronicle | [Before](screenshots/before/390-chronicle.png) | [After](screenshots/after/390-chronicle.png) |
| Report | [Before](screenshots/before/390-report.png) | [After](screenshots/after/390-report.png) |
| Army | [Before](screenshots/before/390-army.png) | [After](screenshots/after/390-army.png) |

The `after` folder also includes all six surfaces at **375 × 812**, **768 × 1024** and **1440 × 1000**. The report print/PDF path is checked by the existing suite.

Reproduce captures:

```sh
REFERENCE_UI_CAPTURE=after npx playwright test e2e/reference-ui.spec.ts
```

## Performance and accessibility

The mobile panorama is 23,800 bytes (960 × 320); the desktop source is 67,076 bytes (1920 × 640). Both are local hashed build assets. CSS selects the mobile source at 820 px and below, and repeated uses share the same cached file. There are no network fonts, filters, videos, canvas backgrounds, parallax or background animations. Gradients and the existing original map SVG remain visible when the bitmap cannot load. Background layers are `aria-hidden` and cannot intercept input. The viewport includes `viewport-fit=cover` for the existing safe-area controls.

Automated contrast checks cover primary, secondary and information text against all three main surfaces (minimum 4.5:1). Existing 44 px touch targets, focus indicators, reduced-motion handling, keyboard dismissal and modal focus behavior remain in place. The new checks also rotate a phone viewport to 844 × 390 and use long imported unit names. Desktop keyboard and touch remain supported by the existing controls.

## Validation

Local validation on 2026-10-20: TypeScript passed; 518/518 Vitest tests passed; production build passed. The full Playwright run passed 50/53 cases and found a CSS border-colour regression on official objective markers. After restoring state-specific marker colours (including hover), all three official A/B/C cases passed again. All 53 scenarios have positive results across these runs, including the six new reference checks. The final PR also runs the complete CI suite. Required commands:

```sh
npx tsc --noEmit
npm test -- --run
REFERENCE_UI_CAPTURE=after npm run test:e2e
npm run build
```

Manual review: compare format cards and source labels, switch through all three setups, inspect ±CP on the HUD, tap Wounds repeatedly in Army, select and rotate objectives, open the timeline and report, and use Print / PDF. A separate PR and Vercel Preview are provided for review; do not merge automatically.
