# Phase 25: Exercise Video Processing Pipeline - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a Python pipeline that: (1) sources exercise demonstration videos from the web using exercise names from the DB, and (2) transforms them into a uniform Greek-themed visual style (bronze silhouette on navy background with cream edge glow) using MediaPipe and FFmpeg. The pipeline lives inside the El Templo monorepo and handles 1300+ exercises with batch processing, resume capability, and quality reporting.

Scope expanded during discussion to include video sourcing as a pre-step alongside the processing pipeline.

</domain>

<decisions>
## Implementation Decisions

### Visual Styling

- **Detail level:** Lightly detailed bronze tint with subtle luminance variation — you can tell it's a person but it's stylized (not flat, not fully detailed)
- **Aesthetic:** Greek statue — dignified, classical
- **Bronze tone:** Warm golden-bronze (polished, bright) using brand color #b8956c
- **Background:** Flat solid navy #2c3e5c — no gradient or texture
- **Edge glow:** Subtle cream (#f5f0e8) halo to separate figure from navy background — uniform glow for Phase 25
- **Logo watermark:** Small El Templo logo in a corner — semi-transparent
- **Equipment:** Person only — try to isolate just the person, not equipment (note: MediaPipe will capture held equipment as part of person silhouette — that's acceptable)
- **Single style:** One consistent bronze/navy/cream look for all videos

### Video Sourcing (Pre-Step)

- **Exercise names:** Already in English in the DB — no translation needed
- **Search strategy:** English exercise names searched on YouTube first (curated fitness channels preferred), stock video sites (Pexels, Pixabay) as fallback
- **Curated channels:** Claude researches the best exercise demo channels with clean, single-person demos
- **Automation:** Fully automated batch job — feed exercise list, run overnight, review results after
- **Selection priority:** Single person > clean background > good video quality
- **Download:** Any length accepted — pipeline handles trimming
- **Initial batch:** Start with all alfa-level exercises (check DB for count)
- **Rate limiting:** Built-in configurable delays between searches/downloads to avoid blocks
- **No match handling:** Skip and log as 'no_video_found' in manifest
- **Metadata:** Save source URL for each downloaded video
- **No HTML review page needed** — check output folder manually

### Source Video Handling

- **Format:** Unknown/varied — pipeline must handle whatever comes in
- **Orientation:** Mostly landscape sources expected
- **Trimming:** Auto-detect movement to find exercise demo portion (start/end of exercise)
- **Watermarked videos:** Flag and skip for manual review
- **Filenames:** Exercise name in filename (from sourcing step)

### Output Specifications

- **Resolution:** Portrait 720x1280 — optimized for mobile phone screens
- **Frame rate:** 30fps, consistent regardless of source
- **Codec:** H.264 (AVC) for universal mobile compatibility
- **Audio:** None — silent videos (app handles UI/audio)
- **Duration:** 5-10 second clips
- **Looping:** Hard cut loop for short clips (<5s)
- **Reframing:** Smart crop on person — detect person position in landscape sources, crop around them to fill portrait frame
- **File size:** Smallest useful size — aggressive compression (styled content with flat colors compresses well)
- **Filenames:** Exercise-name slug convention (e.g., bench-press.mp4)
- **Thumbnails:** Generate PNG from middle frame alongside each video
- **Pixel format:** yuv420p with faststart flag for streaming

### CLI Modes & Workflow

- **Project location:** Monorepo subfolder (Claude picks exact path)
- **Batch report:** Generate summary report after batch processing (X processed, Y failed, Z flagged)
- **Resume capability:** progress.json checkpoints for interrupted batch runs

### Claude's Discretion

- Logo watermark position and asset choice
- Equipment handling approach (given MediaPipe limitations)
- Preview mode (single-frame PNG for QA before full batch)
- Project path within monorepo
- Package structure (proper Python package vs scripts)
- CLI invocation style (Python module, Makefile, etc.)
- Dry run mode
- Default verbosity level (with -v flag for detail)
- Crop padding around detected person
- Sourcing tool — separate CLI command within same project or separate module
- Re-process and before/after comparison tools
- Download scope (full video vs extracted demo portion)

</decisions>

<specifics>
## Specific Ideas

- Greek statue aesthetic — dignified, classical bronze museum statue catching light
- Smart crop should detect person bounding box and center them in portrait frame with breathing room for full range of motion
- Body-part-specific glow (medium glow on exercised muscle group) — deferred to future enhancement, requires exercise metadata mapping from Phase 26
- Start batch with alfa-level exercises to validate pipeline before scaling to all 1300+
- Curated YouTube channels for consistent quality exercise demos — Claude should research best channels

</specifics>

<deferred>
## Deferred Ideas

- **Body-part-specific glow:** Medium glow highlighting the exercised body part (e.g., chest glows for bench press). Requires mapping from exercise route/pattern to body regions. Could be added as a re-processing pass once Phase 26 manifest mapping exists. Document this capability in pipeline docs for future implementation.

</deferred>

---

_Phase: 25-exercise-video-processing-pipeline_
_Context gathered: 2026-02-14_
