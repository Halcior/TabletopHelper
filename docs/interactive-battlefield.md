# Interactive battlefield and replay

Objectives opens in Board mode. List retains quick control and OC mode. Tapping a marker opens a small control sheet, which dispatches the existing `OBJECTIVE_CONTROL_CHANGED` event. Ownership, scoring, Chronicle and both objective views read the same projected objective state.

## Official geometry provenance

Source: [Warhammer Event Companion](https://assets.warhammer-community.com/eng_12-06_warhammer40000_event_companion-s3bfb5f9s1-ivswuij3fo.pdf), version 1.0, retrieved and checked on 2026-10-13. The referenced asset currently contains 93 pages. No verified replacement asset was identified on the official downloads page; the version is pinned rather than silently assuming future changes.

- Page 8 defines deployment, Territory and objective glyph types.
- Pages 9–53 contain 45 diagrams: 15 unordered Force Disposition pairings, with A/B/C for each pairing. Layout number alone is insufficient to select the correct diagram.
- Each field is 44″ × 60″, represented as 111.76 × 152.4 cm in the published portrait orientation.
- Objective glyph centres, deployment paths (including stepped and curved shapes), and emitted dashed Territory paths are normalized from the published PDF vectors.
- Eleven straight Territory dividers follow the published half-field definition and diagram orientation: pages 10, 14, 17, 19, 22, 23, 30, 31, 33, 35 and 40. Their orientation was visually checked against every affected diagram.
- Attacker/Defender HOME assignment is stored separately from turn order. Setup and Board allow assigning Attacker to A or B. The default A assignment must match the players' actual roll. Rotate 180° changes only the local view.
- Central and Expansion glyph categories stay mapped to `CENTER-*` and `EXPANSION-*`. Numbering within each category follows top-to-bottom, then left-to-right source order; this does not alter their existing game semantics.

The PDF diagrams have 4–6 physical objectives, while existing official sessions always contain six IDs. All saved IDs and scoring semantics are retained. IDs without a source counterpart have `null` coordinates and appear in a separate panel below the field. They are never assigned fabricated official positions. Aligning the existing scoring model with mission-specific objective counts would be a separate rules change.

Data lives in `src/domain/battlefield/officialLayouts.json`, with source version, URL, retrieval date and SHA-256. Reproduce extraction with PyMuPDF:

```sh
python scripts/extract-official-battlefields.py --pdf /path/to/event-companion.pdf --output src/domain/battlefield/officialLayouts.json
```

The extractor rejects a different page count or version. Tests cover all 25 ordered pairings × three variants, plus independently recorded source coordinates and role mapping. No terrain footprints or terrain artwork are reproduced in this MVP.

## Custom layout

FFA starts with a symmetric 180 × 120 cm orientation template. Edit Layout supports real pointer/touch dragging, keyboard arrows, custom dimensions, 160/180 × 120 presets, reset, cancel, save and locking. Entering Edit Layout explicitly unlocks the private draft. Lock positions immediately prevents dragging and arrow-key movement; Save retains the lock flag. Normal play keeps positions fixed outside the editor. Draft changes remain private until saved. `BATTLEFIELD_LAYOUT_CHANGED` stores normalized 0–1 coordinates, dimensions, lock state and HOME role mapping in the event history. Invalid intermediate size input cannot create an excessively tall canvas and cannot be saved.

Historical N1/N2/N3 and six-objective games keep their IDs and count. They use the corresponding neutral template positions without adding CENTER. Cauldron Duel uses a clearly labeled schematic. Custom deployment shapes are orientation aids, not official Territory or deployment rules.

The footprint union reserves rectangular and polygon shapes, rotation and dimensions for a later terrain editor. Only objective markers are rendered and editable now.

## Persistence and shared sessions

Geometry is projected by the engine, serialized with the existing session and replicated through the existing Supabase event transport. The host policy validates the exact saved objective set and rejects altered official geometry. Client policy and Supabase RLS both restrict geometry to the room host; objective-control permissions are unchanged.

Schema version 6 is required for shared rooms. Existing version 5 databases apply `supabase/migrations/20261013094351_battlefield_geometry_host_policy.sql`; older databases first apply the compatibility migration described in `shared-sessions.md`. No new tables, identity mechanism or scoring state are introduced.

Offline changes use the existing persisted outbox, canonical sequence ordering and unique event IDs. Local undo/redo includes geometry events. Shared-room undo/redo retains the existing disabled behavior until synchronized compensating actions exist.

## Replay

Replay is read-only. Its slider includes the initial state and each unique recorded event in order, including multiple ownership changes in one round, OC-driven changes, VP corrections and geometry edits. R1–R5 jump to the last available step of each round; future rounds are disabled. Historical VP and recorded round highlights come from the engine and Chronicle. Completed or abandoned battles also expose View battlefield replay.

The engine's existing round/turn snapshots continue to be produced by the same event reducers. Replay does not invent extra snapshots or replace missing event history with fictitious changes. A history-free session can display only its saved state. Scrubbing never dispatches a battle event.

## Limits and next steps

This is an orientation and control interface. The physical table determines LOS, distances, Wholly Within/Outside Territory, Mission Action eligibility and OC. Marker positions never score VP or decide those conditions. Reduced-motion disables animation; ownership changes use the existing player palette.

Next steps: reconcile mission-specific official counts in a separately reviewed rules change; add footprint rendering and a source-version update workflow; optionally add Chronicle casualty highlights directly to Replay. Three-device Playwright tests exercise the real REST client against a deterministic Supabase API fixture (including host rejection and lost acknowledgements), not three physical devices or a live Supabase database.

## Verification and mobile captures

Validation on the combined Chronicle + map implementation: `npx tsc --noEmit`, all 463 Vitest tests in 60 files, `npm run build`, and all 20 scenarios from `npm run test:e2e` pass. This includes unchanged Duel/FFA Primary and Secondary scenarios, mobile attribution/report exports, Board/List consistency, real touch dragging, invalid sizes, locking, geometry restoration, undo/redo, read-only Replay, three phone contexts, offline events, lost acknowledgements and reconnect.

The installed Supabase schema was separately verified with `supabase/tests/battlefield_geometry_rls.sql`: the actual `anon` role can publish host geometry and peer objective control, while peer geometry, host impersonation and peer corrections are rejected. The check rolls back every test row. Schema version is 6 and the Supabase security advisor reports no lints. Existing shared battles and tables are preserved.

Mobile captures use a 390 × 844 touch viewport with demonstration data. Attacker is assigned to B in the official examples; FFA shows a moved CENTER controlled by Player III.

| View | Screenshot |
| --- | --- |
| Official A, Take and Hold pairing, page 9 | [Board A](screenshots/board-official-A-mobile.png) |
| Official B, Take and Hold pairing, page 10 | [Board B](screenshots/board-official-B-mobile.png) |
| Official C, Take and Hold pairing, page 11 | [Board C](screenshots/board-official-C-mobile.png) |
| Custom FFA, seven objectives | [FFA Board](screenshots/board-ffa-mobile.png) |
| FFA dimensions, presets and locking | [Layout Editor](screenshots/board-ffa-editor-mobile.png) |
| Event-level Replay and historical VP | [Replay](screenshots/board-replay-mobile.png) |
| Battle Chronicle | [Chronicle](screenshots/chronicle-timeline-mobile.png) |
| Offline Battle Report | [Report](screenshots/chronicle-report-mobile.png) |
| Unit Performance and Combat ROI | [Performance](screenshots/chronicle-performance-mobile.png) |

Demonstration reports: [Markdown](examples/battle-report.md) and [JSON](examples/battle-report.json). These fixtures illustrate accounting and narrative output; they are not records of an actual played battle.
