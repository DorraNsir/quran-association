# Qalun (Tunisia) Mushaf — extraction and verification report

Edition: `qalun-abi-nashit-tn-hannibal-mualim-v1` · source `مصحف قالون (الطبعة التونسية).pdf` · SHA-256 `25395b82ba2f834dbf44ebd86b417d909088d3af5580a1271100bd051bd5585c`

## Summary

| Entries | Total | cross-checked | consistent | needs-review | verified |
|---|---|---|---|---|---|
| Surah verse counts | 114 | 113 | 0 | 1 | 0 |
| Page starts | 603 | 55 | 548 | 0 | 0 |
| Eighth (ثُمُن) starts | 480 | 154 | 326 | 0 | 0 |
| Quarter starts (derived) | 240 | 94 | 146 | 0 | 0 |
| Hizb starts (derived) | 60 | 44 | 16 | 0 | 0 |

Total verses: **6236** (sum of the 114 counts read) = the total stated by the edition («طريقة الكوفيين: 6236 آية»).

## Method

1. Rendered PDF pages 3–605 at 100 dpi (local `work/`, never published). Page frames located automatically.
2. **Pages:** for every page, the header surah and juz and the last verse number of the last line were read visually (603 readings). Each page start = previous page last verse + 1, or verse 1 after a title frame.
3. **Surahs:** for each of the 114 surahs, the last verse number before the next title, and independently the «آياتها» count in the title frame.
4. **Divisions:** every inline division ornament was found by template matching (480 detections, score ≥ 0.74; the next detection scores 0.55: a clean gap). Each was read in context: the verse it starts, and the hizb number printed inside the ornament.
5. Automated checks: `node --test tests/dataset.test.mjs` (16 tests), plus a mutation check (corrupted copies fail).

Status: **cross-checked** = two independent readings agree; **consistent** = one reading that passes every structural check; **needs-review** = partial or missing evidence; **verified** = reserved for confirmation by a person (none yet). All readings were made by the AI assistant from page images; none is human-verified.

## Structural checks (all pass)

- 114 surahs; total 6236; al-Fatiha 7 and al-Baqara 286 (Kufan count)
- 113 title-frame counts equal the last verse number read; 1 partial (al-Ahzab)
- 603 pages, printed 2–604, PDF = printed + 1, exactly one start each
- page starts valid, strictly increasing, no duplicates; first 1:1; last page ends at 114:6
- every page ends on a verse end: no page ends mid-verse
- juz in headers increase 1…30; every juz starts on (or one page before) a page with that juz in its header
- 480 eighths, strictly increasing, valid verses; the printed hizb number in all 480 ornaments matches its place in the sequence
- every marker lies inside its page's verse range
- 240 quarters and 60 hizbs derived from the eighths; hizb 1 starts at 1:1

## The five partly clipped page numbers

PDF 436, 464, 509, 515, 516 re-rendered at 150 dpi: printed 435 (first digit cut by the scan, «□35»), 463, 508, 514, 515. All fit the sequence; the page contents (verse continuity) confirm them. Resolved.

## Needs manual review

1. **al-Ahzab (33) verse count:** 73 read from the last verse before Saba; the title frame on PDF 419 shows only the units digit «3» (scan defect). Check the printed copy.
2. **Single-reading entries:** 548 page starts and 326 eighth starts rest on one reading of a verse number each (structurally consistent). A person should spot-check a sample against the printed copy before the data is marked verified; suggested sample below.

## Differences from the Hafs/Madinah reference (comparison only, never used as a source)

Page starts: 2 differ:

- page 2 (PDF 3): this edition 1:1, reference 2:1
- page 592 (PDF 593): this edition 87:15, reference 87:16

Page 2 holds al-Fatiha and the start of al-Baqara (no printed page 1). Page 592 starts at 87:15: confirmed directly (page 591 ends with verse 14).

Quarter starts: 28 of 240 differ from the Hafs quarter positions, as expected for the Maghrebi division tradition. Each was read directly from this edition's ornament:

| Quarter | Hizb · ¼ | This edition | Hafs reference | Page |
|---|---|---|---|---|
| 25 | 7 · 1 | 3:92 | 3:93 | 62 |
| 37 | 10 · 1 | 4:87 | 4:88 | 92 |
| 38 | 10 · 2 | 4:97 | 4:100 | 94 |
| 47 | 12 · 3 | 5:49 | 5:51 | 116 |
| 51 | 13 · 3 | 5:111 | 5:109 | 126 |
| 74 | 19 · 2 | 8:60 | 8:61 | 184 |
| 79 | 20 · 3 | 9:61 | 9:60 | 196 |
| 86 | 22 · 2 | 10:49 | 10:53 | 214 |
| 89 | 23 · 1 | 11:1 | 11:6 | 221 |
| 96 | 24 · 4 | 12:36 | 12:30 | 239 |
| 100 | 25 · 4 | 13:6 | 13:5 | 250 |
| 106 | 27 · 2 | 15:49 | 15:50 | 264 |
| 110 | 28 · 2 | 16:71 | 16:75 | 274 |
| 112 | 28 · 4 | 16:112 | 16:111 | 280 |
| 119 | 30 · 3 | 18:30 | 18:32 | 297 |
| 120 | 30 · 4 | 18:50 | 18:51 | 299 |
| 130 | 33 · 2 | 21:30 | 21:29 | 324 |
| 138 | 35 · 2 | 23:39 | 23:36 | 344 |
| 146 | 37 · 2 | 25:45 | 25:53 | 364 |
| 150 | 38 · 2 | 26:160 | 26:181 | 374 |
| 158 | 40 · 2 | 28:71 | 28:76 | 394 |
| 163 | 41 · 3 | 30:30 | 30:31 | 407 |
| 170 | 43 · 2 | 33:49 | 33:51 | 424 |
| 191 | 48 · 3 | 41:1 | 41:9 | 477 |
| 199 | 50 · 3 | 44:25 | 44:17 | 497 |
| 222 | 56 · 2 | 63:9 | 63:4 | 555 |
| 228 | 57 · 4 | 71:1 | 70:19 | 570 |
| 240 | 60 · 4 | 101:1 | 100:9 | 600 |

## Suggested spot-check sample for a person with the printed copy

Pages: 2, 3, 49, 50, 77, 106, 128, 151, 200, 221, 249, 250, 293, 312, 342, 360, 377, 406, 418, 440, 446, 453, 492, 532, 560, 577, 591, 592, 600, 604 — check that each page begins at the verse in `pageStarts`.
Divisions: the 28 quarters above, and juz starts (hizb 1, 3, 5 … 59).

## Not extracted

Sajda positions, juz labels as printed in the margin medallions (derived instead: juz j = hizb 2j−1), and per-line or per-word positions. Page workload for partial pages therefore cannot be exact (see recommendation).
