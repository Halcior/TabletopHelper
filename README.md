# TabletopHelper

An offline-first tabletop battle co-pilot built with React, strict TypeScript, Vite, Zustand, Zod, Dexie, Vitest, and Playwright.

Current capabilities:

- import real New Recruit JSON into an internal army model;
- preview and persist imported armies locally;
- configure official Chapter Approved Duel 1v1 or GW Doubles 2v2 by default, or a clearly labelled Community FFA 3, with saved armies, deployment zones and fixed turn order;
- track automatic Rival rotation, snapshots, phases, turns, rounds, CP, objectives, attributed casualties, wounds, abilities, and an event log;
- manage all 15 Cauldron Secondaries and Mission Actions, including automatic Sabotaż evaluation;
- select the existing Cauldron Secondary deck or the 18 Chapter Approved 2026–27 Secondary cards at battle setup, in Duel or FFA;
- reveal newly drawn Secondaries, use the free mulligan, and automatically commit Primary/Secondary scoring;
- hand the phone over from a compact end-turn summary while keeping the full scoring audit available on demand;
- record damage against any opponent while keeping Rival-specific scoring separate and crediting the final casualty correctly;
- share one battle across two, three or four commander devices with a readiness lobby, QR invite, offline retry, reconnect, and host-only recorded corrections;
- export a privacy-safe diagnostic report when a playtest problem occurs;
- install the hosted build as a PWA and reopen the previously visited app shell offline;
- use a one-handed phone battle surface with one-tap Fast Mode progression, collapsed reminders, readable objective ownership, and recent-unit damage controls;
- use a restrained tactical-console visual system with semantic player colours, icon-led navigation, accessible state contrast, and reduced-motion support;
- verify Duel and synchronized three-phone flows in mobile Chromium through Playwright;
- undo/redo actions and resume active battles from IndexedDB.

## Visual language

The interface uses a layered graphite tactical-map background with original SVG contour art, a grid and a vignette. Gold identifies the current phase and primary action; blue carries information, green confirms state and red marks danger. Stable player colours identify commanders separately. Operational screens use compact system typography and 44px-or-larger mobile controls. `src/visualSystem.css` is the single CSS entry point: `tacticalCommand.css` owns layout/tokens; `appBackground.css` and `productPolish.css` provide the final presentation. The background is static, with a lighter mobile version and reduced-motion support.

The reference-driven visual implementation, before/after screenshots and original artwork provenance are documented in [Reference UI implementation](docs/reference-ui/README.md).

## Rules Source and setup defaults

New Duel games use Chapter Approved Primary and Secondary. New Doubles games use GW Doubles v1.0 with the Chapter Approved matrix and shared team decks. FFA defaults to **Recommended House Format**, with Balanced FFA v1, Tactical Secondary and seven objectives; it is always labelled **Community format**. The **Custom / Homebrew settings** disclosure retains Cauldron and mixed-deck options for Duel/FFA. Existing saves keep their original decks, scoring and CP economy; source labels are derived from their saved configuration.

See [product polish notes, file map, validation and screenshots](docs/product-polish/README.md) and the [pinned rules audit](docs/11th-edition-rules-audit-2026-10-15.md).

Stratagem tracking and reaction assistance have been retired from the playing interface. Resolve these rules at the table and adjust CP using the scoreboard's ± controls. The app no longer loads the Stratagem metadata bundle or opens automatic reaction/timing reviews. Historical events remain readable; saved reaction pauses can be closed explicitly without changing previous CP spending or scoring.

Development commands:

1. `npm install`
2. `npm run dev`
3. `npx tsc --noEmit`
4. `npm test -- --run`
5. `npm run test:e2e:install` once on a new development machine
6. `npm run test:e2e`
7. `npm run build`

The retained `generate:rules-data` and `diagnose:stratagems` scripts support legacy diagnostics; their data is not shipped in the playing interface.

