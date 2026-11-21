# Audit — Quranic workload calculations (hizbs + pages)

Edition `qalun-abi-nashit-tn-hannibal-mualim-v1` · audit date 2026-11-20 · **read-only: no code, test, schema or data was changed.**
Diagnostics were run from scratch scripts outside the repository (engine imported read-only).

---

## 1. Executive summary

| Question | Answer |
|---|---|
| Are the calculations correct? | **Yes.** An independent recomputation over **12,555 ranges** (all 6,555 surah-to-surah ranges + 6,000 random verse ranges) matched the engine exactly: same complete-hizb count, same lower and upper page bounds, same exact/bounded verdict. **0 mismatches.** |
| Is there double counting or an off-by-one? | **No** (see §6). |
| Why are some page intervals wide (width 3–4)? | Each remainder segment (before and after the complete hizbs) can start **and** end inside a page. With no line positions, each such page is an unknown fraction in (0, 1). Two segments × two partial pages = width up to 4. **Genuine data limitation, not a bug.** |
| Can the current dataset give narrower *page* bounds? | **No.** The engine's bounds are already the tightest the verse-level data allows (proved in §6). |
| Is there something to fix? | Yes, but in **presentation and conventions**, not in the mathematics: (1) the combined form is often *less* precise than the plain page count; (2) the remainder is frequently ≥ 9 pages, so it reads like "another hizb"; (3) ranges starting at al-Baqara never get hizb 1 (it begins at al-Fatiha); (4) verbose Arabic. |
| Recommendation | Keep the engine. Change the **displayed unit** (hybrid, see §12): hizbs + **eighths** (أثمان) when a complete hizb exists — exact in 42 % of surah ranges vs 13 % today, width ≤ 2 — otherwise pages; verse counts only below one hizb. Needs your decisions (§13). |

**Confirmed bugs: none.** One small robustness note (§7) and several UI/formatting issues (§9).

---

## 2. Architecture and data flow

```
assignment (references)                          clients never compute workloads
   │  backend/src/quran-reference/quran-assignment.ts · resolveAssignment()
   ▼
canonical verse range  (fromSurah:fromAyah – toSurah:toAyah, edition id)
   │  generated engine copy: backend/src/quran-reference/generated/engine.ts · workload()
   ▼
Workload { verses, pages, juz, hizbs, quarters, eighths, hizbsAndPages, dataStatus, authoritative }
   │  resolveAssignment() → quranWorkload snapshot (JSONB, never recomputed silently)
   │  work-followup.service.ts · assignmentData() / assignmentOf() / copyAssignment() (transfers)
   ▼
API: item.assignment + item.workload  (students: assignment only)
   │
   ▼
shared formatter: quran-reference/clients/work-assignment.ts
   · workloadLines() → formatHizbsAndPages() | formatMeasure() → countLabel()/boundedText()
   · workloadSummary() (mobile one-line form)
   ▼
web  frontend/src/components/teacher/work-followup/work-assignment-view.tsx (chips, workloadLines)
mobile mobile/src/features/teacher/work-assignment-view.tsx (one line, workloadSummary)
```

| Component | Responsibility |
|---|---|
| `quran-reference/data/qalun-tn-v1.json` | Verse counts, first verse of each printed page (603), first verse of each eighth (480 → 60 hizbs). No line positions. |
| `engine/engine.ts` · `unitAt()` (l.117) | Unit containing a verse index (linear scan; returns null near unknown boundaries). |
| `engine/engine.ts` · `measure()` (l.133) | One unit over [s, e]: exact if both ends on unit boundaries; else bounded `(whole, touched)`. |
| `engine/engine.ts` · `hizbsAndPagesOf()` (l.175) | Complete hizbs inside [s, e]; remainder segments measured with `measure('page')`; sum of bounds. |
| `engine/engine.ts` · `workload()` (l.257) | Assembles all measures, `dataStatus`, `authoritative`. |
| `backend/.../quran-assignment.ts` · `resolveAssignment()` (l.107) | Validates references, builds the canonical range, stores the snapshot (incl. `hizbsAndPages`, l.219). |
| `clients/work-assignment.ts` · `workloadLines()` (l.445) | Chooses parts per work type: verses + (hizbsAndPages, else pages). Drops unavailable parts. |

---

## 3. The current algorithm

