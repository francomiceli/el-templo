/**
 * Wellhub sandbox — herramienta de desarrollo local.
 *
 * El sandbox de Wellhub no puede llegar a localhost, así que sus
 * simuladores DEVUELVEN el payload del webhook en la respuesta; este script
 * cierra el ciclo: dispara el simulador, toma ese payload, lo firma con
 * WELLHUB_WEBHOOK_SECRET (HMAC-SHA256 hex del raw body) y lo POSTea a
 * nuestro webhook local. Requiere el API corriendo (pnpm dev) y en .env:
 * WELLHUB_API_KEY, WELLHUB_WEBHOOK_SECRET y WELLHUB_GYM_ID (sandbox: 546).
 *
 * Antes de reservar: mapear la sede local al gym del sandbox, p.ej.
 *   UPDATE branches SET wellhub_gym_id = 546 WHERE code = 'MOGOTES';
 * y correr una sincronización para publicar slots (npx tsx scripts/
 * wellhub-sandbox.ts sync).
 *
 * Uso:
 *   npx tsx scripts/wellhub-sandbox.ts products
 *   npx tsx scripts/wellhub-sandbox.ts classes
 *   npx tsx scripts/wellhub-sandbox.ts sync
 *   npx tsx scripts/wellhub-sandbox.ts checkin <gympass_user_id> [product_id]
 *   npx tsx scripts/wellhub-sandbox.ts book <gympass_user_id> <slot_id> <class_id>
 *   npx tsx scripts/wellhub-sandbox.ts cancel <booking_number>
 *
 * Usuarios de prueba del sandbox: 1000000000001..1000000000010.
 */

import { createHmac } from "crypto";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.development" });
loadEnv({ path: ".env" });

const BASE_URL =
  process.env.WELLHUB_BASE_URL ?? "https://apitesting.partners.gympass.com";
const API_KEY = process.env.WELLHUB_API_KEY;
const SECRET = process.env.WELLHUB_WEBHOOK_SECRET;
const GYM_ID = process.env.WELLHUB_GYM_ID;
const LOCAL_WEBHOOK =
  process.env.WELLHUB_LOCAL_WEBHOOK ??
  "http://localhost:3000/api/webhooks/wellhub";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function wellhub(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  process.stdout.write(`← ${method} ${path} → ${res.status}\n`);
  if (!res.ok) fail(text);
  return text ? JSON.parse(text) : undefined;
}

/** Firma el payload como lo hará Wellhub y lo entrega a nuestro webhook. */
async function forwardToLocalWebhook(payload: unknown): Promise<void> {
  if (!SECRET) fail("Falta WELLHUB_WEBHOOK_SECRET en el .env");
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
  const res = await fetch(LOCAL_WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gympass-Signature": signature,
    },
    body: raw,
  });
  process.stdout.write(
    `→ webhook local ${LOCAL_WEBHOOK} → ${res.status} ${await res.text()}\n`,
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!API_KEY) fail("Falta WELLHUB_API_KEY en el .env");
  if (!GYM_ID) fail("Falta WELLHUB_GYM_ID en el .env (sandbox: 546)");

  switch (command) {
    case "products": {
      const products = await wellhub(
        "GET",
        `/setup/v1/gyms/${GYM_ID}/products`,
      );
      process.stdout.write(`${JSON.stringify(products, null, 2)}\n`);
      break;
    }

    case "classes": {
      const classes = await wellhub(
        "GET",
        `/booking/v1/gyms/${GYM_ID}/classes`,
      );
      process.stdout.write(`${JSON.stringify(classes, null, 2)}\n`);
      break;
    }

    case "sync": {
      // Publica clases/slots usando el mismo código del cron.
      const { drizzle } = await import("drizzle-orm/mysql2");
      const mysql = (await import("mysql2/promise")).default;
      const schema = await import("../src/db/schema");
      const { runWellhubSync } = await import("../src/jobs/wellhub-sync");
      const pool = mysql.createPool({
        host: process.env.DB_HOST ?? "localhost",
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER ?? "root",
        password: process.env.DB_PASSWORD ?? "",
        database: process.env.DB_NAME ?? "eltemplo",
      });
      const db = drizzle(pool, { schema, mode: "default" });
      const summary = await runWellhubSync(db);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      await pool.end();
      break;
    }

    case "checkin": {
      const [userId, productId] = args;
      if (!userId) fail("Uso: checkin <gympass_user_id> [product_id]");
      const payload = await wellhub(
        "POST",
        `/helper/v1/gyms/${GYM_ID}/simulate/checkins`,
        {
          gympass_user_id: userId,
          ...(productId ? { product_id: Number(productId) } : {}),
        },
      );
      await forwardToLocalWebhook(payload);
      break;
    }

    case "book": {
      const [userId, slotId, classId] = args;
      if (!userId || !slotId || !classId) {
        fail("Uso: book <gympass_user_id> <slot_id> <class_id>");
      }
      const payload = await wellhub(
        "POST",
        `/helper/v1/gyms/${GYM_ID}/simulate/bookings`,
        {
          gympass_user_id: userId,
          slot_id: Number(slotId),
          class_id: Number(classId),
        },
      );
      await forwardToLocalWebhook(payload);
      break;
    }

    case "cancel": {
      const [bookingNumber] = args;
      if (!bookingNumber) fail("Uso: cancel <booking_number>");
      const payload = await wellhub(
        "POST",
        `/helper/v1/gyms/${GYM_ID}/simulate/bookings/${bookingNumber}/cancel`,
      );
      await forwardToLocalWebhook(payload);
      break;
    }

    default:
      fail(
        "Comandos: products | classes | sync | checkin | book | cancel (ver encabezado del archivo)",
      );
  }
}

void main();
