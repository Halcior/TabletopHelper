# TabletopHelper — 11th Edition rules and Doubles audit (2026-10-15)

## Official sources (checked)
- [Warhammer Event Companion, version 1.0](https://assets.warhammer-community.com/eng_12-06_warhammer40000_event_companion-s3bfb5f9s1-ivswuij3fo.pdf), pages 1–3 and terrain diagrams (physical objective counts validated against pinned JSON extracted 2026-10-13).
- [Warhammer Doubles Event Companion, version 1.0](https://assets.warhammer-community.com/eng_12-06_warhammer40000_doubles_event_companion-xyapytrwkz-9a6fljmnob.pdf), pages 1–4.
- [Warhammer Community downloads](https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/) for live errata and updates. Check this page before an event; this audit intentionally pins the above PDFs.

## Verified / implemented
| Rule | Duel 1v1 | Doubles 2v2 | Evidence |
| --- | --- | --- | --- |
| Asymmetric Primary from ordered pair of Force Dispositions | Implemented (25 matrix choices) | Two team dispositions reuse Duel matrix | `duelPrimary.ts`, `getDuelMission` |
| Three layouts per unordered Force Disposition pairing | Implemented | Reused | `officialLayouts.json`, `layouts.ts` |
| Physical objectives vary by layout: 4–6, not a mandatory six | **Fixed for new sessions** | **Fixed for new sessions** | `officialObjectivesForPair`, full 25×3 test |
| Attacker vs Defender independent of first-turn roll | Implemented | Implemented by team | `battlefieldAttackerHomeZone`, separate `turnOrder` |
| Five Battle Rounds | Implemented | Implemented | engine progression / ten 2v2 team turns test |
| Tactical or Fixed, two active Secondaries | Implemented | One deck per **team**, not per person | `createSecondaryInitializationEvents` |
| One Core CP per side at the relevant CP step | Implemented | One Core CP per **force** | engine projections and two-person turn order |
| Shared CP and VP (max Primary 45, Secondary 45, Battle Ready 10) | Per player | Per force | scorekeeper projection and report tests |
| Primary max 15 VP per round | Implemented | Per team | `duelPrimaryPreview` |
| Secondary max 15 VP/round, max 45 VP/game; Fixed card max 20 | Implemented | Per team | `scoreOfficialSecondary` |
| Five completed rounds even after an army is tabled | Engine continues | Engine continues | end-of-battle logic |
| Each physical player's models, Wounds and casualty attribution | Independent | Independent for all four | battle store, unit performance |
| CP and Stratagem usage restrictions belong to whole team | N/A | Implemented core sharing | stratagem timing + team tests |
| Four independent lobby identities and readiness | Two | Four | `SharedSessions.tsx`, shared store, GW-Doubles DB migration |
| Chapter Approved board view / scoring | Mission-specific | Mission-specific | `officialLayouts.json`, `officialObjectiveCounts.test.ts` |

## GW Doubles v1.0 specifics requiring manual tabletop judgement
- Each *force* selects exactly one CHARACTER Warlord and one Force Disposition available to either included army.
- Epic Heroes, once-per-army datasheets, Enhancements and once-per-army Upgrades cannot be duplicated across the two rosters.
- A **Unified Force** requires both armies to share all faction keywords after ignoring allied units. A **Force of Convenience** has partner units that are neither friendly nor enemy for the relevant rules.
- A Unified Force shares army rules and (if identical) Detachment rules; otherwise each Detachment's effects are restricted to its own army and enemy units. Transport interactions also require the correct Unified classification and unit restrictions.
- Deployment, strategic reserves, redeploys, physical movement, OC control, conditions involving distances, wholly-within / wholly-outside Territory, terrain area footprints, LOS and damage must be checked by players. No GPS-like model position or automatic LOS assertion is made by this app.
- Team painting Battle Ready is declared at the table for **both** armies before awarding 10 VP.
- The UI stores each army's faction and selected force category, but does **not** automatically certify codex legality, available disposition, duplicate Epic Heroes/Enhancements, detachments or all special interactions. Players must check rosters before play.

## Known functional limitations (disclose, do not silently score)
1. The current Chapter Approved Primary and Secondary screen is a **human-confirmed scoring assistant**, not an automated referee. For example, seeing "condition met" on a form does not prove the tabletop state.
2. Official `A Tempting Target` Duel card uses a text-entered objective chosen by the opponent; the app does not enforce a simultaneous blind selection on separate devices. Agree the target at the table before saving.
3. Extra-CP allowances from army rules must be checked manually (Doubles force: max one extra CP per Battle Round). The direct `+CP` adjustment intentionally remains manual, so the app cannot distinguish a legal generation ability from an administrative correction.
4. Very close simultaneous offline CP expenditure by both teammates may require reconciliation because the existing shared-event transport orders events after submission; no DB-side atomic CP reservation has been proven. Check the shared pool before jointly committing a Stratagem.
5. Full legality of all 25 printed Primary Mission cards and every Chapter Approved Secondary has **not** been certified against a complete official card deck; current tests verify configured conditions and arithmetic against the app definitions. Do not claim certification without a card-by-card source comparison.
6. Historical official sessions with six recorded objective IDs are preserved; their unmatched IDs remain unplaced in Board mode. Only **new** official sessions get exact 4–6 objective sets, avoiding migration of old scored events.

## Original game modes
- `Duel 1v1`: official Chapter Approved mode can use 25 Force Disposition combinations, 45 pairing layouts and their exact source objective count.
- `Cauldron Duel`: app-specific homebrew; not a GW tournament format. Its schematic and scoring should not be presented as official.
- `FFA 3`: homebrew mode with tailored Rival rotation, Primary balancing and/or Chapter Approved Tactical Secondary adaptation. GW Event/Doubles Companion does **not** certify its scoring balance.
- `Doubles 2v2`: official *format* per GW Doubles Event Companion; team control is implemented, but app assists rather than replaces physical game rulings.

## Production checklist
- [ ] Full GitHub CI passes at the PR head: TypeScript, Vitest, 4-client Playwright, all legacy E2E, production bundle.
- [x] Additive four-seat lobby migration present on the branch and previously applied to the linked Supabase project.
- [x] Transaction-safe SQL checks for invalid four-seat rooms and old Duel 2-seat rooms; Supabase security advisor reports no lints.
- [ ] Run a complete live tabletop playtest (4 physical phones) before calling every card flow field-tested.
- [ ] Resolve concurrency for simultaneous team CP expenditures before advertising hard prevention.
- [ ] Verify user-visible onboarding and Warlord/Force roster validity with actual army exports.
- [ ] Once all above are satisfactory, remove PR draft, merge and verify Vercel deployment without changing stored games.

This document distinguishes verified engine behavior from manual game confirmation and unresolved integration risks.