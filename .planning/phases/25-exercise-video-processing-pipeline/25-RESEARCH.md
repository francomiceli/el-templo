# Phase 25: Exercise Video Processing Pipeline - Research

**Researched:** 2026-02-14
**Domain:** Python video processing (MediaPipe segmentation + OpenCV compositing + FFmpeg encoding)
**Confidence:** HIGH

## Summary

This phase builds a standalone Python CLI tool that batch-processes raw exercise demonstration videos into a branded Greek-themed style: bronze-tinted silhouette on navy background with cream edge glow. The pipeline reads each video frame-by-frame, uses MediaPipe's Image Segmenter to isolate the person, applies visual styling with OpenCV/NumPy, and re-encodes with FFmpeg to a normalized format (H.264, yuv420p, 30fps, 720p, faststart). It handles 1300+ videos with progress checkpointing and resume capability.

The core technologies are well-established and heavily documented. MediaPipe 0.10.32 provides the Image Segmenter task API with a dedicated `selfie_segmenter.tflite` model optimized for person isolation. OpenCV and NumPy handle all pixel-level compositing (mask dilation for edge glow, color tinting, background replacement). FFmpeg handles final encoding and video looping. The Python standard library provides everything needed for CLI, concurrency, and progress tracking.

**Primary recommendation:** Use MediaPipe's Image Segmenter task API (not the legacy Selfie Segmentation solution) with the `selfie_segmenter` float16 model, OpenCV/NumPy for frame compositing, subprocess for FFmpeg calls, and `uv` for Python project management. Process videos sequentially per-video but use `concurrent.futures.ProcessPoolExecutor` for multi-video parallelism.

## Standard Stack

### Core

| Library                | Version          | Purpose                                                         | Why Standard                                                                                           |
| ---------------------- | ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| mediapipe              | 0.10.32          | Person segmentation via Image Segmenter task API                | Google's official on-device ML framework; selfie_segmenter model is purpose-built for person isolation |
| opencv-python-headless | 4.x (latest)     | Frame reading, mask operations, compositing, color manipulation | Industry standard for video/image processing; headless variant avoids GUI dependencies on servers      |
| numpy                  | 1.x/2.x (latest) | Array operations for mask manipulation and color math           | Required by both MediaPipe and OpenCV; enables fast vectorized pixel operations                        |
| FFmpeg (system)        | 6.x+             | Final video encoding (H.264/yuv420p/faststart) and looping      | The universal video encoder; called via subprocess, not a Python package                               |

### Supporting

| Library | Version | Purpose                                         | When to Use                                             |
| ------- | ------- | ----------------------------------------------- | ------------------------------------------------------- |
| Pillow  | 10.x+   | Image format conversions if needed by MediaPipe | Only if mp.Image requires PIL input for certain formats |
| tqdm    | 4.x     | Progress bars for batch processing CLI output   | Always -- visual feedback for 1300+ video processing    |

### Alternatives Considered

| Instead of                | Could Use                               | Tradeoff                                                                                        |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| subprocess + FFmpeg       | ffmpeg-python (kkroening)               | Unmaintained since 2019; subprocess is more reliable long-term                                  |
| subprocess + FFmpeg       | python-ffmpeg (2.0.12)                  | Actively maintained but adds dependency for simple encode commands                              |
| MediaPipe Image Segmenter | rembg / U2-Net                          | Heavier models, slower, not optimized for video frame-by-frame processing                       |
| MediaPipe Image Segmenter | Legacy mp.solutions.selfie_segmentation | Old API being deprecated in favor of Tasks API                                                  |
| opencv-python-headless    | moviepy                                 | Higher-level but adds FFmpeg dependency management complexity; overkill for frame-by-frame work |
| ProcessPoolExecutor       | multiprocessing.Pool                    | Similar performance but concurrent.futures has cleaner API and better error handling            |

**Installation:**

```bash
# Project setup with uv
uv init el-templo-video-pipeline
cd el-templo-video-pipeline
uv add mediapipe opencv-python-headless numpy tqdm

# System dependency
sudo apt install ffmpeg  # or brew install ffmpeg
```

**Model download (one-time):**

