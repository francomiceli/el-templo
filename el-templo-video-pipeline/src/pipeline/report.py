"""Summary report generation after batch processing runs.

Reads progress.json and output directory to produce a formatted text report
with completion stats, failed video list, and flagged-for-review list.
"""

import json
from datetime import datetime
from pathlib import Path

from pipeline.batch import VideoStatus


def generate_report(
    progress_path: Path,
    output_dir: Path,
    report_path: Path | None = None,
) -> str:
    """Generate a text report from progress.json and output directory.

    Reads the progress file, computes statistics, and formats a human-readable
    report. Optionally writes the report to a file.

    Args:
        progress_path: Path to progress.json file.
        output_dir: Path to the output directory (for file size stats).
        report_path: Optional path to write the report file. If None, report
                     is only returned as a string.

    Returns:
        The formatted report as a string.
    """
    # Load progress data
    progress: dict[str, object] = {}
    if progress_path.exists():
        try:
            progress = json.loads(progress_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    videos: dict[str, dict[str, object]] = progress.get("videos", {})  # type: ignore[assignment]
    stats: dict[str, int] = progress.get("stats", {  # type: ignore[assignment]
        "completed": 0,
        "failed": 0,
        "skipped": 0,
        "flagged": 0,
        "pending": 0,
    })

    total = len(videos)
    completed = stats.get("completed", 0)
    failed = stats.get("failed", 0)
    flagged = stats.get("flagged", 0)
    skipped = stats.get("skipped", 0)
    pending = stats.get("pending", 0)

    # Time range
    started_at = str(progress.get("started_at", "N/A"))
    updated_at = str(progress.get("updated_at", "N/A"))
    duration_str = _compute_duration(started_at, updated_at)

    # Output file stats
    total_size_bytes = 0
    total_duration = 0.0
    completed_count = 0

    for entry in videos.values():
        if str(entry.get("status", "")) == VideoStatus.COMPLETED:
            total_size_bytes += int(entry.get("file_size", 0) or 0)
            total_duration += float(entry.get("duration", 0) or 0)
            completed_count += 1

    avg_file_size = total_size_bytes / completed_count if completed_count > 0 else 0.0
    avg_duration = total_duration / completed_count if completed_count > 0 else 0.0

    # Collect failed and flagged videos
    failed_videos: list[tuple[str, str]] = []
    flagged_videos: list[str] = []

    for filename, entry in sorted(videos.items()):
        status = str(entry.get("status", ""))
        if status == VideoStatus.FAILED:
            error = str(entry.get("error", "Unknown error"))
            failed_videos.append((filename, error))
        elif status == VideoStatus.FLAGGED_WATERMARK:
            flagged_videos.append(filename)

    # Build report
    sep = "\u2550" * 43
    lines: list[str] = []

    lines.append(sep)
    lines.append("El Templo Video Pipeline — Batch Report")
    lines.append(sep)
    lines.append("")
    lines.append(f"Run: {_format_timestamp(started_at)} → {_format_timestamp(updated_at)}")
    lines.append(f"Duration: {duration_str}")
    lines.append("")
    lines.append("Summary:")
    lines.append(f"  Total videos:     {total:>5}")
    if total > 0:
        lines.append(f"  Completed:        {completed:>5}  ({_pct(completed, total)})")
        lines.append(f"  Failed:           {failed:>5}  ({_pct(failed, total)})")
        lines.append(f"  Flagged (review): {flagged:>5}  ({_pct(flagged, total)})")
        lines.append(f"  Skipped:          {skipped:>5}  ({_pct(skipped, total)})")
        if pending > 0:
            lines.append(f"  Pending:          {pending:>5}  ({_pct(pending, total)})")
    lines.append("")
    lines.append("Output:")
    lines.append(f"  Total size:       {_format_size(total_size_bytes)}")
    lines.append(f"  Avg file size:    {_format_size(int(avg_file_size))}")
    lines.append(f"  Avg duration:     {avg_duration:.1f}s")

    if failed_videos:
        lines.append("")
        lines.append("Failed Videos:")
        for i, (filename, error) in enumerate(failed_videos, 1):
            lines.append(f"  {i}. {filename} — {error}")

    if flagged_videos:
        lines.append("")
        lines.append("Flagged for Review (possible watermark):")
        for i, filename in enumerate(flagged_videos, 1):
            lines.append(f"  {i}. {filename}")

    lines.append("")
    lines.append(sep)

    report = "\n".join(lines)

    # Optionally save to file
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report, encoding="utf-8")

    return report


def print_report(progress_path: Path, output_dir: Path) -> None:
    """Generate and print the report to stdout.

    Args:
        progress_path: Path to progress.json file.
        output_dir: Path to the output directory.
    """
    report = generate_report(progress_path, output_dir)
    print(report)


def _compute_duration(started: str, updated: str) -> str:
    """Compute human-readable duration between two ISO timestamps.

    Args:
        started: ISO timestamp string for start.
        updated: ISO timestamp string for end.

    Returns:
        Human-readable duration string (e.g., "4h 27m 23s").
    """
    try:
        start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        delta = end_dt - start_dt
        total_seconds = int(delta.total_seconds())

        if total_seconds < 0:
            return "N/A"

        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60

        parts: list[str] = []
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0 or hours > 0:
            parts.append(f"{minutes}m")
        parts.append(f"{seconds}s")

        return " ".join(parts)
    except (ValueError, TypeError):
        return "N/A"


def _format_timestamp(ts: str) -> str:
    """Format an ISO timestamp for display.

    Args:
        ts: ISO timestamp string.

    Returns:
        Formatted timestamp string (e.g., "2026-02-15 03:45:22").
    """
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return ts


def _pct(value: int, total: int) -> str:
    """Format a percentage string.

    Args:
        value: Numerator.
        total: Denominator.

    Returns:
        Formatted percentage string (e.g., "94.7%").
    """
    if total == 0:
        return "0.0%"
    return f"{value / total * 100:.1f}%"


def _format_size(size_bytes: int) -> str:
    """Format a byte count as human-readable size.

    Args:
        size_bytes: Size in bytes.

    Returns:
        Formatted size string (e.g., "856 MB", "1.2 GB").
    """
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