## Remote playtesting

The app is intended to be testable through a hosted Vercel URL as well as locally. `vercel.json` keeps React Router deep links SPA-safe, so refreshing routes such as `/battle/setup` does not return a hosting 404.

When the GitHub repository is connected to Vercel, pushes to feature branches can be shared as Vercel Preview Deployments. Testers should normally open the app from the root URL and create/import their own local data. Battle sessions and imported armies are stored in IndexedDB on each browser/device, so sending somebody a `/battle/<id>` URL does not transfer that battle state to another device.

The shared-session flow is different: one player creates a two- or three-seat lobby directly from battle setup or the battle header. The other phones scan its QR invite (or enter the six-character code), claim their seats, mark ready, and enter the synchronized battle together when the host starts it. See `docs/shared-sessions.md` for the cumulative Supabase migration and the physical-phone checklist.

The files in `test-data/` are immutable external New Recruit fixtures.

## Chapter Approved Secondary deck

The deck selector applies only to Secondary Missions. Primary, Operational Plans, phases, objectives, and Rival rotation still use the configured Cauldron battle mode. Existing saved battles without a deck selection continue using the original 15-card Cauldron deck.

Tactical uses a separate shuffled 18-card deck for each player. Players draw two cards in each own Command phase, even if they still hold cards. New FFA battles draw the first two when each commander actually starts their first turn, so when-drawn choices happen before play continues and a Rival whose turn has already passed cannot be scored retroactively. Legacy setup hands are retained without a duplicate first-turn draw. Card-specific when-drawn replacements, once-per-battle New Orders (1 CP), and end-of-turn discards (one or more cards for 1 CP total) are available on the Secondary panel. Fixed allows each player to select two of the four eligible cards in setup. The app applies the 15 VP per round, 45 VP per battle, and 20 VP per Fixed card limits.

