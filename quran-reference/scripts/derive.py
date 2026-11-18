"""Derive page starts and the surah of each page's last verse from data/readings/pages.csv.

Rules (no external data):
- A page that opens with a surah title frame (T) starts at (header surah, 1).
- Otherwise it continues the previous page: (header surah, previous last verse + 1).
- The surah of a page's last verse is the next page's header surah, unless the next
  page opens with a title frame (then the previous surah, header - 1).
"""
import csv

def load(path='data/readings/pages.csv'):
    with open(path, encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k in ('pdf', 'printed', 'header_surah', 'juz', 'last_ayah'):
            r[k] = int(r[k])
        r['T'] = r['starts_with_title'] == 'Y'
    return rows

def derive(rows):
    out = []
    for i, r in enumerate(rows):
        nxt = rows[i + 1] if i + 1 < len(rows) else None
        if i == 0:
            start = (1, 1)
        elif r['T']:
            start = (r['header_surah'], 1)
        else:
            start = (r['header_surah'], rows[i - 1]['last_ayah'] + 1)
        last_surah = 114 if nxt is None else (nxt['header_surah'] - 1 if nxt['T'] else nxt['header_surah'])
        out.append({**r, 'start': start, 'end': (last_surah, r['last_ayah'])})
    return out
