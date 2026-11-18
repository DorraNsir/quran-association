# Quran reference data — Qalun, Tunisian edition (candidate)

Isolated workspace for Work Program 2.0. Nothing here is used by `backend`, `frontend` or `mobile` yet.

| Path | What |
|---|---|
| `data/qalun-tn-v1.json` | Candidate dataset: 114 surah counts, 603 page starts, 480 eighths, 240 quarters, 60 hizbs, each with PDF page, status and evidence |
| `data/readings/*.csv` | The raw visual readings the dataset is built from (one row per page / surah end / marker) |
| `reports/verification-report.md` | Method, check results, differences, entries needing manual review |
| `reports/independent-verification.md` | Phase 2B independent checks, status ladder, remaining uncertainties |
| `reports/manual-verification-checklist.md` | What the association should check on the printed copy |
| `data/readings/independent_*.csv`, `print_checks.csv` | Independent PDF readings; print checks (empty until the association records them) |
| `engine/` | Pure TypeScript workload engine (`engine.ts`, `types.ts`, tests, README with the API and exact/bounded/estimate rules) |
| `docs/integration-design.md` | How to integrate into Work Program 2.0 (not implemented) |
| `scripts/` | Rendering, frame/marker detection, reading-sheet generation, dataset build |
| `tests/dataset.test.mjs` | Validation (`node --test tests/dataset.test.mjs`) |
| `work/` | Local renders of the PDF and comparison data — git-ignored, never publish |

Rebuild: `scripts/01_render.sh <pdf>` → `.venv/bin/python scripts/04a_detect_markers.py` → `.venv/bin/python scripts/08_medallions.py` → `.venv/bin/python scripts/05_build.py` → `npm test` (all 56 tests) and `../frontend/node_modules/.bin/tsc -p tsconfig.json`.

The source PDF is not copied here and must not be redistributed. Statuses: `structurally-consistent` < `cross-checked` < `pdf-independent` < `print-verified` (a person checked the printed copy), plus `needs-review`.
