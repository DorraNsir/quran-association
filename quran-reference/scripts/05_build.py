"""Build the candidate reference dataset from the manual readings (data/readings/*.csv).

Status ladder (weakest → strongest; 'print-verified' only after a person checks the printed Mushaf):
  structurally-consistent : one reading that passes every structural check
  cross-checked           : two readings made during the extraction agree
  pdf-independent         : confirmed by a separate, later check against the PDF (data/readings/independent_*.csv)
  print-verified          : confirmed by a person on the physical printed copy (data/readings/print_checks.csv)
  needs-review            : missing, partial or conflicting evidence
"""
import csv, json, hashlib, sys, os
sys.path.insert(0, 'scripts')
from derive import load, derive
from counts import surah_counts

PDF = os.path.expanduser('~/Downloads/مصحف قالون (الطبعة التونسية).pdf')
pages = derive(load())
def rows(path):
    return list(csv.DictReader(open(path, encoding='utf-8'))) if os.path.exists(path) else []
indep_pages = {int(r['printed']): r for r in rows('data/readings/independent_tops.csv')}
indep_quarters = {int(r['quarter']): r for r in rows('data/readings/independent_quarters.csv')}
print_checks = rows('data/readings/print_checks.csv')  # filled in by the association; empty for now
medallion_pages = set(json.load(open('work/indep/medallions.json'))['medallion_pages']) | {
    80, 200, 231, 239, 240, 243, 282, 339, 380, 437, 477, 485, 512, 515, 517, 521, 540, 594, 603}  # last 19: confirmed visually
counts = surah_counts()
marks = list(csv.DictReader(open('data/readings/markers.csv', encoding='utf-8')))
ordered = json.load(open('work/markers_ordered.json'))

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()

surahs = []
for s in range(1, 115):
    c = counts[s]
    title = c['title']
    if title and title == c['last_seen']:
        status, ev = 'cross-checked', 'last verse number before the next title = «آياتها» count in the title frame'
    elif s == 33:
        status, ev = 'pdf-independent', ('verse 73 ends the surah (re-read at 200 dpi, PDF 428) and 6236 − the 113 cross-checked counts = 73; '
                                         'the title frame prints a blank in place of the tens digit («□3»), to confirm on the printed copy')
    else:
        status, ev = 'structurally-consistent', 'last verse number read'
    surahs.append({'surah': s, 'ayahCount': c['count'], 'pdfPage': c['pdf'][0] if c['pdf'] else None,
                   'titleCount': title[0] if len(title) == 1 else None, 'status': status, 'evidence': ev})

page_rows = []
for p in pages:
    s, a = p['start']
    if p['pdf'] == 3:
        status, ev = 'cross-checked', 'first Quran page: al-Fatiha title and verse 1'
    elif p['T']:
        status, ev = 'cross-checked', 'page opens with a surah title frame; header surah agrees'
    else:
        status, ev = 'structurally-consistent', f'previous page ends at verse {a - 1}; header surah agrees'
    ind = indep_pages.get(p['printed'])
    if ind:
        assert int(ind['start_ayah']) == a, ('independent page check disagrees', p['printed'])
        status = 'pdf-independent'
        ev += f"; independently re-read from the top of the page ({ind['method']}: verse {ind['start_ayah']})"
    page_rows.append({'page': p['printed'], 'pdfPage': p['pdf'], 'surah': s, 'ayah': a,
                      'juzInHeader': p['juz'], 'status': status, 'evidence': ev})

