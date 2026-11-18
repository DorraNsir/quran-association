# Integration design — Quran reference engine × Work Program 2.0 (not implemented)

## What exists today (inspected)
- **Backend** `backend/src/work-followup/`: `WorkProgram` (one per student × session, `version`) → `WorkItem` (`type`, free-text `description` ≤ 2000, `status`, `recitationNumber`, `evaluationComment`, `carriedFromItemId`/`carriedFromStatus`, `continuedFromItemId`, `version`, evaluator). Items are never deleted; every edit/evaluation is a version-checked `updateMany … where version` (409 `WORK_ITEM_CHANGED`). Transfers / next recitation copy the item into a later session. Phase 1 added `evaluation` and session-timing rules.
- **Web** `frontend/src/components/teacher/work-followup/` and **mobile** `mobile/src/features/teacher/teacher-work-*`: forms send `type + description (+ recitationNumber)`; display `description`.
- **Reference data pattern already in use**: the 114 surah names are copied by hand into `backend/src/memorization/surahs.ts`, `frontend/src/lib/quran/surahs.ts`, `mobile/src/features/quran/surahs.ts`, with a parity test in mobile reading the web file.

## Principles
1. **One authoritative dataset, versioned.** `quran-reference/data/qalun-tn-v1.json` is the source; apps get a slim, generated copy. Any boundary change = a new edition id (`…-v2`); status upgrades (print checks) do not change the id, only the statuses.
2. **The backend decides; clients preview.** The server validates ranges and computes the workload snapshot it stores; web/mobile run the same engine only to preview while the teacher types.
3. **Additive only.** Nothing existing changes meaning; legacy items stay free text.

## Shared code and data
- Generator `quran-reference/scripts/export-runtime.mjs` (to write) emits `quran-reference.generated.ts` = edition id, dataset SHA-256, surah counts, page starts, eighth starts, statuses (~20 KB, no evidence text) + a copy of `engine.ts`/`types.ts`, into:
  `backend/src/quran-reference/`, `frontend/src/lib/quran-reference/`, `mobile/src/features/quran-reference/`.
- Parity tests (same pattern as `surahs.test.ts`): each app checks that its generated file's SHA-256 and engine source match `quran-reference/` — a drifted copy fails CI.
- Performance: engine creation is O(n) once at module load; lookups are linear over ≤ 603 boundaries (sub-millisecond); can switch to binary search without API change.

## Database (one additive migration, nullable, no backfill)
`work_items`:
| Column | Type | Note |
|---|---|---|
| `rangeStartSurah`, `rangeStartAyah`, `rangeEndSurah`, `rangeEndAyah` | SMALLINT NULL | all four set or all null (CHECK); start ≤ end checked by the API (engine) |
| `quranEditionId` | TEXT NULL | set iff the range is set |
| `workload` | JSONB NULL | the engine's `Workload` at save time (verses, measures, dataStatus) + `datasetSha256`, `engineVersion` |

No new table is required; an optional `quran_editions` table (id, sha256, activatedAt) can be added if more than one edition must coexist.

## API (backward compatible)
- `NewWorkItemDto` / `WorkItemEditDto`: optional `range: { from: {surah, ayah}, to: {surah, ayah} }` and optional helpers `{ pages: [first, last] }`, `{ surahs: [first, last] }`, `{ hizb | quarter | eighth: [first, last] }` resolved server-side with `unitRange`.
- `description` stays required for legacy clients; when a range is sent and `description` is empty, the server writes a readable default («من البقرة 6 إلى البقرة 20») so students and old app builds still see text.
- Responses add `range`, `quranEditionId` and `workload` (null for legacy items). Old clients ignore them.
- New errors: `WORK_RANGE_INVALID` (400, engine `INVALID_REFERENCE`), `WORK_RANGE_REVERSED` (400, unless the UI asks to reorder), `QURAN_REFERENCE_UNAVAILABLE` (409).

## Concurrency and history
- Setting/changing a range goes through the existing `editItem` path: same `version` check, recompute `workload` in the same transaction, `version + 1`. No new concurrency mechanism.
- Evaluation does not touch range or workload.
- Transfer / next recitation copy `range` + `quranEditionId` and **recompute** the snapshot with the current engine (the source keeps its own snapshot).
- Historical items: never backfilled from free text, never recomputed silently. A recompute happens only when the item's range is edited. A new edition id leaves old snapshots on the old id (still displayable; comparisons across editions are refused by the engine).

## Ranking and priority (Phase 3)
- Use `verses` (always exact) and exact/bounded page–hizb measures through `compareWorkloads`.
- Respect `authoritative`: until the association records print checks, show workload values but do not produce authoritative student rankings (UI wording: «تقديري — في انتظار التحقق من المصحف المطبوع»).

## Rollout (each step separately approved)
1. Print checks by the association → `print_checks.csv` → rebuild (statuses only).
2. Generator + parity tests in the three apps (no behaviour change).
3. Migration + DTO/response fields + server validation and snapshot; tests on the `_test` database.
4. Web and mobile range pickers (surah → ayah, or page / hizb / quarter selectors) with live preview; free text stays available.
5. Workload-based priority and the teacher badge (Phase 3).
