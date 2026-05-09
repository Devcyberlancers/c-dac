from pathlib import Path
import math
import random

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "static" / "videos"
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H = 1280, 720
FPS = 24
DURATION = 5
FRAMES = FPS * DURATION


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


TITLE = font(54, True)
SUB = font(24)
HUD = font(18)
HUD_BIG = font(25, True)


def lerp(a, b, p):
    return a + (b - a) * p


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))


def gradient(top, bottom):
    y = np.linspace(0, 1, H)[:, None]
    top = np.array(top, dtype=np.float32)
    bottom = np.array(bottom, dtype=np.float32)
    col = top * (1 - y) + bottom * y
    return np.repeat(col[:, None, :], W, axis=1).astype(np.uint8)


def add_noise(img, strength=9):
    arr = np.asarray(img).astype(np.int16)
    rng = np.random.default_rng(44)
    noise = rng.normal(0, strength, arr.shape).astype(np.int16)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def text_center(draw, y, text, fnt, fill):
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((W - (box[2] - box[0])) // 2, y), text, font=fnt, fill=fill)


def hud_panel(draw, xy, title, lines, accent):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=14, fill=(5, 12, 16, 176), outline=(*accent, 155), width=2)
    draw.text((x1 + 18, y1 + 14), title, font=HUD_BIG, fill=(235, 250, 238, 245))
    for idx, line in enumerate(lines):
        y = y1 + 55 + idx * 29
        draw.text((x1 + 20, y), line, font=HUD, fill=(190, 230, 205, 230))
        draw.line((x1 + 155, y + 13, x2 - 20, y + 13), fill=(*accent, 92), width=2)


