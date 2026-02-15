"""Single-video processing orchestrator with logo watermark.

Orchestrates the complete pipeline for transforming a raw source video
into a styled, normalized, portrait-format exercise clip:
probe -> watermark check -> trim -> stable crop analysis -> frame-by-frame
segmentation+styling+watermark -> encode -> loop -> thumbnail.
"""

import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from pipeline.config import (
    MAX_DURATION_SECONDS,
    MIN_DURATION_SECONDS,
    MODEL_PATH,
    TARGET_FPS,
)
from pipeline.cropper import compute_stable_crop, smart_crop
from pipeline.encoder import (
    encode_video,
    extract_thumbnail,
    get_video_info,
    has_watermark,
    loop_video,
)
from pipeline.segmenter import close_segmenter, create_segmenter, segment_frame
from pipeline.styler import style_frame
from pipeline.trimmer import detect_movement_range, trim_video

# Default logo path: el-templo-video-pipeline/assets/logo.png
_DEFAULT_LOGO_PATH = Path(__file__).parent.parent.parent / "assets" / "logo.png"


@dataclass
class ProcessResult:
    """Result of processing a single video."""

    status: str  # "completed" | "failed" | "flagged_watermark" | "skipped"
    error: str | None
    duration: float  # processing time in seconds
    file_size: int  # output file size in bytes
    source_duration: float  # original video duration
    output_duration: float  # final output duration


def load_watermark(
    logo_path: Path,
    target_size: int = 40,
) -> np.ndarray | None:
    """Load and resize the logo PNG for watermark overlay.

    Reads the logo with alpha channel, resizes it so the longest
    dimension equals target_size while maintaining aspect ratio.

    Args:
        logo_path: Path to the logo PNG file.
        target_size: Maximum dimension in pixels for the watermark.

    Returns:
        BGRA numpy array of the resized logo, or None if file not found.
    """
    if not logo_path.exists():
        return None

    logo = cv2.imread(str(logo_path), cv2.IMREAD_UNCHANGED)
    if logo is None:
        return None

    # If no alpha channel, add one (fully opaque)
    if logo.shape[2] == 3:
        alpha = np.full(
            (logo.shape[0], logo.shape[1], 1), 255, dtype=np.uint8
        )
        logo = np.concatenate([logo, alpha], axis=2)

    # Resize so longest dimension equals target_size
    h, w = logo.shape[:2]
    if h >= w:
        new_h = target_size
        new_w = max(1, int(w * target_size / h))
    else:
        new_w = target_size
        new_h = max(1, int(h * target_size / w))

    resized: np.ndarray = cv2.resize(
        logo, (new_w, new_h), interpolation=cv2.INTER_AREA
    )
    return resized


def apply_watermark(
    frame: np.ndarray,
    watermark: np.ndarray,
    position: str = "bottom-right",
    margin: int = 10,
    opacity: float = 0.3,
) -> np.ndarray:
    """Composite a watermark onto a frame with alpha blending.

    Args:
        frame: BGR frame as numpy array (H, W, 3), uint8.
        watermark: BGRA watermark image as numpy array (wH, wW, 4), uint8.
        position: Corner placement - "top-left", "top-right",
                  "bottom-left", or "bottom-right".
        margin: Pixel margin from frame edge.
        opacity: Overall opacity multiplier for the watermark.

    Returns:
        Frame with watermark composited, same shape as input.
    """
    fh, fw = frame.shape[:2]
    wh, ww = watermark.shape[:2]

    # Skip if watermark doesn't fit
    if wh + 2 * margin > fh or ww + 2 * margin > fw:
        return frame

    # Compute position
    if position == "top-left":
        y, x = margin, margin
    elif position == "top-right":
        y, x = margin, fw - ww - margin
    elif position == "bottom-left":
        y, x = fh - wh - margin, margin
    else:  # bottom-right
        y, x = fh - wh - margin, fw - ww - margin

    # Extract watermark channels
    wm_bgr = watermark[:, :, :3].astype(np.float32)
    wm_alpha = (watermark[:, :, 3].astype(np.float32) / 255.0) * opacity

    # Alpha blend
    result = frame.copy()
    roi = result[y : y + wh, x : x + ww].astype(np.float32)
    alpha_3ch = np.stack([wm_alpha] * 3, axis=-1)
    blended = roi * (1.0 - alpha_3ch) + wm_bgr * alpha_3ch
    result[y : y + wh, x : x + ww] = blended.astype(np.uint8)

    return result


