/**
 * Fase 214 Plan 14 (D-30, D-31, D-33, D-34, D-43, D-45, D-50, D-63): foto propia
 * del alumno.
 *
 *   - POST   /api/members/profile-photo/upload-url
 *   - POST   /api/members/profile-photo/confirm
 *   - DELETE /api/members/profile-photo
 *   - POST   /api/members/profile-photos/:photoId/report
 *   - resolveCommunityPhotos (servicio, solo lectura)
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas (ids
 * nunca fijos). La tienda privada se simula con `mockPrivateMedia`.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  PHOTO_MAX_BYTES,
  fichaMirrorKey,
  isOwnAvatarKey,
  privateAvatarKey,
} from "../../src/modules/conquer/private-media";
import { resolveCommunityPhotos } from "../../src/modules/members/profile-photo-service";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { mockPrivateMedia } from "../conquer/_helpers";

const CTX: TenantContext = { tenantId: 1 };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };
const BASE = "/api/members";
const UPLOAD_URL = `${BASE}/profile-photo/upload-url`;
const CONFIRM_URL = `${BASE}/profile-photo/confirm`;
const REMOVE_URL = `${BASE}/profile-photo`;
const PUBLIC_URL = "https://pub-test.r2.dev";

interface UploadBody {
  uploadUrl: string;
  key: string;
  contentType: string;
  expiresIn: number;
}

interface ConfirmBody {
  photoId: number;
  status: string;
}

interface ErrorBody {
  error: string;
  code?: string;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function reportUrl(photoId: number): string {
  return `${BASE}/profile-photos/${photoId}/report`;
}

async function uploadRaw(
  token: string,
  payload: Record<string, unknown> = {
    contentType: "image/jpeg",
    acceptedRules: true,
  },
) {
  return app.inject({
    method: "POST",
    url: UPLOAD_URL,
    headers: auth(token),
    payload,
  });
}

async function confirmRaw(token: string, key: string) {
  return app.inject({
    method: "POST",
    url: CONFIRM_URL,
    headers: auth(token),
    payload: { key },
  });
}

/** Pide la URL de subida (con el storage simulado) y devuelve el cuerpo. */
async function requestUpload(token: string): Promise<UploadBody> {
  const res = await uploadRaw(token);
  expect(res.statusCode).toBe(200);
  return res.json<UploadBody>();
}

/** Sube y confirma: devuelve la clave y el id de la foto. */
async function uploadAndConfirm(
  token: string,
): Promise<{ key: string; photoId: number }> {
  const { key } = await requestUpload(token);
  const res = await confirmRaw(token, key);
  expect(res.statusCode).toBe(201);
  return { key, photoId: res.json<ConfirmBody>().photoId };
}

async function rowsOf(userId: number, ctx: TenantContext = CTX) {
  return app.db
    .select()
    .from(schema.memberPhotos)
    .where(
      and(
        tenantWhere(schema.memberPhotos, ctx),
        eq(schema.memberPhotos.userId, userId),
      ),
    )
    .orderBy(schema.memberPhotos.id);
}

async function rowById(photoId: number, ctx: TenantContext = CTX) {
  const [row] = await app.db
    .select()
    .from(schema.memberPhotos)
    .where(
      and(
        tenantWhere(schema.memberPhotos, ctx),
        eq(schema.memberPhotos.id, photoId),
      ),
    );
  if (!row) throw new Error(`foto ${photoId} no encontrada`);
  return row;
}

type SeedStatus = (typeof schema.memberPhotos.status.enumValues)[number];

/** Siembra una fila de `member_photos` directo (no pasa por la API). */
async function seedPhoto(
  userId: number,
  opts: {
    origin?: "alumno" | "ficha";
    status?: SeedStatus;
    storageKey?: string;
    sourceUrl?: string | null;
    ctx?: TenantContext;
  } = {},
): Promise<{ id: number; storageKey: string }> {
  const ctx = opts.ctx ?? CTX;
  const origin = opts.origin ?? "alumno";
  const storageKey =
    opts.storageKey ??
    (origin === "alumno"
      ? privateAvatarKey({ tenantId: ctx.tenantId, userId })
      : fichaMirrorKey({
          tenantId: ctx.tenantId,
          userId,
          sourceUrl: opts.sourceUrl ?? `${PUBLIC_URL}/x-${userId}.jpg`,
        }));
  const [inserted] = await app.db
    .insert(schema.memberPhotos)
    .values(
      tenantValues(ctx, {
        userId,
        storageKey,
        origin,
        status: opts.status ?? "aprobada",
        sourceUrl: opts.sourceUrl ?? null,
      }),
    )
    .$returningId();
  if (!inserted) throw new Error("no se pudo sembrar la foto");
  return { id: inserted.id, storageKey };
}

