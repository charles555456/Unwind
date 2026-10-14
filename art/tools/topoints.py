"""
Turn a photo into a point file for the site.
Format (little-endian): b'UPTS', u16 width, u16 height, u32 count,
then per point u16 x, u16 y (0..65535 across the image), u8 brightness.
"""
import struct, sys
import numpy as np
from PIL import Image, ImageFilter

def write(path, w, h, xs, ys, bs):
    with open(path, 'wb') as f:
        f.write(b'UPTS' + struct.pack('<HHI', w, h, len(xs)))
        for x, y, b in zip(xs, ys, bs):
            f.write(struct.pack('<HHB', int(x), int(y), int(b)))

def sample(lum, mask, target, gamma, rng):
    """Stratified jittered sampling: brighter and more opaque pixels win more points."""
    h, w = lum.shape
    p = (np.clip(lum, 0, 1) ** gamma) * mask
    scale = target / max(p.sum(), 1e-6)
    p = np.clip(p * scale, 0, 1)
    keep = rng.random((h, w)) < p
    ys, xs = np.nonzero(keep)
    jx = xs + rng.random(len(xs)); jy = ys + rng.random(len(ys))
    b = np.clip(lum[ys, xs], 0, 1)
    return jx / w * 65535, jy / h * 65535, np.round(40 + b * 215)

rng = np.random.default_rng(7)
src = sys.argv[1]; out = sys.argv[2]

# ── astronaut: on black space ──
im = Image.open(src + '/s84-27017-medium.jpg').convert('RGB').crop((330, 40, 1000, 700))
im = im.resize((560, int(560 * im.height / im.width)), Image.LANCZOS)
im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2))
a = np.asarray(im).astype(np.float32) / 255
lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
mask = np.clip((lum - 0.07) / 0.1, 0, 1)                 # space is near black
xs, ys, bs = sample(lum, mask, 13000, 1.15, rng)
write(out + '/astronaut.bin', im.width, im.height, xs, ys, bs)
print('astronaut', im.size, len(xs))

# ── hands: Michelangelo, separated from the plaster by colour ──
im = Image.open(src + '/adam.jpg').convert('RGB').crop((880 + 40, 560 + 40, 880 + 930, 560 + 300))
im = im.resize((900, int(900 * im.height / im.width)), Image.LANCZOS)
a = np.asarray(im).astype(np.float32) / 255
r, g, b = a[..., 0], a[..., 1], a[..., 2]
warm = r - b                                             # skin is warm; plaster is near neutral
red = (r - g) / np.maximum(r, 1e-3)                      # the red cloak
skin = np.clip((warm - 0.16) / 0.1, 0, 1) * np.clip((0.42 - red) / 0.12, 0, 1)
skin = np.asarray(Image.fromarray((skin * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
# keep only the two arms: firm threshold, the two largest regions, and no cherub or knee
from scipy import ndimage
firm = skin > 0.5
labels, count = ndimage.label(firm)
sizes = ndimage.sum(firm, labels, range(1, count + 1))
keep_ids = 1 + np.argsort(sizes)[-3:]
arms = np.isin(labels, keep_ids)
hh, ww = arms.shape
yy, xx = np.mgrid[0:hh, 0:ww]
arms &= ~((xx > ww * 0.84) & (yy > hh * 0.56))           # the cherub below God's arm
arms &= ~((xx < ww * 0.16) & (yy > hh * 0.82))           # Adam's knee
# God's pointing finger is thin and faint; take it straight from the soft mask
gap = (xx > ww * 0.44) & (xx < ww * 0.62) & (yy > hh * 0.3) & (yy < hh * 0.62)
arms |= gap & (skin > 0.28)
arms = ndimage.binary_closing(arms, iterations=2)
soft = np.asarray(Image.fromarray((arms * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32) / 255
skin = soft * np.maximum(np.clip((skin - 0.35) / 0.3, 0, 1), gap * np.clip((skin - 0.2) / 0.25, 0, 1))
lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
lum = np.clip((lum - 0.25) / 0.65, 0, 1)                 # stretch the skin's range
xs, ys, bs = sample(lum, skin, 14000, 1.0, rng)
write(out + '/hands.bin', im.width, im.height, xs, ys, bs)
Image.fromarray((skin * 255).astype(np.uint8)).save(src + '/hands-mask.png')
print('hands', im.size, len(xs))
