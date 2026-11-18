"""Verse count of every surah, from the two independent readings in the PDF:
- last_seen: the last verse number printed before the next surah title (or at the book's end),
- title: the «آياتها» number printed in each surah's title frame.
Returns {surah: {'count', 'last_seen', 'title', 'sources'}}."""
import csv, re, sys
sys.path.insert(0, 'scripts')
from derive import load, derive

def surah_counts():
    pages = derive(load())
    seen, title, where = {}, {}, {}
    for r in csv.DictReader(open('data/readings/surah_ends.csv', encoding='utf-8')):
        s, v = int(r['surah']), int(r['value'])
        if r['kind'] == 'last_seen':
            seen.setdefault(s, set()).add(v); where.setdefault(s, set()).add(int(r['pdf']))
        elif r['kind'] == 'title_count':
            title.setdefault(s, set()).add(v)
    for i, p in enumerate(pages):
        m = re.search(r'title frame shows (\d+)', p['note'])
        if m: title.setdefault(p['header_surah'], set()).add(int(m.group(1)))
        nxt = pages[i + 1] if i + 1 < len(pages) else None
        if nxt is None or nxt['T']:
            seen.setdefault(p['end'][0], set()).add(p['last_ayah']); where.setdefault(p['end'][0], set()).add(p['pdf'])
    out = {}
    for s in range(1, 115):
        ls, tc = seen.get(s, set()), title.get(s, set())
        out[s] = {'count': min(ls) if len(ls) == 1 else None,
                  'last_seen': sorted(ls), 'title': sorted(tc), 'pdf': sorted(where.get(s, set()))}
    return out

if __name__ == '__main__':
    c = surah_counts()
    print(sum(v['count'] for v in c.values() if v['count']), [s for s, v in c.items() if v['count'] is None])
