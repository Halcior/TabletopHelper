# Battle Companion — implementation and verification

## Architecture decision

The existing app already imports New Recruit JSON and TabletopHelper JSON backups,
stores unique roster instances in Dexie, and replays battle events into the same
CP/score/unit state. Battle Clock, casualties, phase navigation and mission rules
remain owned by their existing modules.

The reader uses those rosters rather than introducing an army builder. Rules live
in a separate content-addressed IndexedDB cache. Manual datasheet choices and
favorites are scoped by account, army/battle player and dataset, so they cannot
silently apply to a different rules version. NR selection IDs are not Wahapedia
IDs. An automatic match requires an exact normalized name AND known faction;
ambiguous, allied or renamed entries require a manual choice.

The existing online CP reducer clamps spending to zero and the shared transport
does not atomically validate balance at write time. Companion therefore **does not
offer online stratagem spending/refunds**. This is enforced in the mutation policy,
not just by a disabled button. Online readers and per-player snapshot selection
use existing session synchronization. No production database migration was applied.

## Included

- Lazy-loaded Battle Companion overlay in an active battle; the battle remains
  mounted, including its clock. Choose the using player at the top before opening
  a stratagem. A standalone reader is available on each Army Library card.
- Searchable, separate unit instances, roster and current model counts, existing
  Leader assignments and enhancements, characteristics, selected/uncertain weapons,
  keywords, abilities, damaged/transport rules, loadout options and source links.
- Separate original roster section; differing model and weapon profiles are flagged.
- Exact equipment name matches appear first. Variant suffixes, quantities and
  partial names are never guessed; other profiles remain available and labelled.
- Core/faction/configured-detachment stratagem library, full plain-text conditions,
  phase/turn/type/search filters, favorites and optional datasheet relationship filter.
  Blank faction is not treated as Core: Boarding Actions entries are excluded.
  Unknown timing stays visible. Unit abilities have no reliable structured timing
  in the export and remain under “Other / check conditions”.
- Multiple configured detachments are supported by name. Force Disposition alone
  does not establish a datasheet/stratagem/detachment relationship.
- English and Polish interface labels; source rule text remains in source language.

## Local CP operations

Opening a rule does nothing to battle state. “Use stratagem” opens a confirmation
with the player, base cost, editable actual cost, optional unit and before/after CP.
Zero is accepted; negative/fractional/nonfinite costs, overspending and an invalid
target unit are rejected. The cost modification is the player's decision.

One `COMPANION_STRATAGEM_RECORDED` event updates the existing CP pool and records
source ID, dataset, player, actual/base cost, round, phase and optional target.
It is independent of whose turn it is. In Doubles it uses the **existing shared
team CP pool** while attributing the stratagem to the actual commander.
An operation UUID deduplicates retries even with different event IDs and after
rehydration. The UI waits for the queued IndexedDB save before closing confirmation.
Chronicle includes the record; the normal report consumes that same history.

“Undo use” appends `COMPANION_STRATAGEM_REVERTED`, refunds the actual paid cost once
and marks the use reverted. It does not restore an old balance or erase subsequent
CP changes. Rejected replay operations never charge or refund points. Ordinary
battle undo/redo remains available for the most recent action.

Use a local battle on one active device/tab. This is not a cross-tab transactional
CP system. Online Companion is reference-only for CP; manual CP buttons remain.
The next online step needs a server-validated, idempotent CP operation with a
canonical balance and an explicit result, coordinated with *all* existing CP writers
and the offline outbox. A cosmetic client lock would not solve that problem.

## Data provider and updates

Sources inspected on 2026-11-12:

