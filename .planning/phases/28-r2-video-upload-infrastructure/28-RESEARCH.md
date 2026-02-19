# Phase 28: R2 Video Upload Infrastructure - Research

**Researched:** 2026-02-19
**Domain:** Cloudflare R2 object storage, presigned URL uploads, admin exercise management UI, video post-processing (thumbnails, conditional compression)
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Primary interface: Admin UI in the browser (no CLI scripts)
- Two upload modes: single-exercise (row action button) and bulk upload (file picker with multi-select)
- Uploads go directly to R2 via presigned URLs (API generates temporary upload URL, browser uploads directly -- server never handles video bytes)
- Replace allowed: coach can re-upload a new video, old one deleted from R2
- Delete allowed: coach can remove a video entirely, clearing video_url
- Any admin can upload/replace/delete videos -- no special role needed
- Current state: 5 test videos exist. Targeting 300 in next 2 weeks, 1500 total over time
- Filename convention: `{exerciseId}-{name-slug}.mp4` (e.g., `42-sentadilla-bulgara.mp4`). ID used for auto-matching, name slug for human readability
- Validation step: after selecting files, show preview table of matched files -> exercises. Coach reviews matches and confirms before uploading
- Unmatched files (bad filename, unknown ID) shown with option for manual exercise assignment
- Input format: MP4 (H.264) -- all videos will be in this format
- Conditional compression: only process videos that aren't already web-optimized (avoid over-compressing already-compressed videos)
- Hard limits: 20MB max file size, 20 seconds max duration -- enforced on upload
- Auto-generate thumbnail: extract a frame as poster image, stored in same R2 bucket under `thumbnails/` prefix
- New "Ejercicios" page in admin sidebar -- exercise management view
- Shows exercise list with essential details: name, category, level, contraction type, video status (has video / no video)
- Full search + filters: search by name, filter by category/level/route AND video status (with/without video)
- Single-exercise upload: action button in each exercise row, opens file picker directly (stays on list page)
- Video preview: click opens video URL in new tab (no inline player in admin)
- Disabled "Crear Ejercicio" button visible but not clickable -- placeholder for future exercise CRUD
- No summary stats -- filtered list is sufficient
- Flat structure in R2: `exercises/{id}.mp4` -- single level, no nested folders
- Thumbnails in same bucket: `thumbnails/{id}.jpg`
- video_url column stores R2 key only (e.g., `exercises/42.mp4`), not full URL
- Base CDN URL configured in environment variable, assembled at read time
- Default R2 public URL (pub-xxxxx.r2.dev) -- no custom subdomain
- No lifecycle rules: old videos deleted immediately on replace, no version retention

### Claude's Discretion

- Presigned URL implementation details (expiry time, content-type restrictions)
- Web optimization detection heuristic (codec, bitrate thresholds for conditional compression)
- Thumbnail extraction timing (which frame to capture)
- Exact Quasar component choices for upload UI
- R2 bucket configuration details (CORS, public access settings)

### Deferred Ideas (OUT OF SCOPE)

- Exercise CRUD (create/edit/delete exercises) -- future phase. "Crear Ejercicio" button placed as disabled placeholder
- Custom CDN subdomain (videos.eltemplo.org) -- can be added later by changing the env var base URL (R2 key storage makes this painless)
- CSV export of exercise list with IDs for filename reference -- not needed, coaches can see IDs in the list
  </user_constraints>

## Summary

This phase adds Cloudflare R2 object storage to the El Templo monorepo, enabling coaches to upload exercise demonstration videos through the admin app. The architecture is straightforward: the API generates presigned PUT URLs using the AWS S3-compatible SDK, the browser uploads directly to R2 (no video bytes through the server), and after upload the API triggers server-side post-processing (thumbnail extraction and conditional compression via FFmpeg). The admin app gets a new "Ejercicios" page with a QTable-based exercise list, search/filter capabilities, and both single and bulk upload workflows.

The technology stack is mature and well-documented. Cloudflare R2 is fully S3-compatible, meaning `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` work directly. The existing codebase already has the `video_url` column on the exercises table (Phase 26 migration 0014), the VideoPlaceholder component in the member app, and the green videocam badge in the admin's ExercisePoolItem. This phase populates that infrastructure with actual video data.

