"""Detect the 480 inline division ornaments and order them in reading order → work/markers_ordered.json.
Score threshold 0.65: real ornaments score ≥ 0.74, the best non-ornament 0.55."""
import json, sys
sys.path.insert(0, 'scripts')
from markers import template, find

t = template()
hits = [(h[0], p, h[1], h[2]) for p in range(3, 606) for h in find(p, t, 0.65)]
# reading order: page, then line (y, 12 px bands), then right-to-left (x descending)
hits.sort(key=lambda h: (h[1], round(h[3] / 12), -h[2]))
json.dump([{'k': i + 1, 'score': round(h[0], 3), 'pdf': h[1], 'x': h[2], 'y': h[3]} for i, h in enumerate(hits)],
          open('work/markers_ordered.json', 'w'))
print(len(hits), 'markers')
