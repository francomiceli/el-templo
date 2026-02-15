"""Frame compositing module for Greek-themed visual styling.

Transforms a raw BGR video frame and person confidence mask into a styled
output frame: bronze-tinted silhouette on navy background with cream edge glow.
"""

import cv2
import numpy as np

from pipeline.config import (
    BRONZE_BGR,
    CONFIDENCE_THRESHOLD,
    CREAM_BGR,
    GLOW_BLUR_SIZE,
    GLOW_INTENSITY,
    GLOW_KERNEL_SIZE,
    MASK_BLUR_SIZE,
    NAVY_BGR,
)


def style_frame(frame_bgr: np.ndarray, person_mask: np.ndarray) -> np.ndarray:
    """Apply Greek-themed styling to a single video frame.

    Composites a bronze-tinted silhouette of the person on a navy background
    with a soft cream edge glow separating the figure from the background.

    Algorithm:
        1. Resize mask to match frame dimensions if needed
        2. Smooth mask edges with Gaussian blur
        3. Create binary mask from smoothed confidence values
        4. Fill canvas with navy background
        5. Create cream edge glow via morphological dilation
        6. Create bronze silhouette from grayscale luminance
        7. Composite: person regions get bronze, background gets navy + glow

    Args:
        frame_bgr: A BGR video frame as a numpy array (H, W, 3), uint8.
        person_mask: A float32 confidence mask (H, W) with values in [0, 1].
                     Typically from segmenter.segment_frame().

    Returns:
        A styled BGR frame as a uint8 numpy array (H, W, 3).
    """
    h, w = frame_bgr.shape[:2]

    # 1. Resize mask if dimensions differ from frame
    if person_mask.shape[:2] != (h, w):
        person_mask = cv2.resize(person_mask, (w, h))

    # 2. Smooth mask edges to reduce jagged segmentation boundaries
    smooth_mask = cv2.GaussianBlur(
        person_mask, (MASK_BLUR_SIZE, MASK_BLUR_SIZE), 0
    )

    # 3. Create binary mask for morphological operations
    binary = (smooth_mask > CONFIDENCE_THRESHOLD).astype(np.uint8)

    # 4. Create navy background canvas
    canvas = np.full((h, w, 3), NAVY_BGR, dtype=np.uint8)

    # 5. Create cream edge glow
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (GLOW_KERNEL_SIZE, GLOW_KERNEL_SIZE)
    )
    dilated = cv2.dilate(binary, kernel, iterations=1)
    edge_ring = (dilated - binary).astype(np.float32)
    glow = cv2.GaussianBlur(edge_ring, (GLOW_BLUR_SIZE, GLOW_BLUR_SIZE), 0)

    # Apply cream color to canvas where glow exists
    for c in range(3):
        canvas[:, :, c] = np.clip(
            canvas[:, :, c].astype(np.float32)
            + glow * float(CREAM_BGR[c]) * GLOW_INTENSITY,
            0,
            255,
        ).astype(np.uint8)

    # 6. Create bronze silhouette from grayscale luminance
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    gray_norm = cv2.normalize(gray, None, 60, 240, cv2.NORM_MINMAX)
    bronze = np.zeros_like(frame_bgr)
    for c in range(3):
        bronze[:, :, c] = (
            gray_norm.astype(np.float32) * (float(BRONZE_BGR[c]) / 255.0)
        ).astype(np.uint8)

    # 7. Composite: person mask > threshold gets bronze, else canvas (navy + glow)
    mask_3ch = np.stack([smooth_mask] * 3, axis=-1)
    result = np.where(mask_3ch > CONFIDENCE_THRESHOLD, bronze, canvas)

    return result.astype(np.uint8)