- [Wahapedia 11th edition data export](https://wahapedia.ru/wh40k11ed/the-rules/data-export/)
- [Export specification](https://wahapedia.ru/wh40k11ed/Export%20Data%20Specs.xlsx?v=20260817b)

The specification states UTF-8, `|` delimiters, string identifiers and HTML
descriptions. Actual files additionally contain unquoted HTML line breaks and
repeated ability IDs across factions. The parser supports BOM/CRLF, inch marks,
quoted delimiters/newlines/escaped quotes and the fixed-width, trailing-delimiter
multiline records actually exported by Wahapedia. Linked abilities resolve using
the datasheet faction, retain parameters, and flag ambiguity instead of selecting
a conflicting record. Orphan references remain visible as import warnings.

HTML is converted to text and rendered as React text; no upstream HTML executes.
Source links are limited to HTTPS Wahapedia URLs.

“Download Wahapedia CSV” fetches the fixed list below through `/api/rules-export`.
The Vercel Node function accepts only allowlisted filenames, has a timeout/response
size limit and never forwards credentials or user-provided URLs. Each file is
below the platform response limit. Vite provides the same route in development.
No unit page scraping or background polling is performed. API responses bypass
the service worker cache. Last_update is checked before and after the download.

Importing a new dataset **does not select it**. Users explicitly choose/confirm
the snapshot. A SHA-256 content ID, source, edition, upstream export timestamp,
import timestamp and missing-data warnings identify the snapshot. A battle stores
the chosen manifest **per player** in its replayable history; each phone must have
the matching CSV snapshot cached. Missing pinned snapshots are not replaced with
the latest cache. Outside a battle, selection is a local army preference.

The export's upstream timestamp is not proof of rules correctness or completeness;
neither is the import date. Source records retain edition/version/errata fields.

### Manual files

Download from `https://wahapedia.ru/wh40k11ed/<filename>` and select the files
together in “Import CSV files”. Minimum: `Factions.csv` and `Datasheets.csv`.
For the full implemented reader, use:

```text
Factions.csv
Source.csv
Datasheets.csv
Datasheets_models.csv
Datasheets_wargear.csv
Datasheets_abilities.csv
Abilities.csv
Datasheets_keywords.csv
Datasheets_options.csv
Datasheets_unit_composition.csv
Stratagems.csv
Datasheets_stratagems.csv
Detachments.csv
Detachment_abilities.csv
Datasheets_detachment_abilities.csv
Enhancements.csv
Last_update.csv
```

No user-supplied CSV files were needed for development: the real export was
downloaded successfully. Raw downloads totalled 6,771,350 bytes for these files;
they are not committed to git. In a deployment where upstream access is blocked,
manual upload is the fallback. Static hosting without the API supports manual
import; `vite preview` alone does not execute server functions.

The export page invites mechanics research and related interfaces and recommends
attribution. “Powered by Wahapedia” links to the source. That statement is not a
blanket copyright licence for underlying GW text/artwork; no such licence was
assumed. There is no bundled rules dump or new image redistribution in this PR.

## Formats and boundaries

Supported rosters: existing **New Recruit JSON** and **TabletopHelper JSON backups**.
`.ros` and `.rosz` were not added or claimed. Manual weapon changes remain in the
existing roster editor; Companion offers manual datasheet confirmation, not a new
wargear builder. Existing Leader links are shown, never invented from eligibility.
No new wounds/model/actions tracker or automatic effect/legality engine was added.

The read-only army dropdown can inspect opponents whose rosters already exist in
the shared session. Only the owning seat can change its shared snapshot selection.
Manual matches/favorites remain device preferences, not cloud roster edits.

## Offline

- Once imported, rules are stored in IndexedDB and can be read through connection loss.
- The existing production service worker caches the app shell, including the new
  lazy chunks. A production E2E test verifies full offline reload of a cached reader.
- A first visit, uncached snapshot or fresh rules download needs a connection.
- Local CP operations use the existing local battle save. Online CP operations are
  disabled rather than queued and presented as successful.
- Clearing browser data removes cached rule text/preferences. A battle's recorded
  manifest remains identifiable, but importing the corresponding dataset is needed.

## Real-data audit

Downloaded export timestamp: `2026-10-30 22:19:16` (source timezone GMT+3).
Dataset: `waha-11-7d031bd707c86ba293609a8c5c186fffde3c3286b9703b19d3a1d86812cc838d`.

| Unit | ID | Model profiles | Weapon profiles | Ability rows |
|---|---|---:|---:|---:|
| Trajann Valoris | 000001446 | 1 | 2 | 9 |
| Allarus Custodians | 000001453 | 1 | 5 | 5 |
| Custodian Wardens | 000001450 | 1 | 4 | 5 |
| Telemon Heavy Dreadnought | 000001479 | 1 | 7 | 5 |

The existing real `test-data/1700.json` roster matched 7/11 names automatically.
Custodian Guard, Prosecutors, Witchseekers and allied Inquisitor Draxus require
manual lookup against this export. No silent aliases were introduced.
The audit also reported repeated ability IDs and orphan references in six tables.
Synthetic parser/CP fixtures are marked TEST ONLY and are never loaded by app code.

Reproduce data audit (from repo root):

```bash
npx vite-node scripts/check-companion-data.ts /path/to/csv
# Optional explicit download first:
npx vite-node scripts/check-companion-data.ts /path/to/csv --download
```

## Verification and phone check

Automated coverage includes parsing, namespace/faction matching, ambiguous choices,
weapon uncertainty, unknown timing, source URL safety, proxy allowlist, CP 0 and
invalid costs, duplicate operations, reloads, actual-cost refund after later gains,
2/3/4-player state and the real Doubles shared CP pool, online mutation denial and
snapshot ownership/replay. The final complete Vitest run passed **736 tests across 90 files**; TypeScript and the production build also passed. The build retains existing large-chunk warnings.

Browser flows in `e2e/companion.spec.ts` cover duplicate roster instances, manual
match persistence, another player's turn, 0/1 CP, insufficient CP, refund, real
Custodes CSV upload and connection loss. A production-only test verifies offline
reload. Run the real-data scenario with `COMPANION_CSV_DIR=/path/to/csv`.

**Visual verification limitation:** this execution environment's Chromium reports
zero glyph widths even for a standalone `<h1>Hello</h1>` page. Functional Companion
browser tests pass using DOM text/state assertions, but screenshots cannot certify
typography/layout. Existing `no-stratagems.spec.ts` scenarios stop at their import
helper's heading visibility assertion for this same environment issue. Run them
and inspect mobile/desktop appearance in a normal browser before merging.

On the preview deployment:

1. Import/open your army, then choose **Battle Companion** on its library card.
2. Expand rules data, download CSV (or import the files above), then explicitly use
   the snapshot. Check Trajann, Allarus, Wardens and Telemon; manually resolve others.
3. Open an active local battle → **Battle Companion** → choose the player.
4. Select a snapshot, open **Stratagems**, open a rule and confirm a cost/optional
   target. Verify CP in the normal scoreboard and the entry in Chronicle.
5. Change CP with existing controls, then use **Undo use**; only the paid cost returns.
6. Test the reader with the phone offline, including a reload after the app shell
   has been cached. Verify that an imported update does not switch the battle snapshot.

The server function still needs deployment-side smoke testing; local CSV validation
does not establish that Vercel can reach Wahapedia. Do not merge solely on that claim.