The card panel shows conditions and timing from the [Chapter Approved 2026–27 Secondary Missions](https://gdmissions.app/11th/secondary-missions). Players confirm physical positions, destroyed models, and eligible units at the table. Cleanse and Plunder starts are recorded in the Shooting phase, then confirmed at end of turn. Each eligible commander scores or acknowledges their own cards before turn progression; in a shared room this can happen from their own phone during another commander's turn.

Chapter Approved uses roster selectors in both Duel and FFA: Cleanse and Plunder choose an acting unit from that commander's own army, with destroyed, reserve and Battle-shocked units excluded. Cleanse also selects its non-HOME objective from the battlefield list. Beacon selects and saves a unit's stable roster ID, displaying its name. Plunder's terrain name is entered at the table because terrain areas are not stored in the app.

FFA uses the Secondary Balance Patch: a card targeting an opponent or scoring at an opponent's turn end stores `secondaryRivalPlayerId` when drawn (including Fixed selections). That assigned Rival stays with the card through round rotation until scoring/discard/replacement. Legacy cards without the field fall back to Current Rival. Rival-independent cards have no Target Rival label. Duel follows the two-player card text directly.

Kill cards count only qualifying models/units of the assigned Rival destroyed by the card owner's army, using the recorded `destroyedByPlayerId`; third-player kills never score them. Record casualties in the Army panel. Centre Ground and Defend Stronghold check both enemies, while Display of Might requires `YourCount > max(EnemyA, EnemyB)`, not their sum. The scoring panel collects the physical confirmations for each enemy separately. Opponent-turn cards wait for the assigned Rival's next turn if that turn already ended; Beacon, Burden of Trust and Defend Stronghold keep their end-of-round-5 fallback.

New Chapter Approved FFA games use A/B/C-HOME, AB/AC/BC-NEUTRAL and CENTER. Tempting Target offers only CENTER and the owner/Rival pairwise neutral; Forward Position requires Rival HOME or that pairwise neutral plus CENTER. Old saves keep their objective IDs: N1 = AB-NEUTRAL, N2 = AC-NEUTRAL, N3 = BC-NEUTRAL. Align the physical legacy layout with those labels before using pairwise targets.

NML is the battlefield outside **all** deployment zones. Fixed Territories A/B/C are a separate layer and may overlap NML. Territory boundaries count as inside. Outflank and Beacon's 5 VP require a unit **wholly outside** its own Territory; Plunder requires the **entire terrain footprint** wholly outside, confirmed at action start. Beacon/Tempting choices are saved and locked; Burden saves one guard per controlled objective at draw/start of own turn, then checks those units and continued control. Tactical is the recommended/default Chapter Approved strategy in FFA; Fixed remains experimental due to matchup dependency.

## 11th edition Primary FFA with Tactical Secondary

For a three-player game, select **FFA 3**, **11th edition FFA** Primary, **Chapter Approved 2026–27** Secondary, **Tactical**, and **7 objectives**. Each player freely selects one of the five Primary mirror cards for the whole battle. The choice is not assigned or restricted by the imported army's Detachment. This is a house adaptation; the official 5×5 Force Disposition matrix is available only in Duel 1v1.

New FFA Primary games use the **Balanced FFA v1** point values below. This changes VP amounts only, retaining each mission's tasks and scoring windows. Setup and the battle panel show the adjusted rules; links open the original cards.

| Primary | Original → Balanced FFA v1 |
| --- | --- |
| Battlefield Dominance | Bonus per non-HOME objective while controlling your HOME: **2 → 1 VP**. |
| Meatgrinder | Hold a non-HOME objective: **4 → 5 VP**; destroy more Rival units than your losses to that Rival: **5 → 4 VP**. |
| Gather Intel | Round 1 CENTER: **6 → 4 VP**; hold a non-HOME objective: **4 → 5 VP**; each fresh extraction: **7 → 8 VP**. |
| Sabotage | Each completed action: **3 → 4 VP**; the Rival territory bonus remains **+2 VP**. |
| Outmanoeuvre | Rival HOME: **10 → 8 VP**; each non-HOME objective in rounds 2–3: **5 → 6 VP**, rounds 4–5: **6 → 7 VP**. |

The adjustment reduces the reward for staying on HOME with Battlefield Dominance, gives Meatgrinder a steadier objective-based floor, rewards the action cost of Gather Intel and Sabotage, and makes Outmanoeuvre less dependent on taking a Rival HOME. These are initial house-rule values for playtesting, not measured win-rate balance. Battles save their point profile: existing untagged saves retain the original awards and rule text, including when resumed or shared. Cauldron and official Duel scoring are unchanged.

Primary uses **Current Rival**, rotating by Battle Round. A new Rival-dependent Secondary card takes that Current Rival at draw time as its permanent **Secondary Rival**:

| Battle Rounds | A's Rival | B's Rival | C's Rival |
| --- | --- | --- | --- |
| 1 / 3 / 5 | B | C | A |
| 2 / 4 | C | A | B |

Battlefield Dominance compares objective control only with the current Rival. Meatgrinder and Outmanoeuvre use only that Rival's HOME for their enemy HOME condition. Meatgrinder's manual counts include that Rival's units destroyed this turn and your losses caused by that same Rival since your previous turn. Sabotage's territory bonus applies only in current Rival territory; HOME territory follows deployment zones and other physical territory is confirmed at the table. Gather Intel keeps all operation markers, but its final enemy HOME bonus checks the **round 5 Rival's HOME**, regardless of when the marker was placed. General objective/action conditions still apply to any eligible objective other than your own HOME.

Primary keeps its existing card timings, Command snapshots, final-turn checks, 15 VP per round / 45 VP per battle caps, and one commit per own turn. Cauldron Operational Plans do not add VP. Each commander reviews eligible Tactical cards before advancing the turn. Saved scores remain recorded; create a new battle to play Balanced FFA v1 from the start.
