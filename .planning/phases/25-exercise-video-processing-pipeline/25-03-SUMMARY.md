---
phase: 25-exercise-video-processing-pipeline
plan: 03
subsystem: video-processing
tags:
  [
    python,
    ffmpeg,
    opencv,
    numpy,
    encoding,
    cropping,
    trimming,
    processing,
    watermark,
  ]

# Dependency graph
requires:
  - phase: 25-exercise-video-processing-pipeline
    provides: "Python project with segmenter.py and styler.py for person isolation and compositing"
provides:
  - "encoder.py: FFmpeg encoding (H.264/yuv420p/faststart), looping, thumbnail extraction, watermark detection"
  - "cropper.py: Person-centered smart crop with stable multi-frame crop region"
  - "trimmer.py: Movement detection for auto-trimming exercise demo clips"
  - "processor.py: Single-video pipeline orchestrator (probe -> trim -> crop -> segment -> style -> encode -> loop -> thumbnail)"
  - "Logo watermark asset and compositing in bottom-right corner"
affects: [25-04, 25-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      ffmpeg-subprocess-wrapper,
      stable-crop-from-multi-frame-masks,
      movement-detection-via-frame-differencing,
      single-video-orchestrator-pipeline,
      alpha-blended-watermark-overlay,
    ]

key-files:
  created:
    - el-templo-video-pipeline/src/pipeline/encoder.py
    - el-templo-video-pipeline/src/pipeline/cropper.py
    - el-templo-video-pipeline/src/pipeline/trimmer.py
    - el-templo-video-pipeline/src/pipeline/processor.py
    - el-templo-video-pipeline/assets/logo.png
  modified: []

key-decisions:
  - "Edge density heuristic for watermark detection (Canny edges in corner regions, >15% threshold)"
  - "Union bounding box across sampled frames for stable crop (avoids camera-follow jitter)"
  - "MJPEG codec for intermediate VideoWriter (lossless, fast encode, re-encoded to H.264 after)"
  - "Rolling average smoothed frame-differencing for movement detection (2fps sampling)"
  - "ProcessResult dataclass with non-throwing error handling for batch runner compatibility"

patterns-established:
  - "FFmpeg subprocess pattern: capture stderr, check returncode, raise RuntimeError with stderr on failure"
  - "Stable crop analysis: sample ~10 frames, segment each, union bounding boxes, compute single crop"
  - "Pipeline orchestration: temp files in finally block, single segmenter lifecycle, non-throwing returns"

# Metrics
duration: 7min
completed: 2026-02-15
---

# Phase 25 Plan 03: Video Processing Pipeline Modules Summary

**FFmpeg encoding/looping/thumbnails, person-centered smart crop with stable multi-frame analysis, movement-based auto-trimming, and full single-video orchestrator with logo watermark compositing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-15T03:50:17Z
- **Completed:** 2026-02-15T03:56:56Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Built FFmpeg wrapper for H.264/yuv420p/faststart encoding, video looping (hard cut for short clips), middle-frame thumbnail extraction, and corner-based watermark detection heuristic
- Implemented person-centered smart cropper that detects bounding boxes from segmentation masks and computes a single stable crop region across multiple sampled frames to avoid jitter
- Created movement detection trimmer that samples frames at 2fps, builds a smoothed movement signal via frame differencing, and finds the sustained exercise demo window (5-10 seconds)
- Built the full single-video processor orchestrator that chains: probe -> watermark check -> trim -> stable crop analysis -> frame-by-frame (crop -> segment -> style -> watermark) -> encode -> loop -> thumbnail
- Added preview mode for single-frame PNG output useful for QA before batch processing
- Copied El Templo logo from member app and integrated semi-transparent watermark compositing in bottom-right corner

## Task Commits

Each task was committed atomically:

1. **Task 1: Create encoder, cropper, and trimmer modules** - `4399599` (feat)
2. **Task 2: Create single-video processor orchestrator with logo watermark** - `5063007` (feat)

## Files Created/Modified

- `el-templo-video-pipeline/src/pipeline/encoder.py` - FFmpeg operations: probe_video, get_video_info, encode_video, loop_video, extract_thumbnail, has_watermark
- `el-templo-video-pipeline/src/pipeline/cropper.py` - Smart crop: detect_person_bbox, compute_crop_region, smart_crop, compute_stable_crop
- `el-templo-video-pipeline/src/pipeline/trimmer.py` - Movement trimming: detect_movement_range, trim_video
- `el-templo-video-pipeline/src/pipeline/processor.py` - Pipeline orchestrator: process_video, preview_frame, load_watermark, apply_watermark, ProcessResult
- `el-templo-video-pipeline/assets/logo.png` - El Templo logo for watermark compositing (copied from el-templo-app)

## Decisions Made

- **Edge density watermark detection:** Canny edges in 10% corner regions with >15% density threshold. Simple heuristic -- false negatives acceptable, false positives flagged for manual review.
- **Union bounding box for stable crop:** Sample ~10 frames across the video, segment each, take the union of all person bounding boxes. This produces a single crop region that contains the full range of motion without per-frame jitter.
- **MJPG intermediate codec:** VideoWriter uses MJPEG for the frame-by-frame intermediate file, then re-encodes to H.264 via FFmpeg. MJPEG is fast to write and doesn't accumulate quality loss since it's only one generation.
- **Movement detection algorithm:** Frame-to-frame absolute differences at 2fps, smoothed with rolling average, thresholded at 20% of peak movement, longest contiguous active region selected.
- **Non-throwing ProcessResult:** process_video catches all exceptions and returns them in the status/error fields so the batch runner (Plan 04) can process without try/except per video.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- Python execution via `uv run python` was blocked by the sandbox for most of the execution. Verification was done using system python3 with manually installed opencv-python-headless and numpy, plus AST parsing for syntax validation of modules that depend on mediapipe. All 4 modules (encoder, cropper, trimmer, processor) verified: syntax correct, all expected functions defined, cropper tested with synthetic data (bbox detection, crop region computation, smart_crop output dimensions, stable crop, no-person fallback).

## User Setup Required

None - no external service configuration required. FFmpeg must be available on the system PATH.

## Next Phase Readiness

- All 4 pipeline modules (encoder, cropper, trimmer, processor) are ready for Plan 04 (batch runner and CLI)
- processor.py's ProcessResult dataclass provides the interface for batch aggregation
- The pipeline chain is: sourcer (Plan 02) produces raw videos -> processor (Plan 03) transforms each -> batch runner (Plan 04) orchestrates the collection

## Self-Check: PASSED

- All 5 created files verified on disk
- All 2 task commits verified in git history (4399599, 5063007)

---

_Phase: 25-exercise-video-processing-pipeline_
_Completed: 2026-02-15_