1. **Canonical range** `[s, e]`: verse indices 1…6236, inclusive.
2. **Complete hizbs** (`hizbsAndPagesOf`): every hizb `u` with `start(u) ≥ s` and `start(u+1) − 1 ≤ e`. Hizbs are contiguous, so this is a block `first…last`. None → `unavailable`.
3. **Remainder segments**: `[s, start(first) − 1]` (if non-empty) and `[end(last) + 1, e]` (if non-empty). They lie on opposite sides of at least one hizb (≈ 10 pages), so they never share a page.
4. **Each segment in pages** (`measure('page', …)`): pages fully inside → whole; first/last page partly inside → partial. `exact` when the segment starts at a page top and ends at a page bottom; otherwise `bounded(whole, touched)` (strict interval).
5. **Sum**: `lo = Σ(exact value | greaterThan)`, `hi = Σ(exact value | lessThan)`; exact only if every segment is exact.
6. The hizb count is always an exact integer; only the remainder can be bounded.

---

## 4. Real examples per situation

All figures produced by the current engine on the Qalun dataset.

### A — Complete hizbs: «حزبان»
| Range | Complete hizbs | Remainder | Result |
|---|---|---|---|
| an-Naba → an-Nas (78:1 – 114:6), 564 verses, pages 582–604 | hizbs 59–60 | none | **exact: 2 hizbs, 0 pages** → «564 آية · حزبان» |
| al-Ahqaf → an-Nas (46:1 – 114:6) | hizbs 51–60 | none (hizb 51 starts at 46:1) | **exact: 10 hizbs** — even though its *page* count is bounded (102–103): hizb 51 starts mid-page, but it is entirely inside the range |

Hizb boundaries do not need to align with pages for a hizb to count: a hizb counts when *all its verses* are in the range. No verse is counted twice because the remainder segments are defined as the verses **outside** the hizb block.

### B — Complete hizbs + exact pages: «17 حزبًا و4 صفحات»
| Range | Complete hizbs | Remainder segment | Pages |
|---|---|---|---|
| al-Fatiha → al-A'raf (1:1 – 7:206), 1160 verses | hizbs 1–17 | after hizb 17: the rest of al-A'raf up to 7:206 | **exact 4**: the segment starts at a page top (hizb 18 begins a page) and al-A'raf ends a page |
| al-Fatiha → al-Baqara (1:1 – 2:286) | hizbs 1–4 | after: 8 whole pages | exact → «4 أحزاب و8 صفحات» |

The remainder is exact because both ends of the remainder segment fall on page edges.

### C — Complete hizbs + bounded pages: «حزب واحد وبين 11 و13 صفحة»
**at-Tawba (9:1 – 9:129)**, 129 verses, pages 187–207 (**exactly 21 pages**).
- Complete hizb: **20** only. Hizb 19 started in al-Anfal; hizb 21 starts at 9:93, **mid-page**, and runs past 9:129.
- Remainder before: 9:1 – 9:33 (part of hizb 19). It starts at a page top and ends mid-page (hizb 20 starts at 9:34 mid-page) → partial page at its end.
- Remainder after: 9:93 – 9:129 (part of hizb 21). It starts mid-page and ends at a page bottom → partial page at its start.
- Bounds: whole remainder pages = 11 → lower 11; plus 2 partial pages → upper 13.
- Narrower? **Not with this data**: the two partial pages are each shared with hizb 20, and how much of each lies outside the hizb is unknown without line positions.
- Note: the *plain* page count is **exactly 21** — the combined form loses precision (see §9).

### D — No complete hizb: «بين صفحتين و3 صفحات»
**Maryam 12–50**: inside hizb 31 only → no complete hizb → `hizbsAndPages = unavailable` → page fallback: starts at a page top (p.306), ends mid-page (p.308) → bounded (2, 3). Short memorization: **al-Baqara 6–20** → «15 آية · بين صفحة واحدة وصفحتين». **Yasin** (83 verses): no complete hizb → «بين 5 صفحات و6 صفحات».

### E — Wide intervals (width 3 and 4)
| Range | Complete hizbs | Remainder segments | Partial pages | Bounds | Plain pages |
|---|---|---|---|---|---|
| al-Baqara → Al Imran (2:1 – 3:200) | 6 (hizbs 2–7) | 2:1–2:74 · 3:171–3:200 | 2, 11, 72 | **12 – 15** (w 3) | 74–75 |
| al-Baqara → at-Tawba (2:1 – 9:129) | 19 (2–20) | 2:1–2:74 · 9:93–9:129 | 2, 11, 201 | **14 – 17** (w 3) | 205–206 |
| al-Baqara → Hud (2:1 – 11:123) | 22 (2–23) | 2:1–2:74 · 11:84–11:123 | 2, 11, 231, 235 | **11 – 15** (w 4) | 232–234 |
| al-Baqara → al-Isra (2:1 – 17:111) | 28 (2–29) | 2:1–2:74 · 17:99–17:111 | 2, 11, 292, 293 | **8 – 12** (w 4) | 290–292 |
| at-Tawba → an-Nur (9:1 – 24:64) | 16 (20–35) | 9:1–9:33 · start of hizb 36 … 24:64 | — | **12 – 14** | 172–173 |

