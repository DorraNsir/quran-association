"""Reading crops for every inline division marker (in reading order)."""
import cv2, json, sys, os, numpy as np
sys.path.insert(0, 'scripts')
from frame import frame_box
from derive import load, derive

d = {r['pdf']: r for r in derive(load())}
ms = json.load(open('work/markers_ordered.json'))
W = 980
os.makedirs('work/markers', exist_ok=True)
crops = []
for m in ms:
    p, x, y = m['pdf'], m['x'], m['y']
    im = cv2.imread(f'work/pages/p-{p:03d}.jpg')
    x0, y0, x1, y1 = frame_box(im)
    cv2.rectangle(im, (x - 2, y - 2), (x + 27, y + 44), (0, 0, 255), 2)
    top = y - 4 - (52 if x > x1 - 75 else 0)
    c = im[max(y0, top):y + 46, x0:x1]
    c = cv2.resize(c, (W, int(c.shape[0] * W / c.shape[1])))
    r = d[p]
    lab = np.full((22, W, 3), 255, np.uint8)
    cv2.putText(lab, f"#{m['k']} hizb~{(m['k'] - 1) // 8 + 1} eighth~{(m['k'] - 1) % 8 + 1} | PDF {p} | page {r['start'][0]}:{r['start'][1]} .. {r['end'][0]}:{r['end'][1]}",
                (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 0, 255), 1)
    crops.append(np.vstack([lab, c]))
for i in range(0, len(crops), 16):
    cv2.imwrite(f'work/markers/m{i // 16 + 1:02d}.jpg', np.vstack(crops[i:i + 16]), [cv2.IMWRITE_JPEG_QUALITY, 82])
print(len(crops), 'crops', (len(crops) + 15) // 16, 'sheets')
