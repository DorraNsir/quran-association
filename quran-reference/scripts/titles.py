"""Find surah title boxes inside a page's frame: bands of rows that are densely dark across the text width."""
import cv2, sys, numpy as np
sys.path.insert(0, 'scripts')
from frame import frame_box

def title_bands(img):
    x0, y0, x1, y1 = frame_box(img)
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    inner = g[y0 + 40:y1 - 40, x0 + 40:x1 - 40]
    dark = (inner < 170).mean(axis=1)
    rows = np.where(dark > 0.55)[0]
    bands = []
    for r in rows:
        if bands and r - bands[-1][1] <= 3: bands[-1][1] = r
        else: bands.append([r, r])
    # a title box: two dense borders 25..70 px apart
    boxes = []
    i = 0
    while i < len(bands) - 1:
        a, b = bands[i], bands[i + 1]
        if 25 <= b[0] - a[1] <= 75:
            boxes.append((a[0] + y0 + 40, b[1] + y0 + 40)); i += 2
        else: i += 1
    return (x0, y0, x1, y1), boxes
