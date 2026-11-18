# -*- coding: utf-8 -*-
"""从全屏截图里自动定位并裁出 DevTools 模拟器手机画面。
用法: python tools/capture_phone.py <full_screen.png> <out.png> [x_min_phys]
按亮度阈值在右侧区域找手机屏包围盒，打印坐标供数值自检。"""
import sys
from PIL import Image

src = sys.argv[1]
out = sys.argv[2]
XMIN = int(sys.argv[3]) if len(sys.argv) > 3 else 1400

im = Image.open(src).convert("RGB")
W, H = im.size
px = im.load()
thr = 140  # 手机屏内容(白/薄荷绿)较亮，DevTools 背景较暗
minx, miny, maxx, maxy = W, H, -1, -1
for y in range(0, H, 2):
    for x in range(XMIN, W, 2):
        r, g, b = px[x, y]
        if max(r, g, b) > thr:
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
if maxx < 0:
    print("NOT-FOUND: 右侧无亮区，检查 XMIN"); sys.exit(2)

# 适当收紧：去掉可能的零散亮点，用 4% 边距内缩
bw, bh = maxx - minx, maxy - miny
m = 4
crop = im.crop((minx + m, miny + m, maxx - m, maxy - m))
crop.save(out)
print(f"bbox=({minx},{miny})-({maxx},{maxy}) size={crop.size[0]}x{crop.size[1]} -> {out}")