The primary complexity areas are: (1) the bulk upload UX with filename-to-exercise matching and validation preview, (2) server-side post-processing after upload (conditional compression + thumbnail extraction requires FFmpeg on the server), and (3) the R2 presigned URL flow with proper CORS configuration. All three have well-established patterns.

**Primary recommendation:** Use `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` for R2 operations, spawn `ffprobe`/`ffmpeg` via Node.js `child_process.execFile` for video analysis and thumbnail extraction (no wrapper library needed), and build the admin exercise page with Quasar's `QTable` + server-side pagination matching the existing SessionsPage pattern.

## Standard Stack

### Core (API)

| Library                         | Version | Purpose                                                           | Why Standard                                                            |
| ------------------------------- | ------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `@aws-sdk/client-s3`            | ^3.700+ | S3-compatible client for R2 (PutObject, DeleteObject, HeadObject) | Official AWS SDK; R2 is S3-compatible; Cloudflare's recommended client  |
| `@aws-sdk/s3-request-presigner` | ^3.700+ | Generate presigned PUT URLs for direct browser upload             | Companion to client-s3; only way to generate presigned URLs server-side |
| `ffmpeg` (system binary)        | 6.x+    | Thumbnail extraction, conditional compression, video probe        | Universal standard for video processing; called via child_process       |

### Core (Admin Frontend)

| Library         | Version             | Purpose                                                    | Why Standard                                           |
| --------------- | ------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Quasar `QTable` | (already installed) | Exercise list with server-side pagination, search, filters | Already used for SessionsPage; native Quasar component |
| Quasar `QFile`  | (already installed) | File picker for single/bulk upload                         | Native Quasar file input component                     |
| `axios`         | (already installed) | Presigned URL PUT upload from browser                      | Already used for all API calls in admin app            |

### Supporting

| Library                | Version | Purpose                          | When to Use                                                                       |
| ---------------------- | ------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `@aws-sdk/lib-storage` | ^3.700+ | Multipart upload for large files | Only if single PUT exceeds R2 limits (5GB single PUT; not needed for 20MB videos) |

### Alternatives Considered

| Instead of                | Could Use                     | Tradeoff                                                                                                                              |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@aws-sdk/client-s3`      | Cloudflare Workers R2 binding | Workers binding requires Cloudflare Workers runtime; SDK works from any Node.js server                                                |
| `child_process` + ffmpeg  | `fluent-ffmpeg` npm package   | **Archived May 2025**, no longer maintained; direct subprocess is more reliable                                                       |
| `child_process` + ffmpeg  | `ffmpeg.wasm` (WebAssembly)   | Runs in browser but much slower; server-side processing is more appropriate for this use case                                         |
| Direct `fetch` for upload | `QUploader` component         | QUploader has a factory prop for custom URLs but adds complexity; direct `axios.put` to presigned URL is simpler and more transparent |

**Installation (API):**

```bash
cd el-templo-api && pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**System dependency (server):**

```bash
# FFmpeg must be available on the production EC2 instance
sudo apt install ffmpeg
```

No new frontend dependencies needed -- Quasar components and axios are already installed.

## Architecture Patterns

### API Module Structure

```
el-templo-api/src/
├── modules/
│   ├── admin/
│   │   ├── routes.ts              # Existing - add exercise + upload routes
│   │   ├── exercise-service.ts    # NEW - exercise listing, search, filters
│   │   └── video-service.ts       # NEW - R2 operations, presigned URLs, post-processing
│   └── ...
├── plugins/
│   └── r2.ts                      # NEW - Fastify plugin decorating app with R2 client
└── ...
```

### Admin Frontend Structure

```
el-templo-admin/src/
├── pages/
│   └── ExercisesPage.vue          # NEW - exercise list with search/filter/upload
├── composables/
│   └── useVideoUpload.ts          # NEW - presigned URL upload logic
├── types/
│   └── exercise.ts                # NEW - exercise list types
└── ...
```

### Pattern 1: R2 Client as Fastify Plugin

**What:** Instantiate the S3Client once at app startup, decorate it onto the Fastify instance.
**When to use:** Whenever R2 operations are needed from any route handler.
**Why:** Matches the existing pattern (database plugin decorates `fastify.db`).

