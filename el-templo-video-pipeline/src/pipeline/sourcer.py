"""Video sourcing module for exercise demonstration videos.

Searches YouTube (curated fitness channels first, then broad) and stock
video sites (Pexels, Pixabay) for exercise demo videos. Downloads the
best match with rate limiting and batch processing support.
"""

import json
import os
import time
from pathlib import Path
from typing import TypedDict

import requests as http_requests
import yt_dlp
from dotenv import load_dotenv

# Load .env from pipeline project root
_env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(_env_path)


# ---------- Curated YouTube Channels ----------
# High-quality exercise demonstration channels with clean, single-person demos.
CURATED_CHANNELS: list[str] = [
    "ScottHermanFitness",
    "JEFIT",
    "musaborofficial",  # MuscleWiki's YouTube handle
    "Bodybuilding.com",
    "ACEfitness",
    "NASMAmericas",  # NASM
    "JeffNippard",
    "ataborofficial",  # Athlean-X handle
    "JEFIT",
    "Renaissance Periodization",
    "Mind Pump TV",
    "Buff Dudes",
]

# De-duplicate while preserving order
CURATED_CHANNELS = list(dict.fromkeys(CURATED_CHANNELS))


# ---------- Type Definitions ----------
class VideoInfo(TypedDict, total=False):
    """Information about a found video source."""

    url: str
    title: str
    duration: float
    channel: str
    source: str  # "youtube" | "pexels" | "pixabay"


class SourcingResult(TypedDict, total=False):
    """Result of sourcing a single exercise video."""

    exercise: str
    slug: str
    status: str  # "downloaded" | "no_video_found" | "download_failed"
    source_url: str
    source: str  # "youtube" | "pexels" | "pixabay"
    filename: str
    error: str


class BatchStats(TypedDict):
    """Statistics from a batch sourcing run."""

    total: int
    downloaded: int
    no_video_found: int
    failed: int
    skipped: int


# ---------- YouTube Search ----------
def search_youtube(
    exercise_name: str, curated_only: bool = True
) -> VideoInfo | None:
    """Search YouTube for an exercise demonstration video.

    Strategy:
    - First: search within curated fitness channels
    - If curated_only=False and no curated result: broad YouTube search

    Args:
        exercise_name: Name of the exercise to search for.
        curated_only: If True, only search curated channels. If False,
                      fall back to broad search when curated yields no result.

    Returns:
        VideoInfo dict with url, title, duration, channel, source, or None.
    """
    # Try curated channels first
    result = _search_youtube_curated(exercise_name)
    if result is not None:
        return result

    # Broad search fallback
    if not curated_only:
        result = _search_youtube_broad(exercise_name)
        if result is not None:
            return result

    return None


def _search_youtube_curated(exercise_name: str) -> VideoInfo | None:
    """Search curated channels for the exercise."""
    for channel in CURATED_CHANNELS:
        query = f"{exercise_name} exercise {channel}"
        result = _youtube_search(query, max_results=3)
        if result is not None:
            return result
    return None


def _search_youtube_broad(exercise_name: str) -> VideoInfo | None:
    """Broad YouTube search for exercise demo."""
    query = f'"{exercise_name}" exercise demonstration'
    return _youtube_search(query, max_results=5)


def _youtube_search(query: str, max_results: int = 3) -> VideoInfo | None:
    """Execute a YouTube search via yt-dlp and return the first valid result.

    Args:
        query: Search query string.
        max_results: Maximum number of results to evaluate.

    Returns:
        VideoInfo dict or None if no suitable result found.
    """
    ydl_opts: dict[str, object] = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
        "format": "best[height<=1080]",
        "default_search": f"ytsearch{max_results}",
        "ignoreerrors": True,
        "no_color": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(query, download=False)

            if info is None:
                return None

            entries: list[dict[str, object]] = []
            if "entries" in info:
                entries = [e for e in info["entries"] if e is not None]
            else:
                entries = [info]

            for entry in entries:
                title = str(entry.get("title", ""))
                duration = float(entry.get("duration", 0) or 0)
                webpage_url = str(entry.get("webpage_url", ""))
                channel_name = str(entry.get("channel", entry.get("uploader", "")))

                # Skip very short or very long videos
                if duration < 10 or duration > 600:
                    continue

                # Skip if no URL
                if not webpage_url:
                    continue

                return VideoInfo(
                    url=webpage_url,
                    title=title,
                    duration=duration,
                    channel=channel_name,
                    source="youtube",
                )

    except Exception as exc:
        print(f"  [YouTube] Search error for '{query}': {exc}")

    return None


