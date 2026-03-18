/**
 * Generate physical QR code PNGs for each active branch.
 *
 * Members scan these printed QR codes with the El Templo app to register attendance.
 * The QR encodes an HMAC-SHA256 signed token containing { branchId, type: "checkin" }.
 *
 * Usage:
 *   npx tsx tools/generate-branch-qrs.ts                  # uses local .env
 *   npx tsx tools/generate-branch-qrs.ts --env staging    # uses staging .env
 *   npx tsx tools/generate-branch-qrs.ts --env production # uses production .env
 *
 * Output: tools/qr-output/qr-<branch-slug>.png (one per active branch)
 *
 * Re-run this script whenever JWT_SECRET changes or new branches are added.
 */

import { createHmac } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createRequire } from "module";

// Resolve packages from sub-app node_modules
const apiRequire = createRequire(
  resolve(__dirname, "..", "el-templo-api", "package.json"),
);
const adminRequire = createRequire(
  resolve(__dirname, "..", "el-templo-admin", "package.json"),
);

// Load .env manually (avoid adding dotenv as root dep)
function loadEnv(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    throw new Error(`Env file not found: ${envPath}`);
  }
  const vars: Record<string, string> = {};
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    vars[key] = val;
  }
  return vars;
}

// Same token generation as el-templo-api/src/modules/shared/qr-token.ts
function generateQrToken(branchId: number, secret: string): string {
  const payload = JSON.stringify({ branchId, type: "checkin" });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const args = process.argv.slice(2);
  const envFlagIdx = args.indexOf("--env");
  const envName = envFlagIdx !== -1 ? args[envFlagIdx + 1] : undefined;

  const apiDir = resolve(__dirname, "..", "el-templo-api");
  const envFile =
    envName === "staging"
      ? join(apiDir, ".env.staging")
      : envName === "production"
        ? join(apiDir, ".env.production")
        : join(apiDir, ".env");

  console.log(`Loading env from: ${envFile}`);
  const env = loadEnv(envFile);

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET not found in env file");
  }

  const mysql = apiRequire("mysql2/promise") as typeof import("mysql2/promise");

  const connection = await mysql.createConnection({
    host: env.DB_HOST || "localhost",
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || "root",
    password: env.DB_PASSWORD || "",
    database: env.DB_NAME || "eltemplo",
  });

  const [rows] = await connection.execute(
    "SELECT id, name FROM branches WHERE is_active = 1 ORDER BY name",
  );

  const branches = rows as Array<{ id: number; name: string }>;

  if (branches.length === 0) {
    console.log("No active branches found.");
    await connection.end();
    return;
  }

  console.log(`Found ${branches.length} active branches.\n`);

  const QRCode = adminRequire("qrcode") as typeof import("qrcode");

  const outputDir = resolve(__dirname, "qr-output");

  for (const branch of branches) {
    const slug = slugify(branch.name);
    const token = generateQrToken(branch.id, jwtSecret);
    const filename = `qr-${slug}.png`;
    const filepath = join(outputDir, filename);

    await QRCode.toFile(filepath, token, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    });

    console.log(`  ${branch.name} (id=${branch.id}) → ${filename}`);
  }

  await connection.end();
  console.log(`\nDone. QR images saved to tools/qr-output/`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
