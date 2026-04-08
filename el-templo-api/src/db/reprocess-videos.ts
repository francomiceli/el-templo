/**
 * One-time script: Reprocess all exercise videos through the compression pipeline.
 *
 * Run on server: NODE_ENV=production node dist/db/reprocess-videos.js
 *
 * For each exercise with a video:
 *   1. Download from R2
 *   2. Probe metadata (codec, bitrate, resolution)
 *   3. Compress if needed (H.264, CRF 23, 720p max, faststart)
 *   4. Extract thumbnail
 *   5. Upload compressed version + thumbnail back to R2
 */

import dotenv from "dotenv";
import path from "node:path";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import pino from "pino";
import { isNotNull } from "drizzle-orm";
import { S3Client } from "@aws-sdk/client-s3";
import { createSingleConnection } from "./index";
import { exercises } from "./schema";
import { VideoService } from "../modules/admin/video-service";

const log = pino({ level: "info" });

async function main() {
  // Validate R2 config
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Missing R2 environment variables");
  }

  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const { db, connection } = await createSingleConnection();
  const videoService = new VideoService(r2, bucket, log as never);

  // Find all exercises with videos
  const exercisesWithVideos = await db
    .select({
      id: exercises.id,
      exercise: exercises.exercise,
      videoUrl: exercises.videoUrl,
    })
    .from(exercises)
    .where(isNotNull(exercises.videoUrl));

  log.info(`Found ${exercisesWithVideos.length} exercises with videos`);

  let processed = 0;
  let failed = 0;

  for (const exercise of exercisesWithVideos) {
    try {
      log.info(
        `[${processed + failed + 1}/${exercisesWithVideos.length}] Processing exercise ${exercise.id}: ${exercise.exercise}`,
      );
      await videoService.processVideo(exercise.id, db as never);
      processed++;
      log.info(`  ✓ Done`);
    } catch (err: unknown) {
      failed++;
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        `  ✗ Failed for exercise ${exercise.id}`,
      );
    }
  }

  log.info(
    `Reprocessing complete: ${processed} succeeded, ${failed} failed out of ${exercisesWithVideos.length}`,
  );

  r2.destroy();
  await connection.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