```typescript
// Source: Cloudflare R2 docs + existing databasePlugin pattern
import { S3Client } from "@aws-sdk/client-s3";
import fp from "fastify-plugin";

export default fp(async (fastify) => {
  const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // Workaround for AWS SDK v3.729+ checksum change
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  fastify.decorate("r2", r2Client);
  fastify.decorate("r2Bucket", process.env.R2_BUCKET_NAME!);
});
```

### Pattern 2: Presigned URL Upload Flow

**What:** API generates presigned PUT URL -> browser uploads directly to R2 -> API receives confirmation and triggers post-processing.
**When to use:** For all video uploads (single and bulk).

```
Browser                          API                           R2
  |                               |                            |
  |-- POST /admin/exercises/:id/upload-url -->                 |
  |                               |-- generate presigned PUT --|
  |<-- { uploadUrl, key } --------|                            |
  |                               |                            |
  |-- PUT uploadUrl (video bytes) --------------------------->|
  |<-- 200 OK -------------------------------------------------|
  |                               |                            |
  |-- POST /admin/exercises/:id/upload-complete -->            |
  |                               |-- update video_url in DB   |
  |                               |-- trigger post-processing  |
  |<-- { success, videoUrl } -----|                            |
```

### Pattern 3: Post-Processing Pipeline (Thumbnail + Conditional Compression)

**What:** After upload confirmation, API downloads video from R2, probes it, conditionally compresses, extracts thumbnail, uploads results back to R2.
**When to use:** Triggered by upload-complete endpoint.

```typescript
// Probe video metadata with ffprobe
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function probeVideo(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    filePath,
  ]);
  const data = JSON.parse(stdout);
  const videoStream = data.streams.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  return {
    codec: videoStream?.codec_name,
    bitrate: parseInt(videoStream?.bit_rate || data.format?.bit_rate || "0"),
    duration: parseFloat(data.format?.duration || "0"),
    width: videoStream?.width,
    height: videoStream?.height,
  };
}
```

### Pattern 4: Video URL Assembly at Read Time

**What:** Store only the R2 key in the database (`exercises/42.mp4`), assemble full URL when returning to clients.
**When to use:** All API responses that include video URLs.

```typescript
// In session routes or exercise service
function assembleVideoUrl(key: string | null): string | null {
  if (!key) return null;
  const baseUrl = process.env.R2_PUBLIC_URL; // e.g., https://pub-xxxxx.r2.dev
  return `${baseUrl}/${key}`;
}
```

**Impact:** The existing `sessionToResponse` function in `el-templo-api/src/modules/sessions/routes.ts` currently passes `ex.videoUrl` directly. It will need to wrap this with `assembleVideoUrl()` to convert R2 keys to full URLs.

### Anti-Patterns to Avoid

- **Streaming video bytes through the API server:** The presigned URL pattern exists precisely to avoid this. The API should never receive or forward video data.
- **Storing full URLs in the database:** Storing `https://pub-xxxxx.r2.dev/exercises/42.mp4` means changing the CDN domain later requires a mass database update. Store keys only.
- **Synchronous post-processing in the upload-complete handler:** Thumbnail extraction and compression should not block the HTTP response. Use a background job or fire-and-forget pattern with error logging.
- **Using fluent-ffmpeg:** Archived as of May 2025. Use `child_process.execFile` directly with ffmpeg/ffprobe.

## Don't Hand-Roll

| Problem                       | Don't Build                        | Use Instead                                   | Why                                               |
| ----------------------------- | ---------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| S3/R2 presigned URL signing   | Custom HMAC-SHA256 signing         | `@aws-sdk/s3-request-presigner`               | AWS Signature V4 is complex with many edge cases  |
| Video metadata extraction     | Parse binary video headers         | `ffprobe` (system binary)                     | Handles all container formats, codecs, edge cases |
| Video compression             | Raw FFmpeg command strings         | `child_process.execFile` with argument arrays | Prevents shell injection, handles spaces in paths |
| File upload progress tracking | Custom XMLHttpRequest              | `axios.put` with `onUploadProgress`           | Already in the project, handles progress natively |
| R2 client lifecycle           | Per-request S3Client instantiation | Fastify plugin (single instance)              | Connection reuse, proper cleanup                  |

**Key insight:** R2 is S3-compatible, so the entire AWS S3 ecosystem of tools, docs, and patterns applies directly. Don't invent custom solutions when the S3 SDK handles it.

