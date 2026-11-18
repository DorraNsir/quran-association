# Independent verification — Qalun (Tunisia) reference data

Edition `qalun-abi-nashit-tn-hannibal-mualim-v1` · PDF SHA-256 `25395b82ba2f834dbf44ebd86b417d909088d3af5580a1271100bd051bd5585c`

## Status ladder

| Status | Meaning |
|---|---|
| `print-verified` | confirmed by a person on the physical printed copy (`data/readings/print_checks.csv`) — **none yet** |
| `pdf-independent` | confirmed by a second, later check against the PDF that does not reuse the extraction reading |
| `cross-checked` | two readings made during the extraction agree |
| `structurally-consistent` | one reading that passes every structural check |
| `needs-review` | missing, partial or conflicting evidence — **none now** |

| Entries | Total | print-verified | pdf-independent | cross-checked | structurally-consistent | needs-review |
|---|---|---|---|---|---|---|
| Surah verse counts | 114 | 0 | 1 | 113 | 0 | 0 |
| Page starts | 603 | 0 | 71 | 41 | 491 | 0 |
| Eighth starts | 480 | 0 | 28 | 145 | 307 | 0 |
| Quarter starts | 240 | 0 | 28 | 85 | 127 | 0 |
| Hizb starts | 60 | 0 | 3 | 41 | 16 | 0 |

## Checks performed (independent of the extraction readings)

### 1. Al-Ahzab verse count → 73 (`pdf-independent`)
- End of the surah re-rendered at 200 dpi (PDF 428 = printed page 427): the last verse carries **73**, the one before **72**; the next page opens with سورة سبأ.
- The title frame (PDF 419, 300 dpi) prints **«□3»**: the tens digit is a blank box in the print/scan itself — it cannot be read from this PDF.
- Arithmetic: the edition states 6236 verses; the other 113 counts are cross-checked (last verse = title count); 6236 − their sum = **73**.
- Remains: confirm the title digit on the printed copy (checklist §1).

### 2. Page starts — 71 pages re-read from the TOP of the page (all agree)
The extraction derived each page start from the **last** verse number of the **previous** page. The independent pass read the **first** verse-end marker (or the opening words) at the top of the page itself, from blind crops labelled only with the page number. Pages never break inside a verse, so the first marker on a page is the page's first verse.
Sample: every 10th page (2, 12, 22 … 602), the two pages that differ from the Hafs layout (2, 592), their neighbours (3, 4, 5, 591, 593, 604) and 300–302, 450–452. **71 / 71 agree.** 64 by marker number, 7 by the opening words where the first marker was outside the crop.
- Page 2 holds al-Fatiha and al-Baqara 1–5 (no page 1) — confirmed.
- Page 592 opens with «وذكر اسم ربه فصلى ⑮» (87:15) and page 591 ends at 87:14 — confirmed (the Hafs layout puts 87:16 there).
- Surah transitions in the sample: 14 pages opening with a surah title (al-Fatiha, al-Hijr, al-Isra, al-Anbiya, al-Hajj, al-Muminun, al-Mujadila, al-Mulk, al-Jinn, an-Naba, at-Tariq, al-Fajr, Quraysh, al-Ikhlas) and mid-page transitions on pages 532, 591–593.

### 3. The 28 quarters that differ from the Hafs reference (all agree)
Each was re-rendered at 200 dpi, cropped blind (labelled only «quarter n»), with the **margin medallion** — a separate printed element from the inline ۞ ornament. The verse at the ornament was re-read, and the medallion's label read where visible.
- Positions: **28 / 28 agree** with the dataset.
- Medallion labels: «حزب» at quarter 1 of a hizb, «نصف» at quarter 3, a «ربع»-type label at quarters 2 and 4 — consistent in all 27 crops where the medallion is visible (1 crop shows a tajwid note instead). The «ربع» / «ثلاثة أرباع» distinction is not legible at this size.
- These differences are genuine features of this Maghrebi edition (e.g. hizb 7 starts at «لن تنالوا البر» 3:92; the Hafs quarter is 3:93).

### 4. Every page: margin medallions vs inline markers (automatic + visual)
Circle detection in the outer margins of all 603 pages (`scripts/08_medallions.py`): 458 pages detected automatically; the 19 marker pages it missed were inspected visually and all carry a medallion (detector misses, e.g. medallion low on the page, or the frame detection on PDF 243). **All 477 pages with inline markers carry a medallion; no other page does.** This confirms, independently of the inline template matching, that no marker page was missed or invented.

### 5. Regression tests that catch wrong boundaries
`tests/golden.test.mjs` and `engine/engine.test.ts` assert the dataset against the independent readings above. Mutation checks: substituting the Hafs position for quarter 25 (3:93) passes all structural tests but **fails** the golden and engine tests; shifting a page start fails all three suites.

## Remaining uncertainties
1. **Nothing is print-verified.** Every reading — extraction and independent pass — was made by the AI assistant from page images.
2. **491 page starts and 307 eighth starts rest on one reading** (`structurally-consistent`): each passes every structural check (ordering, continuity, surah counts, medallion page, hizb label), but a mistaken verse number that stays consistent with its neighbours would only be caught by a second reading. The independent sample (71 pages, 28 quarters) found **no** error, which makes a systematic problem unlikely but does not prove each entry.
3. Al-Ahzab title digit (print only).
4. Publisher, year and edition number are not legible in the scan.
5. Not extracted: sajda positions, line/word positions (so partial pages can only be bounded, never measured).

## Manual verification
See `reports/manual-verification-checklist.md`: al-Ahzab, 40 sampled page starts, 24 sampled eighths, the 30 juz starts, and the colophon. Results go in `data/readings/print_checks.csv`; the build then marks them `print-verified` (or `needs-review` on a disagreement — the print wins).
