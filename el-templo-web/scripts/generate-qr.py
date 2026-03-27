#!/usr/bin/env python3
"""
Generate QR PNG images for promo codes.

Usage: python3 scripts/generate-qr.py

Requirements: pip3 install qrcode pillow

QR codes encode the eltemplo.org redirect URLs (not the final destination),
so the redirect target can change without regenerating QR codes.
"""

import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.colormasks import SolidFillColorMask
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "public" / "qr"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Brand color: charcoal (#2e2a26)
BRAND_DARK = (46, 42, 38)
WHITE = (255, 255, 255)

CODES = [
    {"url": "https://eltemplo.org/qr/bcn", "filename": "TEMPLOPASSBCN.png"},
    {"url": "https://eltemplo.org/qr/aura-club", "filename": "AURACLUB1.png"},
]


def generate():
    for code in CODES:
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=32,
            border=2,
        )
        qr.add_data(code["url"])
        qr.make(fit=True)
        img = qr.make_image(
            image_factory=StyledPilImage,
            color_mask=SolidFillColorMask(
                back_color=WHITE,
                front_color=BRAND_DARK,
            ),
        )
        output_path = OUTPUT_DIR / code["filename"]
        img.save(str(output_path))
        print(f"Generated {code['filename']} ({img.size[0]}x{img.size[1]}px)")


if __name__ == "__main__":
    generate()
