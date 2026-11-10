/**
 * Hotfix seguridad tanda 2 (H12) — POST /api/admin/members/:userId/photo/upload-url
 * solo acepta imagenes (jpg, jpeg, png, webp).
 *
 * Antes, una extension fuera de la lista (`x.html`) igual terminaba en la key de
 * R2 con ContentType image/jpeg firmado y el photo_url del socio se guardaba
 * antes de que la subida existiera. Ahora responde 400 ANTES de firmar y de
 * tocar la base.
 *
 * R2 no esta configurado en CI: el test le cuelga a la app un S3Client con
 * credenciales falsas (firmar una URL es un calculo local, no hace red) solo
 * para ejercitar el camino 200.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { S3Client } from "@aws-sdk/client-s3";

import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createTestMember,
} from "../helpers";
import { users } from "../../src/db/schema/users";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const FOTO_PREVIA = "https://cdn.test.invalid/members/photos/previa.jpg";
const MENSAJE_FORMATO = "Formato de imagen no permitido (jpg, jpeg, png, webp)";

describe("Foto del socio — extension permitida", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberId: number;
  let r2Stubbed = false;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    if (app.r2 === undefined) {
      app.r2 = new S3Client({
        region: "auto",
        endpoint: "https://r2.test.invalid",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      });
      app.r2Bucket = "test-bucket";
      r2Stubbed = true;
    }
  });

  afterAll(async () => {
    if (r2Stubbed) {
      app.r2.destroy();
      Reflect.deleteProperty(app, "r2");
      Reflect.deleteProperty(app, "r2Bucket");
    }
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const member = await createTestMember(app);
    memberId = member.id;
    await app.db
      .update(users)
      .set({ photoUrl: FOTO_PREVIA })
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, memberId)));
  });

  async function pedirUrl(filename: string) {
    return app.inject({
      method: "POST",
      url: `/api/admin/members/${memberId}/photo/upload-url`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { filename },
    });
  }

  async function fotoActual(): Promise<string | null> {
    const [row] = await app.db
      .select({ photoUrl: users.photoUrl })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, memberId)))
      .limit(1);
    return row.photoUrl;
  }

  it.each(["x.html", "x.svg", "x.php.jpg.exe", "sinextension"])(
    "%s -> 400 y el photo_url del socio NO cambia",
    async (filename) => {
      const res = await pedirUrl(filename);
      expect(res.statusCode, res.body).toBe(400);
      const body = JSON.parse(res.body) as { error: string; message: string };
      expect(body.error).toBe("Solicitud invalida");
      expect(body.message).toBe(MENSAJE_FORMATO);
      expect(await fotoActual()).toBe(FOTO_PREVIA);
    },
  );

  it("filename de mas de 255 caracteres -> 400 y el photo_url NO cambia", async () => {
    const res = await pedirUrl(`${"a".repeat(260)}.jpg`);
    expect(res.statusCode, res.body).toBe(400);
    expect(await fotoActual()).toBe(FOTO_PREVIA);
  });

  it("foto.JPG -> 200 con key .jpg y el photo_url se actualiza", async () => {
    const res = await pedirUrl("foto.JPG");
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      uploadUrl: string;
      publicUrl: string;
    };
    expect(body.publicUrl).toMatch(
      new RegExp(`members/photos/${memberId}-\\d+\\.jpg$`),
    );
    expect(body.uploadUrl).toContain(`/members/photos/${memberId}-`);
    expect(await fotoActual()).toBe(body.publicUrl);
  });

  it.each([
    ["x.png", "png"],
    ["x.webp", "webp"],
    ["x.jpeg", "jpeg"],
  ])("%s -> 200 con extension %s", async (filename, ext) => {
    const res = await pedirUrl(filename);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { publicUrl: string };
    expect(body.publicUrl.endsWith(`.${ext}`)).toBe(true);
  });
});
