"""Central configuration constants for the video processing pipeline."""

from pathlib import Path

# Brand colors in BGR (OpenCV default) and RGB
NAVY_BGR = (92, 62, 44)  # #2c3e5c
NAVY_RGB = (44, 62, 92)  # #2c3e5c
BRONZE_BGR = (108, 149, 184)  # #b8956c
BRONZE_RGB = (184, 149, 108)  # #b8956c
CREAM_BGR = (232, 240, 245)  # #f5f0e8
CREAM_RGB = (245, 240, 232)  # #f5f0e8
NAVY_HEX = "#2c3e5c"

# Video normalization targets
TARGET_FPS = 30
TARGET_SHORT_EDGE = 720  # 720p on shorter dimension
CRF = 28  # Lower = better quality, higher file size. 28 good for flat-color styled content.
FFMPEG_PRESET = "medium"

# Duration constraints
MIN_DURATION_SECONDS = 5
MAX_DURATION_SECONDS = 15

# Segmentation
MODEL_PATH = Path(__file__).parent.parent.parent / "models" / "selfie_segmenter.tflite"
CONFIDENCE_THRESHOLD = 0.5

# Styling
GLOW_KERNEL_SIZE = 15  # Morphological dilation kernel for edge glow
GLOW_BLUR_SIZE = 21  # Gaussian blur kernel for softening glow
GLOW_INTENSITY = 0.7  # Cream glow opacity multiplier
MASK_BLUR_SIZE = 7  # Gaussian blur for mask edge smoothing

# Batch processing
DEFAULT_MAX_WORKERS = 2
SUPPORTED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
