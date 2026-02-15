"""FFmpeg operations for video encoding, looping, thumbnail extraction, and watermark detection."""

import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from pipeline.config import CRF, FFMPEG_PRESET, NAVY_HEX, TARGET_FPS


@dataclass(frozen=True)
class VideoInfo:
    """Metadata extracted from a video file via ffprobe."""

    width: int
    height: int
    duration: float
    fps: float
    rotation: int


def probe_video(path: Path) -> dict:
    """Call ffprobe and return parsed JSON with format and stream info.

    Args:
        path: Path to a video file.

    Returns:
        Parsed JSON dict from ffprobe output.

    Raises:
        RuntimeError: If ffprobe fails.
    """
    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {path}: {result.stderr}")
    data: dict = json.loads(result.stdout)
    return data


def get_video_info(path: Path) -> VideoInfo:
    """Extract video metadata into a structured VideoInfo object.

    Handles rotation metadata (some phone videos report rotation=90 in
    side_data or stream tags, meaning logical dimensions are swapped).

    Args:
        path: Path to a video file.

    Returns:
        VideoInfo with width, height, duration, fps, and rotation.
    """
    data = probe_video(path)

    # Find the video stream
    video_stream: dict | None = None
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            video_stream = stream
            break
    if video_stream is None:
        raise RuntimeError(f"No video stream found in {path}")

    width = int(video_stream["width"])
    height = int(video_stream["height"])

    # Duration: prefer format duration, fall back to stream duration
    duration_str = data.get("format", {}).get(
        "duration", video_stream.get("duration", "0")
    )
    duration = float(duration_str) if duration_str else 0.0

    # FPS from r_frame_rate (e.g. "30/1" or "30000/1001")
    fps_str = video_stream.get("r_frame_rate", "30/1")
    if "/" in fps_str:
        num, den = fps_str.split("/")
        fps = float(num) / float(den) if float(den) != 0 else 30.0
    else:
        fps = float(fps_str)

    # Rotation: check side_data_list and tags
    rotation = 0
    for side_data in video_stream.get("side_data_list", []):
        if "rotation" in side_data:
            rotation = abs(int(side_data["rotation"]))
            break
    if rotation == 0:
        tags = video_stream.get("tags", {})
        rotate_tag = tags.get("rotate", "0")
        rotation = abs(int(rotate_tag))

    # Swap dimensions if rotation is 90 or 270 (portrait phone videos)
    if rotation in (90, 270):
        width, height = height, width

    return VideoInfo(
        width=width,
        height=height,
        duration=duration,
        fps=fps,
        rotation=rotation,
    )


def encode_video(
    input_path: Path,
    output_path: Path,
    width: int = 720,
    height: int = 1280,
    fps: int = TARGET_FPS,
    crf: int = CRF,
) -> None:
    """Encode a video to H.264/yuv420p/faststart with no audio.

    Uses libx264 with the configured CRF and preset. Scales to fit target
    dimensions, padding with navy to fill the frame.

    Args:
        input_path: Source video file.
        output_path: Destination for encoded MP4.
        width: Target width in pixels.
        height: Target height in pixels.
        fps: Target frame rate.
        crf: Constant Rate Factor (lower = higher quality).

    Raises:
        RuntimeError: If FFmpeg encoding fails.
    """
    scale_filter = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={NAVY_HEX}"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vf",
        scale_filter,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        str(fps),
        "-crf",
        str(crf),
        "-preset",
        FFMPEG_PRESET,
        "-movflags",
        "+faststart",
        "-an",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg encode failed: {result.stderr}")


def loop_video(
    input_path: Path,
    output_path: Path,
    min_seconds: float = 5.0,
) -> bool:
    """Loop a short video to meet a minimum duration.

    Uses FFmpeg stream_loop to duplicate the video content and trims to
    exactly min_seconds. If the video is already long enough, no action
    is taken.

    Args:
        input_path: Source video file.
        output_path: Destination for looped video.
        min_seconds: Minimum required duration in seconds.

    Returns:
        True if looping was applied, False if already long enough.

    Raises:
        RuntimeError: If FFmpeg looping fails.
    """
    info = get_video_info(input_path)
    if info.duration >= min_seconds:
        return False

    # Calculate how many extra loops needed
    loop_count = math.ceil(min_seconds / info.duration) - 1
    cmd = [
        "ffmpeg",
        "-y",
        "-stream_loop",
        str(loop_count),
        "-i",
        str(input_path),
        "-t",
        str(min_seconds),
        "-c",
        "copy",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg loop failed: {result.stderr}")
    return True


def extract_thumbnail(video_path: Path, output_path: Path) -> None:
    """Extract the middle frame of a video as a PNG thumbnail.

    Uses ffprobe to find the duration midpoint, then extracts a single
    frame at that timestamp.

    Args:
        video_path: Source video file.
        output_path: Destination PNG file.

    Raises:
        RuntimeError: If extraction fails.
    """
    info = get_video_info(video_path)
    midpoint = info.duration / 2.0

    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        str(midpoint),
        "-i",
        str(video_path),
        "-vframes",
        "1",
        "-q:v",
        "2",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg thumbnail extraction failed: {result.stderr}")


def has_watermark(path: Path) -> bool:
    """Basic watermark detection heuristic.

    Extracts the first frame and checks corner regions for high edge
    density, which may indicate overlaid text or logos. This is a simple
    heuristic — false negatives are acceptable; false positives get
    manually reviewed.

    Args:
        path: Path to a video file.

    Returns:
        True if a suspected watermark is detected, False otherwise.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return False

    ret, frame = cap.read()
    cap.release()
    if not ret or frame is None:
        return False

    h, w = frame.shape[:2]
    # Define corner regions (top-left, top-right, bottom-left, bottom-right)
    # Each corner is ~10% of the frame dimensions
    corner_h = max(h // 10, 30)
    corner_w = max(w // 10, 50)

    corners = [
        frame[0:corner_h, 0:corner_w],  # top-left
        frame[0:corner_h, w - corner_w : w],  # top-right
        frame[h - corner_h : h, 0:corner_w],  # bottom-left
        frame[h - corner_h : h, w - corner_w : w],  # bottom-right
    ]

    for corner in corners:
        gray = cv2.cvtColor(corner, cv2.COLOR_BGR2GRAY)
        # Canny edge detection
        edges = cv2.Canny(gray, 50, 150)
        # Edge density: ratio of edge pixels to total pixels
        edge_density = float(np.count_nonzero(edges)) / float(edges.size)
        # High edge density in a corner suggests text/logo overlay
        if edge_density > 0.15:
            return True

    return False