## Common Pitfalls

### Pitfall 1: AWS SDK v3.729+ Checksum Breaking Change

**What goes wrong:** `@aws-sdk/client-s3` v3.729.0+ enables CRC32 checksums by default. R2 does not support CRC32, causing `Header 'x-amz-checksum-algorithm' with value 'CRC32' not implemented` errors on PutObject.
**Why it happens:** AWS changed the default behavior in their SDK to always calculate checksums.
**How to avoid:** Set `requestChecksumCalculation: "WHEN_REQUIRED"` and `responseChecksumValidation: "WHEN_REQUIRED"` in S3Client constructor.
**Warning signs:** 400/403 errors on upload with "checksum" or "x-amz-checksum-algorithm" in the error message.

### Pitfall 2: CORS Misconfiguration for Presigned URL Uploads

**What goes wrong:** Browser-based presigned URL uploads fail with CORS errors even though the presigned URL is valid.
**Why it happens:** Presigned URLs use the S3 API domain (`ACCOUNT_ID.r2.cloudflarestorage.com`), not the public bucket URL. CORS must be configured on the bucket for the admin app origin, allowing PUT method and Content-Type header.
**How to avoid:** Configure CORS on the R2 bucket explicitly:

```json
[
  {
    "AllowedOrigins": ["https://admin.eltemplo.org", "http://localhost:9100"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Warning signs:** `Access-Control-Allow-Origin` missing in preflight response; upload works via curl but fails in browser.

### Pitfall 3: Content-Type Mismatch on Presigned URL

**What goes wrong:** Presigned URL generated with `ContentType: "video/mp4"` but browser sends a different Content-Type, causing signature mismatch (403 error).
**Why it happens:** The Content-Type is part of the signature. If the browser or axios sends `application/octet-stream` instead of `video/mp4`, the signature is invalid.
**How to avoid:** When generating the presigned URL, include `ContentType: "video/mp4"`. When uploading from the browser, explicitly set `Content-Type: "video/mp4"` in the axios PUT request headers.
**Warning signs:** 403 SignatureDoesNotMatch on upload; works with curl (which doesn't auto-set Content-Type).

### Pitfall 4: FFmpeg Not Available on Production Server

**What goes wrong:** Thumbnail generation and conditional compression fail silently or crash the API.
**Why it happens:** FFmpeg is not installed by default on EC2 instances.
**How to avoid:** Add `sudo apt install -y ffmpeg` to the server provisioning script. Add a health check that verifies ffmpeg is available at startup.
**Warning signs:** `ENOENT` error from `execFile("ffmpeg", ...)`.

### Pitfall 5: Presigned URLs Cannot Use Custom Domains

**What goes wrong:** Attempting to generate presigned URLs using the public R2 domain (`pub-xxxxx.r2.dev`) or a custom domain fails.
**Why it happens:** Presigned URLs only work with the S3 API endpoint (`ACCOUNT_ID.r2.cloudflarestorage.com`), not with public/custom domains.
**How to avoid:** Always use the S3 API endpoint for presigned URL generation. Use the public domain only for reading/serving files.
**Warning signs:** Presigned URL upload returns 403 or connection refused.

### Pitfall 6: Blocking the Event Loop with Post-Processing

**What goes wrong:** FFmpeg thumbnail extraction and compression block the API server, causing timeouts for other requests.
**Why it happens:** Even though `execFile` is async, heavy FFmpeg operations can still impact Node.js if too many run concurrently.
**How to avoid:** Process post-processing asynchronously (fire-and-forget from the upload-complete handler), limit concurrency, and set timeouts on FFmpeg operations. Consider a simple queue for bulk uploads.
**Warning signs:** API response times spike during bulk upload sessions.

## Code Examples

### Generating a Presigned Upload URL

```typescript
// Source: Cloudflare R2 Presigned URLs docs
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

async function generateUploadUrl(
  r2Client: S3Client,
  bucket: string,
  key: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: "video/mp4",
  });
  // 15-minute expiry is enough for a single upload
  return getSignedUrl(r2Client, command, { expiresIn: 900 });
}
```

### Deleting an Object from R2

```typescript
// Source: Cloudflare R2 Delete Objects docs
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