async function setPhotoUrl(userId: number, photoUrl: string | null) {
  await app.db
    .update(schema.users)
    .set({ photoUrl })
    .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, userId)));
}

async function readPhotoUrl(userId: number): Promise<string | null> {
  const [row] = await app.db
    .select({ photoUrl: schema.users.photoUrl })
    .from(schema.users)
    .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, userId)));
  return row?.photoUrl ?? null;
}

async function auraRows(userId: number): Promise<number> {
  const rows = await app.db
    .select({ id: schema.auraTransactions.id })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, CTX),
        eq(schema.auraTransactions.userId, userId),
      ),
    );
  return rows.length;
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await limpiarSegundoGimnasio(app);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ── upload-url ──────────────────────────────────────────────────────

describe("POST /profile-photo/upload-url", () => {
  it("sin acceptedRules o con false: 400 (D-50)", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);

    const sin = await uploadRaw(m.token, { contentType: "image/jpeg" });
    const falso = await uploadRaw(m.token, {
      contentType: "image/jpeg",
      acceptedRules: false,
    });

    expect(sin.statusCode).toBe(400);
    expect(falso.statusCode).toBe(400);
  });

  it("con las normas aceptadas y JPEG: 200 con URL, clave propia, tipo y vigencia", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);

    const body = await requestUpload(m.token);

    expect(body.uploadUrl).toContain(body.key);
    expect(isOwnAvatarKey(body.key, 1, m.id)).toBe(true);
    expect(body.contentType).toBe("image/jpeg");
    expect(body.expiresIn).toBe(600);
  });

  it("image/png: 400 con código de tipo inválido", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);

    const res = await uploadRaw(m.token, {
      contentType: "image/png",
      acceptedRules: true,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("FOTO_PERFIL_TIPO_INVALIDO");
  });

  it("sin storage: 503 FOTO_PERFIL_NO_DISPONIBLE, sin claves en el cuerpo ni bucket público", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await createTestMember(app);

    const res = await uploadRaw(m.token);

    expect(res.statusCode).toBe(503);
    const body = res.json<ErrorBody>();
    expect(body.code).toBe("FOTO_PERFIL_NO_DISPONIBLE");
    expect(res.body).not.toContain("private/");
    expect(res.body).not.toContain("members/photos/");
  });
});

// ── confirm ─────────────────────────────────────────────────────────

