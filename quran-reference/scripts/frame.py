"""Locate the decorative frame of a scanned Mushaf page (outer edge of its border)."""
import cv2, numpy as np

EDGE = 12  # px ignored at the page edges (dark scan borders)

def _first_dense(profile, rng):
    """Index where the first dense run (the border) starts, scanning in `rng` order."""
    for i in rng:
        if profile[i] > 0.35:
            return i
    return None

def frame_box(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    dark = (g < 140).astype(np.float32)
    h, w = dark.shape
    cols = dark.mean(axis=0)
    x0 = _first_dense(cols, range(EDGE, w // 3))
    x1 = _first_dense(cols, range(w - 1 - EDGE, 2 * w // 3, -1))
    rows = dark[:, (x0 or 0) + 15:(x1 or w) - 15].mean(axis=1)
    y0 = _first_dense(rows, range(EDGE, h // 3))
    y1 = _first_dense(rows, range(h - 1 - EDGE, 2 * h // 3, -1))
    return x0, y0, x1, y1
