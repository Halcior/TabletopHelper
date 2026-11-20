# TabletopHelper — Warhammer 40,000 11th edition audit

Review date: 20 November 2026. Repository baseline: `main` at `1f4b1a6541569b4b28685c3c791cfe1df2e41f88`. This update covers the Chapter Approved tools for Duel and Doubles and checks their integration with the community FFA format.

## Official sources

Dates are the dates listed by Games Workshop. PDF hashes and source metadata are recorded in [the rules source registry](../src/rulesets/officialRuleSources.json). The live downloads index returned the same documents on the review date.

| Document | Published / updated | Evidence used |
| --- | --- | --- |
| [Warhammer Event Companion](https://assets.warhammer-community.com/eng_14-10_wh40k_event_companion-rdwnqprl4c-nj8oqogadv.pdf) | v1.3 · 14 October | Event procedure and caps, p. 1–3. Mission FAQ, p. 4. Terrain key and 45 layouts, pp. 7–53. |
| [Warhammer Doubles Event Companion](https://assets.warhammer-community.com/eng_wh40k_doubles_event_companion-x8bakj0hba-chdctfbcoc.pdf) | v1.1 · 26 August | Team muster and mission sequence, pp. 1–2. Two armies per team, one disposition available to either army, one Secondary selection per team. |
| [Core Rules](https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf) and [Universal Rules Updates](https://assets.warhammer-community.com/eng_wh40k_core&key_universal_rules_updates-lu3grocned-rphh78bl6k.pdf) | 1 June and v1.1 · 26 August | Edition baseline including Command CP, tabletop terms and general errata. The indexed downloads did not expose a separate 11th edition Rules Commentary or Core Rules FAQ with additional mission changes. |
| [Armageddon terrain area footprints](https://assets.warhammer-community.com/eng_12-06_warhammer40000_terrainareafootprints-biavo5zf9f-gxdahkydbj.pdf) | 12 June | Printable shapes used by the existing atlas. |
| [Munitorum Field Manual](https://mfm.warhammer-community.com/) | 14 October according to [GW Downloads](https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/) | Listing date verified. The live Field Manual returned HTTP 403. Current complete costs by unit, Detachment Points, Force Dispositions and roster legality remain unverified. |
| [Chapter Approved deck overview](https://www.warhammer-community.com/en-gb/articles/p3i6aa3h/the-chapter-approved-deck-what-is-it-and-how-does-it-work/) | June | Official preview images show Centre Ground and Assassination. The Event Companion specifies event timing, strategy and caps. |
| [Custodes Codex updates](https://assets.warhammer-community.com/eng_14-10_wh40k_printed_product_updates_adeptus_custodes_updates-fmj4bdwwhh-0qshh8eauk.pdf), [Custodes detachment tips](https://www.warhammer-community.com/en-gb/articles/4a8o9tzw/adeptus-custodes-top-detachment-tips/) and [13-detachment preview](https://www.warhammer-community.com/en-gb/articles/joz5iubm/your-first-look-at-13-new-adeptus-custodes-detachments/) | v1.0 · 14 October, 1 October, 28 September | Codex-era context and seven explicitly announced DP costs. Where a June detachment was reprinted, the October DP evidence does not carry over the former disposition. |
| Faction Pack updates for [Death Guard](https://assets.warhammer-community.com/eng_30-09_wh40k_faction_pack_death_guard-bp5c8lcjq6-i4ew7urwyk.pdf), [Thousand Sons](https://assets.warhammer-community.com/eng_30-09_wh40k_faction_pack_thousand_sons-4lioijwxdj-otjrinzt8c.pdf), [World Eaters](https://assets.warhammer-community.com/eng_30-09_wh40k_faction_pack_world_eaters-rxxj1fzectxb.pdf), [Necrons](https://assets.warhammer-community.com/eng_30-09_wh40k_faction_pack_necrons-1urphgbmpy-wbhocjbaba.pdf), [Aeldari](https://assets.warhammer-community.com/eng_14-10_wh40k_-faction_pack_aeldari-seqmcs1mu0-g8gzewikcm.pdf), and [Custodes index](https://assets.warhammer-community.com/eng_30-09_wh40k_faction_pack_adeptus_custodes-xlscee8b1b-b1evo9u920.pdf) | Respectively v1.3, v1.3, v1.3, v1.3, v1.4 and v1.2 | Cross-checked the faction document versions and scope. The packs and Codex updates do not supply a replacement live DP/disposition table. |

## CONFIRMED CHANGE

- GW published its [July update](https://www.warhammer-community.com/en-gb/articles/rgqanids/warhammer-40000-july-update-what-you-need-to-know/) and the [separate Tacoma ruling](https://www.warhammer-community.com/en-gb/articles/hkjbvun1/important-updates-for-warhammer-40000-players-at-the-tacoma-open/). The latter is event-specific. The current event documents take precedence here.
- The [August update](https://www.warhammer-community.com/en-gb/articles/b4zj2o7u/the-warhammer-40000-august-update-everything-you-need-to-know/) changed some layout placements and increased six-objective options for some Disruption matchups. It also removed some detachment composition restrictions, such as the restriction between Mortarion's Hammer and Contagion Engines. Doubles v1.1 updated the layout step to reference the same A/B/C catalogue. Those diagram and format changes were already present on `main`.
- The [30 September balance update](https://www.warhammer-community.com/en-gb/articles/rylbvfnv/warhammer-40000-balance-update-emboldened-astartes/), [October faction balance follow-up](https://www.warhammer-community.com/en-gb/articles/vzqu6tzw/warhammer-40000-balance-update-chaos-the-imperium-and-xenos-fight-back/) and Custodes Codex replace earlier roster assumptions. For example, GW published 1 DP for Codex Lions of the Emperor and Null Maiden Vigil, which were listed at 2 DP in June. [June table](https://www.warhammer-community.com/en-gb/articles/8nrrdlgr/new40k-download-new-imperial-faction-packs-today/) · [October Codex tips](https://www.warhammer-community.com/en-gb/articles/4a8o9tzw/adeptus-custodes-top-detachment-tips/)
- GW's [29 October update notice](https://www.warhammer-community.com/en-gb/articles/cumo9vbg/the-warhammer-40000-updates-update/) schedules the next quarterly update for the week of 7 December. The downloaded Companion is v1.3 and its Chapter Approved card errata section lists no amendments. Its FAQ does include scoring and timing rulings.

## IMPLEMENTATION BUG

| Impact | Evidence | Fix and regression coverage |
| --- | --- | --- |
| **Purge the Foe vs Purge the Foe A and C** each lost two possible Expansion objectives, affecting objective control, overall counts and missions that refer to Expansion objectives. | Companion v1.3 pp. 8, 24 and 26. Both diagrams also contain these diamonds in the June v1.0 PDF. Their vector fills are about 21.75 × 20.25 PDF points, outside the previous glyph size filter. | `extract-official-battlefields.py` extracts both compact glyphs, and `extract-terrain-layouts.py` resolves their actual positions and footprint assignments. New catalogue has six objectives on each of these maps. Tests check exact four corrected coordinates, page counts, separate historical catalogue and BYA reconnect. |
| **End-of-battle Primary** could be under-awarded by applying the 15 VP round cap before the separate closing award. | Companion v1.3 p. 4 scoring-limits FAQ. | `duelPrimaryPreview` applies the 45 VP game cap at this window. The test spends the full 15 VP in round five then verifies the closing award and preserved legacy calculation. |
| **Vital Link** could award only one cumulative marker because the base condition was a checkbox. | Companion v1.3 p. 4 Vital Link ruling. | A checked prerequisite permits any reported count of markers in range of controlled central objectives. A count-based base still bounds its corresponding subset. Regression covers multiple markers and missing prerequisite. |
| **Death Trap** guidance could be read as requiring a trap active before a kill. | Companion v1.3 p. 4 Death Trap ruling. | Clarified the timing in the Primary condition shown to players. The physical condition is confirmed at the table. |
| **Beacon** could be scored with no locked target, or while its selected unit was recorded as destroyed or in Reserve. | Companion v1.3 p. 4 Beacon ruling and the target's scoring requirement. | `officialSecondary.ts` keeps the single locked roster unit and checks its recorded status in new games. Unit position still requires tabletop confirmation. |
| **Plunder** accepted an action with no confirmation of the terrain area's relationship to Territory. | Companion v1.3 p. 4 Plunder ruling. The terrain area is the subject of the restriction. | Record the area using atlas IDs where available and record the player's explicit tabletop confirmation. Tests check both rejection and Doubles attribution to the acting teammate. |
| **Rules Source** labelled the October Duel PDF v1.0 and linked the June Doubles PDF. | The live GW index and checked PDF covers show Event v1.3 and Doubles v1.1. | Battle Setup uses the versioned links from the source registry and E2E checks the Doubles link. |

Duel and Doubles now record the opponent's A Tempting Target choice using a known objective ID. The opponent still makes the choice at the table. Burden of Trust reuses the team/roster guard selectors. Eligibility and phase checks use recorded data. Position, occupancy, ability conditions, control by a particular acting unit, and target legality that depends on physical positions still require tabletop confirmation. No Prisoners and Overwhelming Force in Duel and Doubles use player-confirmed awards. FFA retains its existing recorded-kill attribution for its assigned Secondary Rival.

## Layout verification

The current catalogue was reproduced directly using the hash-pinned PDF. All 45 source pages were compared with the checked-in geometry. The 16 terrain-area outlines per page, deployment paths, Territory paths and recorded feature evidence match the existing extraction when the additional objective glyphs are accounted for. The 25 ordered Primary assignments were independently compared with the mission names on the two sides of all 45 pages. The matrix matches.

The corrected catalogue contains 21 five-objective layouts and 24 six-objective layouts. Tests verify unique IDs, source bounds, correct HOME roles with reversed turn order, and 90° landscape and 180° flip transforms. Visual footprints are independent of ownership and VP. See the [existing atlas audit](official-terrain-atlas.md) for extraction precision and sampled physical dimensions. PDF geometry carries diagram precision. Physical terrain measurements, unlabelled individual Light terrain features and an on-table test of every layout remain unverified.

## UNVERIFIED

- The public Companion confirms all 25 Primary names and pairings and the shared event rules. The complete printed 25-card Primary and 18-card Secondary sets were unavailable from the reviewed first-party publications. The remaining exact clauses, action requirements and VP values beyond the verified Companion passages and two Secondary previews remain unverified. Community card references are available in the UI as references and were not the basis of scoring changes.
- The [June GW detachment publications](../src/domain/army/forceDispositionSources.json) provide 266 dated rows. These are historical evidence. The newer public Custodes rows provide seven Codex-era DP values but lack full confirmed disposition mappings. Until the current MFM is reachable, the app flags the choice as **Not verified**, highlights the previously published options, and allows manual confirmation. It cannot certify current point costs, DP budgets, duplicate upgrades, Warlord compliance or legal detachment combinations. In Doubles, the captain sees evidence from both staged armies, with each army's DP shown individually.
- The import date and New Recruit's game-system/catalogue revisions indicate provenance. They do not establish Games Workshop points equivalence. A pre-14 October import can show a freshness notice. Existing rosters keep their units; a reimport of identical contents does not create another variant because of metadata alone.
- No live production Supabase migration, match or physical phone test was performed. Existing SQL tests exercise the schema and transport locally. The official HTML download listing is checked for MFM date changes but cannot attest to the contents of the Field Manual.

## Historical battles and updates

New Chapter Approved sessions pin the rules update and corrected catalogue independently. Older saves retain their objective IDs, geometry and awarded events. The previous October and June layouts remain available for their original pins. Reconnecting to pre-update BYA rooms preserves their previous client-side objective catalogue. Local rematches may reuse the recorded map and its objective IDs. An online official rematch uses the catalogued map for the new lobby's confirmed dispositions. JSON fields are additive and pass through the existing Supabase setup and army payloads.

Balanced FFA v1, Current Rival rotation, per-card Secondary Rival, VP balance and the seven-objective map retain their existing behavior. Changes to official mission windows are gated by the new official setup version. Existing combat records, Chronicle and Timeline remain event-derived.

Run `node scripts/check-official-rule-sources.mjs` to compare indexed document dates, URLs and PDF hashes with the pinned registry. Exit 0 indicates no listed differences, 1 reports changes and 2 reports retrieval errors. This command only produces a report. Review the underlying source and generate a distinct version before changing data used by new games.

## Tests

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm test -- --run` | 746 passed across 91 files |
| `npm run build` | Passed |
| `npm run test:sql` | Passed locally using PostgreSQL test transactions |
| Production offline E2E | 3 passed: two roster scenarios and the separate Battle Companion cache scenario |
| `node scripts/check-official-rule-sources.mjs` | Passed. No indexed source differences. MFM result is limited to the public listing date. |
| `npm run test:e2e` | Full development run: 98 passed, 3 failed, 4 skipped. The three failed scenarios passed on the follow-up run after fixing the source-version display. Two of those failures were timeouts in the clock reconnect and War Chronicle scenarios. The four skips cover three production-offline cases run separately and one optional external CSV fixture. The workspace used a temporary Fontconfig override because the bundled Chromium reported zero-size text with the default system fonts. |

Coverage includes Duel, community FFA, Doubles, imports, source pins, reconnect, rematches, reports and archive replay.

## Three-phone check

1. Open the same build on three phones. In a new online FFA room, stage a different army per seat, set the host's turn order, ready all three seats and start.
2. Verify the same seven objectives and Current Rival on all phones. Draw a Tactical Secondary, check its named Secondary Rival and record a qualifying action and casualty. Confirm the VP award and matching entries in Chronicle and Timeline.
3. Disconnect the third phone for one phase, change objective control from the active phone, reconnect and compare score, ownership and event order.
4. Reuse two phones for a new official Duel. Select Purge the Foe on both, choose Layout A or C, reverse first turn versus Attacker, and verify six markers plus stable HOME ownership. Open a prior four-objective save and review its recorded map. With a fourth phone available, check that the Doubles captain sees both allied rosters and the shared CP, VP and Secondary hand.
