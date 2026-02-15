"""Person-centered smart crop for portrait reframing.

Detects the person bounding box from segmentation masks and computes
a stable crop region that centers the person in a 9:16 portrait frame
with breathing room for full range of motion.
"""

import cv2
import numpy as np


def detect_person_bbox(
    person_mask: np.ndarray,
) -> tuple[int, int, int, int] | None:
    """Find the bounding box of the person from a segmentation mask.

    Uses np.where to locate pixels above 0.5 confidence and computes
    the min/max coordinates to form a bounding box.

    Args:
        person_mask: A float32 confidence mask (H, W) with values [0, 1].

    Returns:
        Tuple (x, y, w, h) of the person bounding box, or None if no
        person detected (mask is empty or below threshold).
    """
    rows, cols = np.where(person_mask > 0.5)
    if len(rows) == 0:
        return None

    y_min = int(np.min(rows))
    y_max = int(np.max(rows))
    x_min = int(np.min(cols))
    x_max = int(np.max(cols))

    return (x_min, y_min, x_max - x_min, y_max - y_min)


def compute_crop_region(
    frame_width: int,
    frame_height: int,
    person_bbox: tuple[int, int, int, int],
    target_width: int = 720,
    target_height: int = 1280,
    padding_ratio: float = 0.15,
) -> tuple[int, int, int, int]:
    """Compute a crop rectangle centered on the person with 9:16 aspect ratio.

    The crop region:
    - Centers on the person bounding box
    - Has the target aspect ratio (9:16 portrait)
    - Includes padding around the person for breathing room / range of motion
    - Stays within frame bounds (clamped to 0..frame_width, 0..frame_height)
    - If source is already portrait and person fills frame, may return full frame

    Args:
        frame_width: Width of the source frame in pixels.
        frame_height: Height of the source frame in pixels.
        person_bbox: (x, y, w, h) bounding box of the person.
        target_width: Desired output width (for aspect ratio calculation).
        target_height: Desired output height (for aspect ratio calculation).
        padding_ratio: Extra padding around person bbox as a fraction of bbox size.

    Returns:
        Tuple (x, y, w, h) defining the crop region within the source frame.
    """
    bx, by, bw, bh = person_bbox
    target_aspect = target_width / target_height  # 9:16 = 0.5625

    # Add padding around the person bbox
    pad_x = int(bw * padding_ratio)
    pad_y = int(bh * padding_ratio)
    padded_x = max(0, bx - pad_x)
    padded_y = max(0, by - pad_y)
    padded_w = bw + 2 * pad_x
    padded_h = bh + 2 * pad_y

    # Person center
    center_x = padded_x + padded_w // 2
    center_y = padded_y + padded_h // 2

    # Determine crop dimensions to fit person with target aspect ratio
    # Try fitting by height first (portrait: height is the dominant dimension)
    crop_h = padded_h
    crop_w = int(crop_h * target_aspect)

    # If crop_w is too narrow to contain the padded person, fit by width instead
    if crop_w < padded_w:
        crop_w = padded_w
        crop_h = int(crop_w / target_aspect)

    # Ensure crop dimensions don't exceed frame
    crop_w = min(crop_w, frame_width)
    crop_h = min(crop_h, frame_height)

    # Recheck aspect ratio after clamping to frame size
    actual_aspect = crop_w / crop_h if crop_h > 0 else target_aspect
    if actual_aspect > target_aspect:
        # Too wide — increase height
        crop_h = min(int(crop_w / target_aspect), frame_height)
    elif actual_aspect < target_aspect:
        # Too tall — increase width
        crop_w = min(int(crop_h * target_aspect), frame_width)

    # Center the crop on the person
    crop_x = center_x - crop_w // 2
    crop_y = center_y - crop_h // 2

    # Clamp to frame bounds
    crop_x = max(0, min(crop_x, frame_width - crop_w))
    crop_y = max(0, min(crop_y, frame_height - crop_h))

    return (crop_x, crop_y, crop_w, crop_h)


def smart_crop(
    frame: np.ndarray,
    crop_region: tuple[int, int, int, int],
    target_width: int = 720,
    target_height: int = 1280,
) -> np.ndarray:
    """Crop and resize a frame to the target portrait dimensions.

    Uses INTER_AREA for downscaling (sharper) and INTER_LANCZOS4 for
    upscaling (smoother).

    Args:
        frame: Source BGR frame as numpy array (H, W, 3).
        crop_region: (x, y, w, h) defining the crop area.
        target_width: Output width in pixels.
        target_height: Output height in pixels.

    Returns:
        Cropped and resized BGR frame as numpy array (target_height, target_width, 3).
    """
    x, y, w, h = crop_region
    cropped = frame[y : y + h, x : x + w]

    # Choose interpolation based on whether we're scaling up or down
    src_pixels = w * h
    dst_pixels = target_width * target_height
    interp = cv2.INTER_AREA if src_pixels > dst_pixels else cv2.INTER_LANCZOS4

    resized: np.ndarray = cv2.resize(
        cropped, (target_width, target_height), interpolation=interp
    )
    return resized


def compute_stable_crop(
    masks: list[np.ndarray],
    frame_width: int,
    frame_height: int,
    target_width: int = 720,
    target_height: int = 1280,
) -> tuple[int, int, int, int]:
    """Compute a single stable crop region from multiple sampled masks.

    Takes the union bounding box of all person positions across sampled
    frames to avoid camera-follow jitter. This should be called once
    before processing all frames to get a consistent crop.

    Args:
        masks: List of float32 confidence masks (H, W), sampled across the video.
        frame_width: Width of the source frames.
        frame_height: Height of the source frames.
        target_width: Desired output width (for aspect ratio).
        target_height: Desired output height (for aspect ratio).

    Returns:
        Tuple (x, y, w, h) defining the stable crop region.
        Falls back to center-crop of full frame if no person detected.
    """
    # Collect all person bounding boxes
    all_x_min: list[int] = []
    all_y_min: list[int] = []
    all_x_max: list[int] = []
    all_y_max: list[int] = []

    for mask in masks:
        bbox = detect_person_bbox(mask)
        if bbox is not None:
            bx, by, bw, bh = bbox
            all_x_min.append(bx)
            all_y_min.append(by)
            all_x_max.append(bx + bw)
            all_y_max.append(by + bh)

    if not all_x_min:
        # No person detected in any frame — fallback to center crop
        target_aspect = target_width / target_height
        frame_aspect = frame_width / frame_height
        if frame_aspect > target_aspect:
            # Frame is wider than target — crop width
            crop_h = frame_height
            crop_w = int(crop_h * target_aspect)
        else:
            # Frame is taller — crop height
            crop_w = frame_width
            crop_h = int(crop_w / target_aspect)
        crop_x = (frame_width - crop_w) // 2
        crop_y = (frame_height - crop_h) // 2
        return (crop_x, crop_y, crop_w, crop_h)

    # Union bounding box across all frames
    union_bbox = (
        min(all_x_min),
        min(all_y_min),
        max(all_x_max) - min(all_x_min),
        max(all_y_max) - min(all_y_min),
    )

    return compute_crop_region(
        frame_width,
        frame_height,
        union_bbox,
        target_width,
        target_height,
    )