Reason for every width: each partial page is a page shared between the remainder and either the complete-hizb block (hizbs 2, 21, 24, 30 … start mid-page) or the outside of the range (al-Baqara starts mid-page 2, after al-Fatiha). Width = number of such pages (≤ 2 per segment).
**Not** caused by double counting, separate counting of a shared page (the two segments never share a page), or loose arithmetic — see §6.

The recurring **2:1 – 2:74** segment is a separate, important effect: **hizb 1 starts at al-Fatiha 1:1**, so any range starting at al-Baqara 2:1 never contains hizb 1 completely. Its 9–10 pages become "remainder" — hence «3 أحزاب وبين 16 و18 صفحة» for al-Baqara alone, where a teacher would say "about five hizbs minus al-Fatiha".

### F — Surah-to-surah situations
| Assignment | Display today |
|---|---|
| مراجعة سورة يس (single surah, < 1 hizb) | «83 آية · بين 5 صفحات و6 صفحات» |
| مراجعة at-Tawba → an-Nur | «1620 آية · 16 حزبًا وبين 12 صفحة و14 صفحة» |
| اختبار al-Ahqaf → an-Nas | «1726 آية · 10 أحزاب» (exact) |
| حفظ al-Baqara 6–20 | «15 آية · بين صفحة واحدة وصفحتين» |
| مراجعة al-Fath → an-Nas (1653 verses — the count in your example) | «9 أحزاب وبين صفحتين و3 صفحات», while its plain page count is **exactly 94** |

The calculation is identical for all of them; only the canonical range differs. Whether a complete hizb exists is what switches between the combined form and the page fallback.

> About your example «1653 آية · 9 أحزاب و4 صفحات»: the current engine gives «9 أحزاب وبين صفحتين و3 صفحات» for the only whole-surah range of 1653 verses (al-Fath → an-Nas). If that text came from a real screen, please tell me the exact range so I can check it; I could not reproduce it.

### G — Legacy, missing and unavailable
| Situation | Behaviour | Assessment |
|---|---|---|
| Legacy free-text item | `assignment = null`, `workload = null` → description only, no workload line | correct |
| Snapshot without `hizbsAndPages` (saved before it existed) | `formatHizbsAndPages(undefined)` → null → page measure | correct; never recomputed |
| `hizbsAndPages` unavailable (no complete hizb) | page measure | correct |
| A measure unavailable (missing boundaries) | the part is **omitted** (`workloadLines` filter) — never shown as a number | correct, but silent (no "غير متاح" hint) |
| Zero remainder | «حزبان» (no «و0 صفحات») | correct; a zero is only ever an exact remainder, never missing data |

---

## 5. Wide intervals — root cause

Width = number of **partial pages** in the remainder, each an unknown fraction in (0, 1):

| Partial page source | Example |
|---|---|
| Range starts mid-page | al-Baqara 2:1 (page 2 shared with al-Fatiha) |
| Complete-hizb block starts mid-page | hizb 2 at 2:75, hizb 21 at 9:93 … (21 of the 60 hizbs start mid-page: 2, 6, 8, 12, 13, 20, 21, 23, 24, 28, 30, 32, 38, 42, 44, 46, 50, 51, 52, 54, 60) |
| Complete-hizb block ends mid-page | the page where the next hizb starts mid-page |
| Range ends mid-page | e.g. Hud 11:123 on page 235 |

Distribution over the 5,651 surah ranges that contain a complete hizb: width 0: 758 · 1: 1,696 · 2: 1,945 · **3: 1,082 · 4: 170**.
By comparison, the **plain page count** of all 6,555 surah ranges: width 0: 1,540 · 1: 3,311 · 2: 1,704 (never more than 2, because only the two outer ends can be partial).

---

## 6. Mathematical correctness