```bash
# Selfie Segmenter (float16, ~250KB)
wget -O models/selfie_segmenter.tflite \
  https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
```

## Architecture Patterns

### Recommended Project Structure

```
el-templo-video-pipeline/
├── pyproject.toml              # uv project config
├── uv.lock                     # Lockfile
├── models/
│   └── selfie_segmenter.tflite # Downloaded model file
├── src/
│   └── pipeline/
│       ├── __init__.py
│       ├── cli.py              # argparse CLI entry point
│       ├── processor.py        # Single-video processing orchestrator
│       ├── segmenter.py        # MediaPipe segmentation wrapper
│       ├── styler.py           # Bronze silhouette + cream glow compositing
│       ├── encoder.py          # FFmpeg encoding + looping
│       ├── batch.py            # Batch runner with progress.json checkpointing
│       └── config.py           # Brand colors, resolution, FPS constants
├── input/                      # Raw source videos (gitignored)
├── output/                     # Processed videos (gitignored)
├── progress.json               # Checkpoint state (gitignored)
└── tests/
    ├── test_segmenter.py
    ├── test_styler.py
    └── test_encoder.py
```

### Pattern 1: Frame-by-Frame Processing Pipeline

**What:** Read video with OpenCV, process each frame through segmentation + styling, write styled frames to temp file, then encode final output with FFmpeg.

**When to use:** Every video in the batch.

**Example:**

```python
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# --- Segmenter setup (once, reused across frames) ---
base_options = python.BaseOptions(model_asset_path='models/selfie_segmenter.tflite')
options = vision.ImageSegmenterOptions(
    base_options=base_options,
    running_mode=vision.RunningMode.VIDEO,
    output_confidence_masks=True,
)
segmenter = vision.ImageSegmenter.create_from_options(options)

# --- Process one video ---
cap = cv2.VideoCapture('input/exercise_001.mp4')
fps = cap.get(cv2.CAP_PROP_FPS)
frame_idx = 0
styled_frames = []

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Convert BGR -> RGB for MediaPipe
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

    # Segment (VIDEO mode requires timestamp_ms)
    timestamp_ms = int(frame_idx * 1000 / fps)
    result = segmenter.segment_for_video(mp_image, timestamp_ms)

    # Get confidence mask (index 1 = person for selfie_segmenter)
    confidence_mask = result.confidence_masks[1].numpy_view()

    # Apply styling (see Pattern 2)
    styled = apply_greek_style(frame, confidence_mask)
    styled_frames.append(styled)
    frame_idx += 1

cap.release()
```

### Pattern 2: Bronze Silhouette with Cream Edge Glow

**What:** Composite styled frame from segmentation mask using brand colors.

**When to use:** Every frame after segmentation.

**Algorithm:**

