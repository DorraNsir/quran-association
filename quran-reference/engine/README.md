# Quran workload engine

Pure TypeScript (erasable syntax only: Node ≥ 23.6 runs it directly, any bundler compiles it). No I/O, no dependencies, deterministic. One engine per versioned Mushaf edition.

```ts
import { createEngine, compareWorkloads } from './engine.ts';
const q = createEngine(dataset /* data/qalun-tn-v1.json */, { minStatusForRanking: 'print-verified' });
```

## API

| Function | Returns |
|---|---|
| `q.isValid(ref)` | `true` for a real verse of this edition (integers, 1 ≤ ayah ≤ count) |
| `q.compare(a, b)` | −1 / 0 / 1 in Mushaf order |
| `q.toIndex(ref)` / `q.fromIndex(i)` | verse ↔ position 1 … 6236 |
| `q.locate(ref, unit)` | page (printed number), juz, hizb, quarter or eighth containing the verse, with its `dataStatus` |
| `q.unitRange(unit, first, last?)` | verse range of whole units (pages 10–12, hizb 3, juz 30 …) |
| `q.surahRange(first, last?)` | verse range of whole surahs |
| `q.workload(range, { allowReversed?, includeEstimates? })` | a `Workload` (below) |
| `compareWorkloads(a, b, unit)` | `-1 / 0 / 1 / 'indeterminate' / 'unavailable'`, the basis, and whether it may rank |

Every fallible call returns `{ ok: true, value } | { ok: false, error }` with a code: `INVALID_REFERENCE`, `REVERSED_RANGE`, `INVALID_UNIT_NUMBER`, `DATA_UNAVAILABLE`.

## Workload

```ts
{
  editionId, from, to, startIndex, endIndex,
  verses,                       // always exact
  surahs: { whole, touched },   // exact
  pages, juz, hizbs, quarters, eighths: Measure,
  dataStatus,                   // weakest reliability among the entries used
  authoritative                 // may be used to RANK students (policy: minStatusForRanking)
}
```

### Exact vs bounded vs estimated (the rules)

| Measure | When | Meaning |
|---|---|---|
| `exact` | the range starts on a unit's first verse **and** ends on a unit's last verse | `value` whole units — e.g. pages 10–12 = 3, juz 30 = 1 juz = 2 hizbs |
| `bounded` | a unit is only partly assigned at the start and/or the end | the true amount is **strictly** between `greaterThan` (whole units inside) and `lessThan` (units touched). Both bounds are exact facts; no assumption about verse length |
| `estimate` (inside `bounded`, opt-in) | `includeEstimates: true` | verse-share of each partial unit — assumes equal verse length, so it is labelled approximate and is **never** used by `compareWorkloads` |
| `unavailable` | the reference data lacks the boundaries around the range | `reason`; nothing is guessed |

- Verse counts and surah counts are always exact.
- Pages are exact only for whole pages: the data has no line or word positions. Every page of this edition ends on a verse end, so whole-page answers are exact.
- Nothing is rounded; exact values and bounds are integers, the opt-in estimate is an unrounded float.
- Comparing: exact vs exact compares exactly; bounded values compare only when their intervals cannot overlap (`basis: 'bounds'`), else `'indeterminate'`. Workloads of different editions are never compared.

### Reliability and ranking
Each measure carries `dataStatus`, the weakest status of the boundaries it used (and of the surah counts involved). `authoritative` is true only when that status reaches `minStatusForRanking` (default `print-verified`) and no measure is unavailable. With today's data nothing is print-verified, so **nothing is authoritative for ranking**; values remain usable for display and planning.

A dataset with an unknown surah count is refused (every later position depends on it). Unknown page or division starts make only the affected measures `unavailable`.

Tests: `node --test engine/engine.test.ts` (35 tests). Typecheck: `tsc -p tsconfig.json`.
