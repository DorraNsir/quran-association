"""Crops of [line above + title box] for every candidate title box on pages with mid-page surah starts."""
import cv2, sys, numpy as np, json
sys.path.insert(0, 'scripts')
from titles import title_bands
from derive import load, derive

d = derive(load())
pages = sorted({r['pdf'] for r in d
                if r['end'][0] > r['start'][0] or r['pdf'] == 3})
W = 900
crops = []
for p in pages:
    im = cv2.imread(f'work/pages/p-{p:03d}.jpg')
    (x0, y0, x1, y1), boxes = title_bands(im)
    for k, (a, b) in enumerate(boxes):
        c = im[max(0, a - 62):b + 4, max(0, x0 - 5):x1 + 5]
        c = cv2.resize(c, (W, int(c.shape[0] * W / c.shape[1])))
        lab = np.full((20, W, 3), 255, np.uint8)
        cv2.putText(lab, f'PDF {p} box {k} y={a}', (4, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
        crops.append(np.vstack([lab, c]))
import os; os.makedirs('work/titles', exist_ok=True)
for i in range(0, len(crops), 12):
    cv2.imwrite(f'work/titles/t{i // 12:02d}.jpg', np.vstack(crops[i:i + 12]), [cv2.IMWRITE_JPEG_QUALITY, 85])
print(len(pages), 'pages', len(crops), 'crops')
