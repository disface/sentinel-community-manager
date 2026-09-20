import math
import os
import base64
from io import BytesIO
from PIL import Image, ImageDraw, ImageFilter

def create_sentinel_icon():
    W, H = 1024, 1024
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    
    # 1. Background Squircle with subtle gradient
    bg = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    
    margin = 54
    radius = 230
    rect = [margin, margin, W - margin, H - margin]
    
    # Gradient background
    for y in range(margin, H - margin):
        ratio = (y - margin) / (H - 2 * margin)
        # Deep space dark slate: from #121829 to #080b14
        r = int(18 * (1 - ratio) + 8 * ratio)
        g = int(24 * (1 - ratio) + 11 * ratio)
        b = int(41 * (1 - ratio) + 20 * ratio)
        bg_draw.line([(margin, y), (W - margin, y)], fill=(r, g, b, 255))
        
    # Mask to rounded rectangle
    mask = Image.new('L', (W, H), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(rect, radius=radius, fill=255)
    
    bg.putalpha(mask)
    im.alpha_composite(bg)
    
    # 2. Glowing Outer Rim Border
    border = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border)
    b_width = 16
    
    for i in range(b_width):
        t = i / b_width
        inset = margin + i
        for y in range(inset, H - inset):
            ratio = (y - inset) / (H - 2 * inset)
            # Cyan #38bdf8 at top to Blue #2563eb to Purple #7c3aed at bottom
            if ratio < 0.5:
                sub = ratio / 0.5
                r = int(56 * (1 - sub) + 37 * sub)
                g = int(189 * (1 - sub) + 99 * sub)
                b = int(248 * (1 - sub) + 235 * sub)
            else:
                sub = (ratio - 0.5) / 0.5
                r = int(37 * (1 - sub) + 124 * sub)
                g = int(99 * (1 - sub) + 58 * sub)
                b = int(235 * (1 - sub) + 237 * sub)
            # We will use mask to keep only the border
    
    # Simpler precise border drawing
    rim_mask = Image.new('L', (W, H), 0)
    rm_draw = ImageDraw.Draw(rim_mask)
    rm_draw.rounded_rectangle(rect, radius=radius, outline=255, width=16)
    
    rim_grad = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rg_draw = ImageDraw.Draw(rim_grad)
    for y in range(margin, H - margin):
        ratio = (y - margin) / (H - 2 * margin)
        if ratio < 0.55:
            sub = ratio / 0.55
            r = int(56 * (1 - sub) + 39 * sub)
            g = int(189 * (1 - sub) + 135 * sub)
            b = int(248 * (1 - sub) + 245 * sub)
        else:
            sub = (ratio - 0.55) / 0.45
            r = int(39 * (1 - sub) + 139 * sub)
            g = int(135 * (1 - sub) + 92 * sub)
            b = int(245 * (1 - sub) + 246 * sub)
        rg_draw.line([(margin, y), (W - margin, y)], fill=(r, g, b, 255))
        
    rim_grad.putalpha(rim_mask)
    im.alpha_composite(rim_grad)
    
    # 3. Sentinel Shield Graphic in the center
    # Shield shape points
    cx = W // 2
    top_y = 200
    mid_y = 540
    bot_y = 820
    half_w = 260
    
    # Draw Shield Outer Glow
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow)
    
    shield_pts = [
        (cx - half_w, top_y + 40),
        (cx - half_w * 0.5, top_y),
        (cx, top_y + 15),
        (cx + half_w * 0.5, top_y),
        (cx + half_w, top_y + 40),
        (cx + half_w, mid_y),
        (cx + half_w * 0.65, mid_y + 160),
        (cx, bot_y),
        (cx - half_w * 0.65, mid_y + 160),
        (cx - half_w, mid_y),
    ]
    
    # Inner Shield Mask
    shield_img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shield_img)
    
    # Gradient for shield interior: #132247 to #0b1329
    s_mask = Image.new('L', (W, H), 0)
    sm_draw = ImageDraw.Draw(s_mask)
    sm_draw.polygon(shield_pts, fill=255)
    
    s_grad = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sg_draw = ImageDraw.Draw(s_grad)
    for y in range(top_y, bot_y):
        ratio = (y - top_y) / (bot_y - top_y)
        r = int(24 * (1 - ratio) + 10 * ratio)
        g = int(48 * (1 - ratio) + 20 * ratio)
        b = int(105 * (1 - ratio) + 50 * ratio)
        sg_draw.line([(cx - half_w - 20, y), (cx + half_w + 20, y)], fill=(r, g, b, 255))
    s_grad.putalpha(s_mask)
    im.alpha_composite(s_grad)
    
    # Shield Border
    s_border_mask = Image.new('L', (W, H), 0)
    sbm_draw = ImageDraw.Draw(s_border_mask)
    sbm_draw.polygon(shield_pts, outline=255, width=14)
    
    s_border_grad = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sbg_draw = ImageDraw.Draw(s_border_grad)
    for y in range(top_y, bot_y):
        ratio = (y - top_y) / (bot_y - top_y)
        # bright electric cyan-blue to indigo
        r = int(56 * (1 - ratio) + 99 * ratio)
        g = int(189 * (1 - ratio) + 102 * ratio)
        b = int(248 * (1 - ratio) + 241 * ratio)
        sbg_draw.line([(cx - half_w - 20, y), (cx + half_w + 20, y)], fill=(r, g, b, 255))
    s_border_grad.putalpha(s_border_mask)
    im.alpha_composite(s_border_grad)
    
    # 4. Center Emblem: Modern Stylized Sentinel Community Wings & Signal Nodes
    # Dynamic Chat / Wings in electric cyan & white
    emblem = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    e_draw = ImageDraw.Draw(emblem)
    
    # Chat Bubble / Sentinel Wing 1 (Upper Left to Center)
    pts_wing_top = [
        (cx - 150, 340),
        (cx + 80, 340),
        (cx + 140, 420),
        (cx - 90, 420),
    ]
    
    # Chat Bubble / Sentinel Wing 2 (Lower Right to Center)
    pts_wing_bot = [
        (cx - 140, 480),
        (cx + 90, 480),
        (cx + 150, 560),
        (cx - 80, 560),
    ]
    
    # Sleek modern S-curve community ribbon:
    # Ribbon 1 (Top segment curving right)
    e_draw.polygon([
        (cx - 140, 360),
        (cx + 60, 360),
        (cx + 130, 430),
        (cx + 30, 430),
        (cx - 40, 395),
        (cx - 140, 395)
    ], fill=(56, 189, 248, 255))
    
    # Ribbon 2 (Bottom segment curving left)
    e_draw.polygon([
        (cx + 140, 540),
        (cx - 60, 540),
        (cx - 130, 470),
        (cx - 30, 470),
        (cx + 40, 505),
        (cx + 140, 505)
    ], fill=(37, 99, 235, 255))
    
    # Central Glowing Beacon (Sentinel Eye & Community Node)
    # 3 community nodes connected with glowing lines
    e_draw.line([(cx - 90, 630), (cx, 690)], fill=(56, 189, 248, 200), width=8)
    e_draw.line([(cx + 90, 630), (cx, 690)], fill=(56, 189, 248, 200), width=8)
    e_draw.line([(cx - 90, 630), (cx + 90, 630)], fill=(37, 99, 235, 200), width=8)
    
    # Left node
    e_draw.ellipse([cx - 105, 615, cx - 75, 645], fill=(255, 255, 255, 255), outline=(56, 189, 248, 255), width=4)
    # Right node
    e_draw.ellipse([cx + 75, 615, cx + 105, 645], fill=(255, 255, 255, 255), outline=(56, 189, 248, 255), width=4)
    # Bottom anchor node
    e_draw.ellipse([cx - 18, 672, cx + 18, 708], fill=(56, 189, 248, 255), outline=(255, 255, 255, 255), width=5)
    
    # Central Core Pulse (diamond star)
    star_r = 32
    cy_center = 450
    e_draw.polygon([
        (cx, cy_center - star_r - 10),
        (cx + star_r * 0.4, cy_center - star_r * 0.4),
        (cx + star_r + 10, cy_center),
        (cx + star_r * 0.4, cy_center + star_r * 0.4),
        (cx, cy_center + star_r + 10),
        (cx - star_r * 0.4, cy_center + star_r * 0.4),
        (cx - star_r - 10, cy_center),
        (cx - star_r * 0.4, cy_center - star_r * 0.4)
    ], fill=(255, 255, 255, 255))
    
    # Subtle core dot
    e_draw.ellipse([cx - 8, cy_center - 8, cx + 8, cy_center + 8], fill=(56, 189, 248, 255))
    
    im.alpha_composite(emblem)
    
    # 5. Glossy highlight across top edge of squircle
    highlight = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    h_draw = ImageDraw.Draw(highlight)
    h_draw.rounded_rectangle([margin + 4, margin + 4, W - margin - 4, margin + 180], radius=radius - 4, fill=(255, 255, 255, 22))
    # cut lower part
    h_cut = Image.new('L', (W, H), 0)
    hc_draw = ImageDraw.Draw(h_cut)
    hc_draw.ellipse([margin - 100, margin + 40, W - margin + 100, margin + 360], fill=255)
    highlight.putalpha(Image.composite(Image.new('L', (W, H), 0), highlight.getchannel('A'), h_cut))
    im.alpha_composite(highlight)
    
    return im

