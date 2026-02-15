"""MediaPipe Image Segmenter wrapper for person isolation."""

from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from pipeline.config import MODEL_PATH


def create_segmenter(model_path: Path = MODEL_PATH) -> vision.ImageSegmenter:
    """Create a MediaPipe Image Segmenter in VIDEO running mode.

    The segmenter uses the selfie_segmenter model to produce per-frame
    confidence masks distinguishing person (index 1) from background (index 0).

    Args:
        model_path: Path to the selfie_segmenter.tflite model file.

    Returns:
        A configured ImageSegmenter instance ready for segment_for_video calls.
    """
    base_options = python.BaseOptions(model_asset_path=str(model_path))
    options = vision.ImageSegmenterOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        output_confidence_masks=True,
    )
    return vision.ImageSegmenter.create_from_options(options)


def segment_frame(
    segmenter: vision.ImageSegmenter,
    frame_bgr: np.ndarray,
    timestamp_ms: int,
) -> np.ndarray:
    """Get the person confidence mask for a single BGR video frame.

    Converts the BGR frame to RGB, wraps it in a MediaPipe Image, and runs
    segmentation in VIDEO mode. Returns a copy of the person confidence mask
    (index 1 from selfie_segmenter).

    Args:
        segmenter: An ImageSegmenter created with create_segmenter().
        frame_bgr: A BGR video frame as a numpy array (H, W, 3).
        timestamp_ms: Frame timestamp in milliseconds (must be monotonically
                      increasing across calls for the same video).

    Returns:
        A float32 numpy array (H, W) with per-pixel person confidence [0, 1].
        The array is a copy — safe to use after subsequent segment calls.
    """
    import cv2

    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = segmenter.segment_for_video(mp_image, timestamp_ms)
    # Index 1 = person confidence mask for selfie_segmenter.
    # .copy() is critical: numpy_view() returns a view that may be
    # invalidated on the next segment call.
    return result.confidence_masks[1].numpy_view().copy()


def close_segmenter(segmenter: vision.ImageSegmenter) -> None:
    """Close the segmenter and release resources.

    Args:
        segmenter: The ImageSegmenter instance to close.
    """
    segmenter.close()
