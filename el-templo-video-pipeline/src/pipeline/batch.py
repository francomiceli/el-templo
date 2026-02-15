"""Batch processing engine with progress checkpointing and resume.

Processes multiple exercise videos through the pipeline with progress.json
checkpointing after each video. Supports resume (skips completed videos),
retry of failed videos, and graceful KeyboardInterrupt handling.
"""

import json
import tempfile
import time
from enum import StrEnum
from pathlib import Path

from tqdm import tqdm

from pipeline.config import SUPPORTED_EXTENSIONS
from pipeline.processor import ProcessResult, process_video


class VideoStatus(StrEnum):
    """Status of a video in the batch processing pipeline."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    FLAGGED_WATERMARK = "flagged_watermark"
    SKIPPED = "skipped"


def load_progress(progress_path: Path) -> dict[str, object]:
    """Load progress.json if it exists, otherwise return default structure.

    Args:
        progress_path: Path to the progress.json file.

    Returns:
        Progress dict with 'started_at', 'updated_at', 'videos', 'stats' keys.
    """
    if progress_path.exists():
        try:
            data = json.loads(progress_path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "videos" in data and "stats" in data:
                return data
        except (json.JSONDecodeError, OSError):
            pass

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "started_at": now,
        "updated_at": now,
        "videos": {},
        "stats": {
            "completed": 0,
            "failed": 0,
            "skipped": 0,
            "flagged": 0,
            "pending": 0,
        },
    }


def save_progress(progress_path: Path, progress: dict[str, object]) -> None:
    """Write progress.json atomically (write to temp file then rename).

    This avoids corruption if the process is interrupted mid-write.

    Args:
        progress_path: Path to the progress.json file.
        progress: Progress dict to save.
    """
    progress["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    progress_path.parent.mkdir(parents=True, exist_ok=True)

    # Write to temp file in the same directory, then rename (atomic on same filesystem)
    fd, tmp_path_str = tempfile.mkstemp(
        dir=str(progress_path.parent), suffix=".tmp"
    )
    tmp_path = Path(tmp_path_str)
    try:
        with open(fd, "w", encoding="utf-8") as f:
            json.dump(progress, f, indent=2, ensure_ascii=False)
        tmp_path.replace(progress_path)
    except Exception:
        # Cleanup temp file on failure
        if tmp_path.exists():
            tmp_path.unlink()
        raise


def update_video_status(
    progress: dict[str, object],
    filename: str,
    status: str,
    error: str | None = None,
    file_size: int = 0,
    duration: float = 0.0,
) -> None:
    """Update a single video entry and recalculate stats.

    Args:
        progress: Progress dict (mutated in place).
        filename: Video filename (key in videos dict).
        status: New status string (from VideoStatus enum).
        error: Error message if status is FAILED.
        file_size: Output file size in bytes.
        duration: Processing duration in seconds.
    """
    videos: dict[str, dict[str, object]] = progress.get("videos", {})  # type: ignore[assignment]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    entry = videos.get(filename, {})
    if not entry.get("started"):
        entry["started"] = now
    entry["status"] = status
    entry["completed"] = now
    entry["file_size"] = file_size
    entry["duration"] = duration
    if error is not None:
        entry["error"] = error
    elif "error" in entry:
        del entry["error"]

    videos[filename] = entry
    progress["videos"] = videos

    # Recalculate stats from all video entries
    stats = {"completed": 0, "failed": 0, "skipped": 0, "flagged": 0, "pending": 0}
    for video_entry in videos.values():
        video_status = str(video_entry.get("status", "pending"))
        if video_status == VideoStatus.COMPLETED:
            stats["completed"] += 1
        elif video_status == VideoStatus.FAILED:
            stats["failed"] += 1
        elif video_status == VideoStatus.SKIPPED:
            stats["skipped"] += 1
        elif video_status == VideoStatus.FLAGGED_WATERMARK:
            stats["flagged"] += 1
        elif video_status in (VideoStatus.PENDING, VideoStatus.PROCESSING):
            stats["pending"] += 1

    progress["stats"] = stats


def _discover_videos(input_dir: Path) -> list[Path]:
    """Discover all supported video files in input_dir.

    Args:
        input_dir: Directory to search for video files.

    Returns:
        Sorted list of video file paths.
    """
    videos: list[Path] = []
    for ext in SUPPORTED_EXTENSIONS:
        videos.extend(input_dir.glob(f"*{ext}"))
    # Sort for deterministic processing order
    videos.sort(key=lambda p: p.name.lower())
    return videos


def run_batch(
    input_dir: Path,
    output_dir: Path,
    progress_path: Path,
    logo_path: Path | None = None,
    max_workers: int = 1,
    skip_watermark_check: bool = False,
) -> dict[str, int]:
    """Run batch processing on all videos in input_dir.

    Discovers video files, loads progress.json, skips already COMPLETED videos,
    and processes each video sequentially (or in parallel if max_workers > 1).
    Saves progress checkpoint after EACH video. Handles KeyboardInterrupt
    gracefully by saving progress and exiting cleanly.

    Args:
        input_dir: Directory containing source video files.
        output_dir: Directory for processed output videos.
        progress_path: Path to progress.json checkpoint file.
        logo_path: Path to logo PNG for watermark. None uses default.
        max_workers: Number of parallel workers. 1 = sequential.
        skip_watermark_check: Skip watermark detection for all videos.

    Returns:
        Final stats dict with completed/failed/skipped/flagged/pending counts.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    all_videos = _discover_videos(input_dir)
    progress = load_progress(progress_path)

    if not all_videos:
        print("No video files found in input directory.")
        return progress.get("stats", {})  # type: ignore[return-value]

    # Determine which videos still need processing
    videos_dict: dict[str, dict[str, object]] = progress.get("videos", {})  # type: ignore[assignment]
    to_process: list[Path] = []
    for video_path in all_videos:
        existing = videos_dict.get(video_path.name, {})
        status = str(existing.get("status", ""))
        if status != VideoStatus.COMPLETED:
            to_process.append(video_path)

    completed_count = len(all_videos) - len(to_process)
    print(f"\nBatch processing: {len(all_videos)} total videos")
    print(f"  Already completed: {completed_count}")
    print(f"  To process: {len(to_process)}")
    print(f"  Output: {output_dir}")
    print(f"  Progress: {progress_path}")
    print("-" * 60)

    if not to_process:
        print("All videos already completed!")
        return progress.get("stats", {})  # type: ignore[return-value]

    if max_workers > 1:
        return _run_parallel(
            to_process, output_dir, progress_path, progress,
            logo_path, max_workers, skip_watermark_check,
        )

    return _run_sequential(
        to_process, output_dir, progress_path, progress,
        logo_path, skip_watermark_check,
    )


