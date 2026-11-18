"""Independent, automatic check over ALL pages: which pages carry a margin division medallion
(two stacked hizb rings outside the text frame)? Compared with the pages of the inline markers."""
import cv2, sys, json, numpy as np
sys.path.insert(0, 'scripts')
from frame import frame_box

def medallion(p):
    im = cv2.imread(f'work/pages/p-{p:03d}.jpg'); x0, y0, x1, y1 = frame_box(im)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    found = []
    for xa, xb in ((0, max(0, x0 - 4)), (min(g.shape[1], x1 + 4), g.shape[1])):
        side = g[:, xa:xb]
        if side.shape[1] < 30: continue
        c = cv2.HoughCircles(cv2.medianBlur(side, 3), cv2.HOUGH_GRADIENT, dp=1, minDist=30,
                             param1=120, param2=22, minRadius=17, maxRadius=26)
        if c is not None:
            pts = sorted(c[0].tolist(), key=lambda t: t[1])
            # two rings stacked vertically, about 50 px apart, same column
            for a in pts:
                for b in pts:
                    if 35 < b[1] - a[1] < 70 and abs(b[0] - a[0]) < 8: found.append((xa + a[0], a[1]))
    return bool(found)

if __name__ == '__main__':
    have = {p for p in range(3, 606) if medallion(p)}
    marker_pages = {m['pdf'] for m in json.load(open('work/markers_ordered.json'))}
    json.dump({'medallion_pages': sorted(have)}, open('work/indep/medallions.json', 'w'))
    print('pages with medallion', len(have), '| marker pages', len(marker_pages))
    print('marker page without medallion', sorted(marker_pages - have))
    print('medallion page without marker', sorted(have - marker_pages))
