import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FastifyBaseLogger } from "fastify";

/** Presigned URL expiry: 15 minutes */
const PRESIGN_EXPIRY_SECONDS = 900;

/** Map file extensions to MIME types */
const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};

function sanitizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME_MAP[ext] ?? "application/octet-stream";
}

export class BlogImageService {
  private r2: S3Client;
  private bucket: string;
  private log: FastifyBaseLogger;

  constructor(r2: S3Client, bucket: string, log: FastifyBaseLogger) {
    this.r2 = r2;
    this.bucket = bucket;
    this.log = log;
  }

  async generateUploadUrl(
    filename: string,
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    const sanitized = sanitizeFilename(filename);
    const key = `blog/images/${Date.now()}-${sanitized}`;
    const contentType = getContentType(filename);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.r2, command, {
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    });

    const r2PublicUrl = process.env.R2_PUBLIC_URL || "";
    const publicUrl = `${r2PublicUrl}/${key}`;

    this.log.info({ key, contentType }, "Blog image upload URL generated");

    return { uploadUrl, publicUrl };
  }
}