async function deleteFromR2(
  r2Client: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
```

### Browser Upload to Presigned URL (Admin App)

```typescript
// Direct PUT to presigned URL using axios
import { api } from "src/boot/axios";
import axios from "axios";

async function uploadVideo(
  exerciseId: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  // Step 1: Get presigned URL from API
  const { data } = await api.post(`/admin/exercises/${exerciseId}/upload-url`, {
    filename: file.name,
    contentType: file.type,
  });

  // Step 2: Upload directly to R2 (no auth header -- presigned URL has credentials)
  await axios.put(data.uploadUrl, file, {
    headers: { "Content-Type": "video/mp4" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });

  // Step 3: Confirm upload to API
  await api.post(`/admin/exercises/${exerciseId}/upload-complete`, {
    key: data.key,
  });
}
```

### Thumbnail Extraction with FFmpeg

```typescript
// Extract frame at 25% duration as JPEG thumbnail
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function extractThumbnail(
  inputPath: string,
  outputPath: string,
  durationSeconds: number,
): Promise<void> {
  const timestamp = Math.max(0, durationSeconds * 0.25);
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    timestamp.toString(),
    "-i",
    inputPath,
    "-vframes",
    "1",
    "-q:v",
    "5", // Quality 5 = good balance for thumbnails
    "-vf",
    "scale=320:-2", // 320px wide, maintain aspect ratio
    outputPath,
  ]);
}
```

### Conditional Compression Heuristic

```typescript
// Determine if a video needs compression based on codec and bitrate
interface VideoMetadata {
  codec: string;
  bitrate: number;
  duration: number;
  width: number;
  height: number;
}

function needsCompression(meta: VideoMetadata): boolean {
  // Already H.264 and reasonable bitrate? Skip compression.
  const isH264 = meta.codec === "h264";
  // Target: ~2 Mbps for 720p web video is well-optimized
  // Over 4 Mbps for 720p suggests room for compression
  const maxBitrate = meta.height <= 720 ? 4_000_000 : 6_000_000;
  if (isH264 && meta.bitrate <= maxBitrate) {
    return false; // Already web-optimized
  }
  return true;
}

