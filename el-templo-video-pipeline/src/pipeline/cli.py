"""CLI entry point for the El Templo video processing pipeline.

Provides subcommands for sourcing, processing, previewing, batch processing,
reporting, and status checking of exercise demonstration videos.

Usage:
    uv run pipeline source --level alfa
    uv run pipeline process input/bench-press.mp4 output/bench-press.mp4
    uv run pipeline preview input/squat.mp4
    uv run pipeline batch --input-dir input/ --output-dir output/
    uv run pipeline report
    uv run pipeline status
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any


def _add_source_parser(subparsers: Any) -> None:
    """Add 'source' subcommand parser."""
    parser = subparsers.add_parser(
        "source",
        help="Source exercise demo videos from the web",
    )
    parser.add_argument(
        "--level",
        type=str,
        default=None,
        help="Filter exercises by level (e.g., 'alfa'). Default: all levels.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("input"),
        help="Output directory for downloaded videos. Default: input/",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("input/manifest.json"),
        help="Path to manifest JSON. Default: input/manifest.json",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=3.0,
        help="Seconds between requests. Default: 3.0",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List exercises that would be sourced without downloading",
    )


def _add_process_parser(subparsers: Any) -> None:
    """Add 'process' subcommand parser."""
    parser = subparsers.add_parser(
        "process",
        help="Process a single video through the pipeline",
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Input video path",
    )
    parser.add_argument(
        "output",
        type=Path,
        help="Output video path",
    )
    parser.add_argument(
        "--no-watermark-check",
        action="store_true",
        help="Skip watermark detection",
    )
    parser.add_argument(
        "--no-logo",
        action="store_true",
        help="Skip logo watermark overlay",
    )


def _add_preview_parser(subparsers: Any) -> None:
    """Add 'preview' subcommand parser."""
    parser = subparsers.add_parser(
        "preview",
        help="Generate single-frame preview PNG",
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Input video path",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output PNG path. Default: replaces extension with .preview.png",
    )


def _add_batch_parser(subparsers: Any) -> None:
    """Add 'batch' subcommand parser."""
    parser = subparsers.add_parser(
        "batch",
        help="Batch process all videos in a directory",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("input"),
        help="Input directory. Default: input/",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output"),
        help="Output directory. Default: output/",
    )
    parser.add_argument(
        "--progress",
        type=Path,
        default=Path("progress.json"),
        help="Progress file path. Default: progress.json",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of parallel workers. Default: 1",
    )
    parser.add_argument(
        "--no-watermark-check",
        action="store_true",
        help="Skip watermark detection for all videos",
    )
    parser.add_argument(
        "--no-logo",
        action="store_true",
        help="Skip logo watermark overlay",
    )
    parser.add_argument(
        "--retry",
        action="store_true",
        help="Only re-process failed videos",
    )


def _add_report_parser(subparsers: Any) -> None:
    """Add 'report' subcommand parser."""
    parser = subparsers.add_parser(
        "report",
        help="Show batch processing report",
    )
    parser.add_argument(
        "--progress",
        type=Path,
        default=Path("progress.json"),
        help="Progress file path. Default: progress.json",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output"),
        help="Output directory. Default: output/",
    )
    parser.add_argument(
        "--save",
        type=Path,
        default=None,
        help="Save report to file",
    )


def _add_status_parser(subparsers: Any) -> None:
    """Add 'status' subcommand parser."""
    parser = subparsers.add_parser(
        "status",
        help="Show current batch processing status",
    )
    parser.add_argument(
        "--progress",
        type=Path,
        default=Path("progress.json"),
        help="Progress file path. Default: progress.json",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("input"),
        help="Input directory. Default: input/",
    )


def _handle_source(args: argparse.Namespace) -> int:
    """Handle 'source' subcommand."""
    from pipeline.exercise_list import get_exercise_list, slugify
    from pipeline.sourcer import batch_source

    exercises = get_exercise_list(level=args.level)

    if not exercises:
        print("No exercises found.")
        return 1

    if args.dry_run:
        print(f"Found {len(exercises)} exercises:")
        for ex in exercises:
            name = str(ex.get("exercise", ""))
            slug = slugify(name)
            level = str(ex.get("level", ""))
            print(f"  [{level}] {name} -> {slug}.mp4")
        return 0

    stats = batch_source(
        exercises=exercises,
        output_dir=args.output_dir,
        manifest_path=args.manifest,
        rate_limit=args.rate_limit,
    )

    print(f"\nDownloaded: {stats['downloaded']}")
    print(f"Not found: {stats['no_video_found']}")
    print(f"Failed: {stats['failed']}")
    return 0


def _handle_process(args: argparse.Namespace) -> int:
    """Handle 'process' subcommand."""
    from pipeline.processor import process_video

    input_path: Path = args.input
    output_path: Path = args.output

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Determine logo path
    logo_path: Path | None = None
    if args.no_logo:
        logo_path = Path("/dev/null")  # Will fail gracefully in load_watermark

    print(f"Processing: {input_path}")
    result = process_video(
        input_path=input_path,
        output_path=output_path,
        logo_path=logo_path if args.no_logo else None,
        skip_watermark_check=args.no_watermark_check,
    )

    print(f"Status: {result.status}")
    if result.error:
        print(f"Error: {result.error}")
    if result.status == "completed":
        print(f"Output: {output_path}")
        print(f"Duration: {result.output_duration:.1f}s")
        print(f"Size: {result.file_size:,} bytes")
        print(f"Processing time: {result.duration:.1f}s")

    return 0 if result.status == "completed" else 1


def _handle_preview(args: argparse.Namespace) -> int:
    """Handle 'preview' subcommand."""
    from pipeline.processor import preview_frame

    input_path: Path = args.input
    output_path: Path = args.output

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        return 1

    if output_path is None:
        output_path = input_path.with_suffix(".preview.png")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Generating preview: {input_path} -> {output_path}")
    try:
        preview_frame(input_path=input_path, output_path=output_path)
        print(f"Preview saved: {output_path}")
        return 0
    except RuntimeError as exc:
        print(f"Error: {exc}")
        return 1


def _handle_batch(args: argparse.Namespace) -> int:
    """Handle 'batch' subcommand."""
    from pipeline.batch import retry_failed, run_batch
    from pipeline.report import print_report

    input_dir: Path = args.input_dir
    if not input_dir.exists():
        print(f"Error: Input directory not found: {input_dir}")
        return 1

    logo_path: Path | None = None
    if args.no_logo:
        logo_path = Path("/dev/null")

    if args.retry:
        stats = retry_failed(
            input_dir=input_dir,
            output_dir=args.output_dir,
            progress_path=args.progress,
            logo_path=logo_path if args.no_logo else None,
        )
    else:
        stats = run_batch(
            input_dir=input_dir,
            output_dir=args.output_dir,
            progress_path=args.progress,
            logo_path=logo_path if args.no_logo else None,
            max_workers=args.workers,
            skip_watermark_check=args.no_watermark_check,
        )

    print()
    print_report(args.progress, args.output_dir)
    return 0


def _handle_report(args: argparse.Namespace) -> int:
    """Handle 'report' subcommand."""
    from pipeline.report import generate_report, print_report

    if args.save:
        report = generate_report(
            progress_path=args.progress,
            output_dir=args.output_dir,
            report_path=args.save,
        )
        print(report)
        print(f"\nReport saved to: {args.save}")
    else:
        print_report(args.progress, args.output_dir)

    return 0


def _handle_status(args: argparse.Namespace) -> int:
    """Handle 'status' subcommand."""
    from pipeline.batch import get_pending_videos, load_progress

    progress = load_progress(args.progress)
    stats: dict[str, int] = progress.get("stats", {})  # type: ignore[assignment]
    pending_files = get_pending_videos(args.progress, args.input_dir)

    total_tracked = sum(stats.values())
    print(f"Progress file: {args.progress}")
    print(f"Input directory: {args.input_dir}")
    print()
    print(f"Tracked videos: {total_tracked}")
    print(f"  Completed:    {stats.get('completed', 0)}")
    print(f"  Failed:       {stats.get('failed', 0)}")
    print(f"  Flagged:      {stats.get('flagged', 0)}")
    print(f"  Skipped:      {stats.get('skipped', 0)}")
    print(f"  Pending:      {stats.get('pending', 0)}")
    print()
    print(f"Unprocessed in input dir: {len(pending_files)}")

    return 0


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="pipeline",
        description="El Templo Exercise Video Processing Pipeline",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Increase output detail",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    _add_source_parser(subparsers)
    _add_process_parser(subparsers)
    _add_preview_parser(subparsers)
    _add_batch_parser(subparsers)
    _add_report_parser(subparsers)
    _add_status_parser(subparsers)

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    handlers: dict[str, object] = {
        "source": _handle_source,
        "process": _handle_process,
        "preview": _handle_preview,
        "batch": _handle_batch,
        "report": _handle_report,
        "status": _handle_status,
    }

    handler = handlers.get(args.command)
    if handler is None:
        parser.print_help()
        sys.exit(1)

    try:
        exit_code = handler(args)  # type: ignore[operator]
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(130)
    except Exception as exc:
        print(f"Error: {exc}")
        sys.exit(1)
