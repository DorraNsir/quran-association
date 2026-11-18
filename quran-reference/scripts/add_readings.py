"""Append manual readings: lines 'pdf surah juz last_ayah [T] [M] [note…]'.
T = page starts with a surah title frame; M = page does NOT end at a verse marker."""
import sys
lines = sys.stdin.read().strip().splitlines()
with open('data/readings/pages.csv', 'a') as f:
    for line in lines:
        parts = line.split()
        p, s, j, last = parts[:4]
        flags = [x for x in parts[4:] if x in ('T', 'M')]
        note = ' '.join(x for x in parts[4:] if x not in ('T', 'M'))
        f.write(f"{p},{int(p) - 1},{s},{j},{'Y' if 'T' in flags else 'N'},{last},{'N' if 'M' in flags else 'Y'},{note}\n")
