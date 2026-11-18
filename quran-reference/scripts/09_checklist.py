"""Manual verification checklist for the association (printed Mushaf in hand) — deterministic sample."""
import json, re, random
ds = json.load(open('data/qalun-tn-v1.json'))
names = {int(n): a for n, a in re.findall(r"number: (\d+), nameAr: '([^']+)'", open('../mobile/src/features/quran/surahs.ts', encoding='utf-8').read())}
assert len(names) == 114
rng = random.Random(20261118)  # fixed seed: the same checklist every time
weak_pages = [p for p in ds['pageStarts'] if p['status'] == 'structurally-consistent']
pages = sorted(rng.sample(weak_pages, 40), key=lambda p: p['page'])
weak_eighths = [e for e in ds['eighthStarts'] if e['status'] == 'structurally-consistent']
eighths = sorted(rng.sample(weak_eighths, 24), key=lambda e: e['index'])
juz = [e for e in ds['eighthStarts'] if e['eighth'] == 1 and e['hizb'] % 2 == 1]
L = []; w = L.append
w('# قائمة التحقق اليدوي — المصحف المعلّم برواية قالون (طبعة تونس)\n')
w('Manual verification checklist · edition `' + ds['editionId'] + '`\n')
w('Use the association\'s **printed** copy. For each line, tick ✓ if the print agrees, or write what the print shows. '
  'Then record each check in `data/readings/print_checks.csv` (kind, key, surah, ayah, checked_by, checked_on) and rebuild: '
  'only these entries become `print-verified`; a disagreement turns the entry to `needs-review`.\n')
w('## 1. عدد آيات سورة الأحزاب (priority)\n')
w('- [ ] Title frame of سورة الأحزاب (page 418): «آياتها» = **73**? (the scan shows a blank tens digit)')
w('- [ ] The last verse of al-Ahzab carries the number **73** (page 427). → print_checks: `surah-count,33,33,73,…`\n')
w('## 2. Page starts — first verse at the top of the page (40 pages)\n')
w('| ✓ | Page | Starts with | Record as |\n|---|---|---|---|')
for p in pages:
    w(f"| [ ] | {p['page']} | {names[p['surah']]} {p['ayah']} | `page,{p['page']},{p['surah']},{p['ayah']}` |")
w('\n## 3. Division markers ۞ (24 eighths)\n')
w('Check that the ۞ ornament stands at the start of this verse, with this hizb number inside it.\n')
w('| ✓ | Eighth | Hizb · eighth | Page | Verse | Record as |\n|---|---|---|---|---|---|')
for e in eighths:
    w(f"| [ ] | {e['index']} | {e['hizb']} · {e['eighth']} | {e['page']} | {names[e['surah']]} {e['ayah']} | `eighth,{e['index']},{e['surah']},{e['ayah']}` |")
w('\n## 4. Juz starts (30)\n')
w('| ✓ | Juz | Page | Verse | Record as |\n|---|---|---|---|---|')
for j, e in enumerate(juz, 1):
    w(f"| [ ] | {j} | {e['page']} | {names[e['surah']]} {e['ayah']} | `eighth,{e['index']},{e['surah']},{e['ayah']}` |")
w('\n## 5. Edition details (for the record)\n')
w('- [ ] Publisher, year and edition number from the colophon / back cover (not legible in the scan).')
w('- [ ] The edition states the Kufan count, 6236 verses (introduction «التعريف بهذا المصحف»).')
open('reports/manual-verification-checklist.md', 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print(len(pages), len(eighths), len(juz))