# ---------- Stock Site Search ----------
def search_stock_sites(exercise_name: str) -> VideoInfo | None:
    """Search Pexels and Pixabay for exercise demo videos.

    Skips each site gracefully if its API key is not set.

    Args:
        exercise_name: Name of the exercise to search for.

    Returns:
        VideoInfo dict or None if no suitable result found.
    """
    # Try Pexels first
    result = _search_pexels(exercise_name)
    if result is not None:
        return result

    # Try Pixabay
    result = _search_pixabay(exercise_name)
    if result is not None:
        return result

    return None


def _search_pexels(exercise_name: str) -> VideoInfo | None:
    """Search Pexels video API."""
    api_key = os.environ.get("PEXELS_API_KEY", "").strip()
    if not api_key:
        return None

    try:
        response = http_requests.get(
            "https://api.pexels.com/videos/search",
            headers={"Authorization": api_key},
            params={
                "query": f"{exercise_name} exercise",
                "per_page": 5,
                "orientation": "landscape",
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

        videos: list[dict[str, object]] = data.get("videos", [])
        for video in videos:
            # Get the best quality video file
            video_files: list[dict[str, object]] = video.get("video_files", [])
            best_file = _pick_best_pexels_file(video_files)
            if best_file is None:
                continue

            duration = float(video.get("duration", 0) or 0)
            if duration < 3 or duration > 120:
                continue

            return VideoInfo(
                url=str(best_file.get("link", "")),
                title=str(video.get("url", "")),
                duration=duration,
                channel="Pexels",
                source="pexels",
            )

    except Exception as exc:
        print(f"  [Pexels] Search error for '{exercise_name}': {exc}")

    return None


def _pick_best_pexels_file(
    video_files: list[dict[str, object]],
) -> dict[str, object] | None:
    """Pick the best quality Pexels video file (prefer HD, max 1080p)."""
    candidates = []
    for vf in video_files:
        height = int(vf.get("height", 0) or 0)
        if 360 <= height <= 1080:
            candidates.append(vf)

    if not candidates:
        return None

    # Sort by height descending, prefer higher quality
    candidates.sort(key=lambda x: int(x.get("height", 0) or 0), reverse=True)
    return candidates[0]


def _search_pixabay(exercise_name: str) -> VideoInfo | None:
    """Search Pixabay video API."""
    api_key = os.environ.get("PIXABAY_API_KEY", "").strip()
    if not api_key:
        return None

    try:
        response = http_requests.get(
            "https://pixabay.com/api/videos/",
            params={
                "key": api_key,
                "q": f"{exercise_name} exercise",
                "per_page": 5,
                "video_type": "film",
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

        hits: list[dict[str, object]] = data.get("hits", [])
        for hit in hits:
            duration = float(hit.get("duration", 0) or 0)
            if duration < 3 or duration > 120:
                continue

            # Get medium quality video URL
            videos_dict: dict[str, dict[str, object]] = hit.get("videos", {})
            medium = videos_dict.get("medium", {})
            video_url = str(medium.get("url", ""))

            if not video_url:
                # Fall back to large
                large = videos_dict.get("large", {})
                video_url = str(large.get("url", ""))

            if not video_url:
                continue

            return VideoInfo(
                url=video_url,
                title=str(hit.get("tags", "")),
                duration=duration,
                channel="Pixabay",
                source="pixabay",
            )

    except Exception as exc:
        print(f"  [Pixabay] Search error for '{exercise_name}': {exc}")

    return None


# ---------- Video Download ----------
def download_video(video_info: VideoInfo, output_path: Path) -> bool:
    """Download a video to the specified output path.

    For YouTube: uses yt-dlp with format selection.
    For stock sites: direct HTTP download.

    Args:
        video_info: Video information dict with url and source.
        output_path: Path to save the downloaded video.

    Returns:
        True on success, False on failure.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    source = video_info.get("source", "")

    try:
        if source == "youtube":
            return _download_youtube(video_info["url"], output_path)
        elif source in ("pexels", "pixabay"):
            return _download_http(video_info["url"], output_path)
        else:
            print(f"  [Download] Unknown source: {source}")
            return False
    except Exception as exc:
        print(f"  [Download] Error downloading {video_info.get('url', '')}: {exc}")
        return False


def _download_youtube(url: str, output_path: Path) -> bool:
    """Download a YouTube video using yt-dlp."""
    # Remove extension since yt-dlp adds it based on format
    output_template = str(output_path.with_suffix(""))

    ydl_opts: dict[str, object] = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        "outtmpl": output_template + ".%(ext)s",
        "merge_output_format": "mp4",
        "no_color": True,
        "postprocessors": [
            {
                "key": "FFmpegVideoConvertor",
                "prefered_format": "mp4",
            }
        ],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        result = ydl.download([url])

    # yt-dlp may create the file with a different name, find it
    expected_mp4 = output_path.with_suffix(".mp4")
    if expected_mp4.exists():
        # Rename to exact target if needed
        if expected_mp4 != output_path:
            expected_mp4.rename(output_path)
        return True

    # Check if any file was created with the template prefix
    parent = output_path.parent
    stem = output_path.stem
    for candidate in parent.iterdir():
        if candidate.stem == stem and candidate.suffix in (".mp4", ".mkv", ".webm"):
            candidate.rename(output_path)
            return True

    return result == 0


def _download_http(url: str, output_path: Path) -> bool:
    """Download a video via direct HTTP request."""
    response = http_requests.get(url, timeout=120, stream=True)
    response.raise_for_status()

    with open(output_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    return output_path.exists() and output_path.stat().st_size > 0


# ---------- Single Exercise Sourcing ----------
def source_exercise_video(
    exercise_name: str,
    output_dir: Path,
    slug: str,
    rate_limit_seconds: float = 2.0,
) -> SourcingResult:
    """Orchestrate full video sourcing for a single exercise.

    Search order:
    1. YouTube curated channels
    2. YouTube broad search
    3. Stock sites (Pexels, Pixabay)

    Args:
        exercise_name: Name of the exercise.
        output_dir: Directory to save downloaded video.
        slug: Filename slug for the video.
        rate_limit_seconds: Seconds to wait between searches.

    Returns:
        SourcingResult dict with exercise, slug, status, source_url, source, filename.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{slug}.mp4"

    result = SourcingResult(
        exercise=exercise_name,
        slug=slug,
        status="no_video_found",
    )

    print(f"  Searching for: {exercise_name} ({slug})")

    # Step 1: YouTube curated channels
    print("    -> YouTube (curated)...")
    video_info = search_youtube(exercise_name, curated_only=True)
    time.sleep(rate_limit_seconds)

    # Step 2: YouTube broad
    if video_info is None:
        print("    -> YouTube (broad)...")
        video_info = search_youtube(exercise_name, curated_only=False)
        time.sleep(rate_limit_seconds)

    # Step 3: Stock sites
    if video_info is None:
        print("    -> Stock sites...")
        video_info = search_stock_sites(exercise_name)
        time.sleep(rate_limit_seconds)

    # No video found anywhere
    if video_info is None:
        print(f"    [!] No video found for '{exercise_name}'")
        result["status"] = "no_video_found"
        return result

    # Download the found video
    print(f"    -> Downloading from {video_info['source']}: {video_info.get('title', '')[:60]}")
    success = download_video(video_info, output_path)

    if success:
        result["status"] = "downloaded"
        result["source_url"] = video_info["url"]
        result["source"] = video_info["source"]
        result["filename"] = f"{slug}.mp4"
        print(f"    [OK] Downloaded: {slug}.mp4")
    else:
        result["status"] = "download_failed"
        result["source_url"] = video_info["url"]
        result["source"] = video_info["source"]
        result["error"] = "Download failed"
        print(f"    [!] Download failed for '{exercise_name}'")

    return result


# ---------- Batch Sourcing ----------
def _load_manifest(manifest_path: Path) -> list[SourcingResult]:
    """Load existing manifest from JSON file."""
    if manifest_path.exists():
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _save_manifest(manifest_path: Path, manifest: list[SourcingResult]) -> None:
    """Save manifest to JSON file."""
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def batch_source(
    exercises: list[dict[str, str | int | None]],
    output_dir: Path,
    manifest_path: Path,
    rate_limit: float = 3.0,
) -> BatchStats:
    """Batch source videos for a list of exercises.

    Iterates through exercises, calls source_exercise_video for each.
    Writes results to a JSON manifest file (append/update, not overwrite).
    Skips exercises already in manifest with status "downloaded".

    Args:
        exercises: List of exercise dicts with at least 'exercise' and 'id' keys.
        output_dir: Directory to save downloaded videos.
        manifest_path: Path to the JSON manifest file.
        rate_limit: Seconds to wait between exercise searches.

    Returns:
        BatchStats dict with total, downloaded, no_video_found, failed, skipped counts.
    """
    from .exercise_list import slugify

    manifest = _load_manifest(manifest_path)

    # Build lookup of already-downloaded slugs
    downloaded_slugs: set[str] = set()
    for entry in manifest:
        if entry.get("status") == "downloaded":
            slug_val = entry.get("slug", "")
            if slug_val:
                downloaded_slugs.add(slug_val)

    stats = BatchStats(
        total=len(exercises),
        downloaded=0,
        no_video_found=0,
        failed=0,
        skipped=0,
    )

    print(f"\nBatch sourcing: {len(exercises)} exercises")
    print(f"Output: {output_dir}")
    print(f"Manifest: {manifest_path}")
    print(f"Already downloaded: {len(downloaded_slugs)}")
    print("-" * 60)

    for i, exercise in enumerate(exercises, 1):
        exercise_name = str(exercise.get("exercise", ""))
        slug = slugify(exercise_name)

        if not exercise_name or not slug:
            continue

        # Skip already downloaded
        if slug in downloaded_slugs:
            print(f"[{i}/{len(exercises)}] SKIP: {exercise_name} (already downloaded)")
            stats["skipped"] += 1
            continue

        print(f"\n[{i}/{len(exercises)}] {exercise_name}")

        result = source_exercise_video(
            exercise_name=exercise_name,
            output_dir=output_dir,
            slug=slug,
            rate_limit_seconds=rate_limit,
        )

        # Add exercise metadata to result
        result["exercise"] = exercise_name

        # Update manifest: remove old entry for same slug, add new one
        manifest = [e for e in manifest if e.get("slug") != slug]
        manifest.append(result)

        # Update stats
        status = result.get("status", "")
        if status == "downloaded":
            stats["downloaded"] += 1
        elif status == "no_video_found":
            stats["no_video_found"] += 1
        elif status == "download_failed":
            stats["failed"] += 1

        # Save manifest after each exercise (checkpoint)
        _save_manifest(manifest_path, manifest)

    print("\n" + "=" * 60)
    print(f"Batch complete:")
    print(f"  Total: {stats['total']}")
    print(f"  Downloaded: {stats['downloaded']}")
    print(f"  No video found: {stats['no_video_found']}")
    print(f"  Failed: {stats['failed']}")
    print(f"  Skipped: {stats['skipped']}")
    print("=" * 60)

    return stats
