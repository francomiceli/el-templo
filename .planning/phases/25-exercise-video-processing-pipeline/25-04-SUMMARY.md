# Plan 25-04: Batch Runner, CLI Entry Point, Progress Checkpointing, Report

## Status: COMPLETE

## What was built

Batch processing engine, summary report generator, and CLI interface tying all pipeline components together.

## Key files

### Created

- `el-templo-video-pipeline/src/pipeline/batch.py` — Batch processing with progress.json checkpointing after each video, resume capability (skips completed), retry mode (re-processes failed), parallel processing via ProcessPoolExecutor, graceful KeyboardInterrupt handling
- `el-templo-video-pipeline/src/pipeline/report.py` — Formatted text report with completion stats, failed video list, flagged-for-review list, file size/duration averages
- `el-templo-video-pipeline/src/pipeline/cli.py` — argparse CLI with 6 subcommands: source, process, preview, batch, report, status. Entry point registered as `pipeline` in pyproject.toml

### Modified

- None

## Commits

1. `a993783` — feat(25-04): add batch processor with progress checkpointing and report generator
2. `7bf91cb` — feat(25-04): add CLI entry point with 6 subcommands

## Decisions

- Used `StrEnum` for VideoStatus for clean string comparisons
- Atomic progress.json writes via temp file + rename to prevent corruption
- Sequential processing by default (max_workers=1) since MediaPipe + OpenCV are memory-intensive
- `from __future__ import annotations` + `Any` for subparsers type annotation (Python 3.12 `_SubParsersAction` not subscriptable at runtime)

## Deviations

- Used `Any` type for argparse subparsers parameter instead of `argparse._SubParsersAction[ArgumentParser]` due to Python 3.12 runtime subscriptability issue

## Self-Check: PASSED

- [x] batch.py progress checkpoint load/save/update cycle verified
- [x] `uv run pipeline --help` shows all 6 subcommands
- [x] `uv run pipeline source --help` shows --level, --output-dir, --rate-limit flags
- [x] `uv run pipeline batch --help` shows --input-dir, --output-dir, --workers, --retry flags
