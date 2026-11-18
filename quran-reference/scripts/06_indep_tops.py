"""Blind crops of the TOP of sampled pages (first lines), labelled only with the printed page.
Independent of the extraction: there, each start was derived from the PREVIOUS page's last verse."""
import cv2, sys, os, numpy as np, json
sys.path.insert(0, 'scripts')
from frame import frame_box
printed = sorted(set(list(range(2, 605, 10)) + [591, 592, 593, 604, 3, 4, 5, 300, 301, 450, 451]))
os.makedirs('work/indep/tops', exist_ok=True)
W = 760; crops = []
for pp in printed:
    p = pp + 1
    im = cv2.imread(f'work/pages/p-{p:03d}.jpg'); x0, y0, x1, y1 = frame_box(im); H = y1 - y0
    c = im[y0:y0 + int(H * 0.23), x0:x1]
    c = cv2.resize(c, (W, int(c.shape[0] * W / c.shape[1])))
    lab = np.full((20, W, 3), 255, np.uint8)
    cv2.putText(lab, f'printed page {pp}', (4, 15), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 0, 0), 1)
    crops.append(np.vstack([lab, c]))
for i in range(0, len(crops), 10):
    cv2.imwrite(f'work/indep/tops/t{i // 10:02d}.jpg', np.vstack(crops[i:i + 10]), [cv2.IMWRITE_JPEG_QUALITY, 85])
json.dump(printed, open('work/indep/tops/pages.json', 'w'))
print(len(printed), 'pages', (len(crops) + 9) // 10, 'sheets')