describe("POST /profile-photo/confirm", () => {
  it("clave de OTRO usuario: 400 y no queda fila", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);
    const otro = await createTestMember(app);

    const res = await confirmRaw(
      m.token,
      privateAvatarKey({ tenantId: 1, userId: otro.id }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("FOTO_PERFIL_CLAVE_INVALIDA");
    expect(await rowsOf(m.id)).toHaveLength(0);
    expect(await rowsOf(otro.id)).toHaveLength(0);
  });

  it("clave propia pero objeto inexistente: 409", async () => {
    mockPrivateMedia({ head: async () => null });
    const m = await createTestMember(app);

    const res = await confirmRaw(
      m.token,
      privateAvatarKey({ tenantId: 1, userId: m.id }),
    );

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe("FOTO_PERFIL_NO_SUBIDA");
  });

  it("objeto sobre el tope: 400 con mensaje accionable (nunca 'pesada')", async () => {
    mockPrivateMedia({
      head: async () => ({
        contentLength: PHOTO_MAX_BYTES + 1,
        contentType: "image/jpeg",
      }),
    });
    const m = await createTestMember(app);

    const res = await confirmRaw(
      m.token,
      privateAvatarKey({ tenantId: 1, userId: m.id }),
    );

    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(body.code).toBe("FOTO_PERFIL_INVALIDA");
    expect(body.error).toBe("No pudimos procesar la foto, probá de nuevo");
    expect(body.error.toLowerCase()).not.toContain("pesad");
  });

  it("objeto vacío o de tipo image/png: 400", async () => {
    const m = await createTestMember(app);
    const key = privateAvatarKey({ tenantId: 1, userId: m.id });

    mockPrivateMedia({
      head: async () => ({ contentLength: 0, contentType: "image/jpeg" }),
    });
    const vacio = await confirmRaw(m.token, key);
    vi.restoreAllMocks();

    mockPrivateMedia({
      head: async () => ({ contentLength: 1024, contentType: "image/png" }),
    });
    const png = await confirmRaw(m.token, key);

    expect(vacio.statusCode).toBe(400);
    expect(png.statusCode).toBe(400);
    expect(await rowsOf(m.id)).toHaveLength(0);
  });

  it("válida: 201 con photoId y status pendiente; la fila guarda rules_accepted_at", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);

    const { key, photoId } = await uploadAndConfirm(m.token);

    const rows = await rowsOf(m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(photoId);
    expect(rows[0]?.status).toBe("pendiente");
    expect(rows[0]?.origin).toBe("alumno");
    expect(rows[0]?.storageKey).toBe(key);
    expect(rows[0]?.rulesAcceptedAt).not.toBeNull();
  });

  it("segunda subida con una pendiente: la anterior queda reemplazada y se borra su objeto", async () => {
    const remove = vi.fn<(key: string) => Promise<void>>(async () => {});
    mockPrivateMedia({ remove });
    const m = await createTestMember(app);

    const primera = await uploadAndConfirm(m.token);
    const segunda = await uploadAndConfirm(m.token);

    expect((await rowById(primera.photoId)).status).toBe("reemplazada");
    expect((await rowById(segunda.photoId)).status).toBe("pendiente");
    expect(remove).toHaveBeenCalledWith(primera.key);
    expect(remove).not.toHaveBeenCalledWith(segunda.key);
  });

  it("confirmar dos veces la misma clave no duplica filas", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);
    const { key, photoId } = await uploadAndConfirm(m.token);

    const otra = await confirmRaw(m.token, key);

    expect(otra.statusCode).toBe(201);
    expect(otra.json<ConfirmBody>().photoId).toBe(photoId);
    expect(await rowsOf(m.id)).toHaveLength(1);
  });

  it("con una aprobada existente, subir otra deja la aprobada y suma una pendiente", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);
    const aprobada = await seedPhoto(m.id, { status: "aprobada" });

    const { photoId } = await uploadAndConfirm(m.token);

    expect((await rowById(aprobada.id)).status).toBe("aprobada");
    expect((await rowById(photoId)).status).toBe("pendiente");
  });
});

// ── quitar (D-63) ───────────────────────────────────────────────────