def vignette(img):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, "RGBA")
    for r, alpha in [(900, 0), (760, 24), (610, 52), (470, 86)]:
        d.rectangle((0, 0, W, H), fill=(0, 0, 0, alpha))
        d.ellipse((W // 2 - r, H // 2 - r // 2, W // 2 + r, H // 2 + r // 2), fill=(0, 0, 0, 0))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def agriculture_frame(i):
    t = i / FPS
    p = i / (FRAMES - 1)
    img = Image.fromarray(gradient((9, 24, 18), (24, 48, 22)), "RGB").convert("RGBA")
    draw = ImageDraw.Draw(img, "RGBA")

    # Warm futuristic sunrise.
    sun_x = int(980 - 90 * p)
    sun_y = int(150 + 16 * math.sin(t))
    for r, a in [(190, 18), (120, 35), (62, 70)]:
        draw.ellipse((sun_x - r, sun_y - r, sun_x + r, sun_y + r), fill=(255, 214, 112, a))

    # Horizon and glass farm structures.
    draw.rectangle((0, 350, W, H), fill=(18, 42, 20, 185))
    for n in range(7):
        x = 95 + n * 158 - int(45 * p)
        draw.polygon([(x, 318), (x + 80, 242), (x + 160, 318)], outline=(120, 230, 140, 95), fill=(16, 50, 34, 80))
        draw.rectangle((x + 18, 318, x + 142, 398), outline=(120, 230, 140, 85), fill=(9, 27, 20, 80))
        draw.line((x + 80, 242, x + 80, 398), fill=(120, 230, 140, 70), width=2)

    # Perspective crop rows, moving toward camera.
    van_x, van_y = W // 2, 330
    row_shift = (p * 90) % 70
    for n in range(-10, 11):
        start_x = W // 2 + n * 46
        end_x = W // 2 + n * 158
        color = (70 + abs(n) * 2, 185, 64, 120)
        draw.line((van_x, van_y, end_x + math.sin(t + n) * 14, H + 30), fill=color, width=5)
        for k in range(9):
            y = 374 + k * 42 + row_shift
            if y > H:
                continue
            scale = (y - van_y) / (H - van_y)
            x = lerp(start_x, end_x, scale) + math.sin(t * 2 + k + n) * 4
            size = 5 + scale * 19
            draw.ellipse((x - size, y - size * 0.55, x + size, y + size * 0.55), fill=(88, 218, 72, 120))

    # Sensor masts and scan cones.
    for n in range(5):
        x = 170 + n * 235 - int(p * 70)
        base_y = 438 + math.sin(n) * 28
        draw.line((x, base_y, x, base_y - 86), fill=(220, 255, 220, 160), width=4)
        draw.ellipse((x - 11, base_y - 102, x + 11, base_y - 80), fill=(159, 255, 120, 230))
        sweep = math.sin(t * 2.8 + n) * 30
        draw.polygon([(x, base_y - 88), (x - 82 + sweep, base_y + 6), (x + 82 + sweep, base_y + 6)], fill=(93, 184, 62, 22))

    # Drone gliding across frame.
    drone_x = int(190 + 790 * p)
    drone_y = int(170 + 22 * math.sin(t * 2.2))
    draw.line((drone_x - 56, drone_y, drone_x + 56, drone_y), fill=(225, 255, 230, 190), width=4)
    draw.ellipse((drone_x - 20, drone_y - 11, drone_x + 20, drone_y + 11), fill=(24, 34, 30, 235), outline=(140, 255, 130, 180))
    for dx in [-70, 70]:
        draw.ellipse((drone_x + dx - 18, drone_y - 18, drone_x + dx + 18, drone_y + 18), outline=(190, 255, 190, 150), width=3)

    # AR overlays.
    draw.rounded_rectangle((78, 72, 450, 168), radius=18, fill=(5, 14, 10, 145), outline=(108, 230, 88, 120), width=2)
    draw.text((104, 88), "AI FUTURE FARM WALKTHROUGH", font=HUD_BIG, fill=(234, 255, 225, 245))
    draw.text((105, 124), "crop health scan | autonomous irrigation", font=HUD, fill=(180, 230, 170, 230))
    hud_panel(draw, (895, 438, 1186, 584), "LIVE FARM TWIN", ["Soil moisture  71%", "Crop stress    LOW", "Irrigation     AUTO"], (93, 184, 62))
    text_center(draw, 630, "Smart Agriculture demo preview", SUB, (226, 246, 222, 218))

    return vignette(add_noise(img.convert("RGB"), 5))


def water_frame(i):
    t = i / FPS
    p = i / (FRAMES - 1)
    img = Image.fromarray(gradient((5, 18, 31), (8, 45, 55)), "RGB").convert("RGBA")
    draw = ImageDraw.Draw(img, "RGBA")

    # Distant city and treatment plant silhouette.
    draw.rectangle((0, 350, W, H), fill=(6, 29, 37, 185))
    for n in range(14):
        x = 55 + n * 88 - int(p * 36)
        h = 82 + (n % 5) * 23
        draw.rectangle((x, 320 - h, x + 52, 350), fill=(8, 24, 35, 185), outline=(70, 160, 195, 70))
        for yy in range(320 - h + 14, 340, 24):
            draw.line((x + 10, yy, x + 42, yy), fill=(79, 200, 245, 55), width=2)

    # Reservoir glow.
    for r, a in [(260, 18), (170, 32), (90, 52)]:
        draw.ellipse((W // 2 - r, 290 - r // 3, W // 2 + r, 290 + r // 3), fill=(64, 178, 235, a))

    # Perspective pipeline network with moving water pulses.
    van_x, van_y = W // 2, 338
    pipe_color = (92, 192, 222, 118)
    pulse_color = (116, 232, 255, 225)
    endpoints = [80, 210, 360, 520, 760, 930, 1080, 1210]
    for x in endpoints:
        draw.line((van_x, van_y, x, H + 28), fill=pipe_color, width=11)
        draw.line((van_x, van_y, x, H + 28), fill=(15, 55, 70, 220), width=5)
        phase = (p * 1.35 + x / W) % 1
        y = lerp(van_y, H + 12, phase)
        sx = lerp(van_x, x, phase)
        draw.ellipse((sx - 13, y - 13, sx + 13, y + 13), fill=pulse_color)
    for k in range(6):
        y = 382 + k * 52
        draw.line((110, y, W - 110, y + math.sin(t + k) * 8), fill=(75, 165, 205, 70), width=7)

    # Monitoring nodes.
    for n in range(8):
        x = 150 + n * 138 - int(45 * p)
        y = 430 + math.sin(t * 1.7 + n) * 34
        draw.ellipse((x - 22, y - 22, x + 22, y + 22), fill=(39, 205, 214, 190), outline=(210, 255, 255, 185), width=2)
        draw.line((x, y + 24, x, y + 92), fill=(76, 220, 205, 105), width=4)
        draw.ellipse((x - 55, y - 55, x + 55, y + 55), outline=(68, 205, 235, 55), width=2)

    # Floating hologram map.
    map_x = int(185 + 40 * math.sin(t * 0.8))
    draw.rounded_rectangle((map_x, 116, map_x + 340, 244), radius=18, fill=(4, 20, 30, 150), outline=(77, 190, 236, 130), width=2)
    draw.text((map_x + 24, 136), "WATER GRID DIGITAL TWIN", font=HUD_BIG, fill=(224, 250, 255, 240))
    for n in range(4):
        y = 182 + n * 18
        draw.line((map_x + 30, y, map_x + 306, y + math.sin(t + n) * 8), fill=(105, 220, 255, 120), width=3)
    draw.ellipse((map_x + 245, 178, map_x + 267, 200), fill=(70, 255, 215, 235))

    hud_panel(draw, (895, 430, 1186, 584), "LIVE FLOW OPS", ["Pressure      4.2 bar", "Leak risk     NONE", "Valve state   BALANCED"], (64, 178, 235))
    text_center(draw, 630, "Smart Water Distribution demo preview", SUB, (220, 245, 255, 218))

    return vignette(add_noise(img.convert("RGB"), 5))


def write_video(filename, frame_fn):
    random.seed(12)
    writer = imageio.get_writer(
        OUT_DIR / filename,
        fps=FPS,
        codec="libx264",
        quality=9,
        macro_block_size=16,
    )
    for i in range(FRAMES):
        writer.append_data(np.asarray(frame_fn(i)))
    writer.close()


write_video("smart-agriculture-demo.mp4", agriculture_frame)
write_video("smart-water-demo.mp4", water_frame)
print("Generated realistic walkthrough demo videos in", OUT_DIR)