async function compressVideo(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-crf",
      "28", // Good web compression quality
      "-preset",
      "medium",
      "-vf",
      "scale='min(720,ih)':-2", // Cap at 720p height
      "-movflags",
      "+faststart", // Web optimization: moov atom at start
      "-an", // Strip audio (exercise demos don't need audio)
      outputPath,
    ],
    { timeout: 120_000 },
  ); // 2-minute timeout per video
}
```

### Exercise Listing API Endpoint Pattern

```typescript
// Following the existing getSessionsSchema pattern
export const listExercisesSchema = {
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      search: { type: "string" },
      category: { type: "string" },
      level: { type: "string" },
      route: { type: "string" },
      effort: { type: "string" },
      hasVideo: { type: "boolean" },
    },
  },
};
```

## State of the Art

| Old Approach                | Current Approach                               | When Changed                      | Impact                                                                      |
| --------------------------- | ---------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `fluent-ffmpeg` npm package | Direct `child_process.execFile("ffmpeg", ...)` | May 2025 (fluent-ffmpeg archived) | Use subprocess directly; no wrapper library needed                          |
| AWS SDK v2 (`aws-sdk`)      | AWS SDK v3 (`@aws-sdk/client-s3`)              | 2023 (v2 deprecated)              | Modular imports, smaller bundle, tree-shakeable                             |
| SDK default checksums off   | SDK default checksums on (v3.729+)             | Late 2024                         | Must set `requestChecksumCalculation: "WHEN_REQUIRED"` for R2 compatibility |
| R2 no checksum support      | R2 supports SHA-256 and SHA-1                  | 2025                              | CRC32 still unsupported; SHA-256 works if needed                            |

**Deprecated/outdated:**

- `fluent-ffmpeg`: Archived May 2025. Repository is read-only and "no longer works properly with recent ffmpeg versions." Use `child_process` directly.
- `aws-sdk` v2: Deprecated since 2023. Use `@aws-sdk/client-s3` v3.
- `@aws-sdk/client-s3` < v3.729: Older versions work fine but check for `requestChecksumCalculation` support when upgrading.

## Discretion Recommendations

### Presigned URL Expiry Time

**Recommendation: 15 minutes (900 seconds).** Reasoning: A 20MB video upload over a reasonable connection takes well under 5 minutes. 15 minutes provides generous buffer for slow connections without leaving URLs valid long enough to be misused. R2 supports 1 second to 7 days.

### Content-Type Restriction

**Recommendation: Enforce `video/mp4` in the presigned URL signature.** This means the browser MUST send `Content-Type: video/mp4` when uploading. Since the decision locks to MP4 only, this is a safe restriction that prevents uploading non-video files to the presigned URL.

### Web Optimization Detection Heuristic

**Recommendation:** Use ffprobe to check codec and bitrate. Skip compression if:

- Codec is already H.264 (codec_name === "h264")
- Bitrate is under 4 Mbps for 720p or under 6 Mbps for 1080p content
- Video is already 720p or smaller height

If any of these conditions fail, re-encode with `-crf 28 -preset medium -vf scale='min(720,ih)':-2 -movflags +faststart -an`.

### Thumbnail Extraction Timing

**Recommendation: 25% into the video.** The first frame is often a transition or blank; 50% risks catching a rest position. 25% typically shows the exercise in its active phase. Extract as JPEG at 320px width, quality 5 (ffmpeg -q:v scale), which yields ~10-30KB thumbnails.

### Quasar Component Choices

**Recommendation:**

- `QTable` for the exercise list (server-side pagination, existing pattern from SessionsPage)
- `QInput` with debounce for search
- `QSelect` for category/level/route/effort filters
- `QBtnToggle` or `QSelect` for video status filter (all / with video / without video)
- `QFile` hidden behind a `QBtn` for single upload (no need for full QUploader complexity)
- `QFile` with `multiple` prop for bulk upload file selection
- `QDialog` for bulk upload preview/confirmation table

### R2 Bucket Configuration

**Recommendation:**

- Enable "Public Development URL" (r2.dev subdomain) for public read access
- CORS configuration allowing PUT from admin app origins (`https://admin.eltemplo.org`, `http://localhost:9100`, `http://localhost:9101`)
- AllowedHeaders: `Content-Type`, `Content-Length`
- MaxAgeSeconds: 3600 (1 hour preflight cache)

## Existing Codebase Integration Points

### Database: `exercises` Table (Already Has `video_url`)

The `video_url` column already exists (migration 0014, varchar(500)). Schema at `/home/franco/projects/el-templo/el-templo-api/src/db/schema/exercises.ts` line 35:

```typescript
videoUrl: varchar("video_url", { length: 500 }),
```

Currently nullable, stores nothing. This phase will populate it with R2 keys like `exercises/42.mp4`.

### API: Video URL Already Flows to Frontend

`/home/franco/projects/el-templo/el-templo-api/src/modules/sessions/routes.ts` already includes `videoUrl` in session responses (lines 92, 107). The `sessionToResponse` function passes `ex.videoUrl ?? null`. **This function must be updated** to assemble full URLs by prepending `R2_PUBLIC_URL` to the stored key.

Similarly, exercise pool queries in `/home/franco/projects/el-templo/el-templo-api/src/modules/admin/exercise-swap-service.ts` already select and return `videoUrl` (lines 84, 119, 185, 318). These also need the URL assembly.

### Frontend: VideoPlaceholder Already Works

`/home/franco/projects/el-templo/el-templo-app/src/modules/training/components/player/VideoPlaceholder.vue` accepts `videoUrl` as a prop, shows video with autoplay/loop/muted when URL is present, and shows a placeholder when null. **No changes needed** to this component -- just provide it with real URLs.

### Frontend: Video Badge Already Works

`/home/franco/projects/el-templo/el-templo-admin/src/components/sessions/ExercisePoolItem.vue` shows a green videocam icon when `exercise.videoUrl` is truthy (line 18). This will work automatically once exercises have video URLs.

### Admin App: Router Needs New Route

`/home/franco/projects/el-templo/el-templo-admin/src/router/routes.ts` currently has: sessions, sessions/edit, generate. The new "Ejercicios" page needs `{ path: 'exercises', component: () => import('pages/ExercisesPage.vue') }`.

### Admin App: Layout Needs New Sidebar Item

