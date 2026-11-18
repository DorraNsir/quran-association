"""Reading sheets: per page, [header + first line | last line], labelled with PDF and printed page."""
import cv2, sys, numpy as np
sys.path.insert(0, 'scripts')
from strips import strips

W = 520
def fit(s):
    return cv2.resize(s, (W, int(s.shape[0] * W / s.shape[1])), interpolation=cv2.INTER_AREA)

def sheet(pages, out):
    rows = []
    for p in pages:
        t, b = map(fit, strips(p))
        h = max(t.shape[0], b.shape[0])
        row = np.full((h + 18, 2 * W + 10, 3), 255, np.uint8)
        row[18:18 + t.shape[0], W + 10:] = t      # right: header + first line
        row[18:18 + b.shape[0], :W] = b           # left: last line
        cv2.putText(row, f'PDF {p} / printed {p - 1}', (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
        rows.append(row)
    cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])

if __name__ == '__main__':
    import os
    os.makedirs('work/sheets', exist_ok=True)
    per = int(sys.argv[1]) if len(sys.argv) > 1 else 16
    for a in range(3, 606, per):
        sheet(range(a, min(a + per, 606)), f'work/sheets/s{a:03d}.jpg')
