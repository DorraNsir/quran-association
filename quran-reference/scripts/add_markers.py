"""Append marker readings: 'k hizb_in_marker surah ayah evidence…'
evidence: aN = directly after verse-end N on the same line; ps = first word of the page;
lN = start of a line, previous line ends with verse N; t = right after a surah title/basmala."""
import sys
with open('data/readings/markers.csv', 'a') as f:
    for line in sys.stdin.read().strip().splitlines():
        k, h, s, a, ev = line.split(maxsplit=4)
        f.write(f'{k},{h},{s},{a},{ev}\n')