def create_tray_icon():
    # 32x32 crisp tray icon: vibrant shield with high contrast
    T = 32
    im = Image.new('RGBA', (T, T), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    
    # Shield shape points scaled to 32x32
    pts = [
        (4, 4),
        (16, 2),
        (27, 4),
        (27, 18),
        (16, 29),
        (4, 18)
    ]
    # Background fill: vibrant cyber blue
    d.polygon(pts, fill=(39, 135, 245, 255), outline=(255, 255, 255, 255), width=2)
    
    # Center white dot / eye
    d.ellipse([13, 11, 19, 17], fill=(255, 255, 255, 255))
    d.point([(16, 14)], fill=(39, 135, 245, 255))
    
    return im

if __name__ == '__main__':
    os.makedirs('build', exist_ok=True)
    os.makedirs('src/assets', exist_ok=True)
    
    print('Generating high-res Sentinel Community Manager icon (1024x1024)...')
    icon_1024 = create_sentinel_icon()
    icon_1024.save('build/icon.png', 'PNG')
    icon_1024.resize((512, 512), Image.Resampling.LANCZOS).save('src/assets/icon.png', 'PNG')
    
    # Windows multi-size .ico: 256, 128, 64, 48, 32, 24, 16
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    icon_1024.save('build/icon.ico', format='ICO', sizes=sizes)
    print('Saved build/icon.ico with multi-resolution mipmaps!')
    
    # Generate Tray Icon
    tray_32 = create_tray_icon()
    tray_32.save('build/tray.png', 'PNG')
    
    # Export Tray icon as Base64 data URL
    buf = BytesIO()
    tray_32.save(buf, format='PNG')
    b64_tray = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
    print('Tray Base64 length:', len(b64_tray))
    
    with open('build/tray_b64.txt', 'w', encoding='utf-8') as f:
        f.write(b64_tray)
    print('Done!')