| Check | Result |
|---|---|
| Inclusive ranges | `[s, e]` inclusive everywhere; `next − 1` for unit ends — correct. |
| Hizb completeness | `start ≥ s && next − 1 ≤ e` — exactly "every verse of the hizb is in the range". |
| Remainder segments | `[s, hizbStart − 1]`, `[hizbEnd + 1, e]` — complement of the block, no overlap, no gap. |
| Shared pages | a page shared with the hizb block contributes a fraction in (0, 1) to the remainder only; the two segments are ≥ 1 hizb apart and never share a page. |
| Interval arithmetic | sums of open intervals (a₁, b₁) + (a₂, b₂) = (a₁ + a₂, b₁ + b₂): valid and, with independent unknown fractions, the tightest possible. |
| Exact vs bounded | exact ⇔ every segment starts at a page top and ends at a page bottom. Verified equal to "no partial page" in all 12,555 ranges. |
| **Tightness** | Independent oracle: for each page, count it 1 if all its verses are in the remainder, (0, 1) if some are. Engine bounds = oracle bounds in **12,555 / 12,555** ranges. Narrower page bounds would need information below verse level (lines/words). |
| Off-by-one | none found (single-verse, single-page, whole-hizb, juz and whole-Quran ranges included). |

**Conclusion: the algorithm is correct and as tight as the dataset allows.** A 10-pages-per-hizb assumption is not used anywhere.

---

## 7. Confirmed bugs

**None in the calculation or the formatting logic.**

Minor robustness notes (not bugs with the current dataset, which has no unknown boundaries):
- `engine.ts · hizbsAndPagesOf()`: the unknown-boundary branch tests `(start ?? 0) <= e && (next ?? Infinity) > s` — it treats an unknown boundary conservatively (unavailable). Correct, but untested with real gaps.
- `engine.ts · unitAt()` / `hizbsAndPagesOf()` are linear scans (603 / 60 entries): fine for performance, noted only for completeness.

---

## 8. Limits caused by missing line positions

Without the position of each verse on its page (line, or start/end offset), the share of a partial page that belongs to a range is unknown. Therefore:
- page remainders adjacent to a mid-page hizb boundary (21 hizbs) or to a mid-page surah start (most surahs) are always bounded;
- «صفحتان و3 أسطر» or fractional pages cannot be produced honestly;
- verse-count shares are not a substitute (verse lengths vary widely).

---

## 9. Display assessment (web and mobile)

| Issue | Type | Example |
|---|---|---|
| The combined form can be **less precise** than the plain page count | design | at-Tawba: exactly **21 pages** vs «حزب واحد وبين 11 و13 صفحة»; al-Fath → an-Nas: exactly **94 pages** vs «9 أحزاب وبين صفحتين و3 صفحات». Happens in **884** of the 12,555 ranges tested. |
| Remainder often ≥ 9 pages (≈ a hizb) | design / readability | 2,866 of 5,651 surah ranges with a complete hizb; reads like "almost another hizb" |
| al-Baqara never gets hizb 1 (it starts at al-Fatiha) | convention to decide | al-Baqara alone: «3 أحزاب وبين 16 و18 صفحة» (94 of 113 ranges starting at al-Baqara have a remainder ≥ 9 pages) |
| Verbose bounds | formatting | «بين 5 صفحات و6 صفحات», «وبين 12 صفحة و14 صفحة» — the unit is repeated |
| Verse counts on large ranges | formatting | «1726 آية · 10 أحزاب» — the verse count adds little for teachers |
| Silent omission of unavailable parts | minor | no hint that a measure could not be computed |
| Web shows chips, mobile one line | consistency | same text, different layout (acceptable) |

**Your rule "hide verse counts from 100 verses"**: sensible, but the threshold is arbitrary (Yasin = 83 verses but 5–6 pages; al-Kawthar = 3 verses). A rule tied to the Quranic unit is more natural: **show verses only when the range holds no complete hizb** (short assignments), otherwise hizbs + a sub-unit. Both are easy; this is a decision for you (§13).

---

## 10. Options

| | A · Keep, polish Arabic | B · Tighten page bounds | C · Approximation | D · Line positions | E · Hizbs + eighths (أثمان) |
|---|---|---|---|---|---|
| What changes | wording only («بين 12 و14 صفحة», no unit repetition) | nothing achievable (bounds are already optimal) | show «≈ 9.3 أحزاب» or «حوالي 94 صفحة» | extract line/offset per verse for 603 pages | remainder expressed in the Mushaf's own eighths |
| Precision gain | none | **none** (proved tight) | looks precise, is an estimate | page bounds become exact or nearly | exact in **42 %** of surah ranges (vs 13 %), width ≤ 2 (≤ 1 in 89 %) |
| Teacher-friendliness | medium | — | high, but blurs what was assigned | high | high in the Maghrebi tradition (أثمان are printed in the margin) |
| Effort | small | — | small | **large**: ~6,236 verse positions read and verified on the PDF, then print checks | small–medium: engine helper + formatter + tests |
| Risk | low | — | presents estimates as figures; needs clear "تقريبي" | extraction errors; long verification | low (eighth boundaries are 480 verified markers already used) |
| Existing snapshots | unchanged | unchanged | unchanged | new edition version → old snapshots keep v1 | **new field**; old snapshots keep hizbs + pages / pages (fallback) |

