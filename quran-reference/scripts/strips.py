"""Header + first-line and last-line strips of each page, for reading verse markers."""
import cv2, sys, numpy as np
sys.path.insert(0, 'scripts')
from frame import frame_box

def strips(p):
    im = cv2.imread(f'work/pages/p-{p:03d}.jpg')
    h, w = im.shape[:2]
    x0, y0, x1, y1 = frame_box(im)
    H = y1 - y0
    xa, xb = max(0, min(x0, x1 - 520) - 50), min(w, max(x1, x0 + 520) + 50)
    top = im[max(0, y0 - 42):y0 + int(H * 0.115), xa:xb]
    bottom = im[y1 - int(H * 0.105):min(h, y1 + 4), xa:xb]
    return top, bottom