`/home/franco/projects/el-templo/el-templo-admin/src/layouts/AdminLayout.vue` has sidebar items for "Sesiones" and "Generar". Add an "Ejercicios" item with icon `sports_gymnastics` or `fitness_center`.

### API: Admin Routes Need Extension

`/home/franco/projects/el-templo/el-templo-api/src/modules/admin/routes.ts` already has the admin role-check hook. New exercise management and upload routes should be added here (or in a separate plugin under the admin prefix).

### Environment Variables Needed (New)

```
# R2 Configuration
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_api_token_access_key
R2_SECRET_ACCESS_KEY=your_r2_api_token_secret
R2_BUCKET_NAME=el-templo-videos
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

These go in `el-templo-api/.env` and `el-templo-api/.env.example`. The frontend apps need `VITE_R2_PUBLIC_URL` only if they assemble URLs client-side; if the API returns full URLs, no frontend env var is needed.

## Open Questions

1. **FFmpeg on production EC2**
   - What we know: The deploy pipeline uses `ubuntu-latest` on GitHub Actions and rsyncs to EC2.
   - What's unclear: Whether ffmpeg is already installed on the production EC2 instance (it was used for the Phase 25 Python video pipeline, but that may have been on a different machine).
   - Recommendation: Add ffmpeg install to server provisioning and verify during deployment. Add a startup health check that logs ffmpeg version.

2. **Post-processing timing for bulk uploads**
   - What we know: Bulk uploads of 300 videos will each trigger post-processing (thumbnail + conditional compression).
   - What's unclear: Whether to process synchronously per upload, queue them, or batch after all uploads complete.
   - Recommendation: Fire-and-forget pattern for each upload-complete call, with a simple concurrency limiter (max 2-3 concurrent FFmpeg processes). Log failures to Sentry without blocking the upload response.

3. **Video duration validation**
   - What we know: 20-second max duration is a hard limit.
   - What's unclear: Whether to validate client-side only (using HTML5 video element metadata) or also server-side.
   - Recommendation: Validate client-side for UX (fast feedback), validate server-side via ffprobe in the post-processing step (authoritative check). If server-side check fails, delete the uploaded file and clear video_url.

## Sources

### Primary (HIGH confidence)

- [Cloudflare R2 Presigned URLs docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) - Presigned URL generation, expiry limits, content-type handling
- [Cloudflare R2 aws-sdk-js-v3 docs](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) - S3Client configuration for R2
- [Cloudflare R2 Public Buckets docs](https://developers.cloudflare.com/r2/buckets/public-buckets/) - Public URL enabling, custom domain setup
- [Cloudflare R2 CORS Configuration docs](https://developers.cloudflare.com/r2/buckets/cors/) - CORS JSON format, gotchas
- [Cloudflare R2 Delete Objects docs](https://developers.cloudflare.com/r2/objects/delete-objects/) - Object deletion
- Existing codebase: Phase 26 summary, exercises schema, session routes, admin routes, VideoPlaceholder component

### Secondary (MEDIUM confidence)

- [AWS SDK v3 Checksum Change Issue #6810](https://github.com/aws/aws-sdk-js-v3/issues/6810) - requestChecksumCalculation workaround
- [Cloudflare Community: SDK v3.729 breaking change](https://community.cloudflare.com/t/aws-sdk-client-s3-v3-729-0-breaks-uploadpart-and-putobject-r2-s3-api-compatibility/758637) - Checksum breaking change status (resolved for SHA-256, CRC32 still unsupported)
- [fluent-ffmpeg archived (May 2025)](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - Archived, do not use for new projects

### Tertiary (LOW confidence)

- FFmpeg bitrate thresholds for "web-optimized" detection (4 Mbps for 720p) - based on general video encoding best practices, not official documentation. Validate with actual exercise videos.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - R2 is S3-compatible, SDK docs are comprehensive, patterns well-established
- Architecture: HIGH - Presigned URL flow is a standard pattern; existing codebase patterns are clear
- Pitfalls: HIGH - Checksum issue is well-documented; CORS and Content-Type are classic gotchas with known solutions
- Video processing: MEDIUM - FFmpeg commands are standard but "web-optimized" thresholds are heuristic, not definitive
- Bulk upload UX: MEDIUM - Component choices are straightforward but the preview/validation table is custom UI work

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable domain; R2 API is mature)