1. Create binary mask from confidence mask (threshold ~0.5)
2. Tint the person region bronze (#b8956c)
3. Create edge glow by dilating mask, subtracting original, and applying cream (#f5f0e8) with Gaussian blur
4. Composite: navy background + glow layer + bronze silhouette

**Example:**

```python
# Brand colors (BGR for OpenCV)
NAVY_BGR = (92, 62, 44)       # #2c3e5c in BGR
BRONZE_BGR = (108, 149, 184)  # #b8956c in BGR
CREAM_BGR = (232, 240, 245)   # #f5f0e8 in BGR

def apply_greek_style(frame: np.ndarray, confidence_mask: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]

    # 1. Resize mask to frame dimensions if needed
    mask = cv2.resize(confidence_mask, (w, h))

    # 2. Create binary mask with threshold
    binary_mask = (mask > 0.5).astype(np.uint8)

    # 3. Smooth mask edges to reduce jaggedness
    binary_mask = cv2.GaussianBlur(binary_mask.astype(np.float32), (5, 5), 0)
    binary_mask_hard = (binary_mask > 0.5).astype(np.uint8)

    # 4. Create navy background
    background = np.full((h, w, 3), NAVY_BGR, dtype=np.uint8)

    # 5. Create bronze silhouette (grayscale person tinted bronze)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    # Normalize brightness for consistent look
    gray = cv2.normalize(gray, None, 80, 220, cv2.NORM_MINMAX)
    # Tint with bronze color
    bronze_layer = np.zeros_like(frame)
    for c in range(3):
        bronze_layer[:, :, c] = (gray * (BRONZE_BGR[c] / 255.0)).astype(np.uint8)

    # 6. Create edge glow (dilated mask - original mask = edge ring)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    dilated = cv2.dilate(binary_mask_hard, kernel, iterations=1)
    edge_ring = dilated - binary_mask_hard

    # Blur the edge ring for glow effect
    glow_mask = cv2.GaussianBlur(edge_ring.astype(np.float32), (21, 21), 0)

    # 7. Composite layers
    result = background.copy()

    # Apply cream glow
    for c in range(3):
        result[:, :, c] = np.clip(
            result[:, :, c] + (glow_mask * CREAM_BGR[c] * 0.6),
            0, 255
        ).astype(np.uint8)

    # Apply bronze silhouette
    mask_3ch = np.stack([binary_mask] * 3, axis=-1)
    result = np.where(mask_3ch > 0.5, bronze_layer, result)

    return result
```

### Pattern 3: Progress Checkpointing with JSON

**What:** Track batch processing state in a JSON file for resume capability.

**When to use:** Wrapping the batch processor.

**Example:**

```python
import json
from pathlib import Path
from enum import Enum

class VideoStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

def load_progress(progress_path: Path) -> dict:
    if progress_path.exists():
        return json.loads(progress_path.read_text())
    return {"videos": {}, "stats": {"completed": 0, "failed": 0, "skipped": 0}}

def save_progress(progress_path: Path, progress: dict) -> None:
    progress_path.write_text(json.dumps(progress, indent=2))

def process_batch(input_dir: Path, output_dir: Path, progress_path: Path):
    progress = load_progress(progress_path)
    videos = sorted(input_dir.glob("*.mp4"))

    for video_path in videos:
        key = video_path.name
        if progress["videos"].get(key, {}).get("status") == "completed":
            continue  # Skip already completed

        progress["videos"][key] = {"status": "processing", "started": "..."}
        save_progress(progress_path, progress)

        try:
            process_single_video(video_path, output_dir / video_path.name)
            progress["videos"][key]["status"] = "completed"
            progress["stats"]["completed"] += 1
        except Exception as e:
            progress["videos"][key] = {"status": "failed", "error": str(e)}
            progress["stats"]["failed"] += 1

        save_progress(progress_path, progress)  # Checkpoint after each video
```

### Pattern 4: FFmpeg Encoding via Subprocess

**What:** Encode processed frames to final MP4 with proper settings.

**When to use:** After all frames are styled, encode to output.

**Example:**

```python
import subprocess
from pathlib import Path

def encode_video(
    input_path: Path,
    output_path: Path,
    target_width: int = 720,
    target_height: int = 1280,
    target_fps: int = 30,
    crf: int = 23,
) -> None:
    """Encode video to normalized H.264 format."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", str(target_fps),
        "-vf", f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:color=#2c3e5c",
        "-crf", str(crf),
        "-preset", "medium",
        "-movflags", "+faststart",
        "-an",  # No audio for exercise demos
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr}")


def loop_video_to_duration(input_path: Path, output_path: Path, min_seconds: int = 5) -> None:
    """Loop a short video to meet minimum duration."""
    # Get duration with ffprobe
    probe_cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        str(input_path),
    ]
    result = subprocess.run(probe_cmd, capture_output=True, text=True)
    duration = float(result.stdout.strip())

    if duration >= min_seconds:
        return  # Already long enough

    # Calculate loop count needed
    loops_needed = int(min_seconds / duration) + 1

    cmd = [
        "ffmpeg", "-y",
        "-stream_loop", str(loops_needed),
        "-i", str(input_path),
        "-t", str(min_seconds),
        "-c", "copy",
        str(output_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)
```

### Anti-Patterns to Avoid

- **Loading the segmenter per-frame:** Create the ImageSegmenter once and reuse for all frames in a video. Use VIDEO running mode, not IMAGE mode, for video files.
- **Holding all frames in memory:** Write styled frames to a temporary video file with OpenCV VideoWriter, then re-encode with FFmpeg. Do not accumulate frames in a list for large videos.
- **Processing frames as independent images:** Use `segment_for_video()` with timestamps, not `segment()`. The VIDEO mode enables internal temporal optimizations.
- **Hardcoding color values everywhere:** Define brand colors in a single `config.py` and import them. BGR vs RGB confusion is a common source of bugs.
- **Skipping mask smoothing:** Raw segmentation masks have jagged edges. Always apply Gaussian blur to the mask before compositing for professional-looking output.

## Don't Hand-Roll

| Problem                  | Don't Build                               | Use Instead                                         | Why                                                                           |
| ------------------------ | ----------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Person segmentation      | Custom ML model or background subtraction | MediaPipe Image Segmenter + selfie_segmenter.tflite | Pre-trained, 33ms/frame on CPU, handles diverse poses and lighting            |
| Video encoding           | Raw OpenCV VideoWriter for final output   | FFmpeg via subprocess                               | H.264/yuv420p/faststart requires codec flags OpenCV can't reliably set        |
| Edge detection for glow  | Canny edge detection                      | Morphological dilation - original mask              | Canny produces thin noisy lines; dilation gives consistent controllable width |
| Video duration detection | Frame counting with OpenCV                | ffprobe                                             | Faster, more reliable, handles variable frame rate                            |
| CLI argument parsing     | Manual sys.argv parsing                   | argparse (stdlib)                                   | Handles help text, type validation, defaults, subcommands                     |
| Progress bars            | Custom print statements                   | tqdm                                                | Handles terminal width, ETA, speed, nested bars                               |

**Key insight:** The entire visual pipeline is fundamentally "per-frame image compositing" -- MediaPipe segments, NumPy/OpenCV composites, FFmpeg encodes. Resist the urge to build abstractions around video-level operations; the frame is the unit of work.

## Common Pitfalls

### Pitfall 1: BGR vs RGB Color Space Confusion

**What goes wrong:** Bronze looks blue, navy looks orange, colors are inverted.
**Why it happens:** OpenCV uses BGR by default; MediaPipe expects RGB. Mixing them up silently produces wrong colors.
**How to avoid:** Always convert explicitly: `cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)` before MediaPipe, `cv2.cvtColor(result, cv2.COLOR_RGB2BGR)` before OpenCV operations. Define brand colors in both formats in config.
**Warning signs:** Colors look "opposite" of expected; blue/orange where bronze/navy should be.

### Pitfall 2: Segmentation Mask Flickering Between Frames

**What goes wrong:** Person silhouette flickers, edges jump between frames, producing jittery output.
**Why it happens:** Per-frame segmentation has no temporal consistency guarantee. Each frame is independently segmented, so mask boundaries can shift slightly between frames.
**How to avoid:**

1. Use VIDEO running mode (has internal temporal optimizations).
2. Apply Gaussian blur to the confidence mask before thresholding.
3. Optionally maintain a running average of the last N masks: `smoothed = alpha * current + (1 - alpha) * previous`.
   **Warning signs:** Output video looks "noisy" at person edges; silhouette boundary vibrates.

### Pitfall 3: Memory Exhaustion on Large Videos

**What goes wrong:** Python process runs out of memory and crashes mid-batch.
**Why it happens:** Accumulating all frames in a Python list before writing. A 15-second 720p30 video is ~450 frames \* ~2.7MB each = ~1.2GB per video in memory.
**How to avoid:** Write each styled frame immediately to a temporary video file using `cv2.VideoWriter`. Never accumulate frames in a list. Process one video at a time.
**Warning signs:** Process memory grows linearly during processing; OOM kills.

### Pitfall 4: OpenCV VideoWriter Codec Limitations

**What goes wrong:** Output video doesn't play on mobile, has wrong pixel format, or is missing faststart flag.
**Why it happens:** OpenCV's VideoWriter has limited codec control -- it cannot set yuv420p, faststart, or fine-tune H.264 profiles reliably across platforms.
**How to avoid:** Use OpenCV VideoWriter ONLY for intermediate frames (raw/uncompressed or MJPEG), then use FFmpeg subprocess for the final encode with all required flags.
**Warning signs:** Videos play on desktop but not mobile; large file sizes; slow streaming start.

### Pitfall 5: Inconsistent Input Video Formats

**What goes wrong:** Pipeline crashes on certain videos, produces wrong aspect ratios, or has timing issues.
**Why it happens:** Source videos come in varying resolutions, frame rates, codecs, rotations, and aspect ratios. Some may have metadata rotation flags.
**How to avoid:** Always probe input with ffprobe first. Handle rotation metadata. Resize all frames to a consistent working resolution early in the pipeline. Pad rather than stretch to maintain aspect ratio.
**Warning signs:** Some videos appear rotated 90 degrees; some are squished; timestamps drift.

### Pitfall 6: FFmpeg Silent Failures

**What goes wrong:** FFmpeg returns exit code 0 but output is truncated, has no video stream, or is corrupt.
**Why it happens:** FFmpeg is lenient by default and may produce partial output on warnings.
**How to avoid:** Always capture stderr and check for error patterns. Verify output file exists and has non-zero size. Run ffprobe on output to verify stream count and duration. Use `-xerror` flag for strict mode if needed.
**Warning signs:** Output file is suspiciously small; ffprobe shows 0 duration or missing streams.

### Pitfall 7: Confidence Mask Index Confusion

**What goes wrong:** The mask isolates the background instead of the person, or vice versa.
**Why it happens:** The selfie_segmenter model outputs confidence masks where index 0 = background and index 1 = person. Using the wrong index inverts the selection.
**How to avoid:** Always use `result.confidence_masks[1]` for person mask with selfie_segmenter. Verify by visualizing the mask on a test frame before batch processing.
**Warning signs:** Navy background appears on the person; bronze tint appears on the background.

## Code Examples

### Complete Single-Frame Styling Pipeline

```python
# Source: Synthesized from MediaPipe official docs + OpenCV docs
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Brand colors (BGR for OpenCV)
NAVY_BGR = np.array([92, 62, 44], dtype=np.uint8)     # #2c3e5c
BRONZE_BGR = np.array([108, 149, 184], dtype=np.uint8) # #b8956c
CREAM_BGR = np.array([232, 240, 245], dtype=np.uint8)  # #f5f0e8

def create_segmenter(model_path: str) -> vision.ImageSegmenter:
    """Create a reusable segmenter for VIDEO mode."""
    base_options = python.BaseOptions(model_asset_path=model_path)
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
    """Get person confidence mask for a single frame."""
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = segmenter.segment_for_video(mp_image, timestamp_ms)
    # Index 1 = person confidence mask
    return result.confidence_masks[1].numpy_view()

def style_frame(frame_bgr: np.ndarray, person_mask: np.ndarray) -> np.ndarray:
    """Apply Greek-themed styling to a single frame."""
    h, w = frame_bgr.shape[:2]

    # Resize mask if dimensions differ
    if person_mask.shape[:2] != (h, w):
        person_mask = cv2.resize(person_mask, (w, h))

    # Smooth the mask to reduce jagged edges
    smooth_mask = cv2.GaussianBlur(person_mask, (7, 7), 0)
    binary = (smooth_mask > 0.5).astype(np.uint8)

    # --- Navy background ---
    canvas = np.full((h, w, 3), NAVY_BGR, dtype=np.uint8)

    # --- Cream edge glow ---
    glow_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    dilated = cv2.dilate(binary, glow_kernel, iterations=1)
    edge_ring = (dilated - binary).astype(np.float32)
    glow = cv2.GaussianBlur(edge_ring, (21, 21), 0)

    for c in range(3):
        canvas[:, :, c] = np.clip(
            canvas[:, :, c].astype(np.float32) + glow * float(CREAM_BGR[c]) * 0.7,
            0, 255
        ).astype(np.uint8)

    # --- Bronze silhouette ---
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    gray_norm = cv2.normalize(gray, None, 60, 240, cv2.NORM_MINMAX)
    bronze = np.zeros_like(frame_bgr)
    for c in range(3):
        bronze[:, :, c] = (gray_norm.astype(np.float32) * (float(BRONZE_BGR[c]) / 255.0)).astype(np.uint8)

    # Composite: where person mask > 0.5, use bronze; else keep canvas
    mask_3ch = np.stack([smooth_mask] * 3, axis=-1)
    result = np.where(mask_3ch > 0.5, bronze, canvas)

    return result.astype(np.uint8)
```

### Batch Processing with Resume

```python
# Source: Standard Python patterns for batch processing
import json
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

def run_batch(
    input_dir: Path,
    output_dir: Path,
    progress_file: Path,
    max_workers: int = 2,
) -> None:
    """Process all videos with checkpointing and parallelism."""
    output_dir.mkdir(parents=True, exist_ok=True)
    progress = load_progress(progress_file)

    videos = sorted(input_dir.glob("*.mp4"))
    pending = [
        v for v in videos
        if progress["videos"].get(v.name, {}).get("status") != "completed"
    ]

    print(f"Total: {len(videos)}, Pending: {len(pending)}, "
          f"Completed: {progress['stats']['completed']}")

    # Note: max_workers should be conservative (2-4) due to
    # MediaPipe + OpenCV memory usage per worker
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_single, v, output_dir / v.name): v
            for v in pending
        }
        for future in as_completed(futures):
            video = futures[future]
            try:
                future.result()
                update_progress(progress_file, video.name, "completed")
            except Exception as e:
                update_progress(progress_file, video.name, "failed", str(e))
```

### FFmpeg Probe + Encode

```python
# Source: FFmpeg documentation, standard subprocess patterns
import subprocess
import json as json_mod
from pathlib import Path

def probe_video(path: Path) -> dict:
    """Get video metadata using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json_mod.loads(result.stdout)

def get_duration(path: Path) -> float:
    """Get video duration in seconds."""
    info = probe_video(path)
    return float(info["format"]["duration"])

def needs_looping(path: Path, min_duration: float = 5.0) -> bool:
    """Check if video needs to be looped to meet minimum duration."""
    return get_duration(path) < min_duration
```

## State of the Art

| Old Approach                       | Current Approach                 | When Changed            | Impact                                                               |
| ---------------------------------- | -------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `mp.solutions.selfie_segmentation` | `mp.tasks.vision.ImageSegmenter` | MediaPipe 0.10.x (2023) | New Tasks API with VIDEO/LIVE_STREAM modes; old API being deprecated |
| ffmpeg-python (kkroening)          | subprocess or python-ffmpeg      | ~2020 (unmaintained)    | ffmpeg-python abandoned; subprocess is safest long-term choice       |
| pip + venv                         | uv                               | 2024-2025               | 10-100x faster dependency resolution; single tool for Python + deps  |
| poetry / pipenv                    | uv                               | 2025-2026               | uv became the community default for new Python projects              |

**Deprecated/outdated:**

- `mp.solutions.selfie_segmentation`: Legacy API. Still works in 0.10.32 but the Tasks API (`mp.tasks.vision.ImageSegmenter`) is the recommended replacement with better video support.
- `ffmpeg-python` (kkroening/ffmpeg-python on PyPI): Unmaintained since 2019. Do not use for new projects.

## Open Questions

1. **Output resolution: portrait (720x1280) or landscape (1280x720)?**
   - What we know: Exercise demo videos could be filmed in either orientation. The app's VideoPlaceholder uses `object-fit: contain` in a `40vh` container.
   - What's unclear: What orientation the source videos are in. Whether the app expects portrait or landscape.
   - Recommendation: Detect input orientation with ffprobe, maintain original orientation, and normalize to 720p on the shorter dimension. Let the app handle display via `object-fit: contain`.

2. **Target file size per video**
   - What we know: PITFALLS.md recommends "1-5MB per video" at 720p for exercise demos. CRF 23 is FFmpeg's default "visually lossless" setting.
   - What's unclear: Exact target. Silhouette-style videos compress much better than natural video (flat colors, less detail).
   - Recommendation: Start with CRF 28 (styled content compresses well), measure output sizes, adjust if needed. Target under 2MB per 10-second clip.

3. **Multiclass segmenter vs binary segmenter**
   - What we know: Binary `selfie_segmenter` (person vs background) is simpler, faster (33ms vs 218ms CPU). Multiclass `selfie_multiclass_256x256` gives hair/skin/clothes categories.
   - What's unclear: Whether the bronze tint would benefit from different treatment of hair vs skin vs clothes.
   - Recommendation: Start with binary segmenter for simplicity and speed. The entire person gets uniform bronze treatment anyway.

4. **Parallelism strategy for 1300+ videos**
   - What we know: Each video takes ~30-60 seconds to process (segment + style every frame). ProcessPoolExecutor with 2-4 workers is practical.
   - What's unclear: Memory footprint per worker with MediaPipe loaded. Whether GPU acceleration is available on the target machine.
   - Recommendation: Default to 2 workers with a CLI flag to adjust. Each worker creates its own MediaPipe segmenter instance.

5. **Source video naming convention and mapping**
   - What we know: Exercises have numeric IDs and string names in the DB. Phase 26 handles manifest/mapping.
   - What's unclear: How source videos are named (by exercise name? ID? arbitrary?).
   - Recommendation: This pipeline should be filename-agnostic. Process all `*.mp4` files in the input directory. Phase 26 handles the exercise-to-filename mapping.

## Sources

### Primary (HIGH confidence)

- [MediaPipe Image Segmenter Python Guide](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/python) - API setup, running modes, configuration options, model download URLs
- [MediaPipe Image Segmenter Overview](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter) - Available models (selfie_segmenter, selfie_multiclass, DeepLab-v3), performance benchmarks
- [MediaPipe PyPI](https://pypi.org/project/mediapipe/) - Version 0.10.32, Python 3.9-3.12 support
- [OpenCV Morphological Operations Docs](https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html) - Dilation, gradient, kernel operations for edge glow
- [OpenCV Smoothing/Filtering Docs](https://docs.opencv.org/4.x/d4/d13/tutorial_py_filtering.html) - Gaussian blur, bilateral filter for mask smoothing
- [FFmpeg Documentation](https://www.ffmpeg.org/ffmpeg.html) - stream_loop, encoding flags, movflags
- [Python concurrent.futures Docs](https://docs.python.org/3/library/concurrent.futures.html) - ProcessPoolExecutor API

### Secondary (MEDIUM confidence)

- [MediaPipe GitHub Samples - Image Segmentation Notebook](https://github.com/googlesamples/mediapipe/blob/main/examples/image_segmentation/python/image_segmentation.ipynb) - Working code examples for mask-based compositing
- [MediaPipe Segmentation Mask Smoothing Issue #4058](https://github.com/google/mediapipe/issues/4058) - Temporal consistency workarounds
- [uv Getting Started Guide (2026)](https://www.bitdoze.com/uv-get-start/) - uv project setup for Python
- [python-ffmpeg PyPI](https://pypi.org/project/python-ffmpeg/) - Version 2.0.12, actively maintained alternative
- [FFmpeg Looping Tutorial (OTTVerse)](https://ottverse.com/how-to-loop-videos-using-ffmpeg-step-by-step-tutorial/) - stream_loop usage
- [PyImageSearch - Faster Video FPS with OpenCV](https://pyimagesearch.com/2017/02/06/faster-video-file-fps-with-cv2-videocapture-and-opencv/) - Threading optimization for frame reading

### Tertiary (LOW confidence)

- [Pysource - OpenCV Multithreading](https://pysource.com/2024/10/15/increase-opencv-speed-by-2x-with-python-and-multithreading-tutorial/) - Threading claims (379% improvement) need validation in this specific context

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries are well-established, versioned, and verified via PyPI/official docs
- Architecture: HIGH - Frame-by-frame pipeline is the standard pattern for video processing with ML; verified with official MediaPipe examples
- Pitfalls: HIGH - BGR/RGB confusion, mask flickering, memory issues are universally documented in OpenCV/MediaPipe community
- Visual styling: MEDIUM - The bronze silhouette + glow compositing algorithm is custom; the OpenCV operations are standard but the specific parameters (kernel sizes, blur amounts, color blending) will need tuning

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - stable domain, libraries change slowly)