def _run_sequential(
    to_process: list[Path],
    output_dir: Path,
    progress_path: Path,
    progress: dict[str, object],
    logo_path: Path | None,
    skip_watermark_check: bool,
) -> dict[str, int]:
    """Process videos sequentially with tqdm progress bar.

    Args:
        to_process: List of video paths to process.
        output_dir: Output directory.
        progress_path: Path to progress.json.
        progress: Current progress dict.
        logo_path: Logo path for watermark.
        skip_watermark_check: Skip watermark detection.

    Returns:
        Final stats dict.
    """
    try:
        for video_path in tqdm(to_process, desc="Processing", unit="video"):
            filename = video_path.name
            out_path = output_dir / video_path.with_suffix(".mp4").name

            # Mark as processing
            update_video_status(progress, filename, VideoStatus.PROCESSING)
            save_progress(progress_path, progress)

            # Process
            result: ProcessResult = process_video(
                input_path=video_path,
                output_path=out_path,
                logo_path=logo_path,
                skip_watermark_check=skip_watermark_check,
            )

            # Map ProcessResult.status to VideoStatus
            status_map: dict[str, str] = {
                "completed": VideoStatus.COMPLETED,
                "failed": VideoStatus.FAILED,
                "flagged_watermark": VideoStatus.FLAGGED_WATERMARK,
                "skipped": VideoStatus.SKIPPED,
            }
            video_status = status_map.get(result.status, VideoStatus.FAILED)

            update_video_status(
                progress,
                filename,
                video_status,
                error=result.error,
                file_size=result.file_size,
                duration=result.duration,
            )
            save_progress(progress_path, progress)

    except KeyboardInterrupt:
        print("\n\nInterrupted! Saving progress...")
        save_progress(progress_path, progress)
        print(f"Progress saved to {progress_path}")
        print("Resume by running the same command again.")

    return progress.get("stats", {})  # type: ignore[return-value]


