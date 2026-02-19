import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { S3Client } from "@aws-sdk/client-s3";

declare module "fastify" {
  interface FastifyInstance {
    r2: S3Client;
    r2Bucket: string;
  }
}

const r2Plugin: FastifyPluginAsync = async (fastify) => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    fastify.log.warn(
      "R2 configuration missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME). Video storage disabled.",
    );
    return;
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // CRITICAL: AWS SDK v3.729+ checksum fix for R2 compatibility
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  fastify.decorate("r2", client);
  fastify.decorate("r2Bucket", bucket);

  fastify.addHook("onClose", async () => {
    client.destroy();
  });

  fastify.log.info("R2 storage connected (bucket: %s)", bucket);
};

export default fp(r2Plugin, { name: "r2" });