describe("DELETE /profile-photo (D-63)", () => {
  it("quita la propia y la de ficha: filas quitada, photo_url NULL, objetos borrados y sin tocar Aura", async () => {
    vi.stubEnv("R2_PUBLIC_URL", PUBLIC_URL);
    const remove = vi.fn<(key: string) => Promise<void>>(async () => {});
    const removePublic = vi.fn<(key: string) => Promise<void>>(async () => {});
    mockPrivateMedia({ remove, removePublic });
    const m = await createTestMember(app);
    const publicKey = `members/photos/${m.id}-1700000000000.jpg`;
    const fichaUrl = `${PUBLIC_URL}/${publicKey}`;
    await setPhotoUrl(m.id, fichaUrl);
    const propia = await seedPhoto(m.id, { status: "aprobada" });
    const pendiente = await seedPhoto(m.id, { status: "pendiente" });
    const ficha = await seedPhoto(m.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: fichaUrl,
    });
    const rechazada = await seedPhoto(m.id, { status: "rechazada" });
    const auraAntes = await auraRows(m.id);

    const res = await app.inject({
      method: "DELETE",
      url: REMOVE_URL,
      headers: auth(m.token),
    });

    expect(res.statusCode).toBe(204);
    expect((await rowById(propia.id)).status).toBe("quitada");
    expect((await rowById(pendiente.id)).status).toBe("quitada");
    expect((await rowById(ficha.id)).status).toBe("quitada");
    expect((await rowById(rechazada.id)).status).toBe("rechazada");
    expect(await readPhotoUrl(m.id)).toBeNull();
    expect(remove).toHaveBeenCalledWith(propia.storageKey);
    expect(remove).toHaveBeenCalledWith(pendiente.storageKey);
    expect(remove).toHaveBeenCalledWith(ficha.storageKey);
    expect(removePublic).toHaveBeenCalledWith(publicKey);
    expect(await auraRows(m.id)).toBe(auraAntes);
  });

  it("sin ninguna foto: 204 y no toca el storage", async () => {
    const remove = vi.fn<(key: string) => Promise<void>>(async () => {});
    const removePublic = vi.fn<(key: string) => Promise<void>>(async () => {});
    mockPrivateMedia({ remove, removePublic });
    const m = await createTestMember(app);

    const res = await app.inject({
      method: "DELETE",
      url: REMOVE_URL,
      headers: auth(m.token),
    });

    expect(res.statusCode).toBe(204);
    expect(remove).not.toHaveBeenCalled();
    expect(removePublic).not.toHaveBeenCalled();
  });

  it("sin storage configurado igual quita las filas (no falla)", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await createTestMember(app);
    const propia = await seedPhoto(m.id, { status: "aprobada" });

    const res = await app.inject({
      method: "DELETE",
      url: REMOVE_URL,
      headers: auth(m.token),
    });

    expect(res.statusCode).toBe(204);
    expect((await rowById(propia.id)).status).toBe("quitada");
  });
});

// ── reportar (D-45) ─────────────────────────────────────────────────

describe("POST /profile-photos/:photoId/report (D-45)", () => {
  it("suma un reporte por persona: el repetido no cuenta, un segundo socio sí; la foto sigue aprobada", async () => {
    const dueno = await createTestMember(app);
    const r1 = await createTestMember(app);
    const r2 = await createTestMember(app);
    const foto = await seedPhoto(dueno.id, { status: "aprobada" });

    const primero = await app.inject({
      method: "POST",
      url: reportUrl(foto.id),
      headers: auth(r1.token),
    });
    expect(primero.statusCode).toBe(204);
    expect((await rowById(foto.id)).reportCount).toBe(1);

    const repetido = await app.inject({
      method: "POST",
      url: reportUrl(foto.id),
      headers: auth(r1.token),
    });
    expect(repetido.statusCode).toBe(204);
    expect((await rowById(foto.id)).reportCount).toBe(1);

    const segundo = await app.inject({
      method: "POST",
      url: reportUrl(foto.id),
      headers: auth(r2.token),
    });
    expect(segundo.statusCode).toBe(204);

    const fila = await rowById(foto.id);
    expect(fila.reportCount).toBe(2);
    expect(fila.reporterIds).toEqual([r1.id, r2.id]);
    expect(fila.lastReportedAt).not.toBeNull();
    expect(fila.status).toBe("aprobada");
  });

  it("también se puede reportar la foto de ficha", async () => {
    const dueno = await createTestMember(app);
    const r1 = await createTestMember(app);
    const ficha = await seedPhoto(dueno.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: `${PUBLIC_URL}/f-${dueno.id}.jpg`,
    });

    const res = await app.inject({
      method: "POST",
      url: reportUrl(ficha.id),
      headers: auth(r1.token),
    });

    expect(res.statusCode).toBe(204);
    expect((await rowById(ficha.id)).reportCount).toBe(1);
  });

  it("una foto pendiente: 404 y no se cuenta nada", async () => {
    const dueno = await createTestMember(app);
    const r1 = await createTestMember(app);
    const foto = await seedPhoto(dueno.id, { status: "pendiente" });

    const res = await app.inject({
      method: "POST",
      url: reportUrl(foto.id),
      headers: auth(r1.token),
    });

    expect(res.statusCode).toBe(404);
    expect((await rowById(foto.id)).reportCount).toBe(0);
  });

  it("una foto del gimnasio 2: 404 y su contador no cambia", async () => {
    const r1 = await createTestMember(app);
    const socio2 = gym2.socios[0];
    const foto = await seedPhoto(socio2.id, {
      status: "aprobada",
      ctx: CTX_DOS,
    });

    const res = await app.inject({
      method: "POST",
      url: reportUrl(foto.id),
      headers: auth(r1.token),
    });

    expect(res.statusCode).toBe(404);
    expect((await rowById(foto.id, CTX_DOS)).reportCount).toBe(0);
  });

  it("un photoId inexistente o inválido: 404 / 400", async () => {
    const r1 = await createTestMember(app);

    const inexistente = await app.inject({
      method: "POST",
      url: reportUrl(2_000_000_000),
      headers: auth(r1.token),
    });
    const invalido = await app.inject({
      method: "POST",
      url: `${BASE}/profile-photos/0/report`,
      headers: auth(r1.token),
    });

    expect(inexistente.statusCode).toBe(404);
    expect(invalido.statusCode).toBe(400);
  });
});

