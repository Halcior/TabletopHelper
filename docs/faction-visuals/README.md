# Faction identity and private model photos

This feature builds on merged PR #28. PR #29 must remain unmerged until user playtesting.

## Implemented

- All 35 factions/subfactions in the current bundled catalogue, plus neutral. Exact normalized metadata and importer aliases; no unit-name guessing. Independent manual per-army overrides and a default theme.
- 20 original painted environments with 60 optimized WebP variants, plus **16 distinct original illustrated SVG environments** for previously reused faction/chapter art and optional Custodes Shadowkeepers. All 35 catalogue factions now have a distinct scene; regular Adeptus Astartes use the general Space Marines original. SVG variants reuse one resolution-independent file for mobile/banner/portrait. Abstract role/faction marks are project originals. [Asset provenance and sizes](ASSETS.md).
- Army banners, **original 56/72px faction emblems by default on unit cards**, compact scoreboard and objective-legend marks, real Chronicle event attribution, participant banners and standout portraits in the report. Doubles represents both commanders. Existing CP controls and player colours remain unchanged.
- Local army-banner and unit-photo upload, removal and reset. Images are keyed by army plus importer selection ID (otherwise source ID / unit ID), never unit name. Reimport retains photos when identities remain stable; two same-name selections stay independent.
- Persistent Minimal / Themed / Custom appearance, Off / Compact / Enhanced portraits, banners toggle, auto/manual theme. Custom includes personal photos; Themed uses environmental art. Hiding decoration does not delete photos.
- Print hides artwork and preserves statistics. Reduced motion, lazy images, fixed portrait dimensions and a broken-image fallback.

## Architecture and file map

| Path under `src/` | Responsibility |
|---|---|
| `features/factionVisuals/FactionSigil.tsx` | 37 original distinct emblem glyphs, never official GW logos |
| `features/factionVisuals/themes.ts` | Single theme registry, exact aliases, real metadata role lookup, CSS variables; matches the bundled catalogue; verified by tests |
| `features/factionVisuals/preferences.ts` | Versioned, validated localStorage preferences; Zustand state; cross-tab storage updates |
| `features/factionVisuals/media.ts` | Local Blob identity, format/size validation, WebP compression, Dexie live query and object URL cleanup |
| `features/factionVisuals/components.tsx` | Banner / portrait / symbol components and explicit event/player associations |
| `features/factionVisuals/VisualPreferences.tsx` | Global and per-army preferences |
| `features/factionVisuals/ArmyAppearance.tsx` | Lazy photo editor; saved army or battle-snapshot lookup |
| `features/factionVisuals/factionVisuals.css` | Fixed media geometry, theme treatments, mobile, print and motion styles |
| `persistence/database.ts` | Additive Dexie v2 `visualMedia` table; existing army and battle schemas preserved |
| `pages/Home.tsx`, `App.tsx` | Library entry points and lazy route |
| `components/battle/{ArmyTracker,Scoreboard,BattlefieldBoard,BattleLog,BattleReport}.tsx` | Presentation integrations; no engine or transport changes |

Fallback order: custom photo in Custom mode → faction environment → metadata role icon → neutral symbol. Environmental thumbnails are explicitly labelled as thematic, not illustrations of named units. The editor always shows a saved-photo preview so hidden photos can still be removed.

## Privacy, persistence and limits

Media live only in `tabletop-companion.visualMedia`. They are not attached to `Army`, `BattleSession`, event payloads, report JSON or multiplayer messages. Existing Supabase transport sends sessions/events; this feature adds no upload endpoint, bucket, account requirement or network photo sync. Local visual customization is presentation only and does not grant game-edit permissions to an opponent.

Input: JPEG/PNG/WebP, maximum 12 MiB; decoded images above 40 MP rejected. Canvas re-encoding strips source metadata. Long edge at most 384px for portraits / 1600px for banners, WebP quality .8, output at most 2 MiB. Browser storage errors surface in the editor. Browser storage can be cleared/evicted; photos do not form part of exported backups. Cloud photo sync is **not implemented**: account-based private media ownership/storage is outside the existing room/event transport.

No service worker was added: already-loaded app and local photos continue working offline; a cold offline app navigation is not promised. New importer IDs are new photo identities. There is no cross-device photo transfer.

## Performance

- 60 WebP assets: **1,575,456 bytes total** (~1.50 MiB), outside JavaScript.
- All production JS chunks: baseline **876.41 kB / 258.39 kB gzip**, feature **893.87 kB / 265.85 kB gzip**: about **+17.4 kB / +7.4 kB gzip**. These are totals across lazy chunks, not the initial transfer.
- CSS: 232.01 → 236.94 kB, gzip 43.09 → 44.17 kB.
- Scoreboard/legend marks need no image requests. A visible army needs up to one responsive banner URL plus one shared thematic portrait URL; repeated unit thumbnails use browser caching. Custom images use local Blob URLs. Off-screen images are lazy. Minimal fresh load requests **zero faction-art URLs** (tested); the photo editor may still display already-saved local previews.
- Media never increase multiplayer/event/JSON payload size.

## Validation and reproduction

