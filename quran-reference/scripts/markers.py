"""Detect inline division markers (۞ ornament with the hizb number) inside the text frame by template matching."""
import cv2, sys, numpy as np
sys.path.insert(0, 'scripts')
from frame import frame_box

def template():
    im = cv2.imread('work/pages/p-197.jpg', cv2.IMREAD_GRAYSCALE)
    x1 = 612; y0 = 82
    t = im[y0 + 20 + 14:y0 + 20 + 56, x1 - 140 + 76:x1 - 140 + 101]
    return t

def find(p, tpl, thr):
    g = cv2.imread(f'work/pages/p-{p:03d}.jpg', cv2.IMREAD_GRAYSCALE)
    im = cv2.imread(f'work/pages/p-{p:03d}.jpg')
    x0, y0, x1, y1 = frame_box(im)
    roi = g[y0 + 8:y1 - 8, x0 + 8:x1 - 8]
    res = cv2.matchTemplate(roi, tpl, cv2.TM_CCOEFF_NORMED)
    out = []
    r = res.copy()
    th, tw = tpl.shape
    while True:
        _, mv, _, ml = cv2.minMaxLoc(r)
        if mv < thr: break
        out.append((float(mv), ml[0] + x0 + 8, ml[1] + y0 + 8))
        r[max(0, ml[1] - th):ml[1] + th, max(0, ml[0] - tw):ml[0] + tw] = -1
    return out
