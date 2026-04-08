/**
 * VideoService - R2 Video Upload & Post-Processing
 *
 * Handles presigned URL generation for direct browser-to-R2 uploads,
 * upload confirmation with async post-processing (thumbnail extraction,
 * conditional compression), and video deletion.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { unlink, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";

const execFileAsync = promisify(execFile);

/** Video probe metadata */
export interface VideoMetadata {
  codec: string;
  bitrate: number;
  duration: number;
  width: number;
  height: number;
}

/** Maximum allowed video duration in seconds */
const MAX_DURATION_SECONDS = 20;

/** Presigned URL expiry (15 minutes) */
const PRESIGN_EXPIRY_SECONDS = 900;

/** FFmpeg compression timeout (120 seconds) */
const FFMPEG_TIMEOUT_MS = 120_000;

export class VideoService {
  constructor(
    private r2: S3Client,
    private bucket: string,
    private log: FastifyBaseLogger,
  ) {}

  // =========================================================================
  // generateUploadUrl - Presigned PUT URL for direct browser upload
  // =========================================================================

  async generateUploadUrl(
    exerciseId: number,
  ): Promise<{ uploadUrl: string; key: string }> {
    const key = `exercises/${exerciseId}.mp4`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: "video/mp4",
    });

    const uploadUrl = await getSignedUrl(this.r2, command, {
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    });

    return { uploadUrl, key };
  }

  // =========================================================================
  // confirmUpload - Update DB + fire-and-forget post-processing
  // =========================================================================

  async confirmUpload(
    exerciseId: number,
    db: MySql2Database<typeof schema>,
  ): Promise<{ videoUrl: string; thumbnailUrl: string }> {
    const key = `exercises/${exerciseId}.mp4`;

    // Update exercise video_url in DB
    await db
      .update(schema.exercises)
      .set({ videoUrl: key })
      .where(eq(schema.exercises.id, exerciseId));

    // Fire-and-forget post-processing (do NOT await)
    this.processVideo(exerciseId, db).catch((err: unknown) => {
      this.log.error(
        { err, exerciseId },
        "Post-processing failed (fire-and-forget)",
      );
    });

    return {
      videoUrl: key,
      thumbnailUrl: `thumbnails/${exerciseId}.jpg`,
    };
  }

  // =========================================================================
  // processVideo - Async post-processing pipeline
  // =========================================================================

  async processVideo(
    exerciseId: number,
    db: MySql2Database<typeof schema>,
  ): Promise<void> {
    const key = `exercises/${exerciseId}.mp4`;
    const tmpInput = `/tmp/el-templo-video-${exerciseId}.mp4`;
    const tmpCompressed = `/tmp/el-templo-video-${exerciseId}-compressed.mp4`;
    const tmpThumbnail = `/tmp/el-templo-thumb-${exerciseId}.jpg`;

    try {
      // 1. Download video from R2
      this.log.info({ exerciseId }, "Post-processing: downloading from R2");
      await this.downloadFromR2(key, tmpInput);

      // 2. Probe video metadata
      const metadata = await this.probeVideo(tmpInput);
      this.log.info(
        { exerciseId, metadata },
        "Post-processing: probed metadata",
      );

      // 3. Validate duration
      if (metadata.duration > MAX_DURATION_SECONDS) {
        this.log.error(
          {
            exerciseId,
            duration: metadata.duration,
            max: MAX_DURATION_SECONDS,
          },
          "Post-processing: video exceeds max duration, removing",
        );
        await this.deleteFromR2(key);
        await db
          .update(schema.exercises)
          .set({ videoUrl: null })
          .where(eq(schema.exercises.id, exerciseId));
        return;
      }

      // 4. Conditional compression
      if (this.needsCompression(metadata)) {
        this.log.info({ exerciseId }, "Post-processing: compressing video");
        await this.compressVideo(tmpInput, tmpCompressed);

        // Upload compressed version back to R2 (same key, replaces original)
        await this.uploadToR2(key, tmpCompressed, "video/mp4");
        this.log.info(
          { exerciseId },
          "Post-processing: compressed video uploaded",
        );
      }

      // 5. Extract thumbnail at 25% of duration
      const thumbnailTimestamp = metadata.duration * 0.25;
      const inputForThumbnail = this.needsCompression(metadata)
        ? tmpCompressed
        : tmpInput;
      await this.extractThumbnail(
        inputForThumbnail,
        tmpThumbnail,
        thumbnailTimestamp,
      );

      // Upload thumbnail to R2
      const thumbnailKey = `thumbnails/${exerciseId}.jpg`;
      await this.uploadToR2(thumbnailKey, tmpThumbnail, "image/jpeg");
      this.log.info({ exerciseId }, "Post-processing: thumbnail uploaded");
    } catch (err: unknown) {
      this.log.error({ err, exerciseId }, "Post-processing failed");
      // Do NOT rethrow — fire-and-forget
    } finally {
      // 6. Clean up temp files
      await this.cleanupTempFile(tmpInput);
      await this.cleanupTempFile(tmpCompressed);
      await this.cleanupTempFile(tmpThumbnail);
    }
  }

  // =========================================================================
  // deleteVideo - Remove from R2 and clear DB
  // =========================================================================

  async deleteVideo(
    exerciseId: number,
    db: MySql2Database<typeof schema>,
  ): Promise<void> {
    const videoKey = `exercises/${exerciseId}.mp4`;
    const thumbnailKey = `thumbnails/${exerciseId}.jpg`;

    // Delete video from R2
    await this.deleteFromR2(videoKey);

    // Delete thumbnail from R2 (ignore 404)
    try {
      await this.deleteFromR2(thumbnailKey);
    } catch (err: unknown) {
      // Thumbnail may not exist, that's OK
      this.log.debug(
        { err, exerciseId },
        "Thumbnail delete failed (may not exist)",
      );
    }

    // Clear video_url in DB
    await db
      .update(schema.exercises)
      .set({ videoUrl: null })
      .where(eq(schema.exercises.id, exerciseId));
  }

  // =========================================================================
  // Private: needsCompression
  // =========================================================================

  private needsCompression(meta: VideoMetadata): boolean {
    const isH264 = meta.codec.toLowerCase() === "h264";
    const bitrateThreshold = meta.height <= 720 ? 2_000_000 : 4_000_000;

    // No compression needed if already H.264 AND within bitrate threshold
    if (isH264 && meta.bitrate <= bitrateThreshold) {
      return false;
    }
    return true;
  }

  // =========================================================================
  // Private: probeVideo
  // =========================================================================

  private async probeVideo(filePath: string): Promise<VideoMetadata> {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);

    const data = JSON.parse(stdout) as {
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        bit_rate?: string;
      }>;
      format?: {
        duration?: string;
        bit_rate?: string;
      };
    };

    const videoStream = data.streams?.find((s) => s.codec_type === "video");
    if (!videoStream) {
      throw new Error("No se encontro stream de video en el archivo");
    }

    const bitrate =
      parseInt(videoStream.bit_rate || "0", 10) ||
      parseInt(data.format?.bit_rate || "0", 10);

    return {
      codec: videoStream.codec_name || "unknown",
      bitrate,
      duration: parseFloat(data.format?.duration || "0"),
      width: videoStream.width || 0,
      height: videoStream.height || 0,
    };
  }

  // =========================================================================
  // Private: compressVideo
  // =========================================================================

  private async compressVideo(
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
        "23",
        "-preset",
        "medium",
        "-vf",
        "scale='min(720,ih)':-2",
        "-movflags",
        "+faststart",
        "-an",
        outputPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
  }

  // =========================================================================
  // Private: extractThumbnail
  // =========================================================================

  private async extractThumbnail(
    inputPath: string,
    outputPath: string,
    timestamp: number,
  ): Promise<void> {
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      String(timestamp),
      "-i",
      inputPath,
      "-vframes",
      "1",
      "-q:v",
      "5",
      "-vf",
      "scale=320:-2",
      outputPath,
    ]);
  }

  // =========================================================================
  // Private: R2 helpers
  // =========================================================================

  private async downloadFromR2(key: string, destPath: string): Promise<void> {
    const response = await this.r2.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`R2 GetObject returned empty body for key: ${key}`);
    }

    const readableBody = response.Body as Readable;
    const writeStream = createWriteStream(destPath);
    await pipeline(readableBody, writeStream);
  }

  private async uploadToR2(
    key: string,
    srcPath: string,
    contentType: string,
  ): Promise<void> {
    const fileStream = createReadStream(srcPath);
    const fileStat = await stat(srcPath);

    await this.r2.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        ContentType: contentType,
        ContentLength: fileStat.size,
        CacheControl: "public, max-age=604800",
      }),
    );
  }

  private async deleteFromR2(key: string): Promise<void> {
    await this.r2.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  private async cleanupTempFile(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch {
      // File may not exist, that's OK
    }
  }
}