- TypeScript and production build pass.
- Vitest **562/562**, 68 files (518 existing + 44 new).
- New Playwright suite **9/9**, including widths 375 / 390 / 768 / 1440, real repeated damage clicks and stable card position, portrait/name separation, CP, no horizontal overflow or page errors, persistence, same-name units, reimport, invalid/corrupt photos, missing art, offline local photos, Minimal requests, v1 native IndexedDB migration and same-faction player colours.
- Full local run: 59/62 initially; the three failures (heading accessible name, unnecessary metadata request, legacy fixture open connection) were corrected. All 14 tests in the affected suites then passed. See PR checks for the final full-suite CI result. Physical live-device Supabase playtesting is not claimed by deterministic browser tests.
- Print/PDF: A4, 9 pages; inspected render, decorative backgrounds removed. Screenshots are real Chromium app captures, not mockups. Test fixture copies Custodes statistics into a synthetic Necron-labelled roster for visual comparison; it is **not a legal Necron roster recommendation**. The sample custom portrait is an original environment crop, not a user's model photo.

```sh
npm ci
npx tsc --noEmit
npm test -- --run
npx playwright install chromium
npx playwright test
FACTION_CAPTURE=1 npx playwright test e2e/faction-visuals.spec.ts
python3 scripts/optimize-faction-captures.py # Pillow; lossless screenshot packaging
npm run build
```

## Screenshots

Each surface is captured at all four requested widths in [screenshots](screenshots/). Files use lossless WebP converted from the captured PNGs; no visual content is altered.

| Surface | Phone (390px) | Desktop (1440px) |
|---|---|---|
| Custodes vs Necrons | [Dashboard](screenshots/390-dashboard.webp) | [Dashboard](screenshots/1440-dashboard.webp) |
| Custodes army | [Army](screenshots/390-army-custodes.webp) | [Army](screenshots/1440-army-custodes.webp) |
| Unit portraits / actual damage | [Cards](screenshots/390-unit-portraits.webp) | [Cards](screenshots/1440-unit-portraits.webp) |
| Necrons without own photos | [Army](screenshots/390-army-necrons.webp) | [Army](screenshots/1440-army-necrons.webp) |
| Minimal | [Minimal](screenshots/390-minimal.webp) | [Minimal](screenshots/1440-minimal.webp) |
| Chronicle | [Events](screenshots/390-chronicle.webp) | [Events](screenshots/1440-chronicle.webp) |
| Report | [Report](screenshots/390-report.webp) | [Report](screenshots/1440-report.webp) |

[Print/PDF sample](screenshots/report-print.pdf).

## User playtest

1. Open Army Library → Appearance & photos. Add a different photo to two same-name units; reload and verify both.
2. Switch Custom / Themed / Minimal; toggle portraits/banner; confirm hidden photos remain in the editor.
3. Start Duel, FFA or Doubles, check CP and wounds, objective ownership colours and Chronicle attribution.
4. Print the report. Photos remain private to the local browser; another phone should not receive them.

## Preview access

Vercel's GitHub check can confirm deployment status. The current Vercel connection reports HTTP 403 for team `halciors-projects`: missing team access grant. No authenticated Vercel CLI is available in this workspace. A share-link creation and independent access verification remain blocked until that connection is granted the team's access. Project protection has not been changed.

## Unique-scene artwork pass (21 October 2026)

The 16 supplemental vector panoramas intentionally have **different architectural subjects**, not palette-swapped WebP backgrounds. Notable scenes: Shadowkeepers underground containment vault, Agents sealed archive, Emperor's Children decadent theatre, Space Wolves ice bastion, Grey Knights ward sanctum, Raven Guard stealth hangar, Salamanders obsidian forge. Each SVG is a complete environmental scene, with left-side negative space for text, and a distinct silhouette on the right. These are *illustrated vector studies*, not photorealistic replacement paintings; their difference in rendering technique is transparent and can be further refined after review.

**Shadowkeepers is a manual visual override.** The imported `Adeptus Custodes` army automatically stays Custodes; choose `Custodes · Shadowkeepers` from Appearance & photos → Army theme to opt in. The override affects only presentation. No battle schema, rules, point accounting or multiplayer permissions change.

A [GitHub-viewable 36-image contact sheet](CONTACT_SHEET.md) is available without Vercel access. An interactive [visual contact sheet](../../public/faction-art/gallery.html) groups all faction environments and optionally displays them in monochrome so differences in architecture can be evaluated without colours. In a deployed Preview the URL is `/faction-art/gallery.html` (the Preview may require Vercel authentication). Each tile shows whether its image is painted WebP or illustrated SVG; it does not pretend both are equivalent finishes.

New automated tests require every catalogue faction to reference a unique actual file; the SVG rendering path is shared by banners and portrait thumbnails. Existing photo overrides still take precedence in Custom mode.

## Faction emblems on unit cards

Unit cards now show one original emblem per faction, not a thumbnail of the environment artwork. In Custom mode, a private saved unit photo takes precedence; when missing or broken it falls back to the original emblem. Compact and Enhanced change only size, Off and Minimal hide the decoration. Background artwork remains on army banners. This does not affect saved armies, game logic or multiplayer. The emblem artwork is purpose-drawn, not copied from Games Workshop trademarks.
