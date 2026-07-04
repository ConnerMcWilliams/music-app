"""Fast lightweight OMR for the Clarke scan: staff systems + notehead step sequences.

Used to decode the pattern schemes in studies/seed/clarke_notation.py from the
public-domain 1912 Carl Fischer scan. Kept for the follow-up transcription of
the remaining items (etudes, Studies VII/VIII, IX Nos. 184-186, X Nos. 187-188).

Setup:
    uv venv .venv && uv pip install -p .venv/bin/python pymupdf scipy pillow numpy
    curl -sL -o clarke.pdf \
      "https://ia801601.us.archive.org/10/items/clarke-metodo-trompeta/Clarke%20metodo%20trompeta_text.pdf"

Workflow: render(page_idx) caches a 400-dpi PNG; find_systems() locates staves
via comb-template matching (robust to beams); read_heads() erodes away thin
ink and returns filled-notehead (x, diatonic-step) pairs relative to the
staff's bottom line (E4). Accidentals are NOT detected - infer them from the
pattern/key and verify visually. Open noteheads (halves/wholes) are not
detected either. Centroids read ~0.2 step low; read_heads corrects (+0.18).
"""
import os

import fitz
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

DPI = 400
PAGE_W = 3516

def render(page_idx, cache_dir="hi"):
    os.makedirs(cache_dir, exist_ok=True)
    path = f"{cache_dir}/p{page_idx+1:02d}.png"
    if not os.path.exists(path):
        doc = fitz.open("clarke.pdf")
        pix = doc[page_idx].get_pixmap(dpi=DPI, colorspace=fitz.csGRAY)
        pix.save(path)
    return path

def find_systems(pagefile, x0=800, x1=2800, thresh=0.55):
    """Return list of 5-tuples of staff-line rows (comb-template matching)."""
    img = Image.open(pagefile).convert("L")
    a = np.asarray(img)
    ink = a < 128
    f = ink[:, x0:x1].mean(axis=1)
    H = len(f)
    spacings = [26.0, 26.5, 27.0, 27.5, 28.0]
    best_score = np.zeros(H)
    best_sp = np.zeros(H)
    for s in spacings:
        idx = (np.arange(H)[:, None] + np.arange(5)[None, :] * s).astype(int)
        valid = idx[:, 4] < H
        sc = np.zeros(H)
        sc[valid] = f[idx[valid]].sum(axis=1)
        upd = sc > best_score
        best_score[upd] = sc[upd]
        best_sp[upd] = s
    # peaks: score high enough that 5 rows are mostly dark
    out = []
    order = np.argsort(-best_score)
    taken = np.zeros(H, bool)
    for y in order:
        if best_score[y] < 2.8:
            break
        if taken[max(0, y - 60):y + 61].any():
            continue
        s = best_sp[y]
        rows = tuple(int(round(y + k * s)) for k in range(5))
        # refine each row to local rowfrac max within +/-3
        ref = []
        for r in rows:
            lo, hi = max(0, r - 3), min(H, r + 4)
            ref.append(lo + int(np.argmax(f[lo:hi])))
        out.append(tuple(ref))
        taken[max(0, y - 60):min(H, y + int(4 * s) + 60)] = True
    out.sort()
    # merge overlapping detections (same staff found twice)
    merged = []
    for st in out:
        if merged and st[0] - merged[-1][0] < 90:
            continue
        merged.append(st)
    return merged

def read_heads(pagefile, staff, pad_above=110, pad_below=150,
               erode=15, minsz=95, maxsz=360, minh=12, maxh=32, minw=13, maxw=45):
    """Detect filled noteheads around a staff; return [(x, step)] sorted by x.
    step = diatonic steps above bottom staff line (E4 for treble)."""
    img = Image.open(pagefile).convert("L")
    y0 = max(0, staff[0] - pad_above)
    y1 = staff[-1] + pad_below
    line = img.crop((0, y0, PAGE_W, y1))
    inv = line.point(lambda v: 255 if v < 128 else 0)
    er = inv.filter(ImageFilter.MinFilter(erode))
    b = np.asarray(er) > 0
    lab, n = ndimage.label(b)
    if n == 0:
        return []
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum_labels(b, lab, index=np.arange(1, n + 1))
    E4 = float(staff[-1])
    sp = float(np.mean(np.diff(staff)))
    heads = []
    for i, sl in enumerate(objs):
        sz = sizes[i]
        if not (minsz <= sz <= maxsz):
            continue
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if not (minh <= h <= maxh and minw <= w <= maxw):
            continue
        ys, xs = np.nonzero(lab[sl] == i + 1)
        cy = ys.mean() + sl[0].start + y0
        cx = xs.mean() + sl[1].start
        frac = float((E4 - cy) / (sp / 2))
        # noteheads read slightly low (stem/ledger ink pulls centroid down)
        step = round(frac + 0.18)
        heads.append((int(cx), int(step), frac))
    heads.sort()
    return heads

STEP_NAMES_UP = ["E4","F4","G4","A4","B4","C5","D5","E5","F5","G5","A5","B5","C6"]
STEP_NAMES_DN = ["D4","C4","B3","A3","G3","F3","E3","D3","C3"]

def step_name(s):
    return STEP_NAMES_UP[s] if s >= 0 else STEP_NAMES_DN[-s-1]
