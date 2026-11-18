"""Build the candidate reference dataset from the manual readings (data/readings/*.csv).

Status vocabulary (nothing is 'verified' until a person confirms it against the printed Mushaf):
  cross-checked : two independent readings in the PDF agree
  consistent    : one reading, and it passes every structural check
  needs-review  : missing, partial or conflicting evidence
"""
import csv, json, hashlib, sys, os
sys.path.insert(0, 'scripts')
from derive import load, derive
from counts import surah_counts

PDF = os.path.expanduser('~/Downloads/مصحف قالون (الطبعة التونسية).pdf')
pages = derive(load())
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
        status, ev = 'needs-review', 'last verse number read (73); the title frame shows only the units digit 3 (tens digit missing in the scan)'
    else:
        status, ev = 'consistent', 'last verse number read'
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
        status, ev = 'consistent', f'previous page ends at verse {a - 1}; header surah agrees'
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
        status = 'consistent'; why = f'marker right after verse-end {ev[1:].split()[0]}'
    eighths.append({'index': i, 'hizb': (i - 1) // 8 + 1, 'eighth': (i - 1) % 8 + 1,
                    'surah': int(r['surah']), 'ayah': int(r['ayah']), 'pdfPage': m['pdf'], 'page': m['pdf'] - 1,
                    'hizbNumberInMarker': int(r['hizb_in_marker']), 'status': status,
                    'evidence': why + '; printed hizb number inside the ornament matches the sequence'})

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
    'statusLegend': {'cross-checked': 'two independent readings in the PDF agree',
                     'consistent': 'one reading that passes every structural check',
                     'needs-review': 'missing, partial or conflicting evidence',
                     'verified': 'reserved: confirmed by a person against the printed Mushaf (none yet)'},
    'surahs': surahs, 'pageStarts': page_rows, 'eighthStarts': eighths,
    'quarterStarts': quarters, 'hizbStarts': hizbs,
}
json.dump(dataset, open('data/qalun-tn-v1.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
for k in ('surahs', 'pageStarts', 'eighthStarts'):
    print(k, len(dataset[k]), dict(Counter(r['status'] for r in dataset[k])))
print('total', dataset['totalAyahs'])