def process_video(
    input_path: Path,
    output_path: Path,
    thumbnail_path: Path | None = None,
    logo_path: Path | None = None,
    skip_watermark_check: bool = False,
) -> ProcessResult:
    """Process a single video through the complete pipeline.

    Pipeline steps:
    a. Probe input for video info
    b. Check for existing watermarks (optional)
    c. Trim to exercise demo portion
    d. Analyze crop from sampled frames
    e. Frame-by-frame: crop -> segment -> style -> watermark
    f. Encode to H.264/yuv420p/faststart
    g. Loop if too short
    h. Extract thumbnail
    i. Cleanup temp files

    Args:
        input_path: Source video file.
        output_path: Destination for processed MP4.
        thumbnail_path: Destination for thumbnail PNG. Defaults to
                        output_path with .png extension.
        logo_path: Path to logo PNG for watermark. Defaults to
                   assets/logo.png in the project directory.
        skip_watermark_check: Skip source watermark detection.

    Returns:
        ProcessResult with status and metrics.
    """
    start_time = time.monotonic()
    if thumbnail_path is None:
        thumbnail_path = output_path.with_suffix(".png")
    if logo_path is None:
        logo_path = _DEFAULT_LOGO_PATH

    temp_trimmed: Path | None = None
    temp_intermediate: Path | None = None
    temp_looped: Path | None = None
    segmenter = None

    try:
        # a. Probe input
        info = get_video_info(input_path)
        source_duration = info.duration

        # b. Watermark check
        if not skip_watermark_check and has_watermark(input_path):
            elapsed = time.monotonic() - start_time
            return ProcessResult(
                status="flagged_watermark",
                error=None,
                duration=elapsed,
                file_size=0,
                source_duration=source_duration,
                output_duration=0.0,
            )

        # c. Trim to exercise demo portion
        trim_start, trim_end = detect_movement_range(
            input_path,
            min_duration=MIN_DURATION_SECONDS,
            max_duration=MAX_DURATION_SECONDS,
        )

        temp_trimmed_file = tempfile.NamedTemporaryFile(
            suffix=".mp4", delete=False
        )
        temp_trimmed = Path(temp_trimmed_file.name)
        temp_trimmed_file.close()
        trim_video(input_path, temp_trimmed, trim_start, trim_end)

        # d. Analyze crop — sample ~10 frames from trimmed video
        segmenter = create_segmenter(MODEL_PATH)
        trimmed_cap = cv2.VideoCapture(str(temp_trimmed))
        trimmed_fps = trimmed_cap.get(cv2.CAP_PROP_FPS)
        if trimmed_fps <= 0:
            trimmed_fps = 30.0
        trimmed_total = int(trimmed_cap.get(cv2.CAP_PROP_FRAME_COUNT))
        trimmed_w = int(trimmed_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        trimmed_h = int(trimmed_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Sample ~10 frames evenly
        num_samples = min(10, max(1, trimmed_total))
        sample_indices = [
            int(i * trimmed_total / num_samples) for i in range(num_samples)
        ]

        sampled_masks: list[np.ndarray] = []
        sample_ts_ms = 0
        frame_idx = 0
        sample_set = set(sample_indices)

        while True:
            ret, frame = trimmed_cap.read()
            if not ret:
                break
            if frame_idx in sample_set:
                mask = segment_frame(segmenter, frame, sample_ts_ms)
                sample_ts_ms += int(1000 / trimmed_fps)
                sampled_masks.append(mask)
            frame_idx += 1

        trimmed_cap.release()

        # Compute stable crop region
        crop_region = compute_stable_crop(
            sampled_masks, trimmed_w, trimmed_h
        )

        # Load watermark
        watermark = load_watermark(logo_path)

        # e. Frame-by-frame processing
        temp_inter_file = tempfile.NamedTemporaryFile(
            suffix=".avi", delete=False
        )
        temp_intermediate = Path(temp_inter_file.name)
        temp_inter_file.close()

        cap = cv2.VideoCapture(str(temp_trimmed))
        fourcc = cv2.VideoWriter.fourcc(*"MJPG")
        writer = cv2.VideoWriter(
            str(temp_intermediate), fourcc, TARGET_FPS, (720, 1280)
        )

        # Reset segmenter for fresh sequence (timestamps must be monotonic)
        close_segmenter(segmenter)
        segmenter = create_segmenter(MODEL_PATH)
        ts_ms = 0
        ms_per_frame = int(1000 / TARGET_FPS)

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Crop to portrait
            cropped = smart_crop(frame, crop_region)

            # Segment person
            mask = segment_frame(segmenter, cropped, ts_ms)
            ts_ms += ms_per_frame

            # Style frame (bronze silhouette on navy bg)
            styled = style_frame(cropped, mask)

            # Apply watermark
            if watermark is not None:
                styled = apply_watermark(styled, watermark)

            writer.write(styled)

        cap.release()
        writer.release()

        # f. Encode to H.264
        encode_video(temp_intermediate, output_path)

        # g. Loop if too short
        output_info = get_video_info(output_path)
        if output_info.duration < MIN_DURATION_SECONDS:
            temp_looped_file = tempfile.NamedTemporaryFile(
                suffix=".mp4", delete=False
            )
            temp_looped = Path(temp_looped_file.name)
            temp_looped_file.close()

            looped = loop_video(
                output_path, temp_looped, MIN_DURATION_SECONDS
            )
            if looped:
                # Replace output with looped version
                temp_looped.replace(output_path)

        # h. Extract thumbnail
        extract_thumbnail(output_path, thumbnail_path)

        # Final metrics
        final_info = get_video_info(output_path)
        file_size = output_path.stat().st_size
        elapsed = time.monotonic() - start_time

        return ProcessResult(
            status="completed",
            error=None,
            duration=elapsed,
            file_size=file_size,
            source_duration=source_duration,
            output_duration=final_info.duration,
        )

    except Exception as exc:
        elapsed = time.monotonic() - start_time
        error_msg = str(exc) if isinstance(exc, Exception) else "Unknown error"
        return ProcessResult(
            status="failed",
            error=error_msg,
            duration=elapsed,
            file_size=0,
            source_duration=0.0,
            output_duration=0.0,
        )

    finally:
        # i. Cleanup
        if segmenter is not None:
            try:
                close_segmenter(segmenter)
            except Exception:
                pass

        for temp_file in [temp_trimmed, temp_intermediate, temp_looped]:
            if temp_file is not None and temp_file.exists():
                try:
                    temp_file.unlink()
                except OSError:
                    pass


def preview_frame(
    input_path: Path,
    output_path: Path,
    logo_path: Path | None = None,
) -> None:
    """Preview mode: process a single frame and save as PNG.

    Runs the full pipeline on one frame from the middle of the video:
    probe -> trim estimate -> crop -> segment -> style -> watermark -> save.

    Useful for QA before running a full batch.

    Args:
        input_path: Source video file.
        output_path: Destination PNG file.
        logo_path: Path to logo PNG for watermark. Defaults to project logo.

    Raises:
        RuntimeError: If preview fails at any stage.
    """
    if logo_path is None:
        logo_path = _DEFAULT_LOGO_PATH

    segmenter = None
    try:
        # Probe and find midpoint
        info = get_video_info(input_path)
        mid_time = info.duration / 2.0

        # Extract frame at midpoint
        cap = cv2.VideoCapture(str(input_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 30.0
        target_frame = int(mid_time * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)

        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            raise RuntimeError(
                f"Could not read frame at midpoint ({mid_time:.1f}s) of {input_path}"
            )

        frame_h, frame_w = frame.shape[:2]

        # Segment and compute crop
        segmenter = create_segmenter(MODEL_PATH)
        mask = segment_frame(segmenter, frame, 0)

        crop_region = compute_stable_crop(
            [mask], frame_w, frame_h
        )
        cropped = smart_crop(frame, crop_region)

        # Re-segment the cropped frame
        mask_cropped = segment_frame(segmenter, cropped, 33)
        styled = style_frame(cropped, mask_cropped)

        # Apply watermark
        watermark = load_watermark(logo_path)
        if watermark is not None:
            styled = apply_watermark(styled, watermark)

        # Save
        cv2.imwrite(str(output_path), styled)

    finally:
        if segmenter is not None:
            try:
                close_segmenter(segmenter)
            except Exception:
                pass
