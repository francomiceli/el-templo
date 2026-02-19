# Phase 28: R2 Video Upload Infrastructure - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Cloudflare R2 bucket setup, upload mechanism (presigned URLs), CDN URL pattern, and exercise video_url population so the existing frontend video player (Phase 26) has actual videos to display. Includes a new Exercise management page in admin app for video uploads. Does NOT include exercise CRUD (create/edit/delete exercises), only video management.

</domain>

<decisions>
## Implementation Decisions

### Upload Workflow

- Primary interface: Admin UI in the browser (no CLI scripts)
- Two upload modes: single-exercise (row action button) and bulk upload (file picker with multi-select)
- Uploads go directly to R2 via presigned URLs (API generates temporary upload URL, browser uploads directly — server never handles video bytes)
- Replace allowed: coach can re-upload a new video, old one deleted from R2
- Delete allowed: coach can remove a video entirely, clearing video_url
- Any admin can upload/replace/delete videos — no special role needed
- Current state: 5 test videos exist. Targeting 300 in next 2 weeks, 1500 total over time

### Bulk Upload

- Filename convention: `{exerciseId}-{name-slug}.mp4` (e.g., `42-sentadilla-bulgara.mp4`). ID used for auto-matching, name slug for human readability
- Validation step: after selecting files, show preview table of matched files -> exercises. Coach reviews matches and confirms before uploading
- Unmatched files (bad filename, unknown ID) shown with option for manual exercise assignment

### Video Format & Processing

- Input format: MP4 (H.264) — all videos will be in this format
- Conditional compression: only process videos that aren't already web-optimized (avoid over-compressing already-compressed videos)
- Hard limits: 20MB max file size, 20 seconds max duration — enforced on upload
- Auto-generate thumbnail: extract a frame as poster image, stored in same R2 bucket under `thumbnails/` prefix

### Admin Exercise Management UX

- New "Ejercicios" page in admin sidebar — exercise management view
- Shows exercise list with essential details: name, category, level, contraction type, video status (has video / no video)
- Full search + filters: search by name, filter by category/level/route AND video status (with/without video)
- Single-exercise upload: action button in each exercise row, opens file picker directly (stays on list page)
- Video preview: click opens video URL in new tab (no inline player in admin)
- Disabled "Crear Ejercicio" button visible but not clickable — placeholder for future exercise CRUD
- No summary stats — filtered list is sufficient

### URL & Storage Organization

- Flat structure in R2: `exercises/{id}.mp4` — single level, no nested folders
- Thumbnails in same bucket: `thumbnails/{id}.jpg`
- video_url column stores R2 key only (e.g., `exercises/42.mp4`), not full URL
- Base CDN URL configured in environment variable, assembled at read time
- Default R2 public URL (pub-xxxxx.r2.dev) — no custom subdomain
- No lifecycle rules: old videos deleted immediately on replace, no version retention

### Claude's Discretion

- Presigned URL implementation details (expiry time, content-type restrictions)
- Web optimization detection heuristic (codec, bitrate thresholds for conditional compression)
- Thumbnail extraction timing (which frame to capture)
- Exact Quasar component choices for upload UI
- R2 bucket configuration details (CORS, public access settings)

</decisions>

<specifics>
## Specific Ideas

- Exercise list page should feel like a standard data management view — table with search/filter bar at top, action buttons per row
- Bulk upload preview table should clearly show which files matched and which didn't, so coaches can fix filenames before uploading
- The 300-video batch import is the primary near-term use case — bulk upload UX should be optimized for this workflow

</specifics>

<deferred>
## Deferred Ideas

- Exercise CRUD (create/edit/delete exercises) — future phase. "Crear Ejercicio" button placed as disabled placeholder
- Custom CDN subdomain (videos.eltemplo.org) — can be added later by changing the env var base URL (R2 key storage makes this painless)
- CSV export of exercise list with IDs for filename reference — not needed, coaches can see IDs in the list

</deferred>

---

_Phase: 28-r2-video-upload-infrastructure_
_Context gathered: 2026-02-19_
