# Official terrain atlas — source audit and coverage

Checked 21 October 2026. Scope: official Duel 1v1 and Doubles 2v2, using the existing Battlefield engine. **Do not merge without the user's visual/table review.**

## Authoritative sources

The official download page loads its actual list from `POST https://www.warhammer-community.com/api/search/downloads/`, with `index=downloads_v2`, `gameSystem=warhammer-40000`, `language=english`. The metadata below was retrieved from that first-party response. No third-party layout catalogue is used.

- **event**: [eng_14-10_wh40k_event_companion-rdwnqprl4c-nj8oqogadv.pdf](https://assets.warhammer-community.com/eng_14-10_wh40k_event_companion-rdwnqprl4c-nj8oqogadv.pdf)
  - Version: 1.3; updated 2026-10-14; checked 2026-10-21.
  - Relevant pages: 7–8 (key), 9–53 (45 diagrams).
  - SHA-256: `187253a9b6ea377f5e44d1148454bd042b165b03bb5c45c51a5880762bf56dc2`.
- **doubles**: [eng_wh40k_doubles_event_companion-x8bakj0hba-chdctfbcoc.pdf](https://assets.warhammer-community.com/eng_wh40k_doubles_event_companion-x8bakj0hba-chdctfbcoc.pdf)
  - Version: 1.1; updated 2026-08-26; checked 2026-10-21.
  - Relevant pages: 1–2.
  - SHA-256: `752d8887a8821e55199cdf80cdf954daeeda450b4b1836bfe989f321293c9f44`.
- **footprints**: [eng_12-06_warhammer40000_terrainareafootprints-biavo5zf9f-gxdahkydbj.pdf](https://assets.warhammer-community.com/eng_12-06_warhammer40000_terrainareafootprints-biavo5zf9f-gxdahkydbj.pdf)
  - Version: no printed version; June 2026 Armageddon download; updated 2026-06-12; checked 2026-10-21.
  - Relevant pages: 1 (B/E), 2 (A/C), 3 (D).
  - SHA-256: `abda484efe1e3031a92079053594a8b933a6ac429b899151f39ce8d51cbb9189`.

The October Event Companion is v1.3, despite the layouts section saying “None” under layouts updated. Compared with the June v1.0 geometry pinned in the app, 25 diagrams have objective changes (including nine diagrams gaining a second central glyph) and page 53 has a deployment-path change. Some shifts exceed 15 cm. The generated [machine-readable audit](terrain-source-audit.json) identifies every affected page and field. The old file remains byte-for-byte available as `officialLayouts.legacy.json`.

Doubles v1.1, p2 explicitly refers to A/B/C in the main Event Companion, uses the same 44″ × 60″ field and allocates Attacker/Defender to teams. The atlas shares one catalogue; it does not generate four zones or change team CP, VP or missions.

## Geometry contract

- All 45 maps independently contain 16 areas: A×4, B×2, C×4, D×4, E×2. **720 individual placements.** No objective-centred approximation is used for official terrain.
- Nominal dimensions from p7: A 6″×4″; B 10″×2.5″; C 6″×2″; D 7″×11.5″; E 8″×11.5″ polygon. These are NOT the exact extrema of Armageddon's irregular perimeter. The printable Armageddon document has protrusions; E is an irregular, partly diagonal wedge rather than a clean triangle. Actual outline bounds and nominal type size are shown separately.
- Outlines are independently extracted from the grey vector terrain-area paths on each diagram. Cubics are sampled and simplified at a maximum 0.15 mm board-space tolerance; no textures, ruin illustrations, logos or decorative artwork are shipped.
- Physical coordinates use cm, origin top-left in portrait orientation, x right and y down. Local polygon points rotate clockwise around `position`; rotation never stretches either axis. One isotropic conversion per diagram is based on the 44-inch frame width, centred vertically on the 60-inch board. A 180° view rotation changes no saved data.
- The printed board frame is not exactly 44:60: maximum frame discrepancy is **0.6611%** (about 1 cm over the long edge). Positions follow the published vectors, not a claim of surveying accuracy. The user must compare real cutouts with printed dimension callouts for physical validation. Do not market this as independently measured, exact-to-the-millimetre geometry.
- Deployment/objective/Territory transcription retains the established glyph/path extraction in `extract-official-battlefields.py`, applied under an explicit v1.3 and SHA guard. Eleven straight Territory dividers follow the source half-field definition, as in the previous implementation.
- Objective markers remain separate from terrain areas and features. A printed glyph may straddle joined E areas. `objectiveAssignments` references all areas intersecting that glyph; it never creates an extra mission objective. Historical objective IDs and counts remain unchanged. New battles use the latest diagram glyph counts (for example p12 now has six, rather than five); the scoring algorithms are unchanged.
- Dense classification is recorded only for explicitly green component badges. Unlabelled images may include Dense AND Light features, so their class is deliberately omitted rather than inferred. D cues are verified classification labels, NOT invented physical feature silhouettes. The source remains authoritative for the physical ruin build and model placement.

## Persistence and compatibility

New official setups pin `battlefieldSourceId=event-1.3-2026-10-14`. Existing setups without it select the June v1.0 catalogue, including historical objective/deployment coordinates. Old games have an explicit “terrain was not recorded” note; they do not acquire fabricated historical terrain. Reconnect serialization and event-level Replay preserve the pin. An unavailable pin shows an error and unplaced markers, with no replacement deployment or custom layout.

The current Supabase room/event JSON transport already carries setup fields. Its existing RLS restricts layout events to the host; this change adds no migration, table or permission. The four-phone mock-backend test covers a consistent 16-area, two-zone map and reconnect, alongside existing CP/VP/Secondary checks. It does not claim a new live-database test.

## Visual review

The shared React SVG renderer was compared with source pages 9, 10, 29, 33, 41 and 53: all 16 areas per page, long/short types, rotated/near-mirrored E wedges, objective assignment, deployment and Territory orientation match the diagrams within the stated frame precision. This caught and removed an invalid inference that unlabelled features were Light. The [45-map contact sheet](terrain/contact-sheet-45.png) is rendered from the same component as the app, with no separate map engine. Browser screenshots independently check actual UI rendering in CI. No layout is certified as physically measured.

## Validation contract

- Vitest checks all 45 pairings, 16 typed areas, all polygon extents, board bounds, assignment references, preserved IDs, legacy pinning and serialization/Replay.
- Independent source dimension references cover p9 D1/top 6″, p10 D2/top 24″, p29 D3/right 5″, p33 D1/top 4″, p41 D3/bottom 10″, p53 D4/right 4″. The explicit 0.16″ acceptance accommodates the diagram's own scale/outline discrepancy; it is not sub-millimetre certification.
- Playwright loads all 45 actual UI plans and checks every typed area is visibly nonempty; exercises 390×844, 820×1180 and 1440×1000, layers, orientation, two-zone Doubles, dimensions and print styles. Existing battle tests additionally check live marker controls and unchanged state when hiding layers.
- CI exports 45 app screenshots and an A4 print sample as the `terrain-visual-review` artifact. Physical tabletop checking remains pending; schema success alone does not change the `vector-extracted` status.

## Coverage

| Source page | Force Dispositions | Variant | Areas | Objectives | Evidence status |
| --- | --- | --- | ---: | ---: | --- |
| 9 | take-and-hold / take-and-hold | A | 16 | 5 | vector-extracted |
| 10 | take-and-hold / take-and-hold | B | 16 | 5 | vector-extracted |
| 11 | take-and-hold / take-and-hold | C | 16 | 5 | vector-extracted |
| 12 | take-and-hold / purge-the-foe | A | 16 | 6 | vector-extracted |
| 13 | take-and-hold / purge-the-foe | B | 16 | 6 | vector-extracted |
| 14 | take-and-hold / purge-the-foe | C | 16 | 6 | vector-extracted |
| 15 | take-and-hold / disruption | A | 16 | 5 | vector-extracted |
| 16 | take-and-hold / disruption | B | 16 | 5 | vector-extracted |
| 17 | take-and-hold / disruption | C | 16 | 5 | vector-extracted |
| 18 | take-and-hold / reconnaissance | A | 16 | 5 | vector-extracted |
| 19 | take-and-hold / reconnaissance | B | 16 | 5 | vector-extracted |
| 20 | take-and-hold / reconnaissance | C | 16 | 5 | vector-extracted |
| 21 | take-and-hold / priority-assets | A | 16 | 6 | vector-extracted |
| 22 | take-and-hold / priority-assets | B | 16 | 6 | vector-extracted |
| 23 | take-and-hold / priority-assets | C | 16 | 6 | vector-extracted |
| 24 | purge-the-foe / purge-the-foe | A | 16 | 4 | vector-extracted |
| 25 | purge-the-foe / purge-the-foe | B | 16 | 6 | vector-extracted |
| 26 | purge-the-foe / purge-the-foe | C | 16 | 4 | vector-extracted |
| 27 | purge-the-foe / disruption | A | 16 | 6 | vector-extracted |
| 28 | purge-the-foe / disruption | B | 16 | 6 | vector-extracted |
| 29 | purge-the-foe / disruption | C | 16 | 6 | vector-extracted |
| 30 | purge-the-foe / reconnaissance | A | 16 | 6 | vector-extracted |
| 31 | purge-the-foe / reconnaissance | B | 16 | 6 | vector-extracted |
| 32 | purge-the-foe / reconnaissance | C | 16 | 6 | vector-extracted |
| 33 | purge-the-foe / priority-assets | A | 16 | 6 | vector-extracted |
| 34 | purge-the-foe / priority-assets | B | 16 | 6 | vector-extracted |
| 35 | purge-the-foe / priority-assets | C | 16 | 6 | vector-extracted |
| 36 | disruption / disruption | A | 16 | 5 | vector-extracted |
| 37 | disruption / disruption | B | 16 | 5 | vector-extracted |
| 38 | disruption / disruption | C | 16 | 5 | vector-extracted |
| 39 | disruption / reconnaissance | A | 16 | 6 | vector-extracted |
| 40 | disruption / reconnaissance | B | 16 | 6 | vector-extracted |
| 41 | disruption / reconnaissance | C | 16 | 6 | vector-extracted |
| 42 | disruption / priority-assets | A | 16 | 5 | vector-extracted |
| 43 | disruption / priority-assets | B | 16 | 5 | vector-extracted |
| 44 | disruption / priority-assets | C | 16 | 5 | vector-extracted |
| 45 | reconnaissance / reconnaissance | A | 16 | 6 | vector-extracted |
| 46 | reconnaissance / reconnaissance | B | 16 | 6 | vector-extracted |
| 47 | reconnaissance / reconnaissance | C | 16 | 6 | vector-extracted |
| 48 | reconnaissance / priority-assets | A | 16 | 5 | vector-extracted |
| 49 | reconnaissance / priority-assets | B | 16 | 5 | vector-extracted |
| 50 | reconnaissance / priority-assets | C | 16 | 5 | vector-extracted |
| 51 | priority-assets / priority-assets | A | 16 | 5 | vector-extracted |
| 52 | priority-assets / priority-assets | B | 16 | 5 | vector-extracted |
| 53 | priority-assets / priority-assets | C | 16 | 5 | vector-extracted |