Notes:
- **B** cannot narrow page bounds with this dataset; it can only *pick the better representation*: e.g. use the plain page count when it is exact and the combined form is not.
- **C** must never look exact; any approximation has to be labelled, and it is weaker than E, which stays factual.
- **D** is the only way to "صفحتان و3 أسطر"; it is a separate extraction project.
- **E** works because every hizb edge **is** an eighth edge, so uncertainty only remains at the two outer ends of the range.

---

## 11. Test coverage

Existing (`engine/engine.test.ts`, `clients/work-assignment.test.ts`, backend specs, web/mobile screens): whole hizb runs, juz 30, a mixed exact case (hizbs 3–4), a bounded case (at-Tawba), a "no double counting" enclosure check, no-hizb fallback, Arabic forms, display lines, contract with the real backend.

Missing:
1. **Optimality oracle** (as in this audit): engine bounds == per-page oracle bounds over all surah ranges + random ranges.
2. **Width-4** ranges (both segments partial on both sides) and **width-3** ranges, with expected bounds.
3. Every **mid-page hizb** (21) as a block edge, start and end.
4. **al-Fatiha / al-Baqara** convention (2:1 → hizb 1 never complete).
5. Ranges where **plain pages are exact but the combined form is bounded** (884 cases) — whatever display rule is chosen.
6. **Single-verse** and **single-page** ranges at mid-page hizb boundaries; whole-Quran range.
7. **Unknown-boundary** branch of `hizbsAndPagesOf()` (synthetic dataset with a null start).
8. Display rule for verse counts (whichever threshold is approved).

---

## 12. Recommendation

**Hybrid: keep the engine (A) + add hizbs + eighths (E) + choose the most precise representation (from B).**

1. **Engine stays as is** — mathematically correct and optimal; no snapshot is touched.
2. Add a pure helper `hizbsAndEighths` (complete hizbs + remainder in eighths, exact or bounded) to the engine and the stored snapshot (additive field).
3. **Display rule** (shared formatter, identical on web and mobile):
   - range with a complete hizb → «9 أحزاب و3 أثمان» (exact) or «9 أحزاب وبين 3 و4 أثمان»;
   - the remainder in eighths is always below 16 (at most 7 + 7 on the two sides) and every figure is a real Mushaf division, so no "almost another hizb" pages appear;
   - no complete hizb → pages («بين صفحتين و3 صفحات») with the verse count;
   - **fallback**: snapshots without the new field keep today's text.
4. **Concise Arabic**: «بين 12 و14 صفحة» (unit once), «أقل من صفحة».
5. Optionally show the exact page count as a secondary hint when it is exact («94 صفحة»).

Why: it keeps every figure factual (no 10-pages assumption, no invented lines), uses the Mushaf's own divisions, triples the share of exact results, and caps uncertainty at two eighths.

---

## 13. Implementation plan (not executed) and decisions needed

**Decisions needed from you**
1. **Unit for the remainder**: eighths (أثمان, recommended), quarters (أرباع: coarser, exact more often), or pages (today).
2. **Verse counts**: hide when a complete hizb exists (recommended) or from ≥ 100 verses.
3. **al-Fatiha convention**: keep strict (hizb 1 needs al-Fatiha) or count hizb 1 as complete when only al-Fatiha is missing (a teaching convention; must be explicit and labelled).
4. **Exact page count as a secondary hint** when it is exact: yes / no.
5. Whether **line-position extraction** (option D) should be planned later.

**Plan once approved**
1. Engine: `hizbsAndEighthsOf()` + tests (oracle, width cases, mid-page hizbs, al-Fatiha case); `npm run quran:sync`.
2. Backend: add the field to the snapshot (additive JSON, no migration); unit + e2e tests; contract fixture regenerated.
3. Shared formatter: new display rule + concise wording; tests incl. every precision kind and fallbacks; sync to web/mobile.
4. Web/mobile: no structural change (they render the shared text); update screen tests.
5. Full validation (backend e2e, web, mobile, builds). Old snapshots are left as they are.