eighths = []
for i, (m, r) in enumerate(zip(ordered, marks), 1):
    ev = r['evidence']
    if ev.startswith('t'):
        status = 'cross-checked'; why = 'marker right after a surah title: verse 1'
    elif ev.startswith('ps'):
        status = 'cross-checked'; why = 'marker on the first word of the page = page start'
    else:
        status = 'structurally-consistent'; why = f'marker right after verse-end {ev[1:].split()[0]}'
    if m['pdf'] in medallion_pages: why += '; the margin medallion on the same page marks a division'
    q = (i + 1) // 2 if i % 2 == 1 else None
    ind = indep_quarters.get(q)
    if ind:
        assert (int(ind['surah']), int(ind['ayah'])) == (int(r['surah']), int(r['ayah'])), ('independent quarter check disagrees', q)
        status = 'pdf-independent'; why += f"; independently re-read blind at 200 dpi ({ind['method']}; medallion label {ind['medallion_label']})"
    eighths.append({'index': i, 'hizb': (i - 1) // 8 + 1, 'eighth': (i - 1) % 8 + 1,
                    'surah': int(r['surah']), 'ayah': int(r['ayah']), 'pdfPage': m['pdf'], 'page': m['pdf'] - 1,
                    'hizbNumberInMarker': int(r['hizb_in_marker']), 'status': status,
                    'evidence': why + '; printed hizb number inside the ornament matches the sequence'})

# Print checks by the association (kind: surah-count | page | eighth). A match → print-verified,
# a mismatch → needs-review (the printed copy wins; the readings must then be corrected by hand).
index = {'page': {r['page']: r for r in page_rows}, 'eighth': {r['index']: r for r in eighths},
         'surah-count': {r['surah']: r for r in surahs}}
for c in print_checks:
    row = index[c['kind']][int(c['key'])]
    if c['kind'] == 'surah-count':
        ok = int(c['ayah']) == row['ayahCount']
    else:
        ok = (int(c['surah']), int(c['ayah'])) == (row['surah'], row['ayah'])
    row['status'] = 'print-verified' if ok else 'needs-review'
    row['evidence'] += f"; printed copy checked by {c['checked_by']} on {c['checked_on']}: " + ('agrees' if ok else f"DISAGREES ({c['surah']}:{c['ayah']})")

pick = lambda rows: [{k: v for k, v in r.items()} for r in rows]
hizbs = [{'hizb': e['hizb'], 'surah': e['surah'], 'ayah': e['ayah'], 'page': e['page'], 'status': e['status']}
         for e in eighths if e['eighth'] == 1]
quarters = [{'quarter': (e['index'] + 1) // 2, 'hizb': e['hizb'], 'quarterInHizb': (e['eighth'] + 1) // 2,
             'surah': e['surah'], 'ayah': e['ayah'], 'page': e['page'], 'status': e['status']}
            for e in eighths if e['eighth'] % 2 == 1]

dataset = {
    'editionId': 'qalun-abi-nashit-tn-hannibal-mualim-v1',
    'title': 'المصحف المعلّم — رواية قالون عن نافع من طريق أبي نشيط',
    'riwaya': 'QALUN', 'tariq': 'ABI_NASHIT', 'countingSystem': 'KUFI',
    'publishers': ['حنبعل للطباعة والنشر والتوزيع – تونس', 'نوميديا للنشر والتوزيع – تونس (logo, to confirm)'],
    'totalAyahs': sum(s['ayahCount'] for s in surahs),
    'pages': {'first': 2, 'last': 604, 'count': len(page_rows)},
    'source': {'file': os.path.basename(PDF), 'sha256': sha256(PDF), 'pdfPageCount': 627,
               'quranPdfPages': [3, 605], 'printedPageOffset': -1,
               'note': 'printed page = PDF page − 1; PDF 1 cover, 2 title page, 606–626 appendix م1–م21, 627 back cover'},
    'statusLegend': {'structurally-consistent': 'one reading that passes every structural check',
                     'cross-checked': 'two readings made during the extraction agree',
                     'pdf-independent': 'confirmed by a separate, later check against the PDF',
                     'print-verified': 'confirmed by a person on the physical printed copy',
                     'needs-review': 'missing, partial or conflicting evidence'},
    'statusRank': ['needs-review', 'structurally-consistent', 'cross-checked', 'pdf-independent', 'print-verified'],
    'printChecks': len(print_checks),
    'surahs': surahs, 'pageStarts': page_rows, 'eighthStarts': eighths,
    'quarterStarts': quarters, 'hizbStarts': hizbs,
}
json.dump(dataset, open('data/qalun-tn-v1.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
for k in ('surahs', 'pageStarts', 'eighthStarts'):
    print(k, len(dataset[k]), dict(Counter(r['status'] for r in dataset[k])))
print('total', dataset['totalAyahs'])
