"""Blind 200-dpi crops of the 28 quarter markers that differ from the Hafs reference, with the
margin medallion (independent print evidence of the division). Labelled only with the quarter number."""
import cv2, json, os, subprocess, numpy as np
PDF = os.path.expanduser('~/Downloads/مصحف قالون (الطبعة التونسية).pdf')
ds = json.load(open('data/qalun-tn-v1.json')); ref = json.load(open('work/hafs_ref.json'))
ms = json.load(open('work/markers_ordered.json'))
diff = [q['quarter'] for q in ds['quarterStarts'] if (q['surah'], q['ayah']) != tuple(ref['rubs'][q['quarter'] - 1]['start'])]
os.makedirs('work/indep/q', exist_ok=True)
crops = []
for q in diff:
    m = ms[2 * q - 2]; p = m['pdf']
    out = f'work/indep/q/pg-{p:03d}.jpg'
    if not os.path.exists(out):
        subprocess.run(['pdftoppm', '-f', str(p), '-l', str(p), '-r', '200', '-jpeg', '-singlefile', PDF, out[:-4]], check=True)
    im = cv2.imread(out); s = 2.0
    x, y = int(m['x'] * s), int(m['y'] * s)
    y0 = max(0, y - 150); y1 = min(im.shape[0], y + 110)
    c = im[y0:y1, :]
    cv2.rectangle(c, (x - 4, y - y0 - 4), (x + 54, y - y0 + 90), (0, 0, 255), 3)
    c = cv2.resize(c, (900, int(c.shape[0] * 900 / c.shape[1])))
    lab = np.full((22, 900, 3), 255, np.uint8)
    cv2.putText(lab, f'quarter {q}', (4, 16), cv2.FONT_HERSHEY_SIMPLEX, .55, (255, 0, 0), 1)
    crops.append(np.vstack([lab, c]))
for i in range(0, len(crops), 7):
    cv2.imwrite(f'work/indep/q/s{i // 7}.jpg', np.vstack(crops[i:i + 7]), [cv2.IMWRITE_JPEG_QUALITY, 85])
json.dump(diff, open('work/indep/q/quarters.json', 'w')); print(diff)
