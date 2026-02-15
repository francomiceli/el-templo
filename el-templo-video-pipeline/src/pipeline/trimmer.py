"""Movement detection for auto-trimming exercise clips.

Analyzes a video to find the active exercise demonstration portion
and trims to a 5-10 second clip using FFmpeg.
"""

import subprocess
from pathlib import Path

import cv2
import numpy as np

from pipeline.config import MAX_DURATION_SECONDS, MIN_DURATION_SECONDS


def detect_movement_range(
    video_path: Path,
    min_duration: float = MIN_DURATION_SECONDS,
    max_duration: float = MAX_DURATION_SECONDS,
) -> tuple[float, float]:
    """Analyze a video to find the exercise demonstration portion.

    Samples frames at ~2fps, computes frame-to-frame differences to build
    a movement signal, then finds the sustained movement window.

    Algorithm:
        1. Sample frames at ~2fps
        2. Compute absolute difference between consecutive frames
        3. Sum differences per frame for a movement score timeseries
        4. Smooth with rolling average (~1 second window)
        5. Find region above threshold (20th percentile of max movement)
        6. Expand slightly to include start/end of movements
        7. Clamp to min/max duration constraints

    Args:
        video_path: Path to the video file.
        min_duration: Minimum clip duration in seconds.
        max_duration: Maximum clip duration in seconds.

    Returns:
        Tuple (start_seconds, end_seconds) for the active exercise portion.
        Falls back to (0, min(duration, max_duration)) if no movement detected.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return (0.0, min_duration)

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    total_duration = total_frames / fps

    if total_duration <= 0:
        cap.release()
        return (0.0, min_duration)

    # Sample at ~2fps
    sample_interval = max(1, int(fps / 2))
    timestamps: list[float] = []
    movement_scores: list[float] = []
    prev_gray: np.ndarray | None = None

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_interval == 0:
            # Downscale for faster processing
            small = cv2.resize(frame, (160, 90))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)

            if prev_gray is not None:
                diff = np.abs(gray - prev_gray)
                score = float(np.sum(diff))
                movement_scores.append(score)
                timestamps.append(frame_idx / fps)

            prev_gray = gray

        frame_idx += 1

    cap.release()

    # Fallback if not enough frames sampled
    if len(movement_scores) < 3:
        return (0.0, min(total_duration, max_duration))

    scores = np.array(movement_scores, dtype=np.float64)
    times = np.array(timestamps, dtype=np.float64)

    # Smooth with rolling average (window ~1 second at 2fps = 2 samples)
    window_size = max(2, int(fps / sample_interval))
    if len(scores) >= window_size:
        kernel = np.ones(window_size) / window_size
        smoothed = np.convolve(scores, kernel, mode="same")
    else:
        smoothed = scores

    # Threshold: 20th percentile of peak movement
    peak = float(np.max(smoothed))
    if peak <= 0:
        return (0.0, min(total_duration, max_duration))

    threshold = peak * 0.20
    above = smoothed > threshold

    # Find contiguous regions above threshold
    active_indices = np.where(above)[0]
    if len(active_indices) == 0:
        return (0.0, min(total_duration, max_duration))

    # Find the longest contiguous run of active frames
    best_start = active_indices[0]
    best_end = active_indices[0]
    current_start = active_indices[0]

    for i in range(1, len(active_indices)):
        if active_indices[i] - active_indices[i - 1] <= 2:
            # Allow small gaps (up to 2 samples ~1 second)
            if active_indices[i] - current_start > best_end - best_start:
                best_start = current_start
                best_end = active_indices[i]
        else:
            current_start = active_indices[i]

    # Also check the last run
    if active_indices[-1] - current_start > best_end - best_start:
        best_start = current_start
        best_end = active_indices[-1]

    # Convert indices back to timestamps
    start_time = float(times[best_start])
    end_time = float(times[min(best_end, len(times) - 1)])

    # Expand slightly to capture movement boundaries (~0.5s each side)
    start_time = max(0.0, start_time - 0.5)
    end_time = min(total_duration, end_time + 0.5)

    # Enforce duration constraints
    duration = end_time - start_time
    if duration < min_duration:
        # Expand symmetrically to meet minimum
        needed = min_duration - duration
        start_time = max(0.0, start_time - needed / 2)
        end_time = min(total_duration, end_time + needed / 2)
        # If we can't expand enough on one side, expand more on the other
        duration = end_time - start_time
        if duration < min_duration:
            if start_time == 0.0:
                end_time = min(total_duration, min_duration)
            else:
                start_time = max(0.0, end_time - min_duration)

    if end_time - start_time > max_duration:
        # Center a max_duration window on the detected active region
        center = (start_time + end_time) / 2
        start_time = max(0.0, center - max_duration / 2)
        end_time = start_time + max_duration
        if end_time > total_duration:
            end_time = total_duration
            start_time = max(0.0, end_time - max_duration)

    return (round(start_time, 2), round(end_time, 2))


def trim_video(
    input_path: Path,
    output_path: Path,
    start: float,
    end: float,
) -> None:
    """Trim a video using FFmpeg with copy codec for speed.

    Uses -c copy since the output will be re-encoded later in the pipeline.

    Args:
        input_path: Source video file.
        output_path: Destination for trimmed video.
        start: Start time in seconds.
        end: End time in seconds.

    Raises:
        RuntimeError: If FFmpeg trimming fails.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        str(start),
        "-to",
        str(end),
        "-i",
        str(input_path),
        "-c",
        "copy",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg trim failed: {result.stderr}")