// ── resolveCommunityPhotos (D-43) ───────────────────────────────────

describe("resolveCommunityPhotos", () => {
  it("lista vacía: Map vacío sin tocar nada", async () => {
    const res = await resolveCommunityPhotos(app, CTX, []);

    expect(res.size).toBe(0);
  });

  it("propia aprobada: URL firmada del bucket privado y su photoId", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);
    const foto = await seedPhoto(m.id, { status: "aprobada" });

    const res = await resolveCommunityPhotos(app, CTX, [m.id]);

    expect(res.get(m.id)).toEqual({
      url: `https://r2.test/get/${foto.storageKey}`,
      photoId: foto.id,
    });
  });

  it("con una pendiente nueva, los demás siguen viendo la aprobada anterior", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);
    const aprobada = await seedPhoto(m.id, { status: "aprobada" });
    await seedPhoto(m.id, { status: "pendiente" });

    const res = await resolveCommunityPhotos(app, CTX, [m.id]);

    expect(res.get(m.id)?.photoId).toBe(aprobada.id);
  });

  it("espejo de ficha aprobado con la photo_url actual: URL firmada del espejo; la propia le gana", async () => {
    mockPrivateMedia();
    const soloFicha = await createTestMember(app);
    const conPropia = await createTestMember(app);
    const urlA = `${PUBLIC_URL}/members/photos/${soloFicha.id}-1700000000000.jpg`;
    const urlB = `${PUBLIC_URL}/members/photos/${conPropia.id}-1700000000000.jpg`;
    await setPhotoUrl(soloFicha.id, urlA);
    await setPhotoUrl(conPropia.id, urlB);
    const espejo = await seedPhoto(soloFicha.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: urlA,
    });
    await seedPhoto(conPropia.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: urlB,
    });
    const propia = await seedPhoto(conPropia.id, { status: "aprobada" });

    const res = await resolveCommunityPhotos(app, CTX, [
      soloFicha.id,
      conPropia.id,
    ]);

    expect(res.get(soloFicha.id)).toEqual({
      url: `https://r2.test/get/${espejo.storageKey}`,
      photoId: espejo.id,
    });
    expect(res.get(conPropia.id)?.photoId).toBe(propia.id);
  });

  it("espejo viejo, fila fallida o sin nada: ausente del Map; no escribe ni copia", async () => {
    const copyFromPublic = vi.fn<
      (publicKey: string, privateKey: string) => Promise<boolean>
    >(async () => true);
    mockPrivateMedia({ copyFromPublic });
    const viejo = await createTestMember(app);
    const fallida = await createTestMember(app);
    const nada = await createTestMember(app);
    const sinEspejo = await createTestMember(app);
    const urlViejaNueva = `${PUBLIC_URL}/members/photos/${viejo.id}-1700000000002.jpg`;
    const urlFallida = `${PUBLIC_URL}/members/photos/${fallida.id}-1700000000000.jpg`;
    await setPhotoUrl(viejo.id, urlViejaNueva);
    await setPhotoUrl(fallida.id, urlFallida);
    // photo_url cargada pero todavía sin espejo (el job aún no corrió).
    await setPhotoUrl(
      sinEspejo.id,
      `${PUBLIC_URL}/members/photos/${sinEspejo.id}-1700000000000.jpg`,
    );
    await seedPhoto(viejo.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: `${PUBLIC_URL}/members/photos/${viejo.id}-1700000000001.jpg`,
    });
    await seedPhoto(fallida.id, {
      origin: "ficha",
      status: "fallida",
      sourceUrl: urlFallida,
    });
    const filasAntes = (
      await Promise.all(
        [viejo, fallida, nada, sinEspejo].map((u) => rowsOf(u.id)),
      )
    ).flat().length;

    const res = await resolveCommunityPhotos(app, CTX, [
      viejo.id,
      fallida.id,
      nada.id,
      sinEspejo.id,
    ]);

    expect(res.size).toBe(0);
    expect(copyFromPublic).not.toHaveBeenCalled();
    const filasDespues = (
      await Promise.all(
        [viejo, fallida, nada, sinEspejo].map((u) => rowsOf(u.id)),
      )
    ).flat().length;
    expect(filasDespues).toBe(filasAntes);
  });

  it("sin storage: no tira y devuelve un Map vacío", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await createTestMember(app);
    await seedPhoto(m.id, { status: "aprobada" });

    const res = await resolveCommunityPhotos(app, CTX, [m.id]);

    expect(res.size).toBe(0);
  });

  it("una foto del gimnasio 2 no aparece para ese usuario en el gimnasio 1", async () => {
    mockPrivateMedia();
    const socio2 = gym2.socios[0];
    await seedPhoto(socio2.id, { status: "aprobada", ctx: CTX_DOS });

    const res = await resolveCommunityPhotos(app, CTX, [socio2.id]);

    expect(res.size).toBe(0);
  });

  it("ningún valor lleva el id del usuario ni la ruta pública (id grande para evitar colisiones)", async () => {
    await app.dbPool.query("ALTER TABLE users AUTO_INCREMENT = 54321");
    mockPrivateMedia();
    const m = await createTestMember(app);
    expect(m.id).toBeGreaterThan(1000);
    const idTexto = String(m.id);

    const subida = await requestUpload(m.token);
    const { key, photoId } = await uploadAndConfirm(m.token);
    await app.db
      .update(schema.memberPhotos)
      .set({ status: "aprobada" })
      .where(
        and(
          tenantWhere(schema.memberPhotos, CTX),
          eq(schema.memberPhotos.id, photoId),
        ),
      );
    await setPhotoUrl(
      m.id,
      `${PUBLIC_URL}/members/photos/${m.id}-1700000000000.jpg`,
    );
    const confirmada = await confirmRaw(m.token, subida.key);
    const resueltas = await resolveCommunityPhotos(app, CTX, [m.id]);

    const valores = [
      JSON.stringify(subida),
      confirmada.body,
      JSON.stringify([...resueltas.entries()]),
      key,
    ];
    for (const valor of valores) {
      expect(valor).not.toContain("members/photos/");
    }
    expect(resueltas.get(m.id)?.url).toBeDefined();
    // Cada clave: private/avatars/{tenant}/{24 hex}/{uuid}.jpg, sin el id.
    for (const clave of [subida.key, key]) {
      const partes = clave.split("/");
      expect(partes.slice(0, 3)).toEqual(["private", "avatars", "1"]);
      expect(partes[3]).toMatch(/^[0-9a-f]{24}$/);
      expect(partes).not.toContain(idTexto);
    }
    expect(subida.uploadUrl).not.toContain(`/${idTexto}/`);
    expect(String(resueltas.get(m.id)?.url)).not.toContain(`/${idTexto}/`);
    for (const valor of Object.values(subida)) {
      expect(valor).not.toBe(m.id);
      expect(valor).not.toBe(idTexto);
    }
  });
});

// ── autenticación ───────────────────────────────────────────────────

describe("sin token", () => {
  it("las 4 rutas responden 401", async () => {
    const llamadas: Array<{
      method: "POST" | "DELETE";
      url: string;
      payload?: Record<string, unknown>;
    }> = [
      {
        method: "POST",
        url: UPLOAD_URL,
        payload: { contentType: "image/jpeg", acceptedRules: true },
      },
      { method: "POST", url: CONFIRM_URL, payload: { key: "x" } },
      { method: "DELETE", url: REMOVE_URL },
      { method: "POST", url: reportUrl(1) },
    ];

    for (const llamada of llamadas) {
      const res = await app.inject(llamada);
      expect(res.statusCode, `${llamada.method} ${llamada.url}`).toBe(401);
    }
  });
});