def _run_parallel(
    to_process: list[Path],
    output_dir: Path,
    progress_path: Path,
    progress: dict[str, object],
    logo_path: Path | None,
    max_workers: int,
    skip_watermark_check: bool,
) -> dict[str, int]:
    """Process videos in parallel using ProcessPoolExecutor.

    Each worker creates its own MediaPipe segmenter instance (inside process_video).

    Args:
        to_process: List of video paths to process.
        output_dir: Output directory.
        progress_path: Path to progress.json.
        progress: Current progress dict.
        logo_path: Logo path for watermark.
        max_workers: Number of parallel workers.
        skip_watermark_check: Skip watermark detection.

    Returns:
        Final stats dict.
    """
    from concurrent.futures import ProcessPoolExecutor, as_completed

    # Build (input, output) pairs
    tasks: list[tuple[Path, Path]] = []
    for video_path in to_process:
        out_path = output_dir / video_path.with_suffix(".mp4").name
        tasks.append((video_path, out_path))

    try:
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            future_to_filename: dict[object, str] = {}
            for input_path, out_path in tasks:
                future = executor.submit(
                    process_video,
                    input_path=input_path,
                    output_path=out_path,
                    logo_path=logo_path,
                    skip_watermark_check=skip_watermark_check,
                )
                future_to_filename[future] = input_path.name

            pbar = tqdm(total=len(tasks), desc="Processing", unit="video")
            for future in as_completed(future_to_filename):
                filename = future_to_filename[future]
                try:
                    result: ProcessResult = future.result()
                    status_map: dict[str, str] = {
                        "completed": VideoStatus.COMPLETED,
                        "failed": VideoStatus.FAILED,
                        "flagged_watermark": VideoStatus.FLAGGED_WATERMARK,
                        "skipped": VideoStatus.SKIPPED,
                    }
                    video_status = status_map.get(result.status, VideoStatus.FAILED)
                    update_video_status(
                        progress,
                        filename,
                        video_status,
                        error=result.error,
                        file_size=result.file_size,
                        duration=result.duration,
                    )
                except Exception as exc:
                    error_msg = str(exc) if isinstance(exc, Exception) else "Unknown error"
                    update_video_status(
                        progress,
                        filename,
                        VideoStatus.FAILED,
                        error=error_msg,
                    )
                save_progress(progress_path, progress)
                pbar.update(1)
            pbar.close()

    except KeyboardInterrupt:
        print("\n\nInterrupted! Saving progress...")
        save_progress(progress_path, progress)
        print(f"Progress saved to {progress_path}")
        print("Resume by running the same command again.")

    return progress.get("stats", {})  # type: ignore[return-value]


def retry_failed(
    input_dir: Path,
    output_dir: Path,
    progress_path: Path,
    logo_path: Path | None = None,
) -> dict[str, int]:
    """Re-process only videos with status FAILED.

    Resets their status to PENDING and runs batch on them.

    Args:
        input_dir: Directory containing source video files.
        output_dir: Directory for processed output videos.
        progress_path: Path to progress.json checkpoint file.
        logo_path: Path to logo PNG for watermark. None uses default.

    Returns:
        Final stats dict.
    """
    progress = load_progress(progress_path)
    videos_dict: dict[str, dict[str, object]] = progress.get("videos", {})  # type: ignore[assignment]

    failed_filenames: list[str] = []
    for filename, entry in videos_dict.items():
        if str(entry.get("status", "")) == VideoStatus.FAILED:
            failed_filenames.append(filename)

    if not failed_filenames:
        print("No failed videos to retry.")
        return progress.get("stats", {})  # type: ignore[return-value]

    print(f"\nRetrying {len(failed_filenames)} failed videos:")
    for fn in failed_filenames:
        print(f"  - {fn}")
        entry = videos_dict.get(fn, {})
        entry["status"] = VideoStatus.PENDING
        if "error" in entry:
            del entry["error"]
        videos_dict[fn] = entry

    progress["videos"] = videos_dict
    save_progress(progress_path, progress)

    # Run batch (it will pick up the PENDING ones)
    return run_batch(
        input_dir=input_dir,
        output_dir=output_dir,
        progress_path=progress_path,
        logo_path=logo_path,
    )


def get_pending_videos(progress_path: Path, input_dir: Path) -> list[Path]:
    """Return list of video paths not yet completed (for dry-run display).

    Args:
        progress_path: Path to progress.json checkpoint file.
        input_dir: Directory containing source video files.

    Returns:
        List of video paths that have not been completed.
    """
    all_videos = _discover_videos(input_dir)
    progress = load_progress(progress_path)
    videos_dict: dict[str, dict[str, object]] = progress.get("videos", {})  # type: ignore[assignment]

    pending: list[Path] = []
    for video_path in all_videos:
        entry = videos_dict.get(video_path.name, {})
        if str(entry.get("status", "")) != VideoStatus.COMPLETED:
            pending.append(video_path)

    return pending
