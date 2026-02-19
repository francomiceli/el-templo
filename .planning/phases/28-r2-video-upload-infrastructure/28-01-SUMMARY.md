---
phase: 28-r2-video-upload-infrastructure
plan: 01
subsystem: api
tags: [r2, cloudflare, s3, presigned-url, ffmpeg, video-upload, fastify-plugin]

# Dependency graph
requires:
  - phase: 26-app-video-integration
    provides: videoUrl column in exercises table, video display in member app
provides:
  - R2 Fastify plugin (fastify.r2 S3Client decorator)
  - VideoService (presigned URLs, upload confirmation, async post-processing, video deletion)
  - ExerciseService (paginated listing with filters)
  - assembleVideoUrl utility for R2 key to full URL resolution
  - Admin API routes for exercise management and video upload
affects: [28-02, 28-03, admin-frontend, member-app-video-display]

# Tech tracking
tech-stack:
  added:
    ["@aws-sdk/client-s3 ^3.994.0", "@aws-sdk/s3-request-presigner ^3.994.0"]
  patterns:
    [
      R2 plugin with graceful no-op,
      fire-and-forget async post-processing,
      assembleVideoUrl at read time,
    ]

key-files:
  created:
    - el-templo-api/src/plugins/r2.ts
    - el-templo-api/src/modules/admin/video-service.ts
    - el-templo-api/src/modules/admin/exercise-service.ts
    - el-templo-api/src/modules/admin/video-schemas.ts
    - el-templo-api/src/modules/shared/video-url.ts
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/index.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/admin/exercise-swap-service.ts
    - el-templo-api/.env.example
    - el-templo-api/package.json

key-decisions:
  - "R2 plugin graceful no-op when env vars missing (dev without R2 config works)"
  - "assembleVideoUrl at read time allows CDN domain changes without DB migration"
  - "Fire-and-forget post-processing pattern for upload-complete endpoint"
  - "requestChecksumCalculation WHEN_REQUIRED for AWS SDK v3.729+ R2 compatibility"

patterns-established:
  - "R2 plugin pattern: fp() with name, graceful skip on missing env, decorates S3Client"
  - "assembleVideoUrl: DB stores R2 keys, full URLs assembled at read time via R2_PUBLIC_URL"
  - "Video route guard: check fastify.r2 existence, return 503 if not configured"

requirements-completed: [SC-01, SC-02, SC-03, SC-04, SC-05, SC-06]

# Metrics
duration: 5min
completed: 2026-02-19
---

# Phase 28 Plan 01: R2 Video Upload Infrastructure Summary

**R2 S3Client plugin with presigned URL upload flow, async ffmpeg post-processing pipeline, paginated exercise listing service, and assembleVideoUrl utility wired across all session/admin API responses**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-19T21:13:59Z
- **Completed:** 2026-02-19T21:19:20Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- R2 Fastify plugin with graceful no-op when env vars missing, S3Client with R2-specific checksum config
- VideoService with full lifecycle: presigned URL generation, upload confirmation with fire-and-forget post-processing (ffprobe metadata, duration validation, conditional H.264 compression, thumbnail extraction), and video deletion
- ExerciseService with paginated, filterable listing (search, category, level, route, effort, hasVideo)
- assembleVideoUrl utility wraps R2 keys with R2_PUBLIC_URL at read time across session API, exercise-swap-service, and admin routes
- 5 new admin API routes: GET /exercises, POST upload-url, POST upload-complete, DELETE video, POST bulk-upload-urls
- All 33 existing integration tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: R2 Fastify plugin, video service, exercise service, and API schemas** - `99a4ac3` (feat)
2. **Task 2: API routes for exercises/videos + assembleVideoUrl for existing consumers** - `ba319d0` (feat)

## Files Created/Modified

- `el-templo-api/src/plugins/r2.ts` - R2 S3Client Fastify plugin with graceful no-op
- `el-templo-api/src/modules/admin/video-service.ts` - Presigned URLs, upload confirmation, async post-processing, video deletion
- `el-templo-api/src/modules/admin/exercise-service.ts` - Paginated exercise listing with filters
- `el-templo-api/src/modules/admin/video-schemas.ts` - JSON schemas for exercise/video endpoints
- `el-templo-api/src/modules/shared/video-url.ts` - assembleVideoUrl and assembleThumbnailUrl utilities
- `el-templo-api/src/app.ts` - R2 plugin registration after database plugin
- `el-templo-api/src/modules/admin/routes.ts` - Exercise management and video upload routes
- `el-templo-api/src/modules/admin/index.ts` - Exports ExerciseService and VideoService
- `el-templo-api/src/modules/sessions/routes.ts` - assembleVideoUrl wrapping in sessionToResponse
- `el-templo-api/src/modules/admin/exercise-swap-service.ts` - assembleVideoUrl in pool results
- `el-templo-api/.env.example` - R2 configuration variables documented
- `el-templo-api/package.json` - @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner dependencies

## Decisions Made

- R2 plugin uses graceful no-op pattern when env vars missing -- dev environments work without R2 config, plugin logs warning and skips
- assembleVideoUrl at read time rather than storing full URLs -- allows CDN domain changes without DB migration
- Post-processing is fire-and-forget -- upload-complete returns immediately, processing runs async with error logging to Sentry-capable logger
- AWS SDK v3 requestChecksumCalculation set to WHEN_REQUIRED for R2 compatibility (v3.729+ checksum fix)
- Video route handlers guard on fastify.r2 existence, returning 503 "Video storage not configured" if R2 plugin skipped

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

External services require manual configuration before video upload functionality works:

**Cloudflare R2:**

1. Create R2 bucket named 'el-templo-videos' (Cloudflare Dashboard -> R2 -> Create bucket)
2. Enable Public Development URL (Cloudflare Dashboard -> R2 -> bucket -> Settings -> Public Development URL -> Enable)
3. Create R2 API Token with read/write permissions (Cloudflare Dashboard -> R2 -> Overview -> Manage R2 API Tokens)
4. Configure CORS on R2 bucket for admin app origins
5. Set environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL

**FFmpeg (Production):**

1. Install FFmpeg on production EC2 instance: `sudo apt install -y ffmpeg`

## Next Phase Readiness

- API infrastructure complete, ready for admin frontend exercise management UI (Plan 02)
- Admin frontend can call GET /exercises, POST upload-url, POST upload-complete, DELETE video
- Member app will automatically show video URLs once exercises have video_url populated and R2_PUBLIC_URL is set

## Self-Check: PASSED

- All 5 created files verified on disk
- Commit 99a4ac3 (Task 1) verified in git log
- Commit ba319d0 (Task 2) verified in git log

---

_Phase: 28-r2-video-upload-infrastructure_
_Completed: 2026-02-19_
