/**
 * Fase 214 Plan 15 (D-30, D-31, D-32, D-43, D-45, D-46, D-63, D-69): el staff
 * revisa la foto de perfil de los alumnos y `GET /auth/me` la devuelve.
 *
 *   - GET    /api/admin/members/profile-photos                      (cola)
 *   - POST   /api/admin/members/:userId/profile-photo/approve
 *   - POST   /api/admin/members/:userId/profile-photo/reject
 *   - DELETE /api/admin/members/:userId/profile-photo
 *   - GET    /api/auth/me (photoUrl y photo)
 *   - POST   /api/auth/me/delete-account (limpieza de fotos)
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
import { publicKeyFromFichaUrl } from "../../src/modules/conquer/private-media";
import { PHOTO_REJECTION_PUSH_BODY } from "../../src/modules/members/profile-photo-service";
import { NotificationService } from "../../src/modules/notifications/service";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  cleanAllTestData,
  createStaffUser,
  createTestApp,
  createTestMember,
  getAuthToken,
} from "../helpers";
import { createConquerStaff, mockPrivateMedia } from "../conquer/_helpers";
import {
  FOTO_CTX,
  FOTO_PUBLIC_URL,
  photoRowById,
  photoRowsOf,
  profilePhotoAuraRows,
  readUserPhotoUrl,
  seedMemberPhoto,
  setUserPhotoUrl,
  uploadAndConfirmAsMember,
} from "./_profile-photo-helpers";

const ADMIN = "/api/admin/members";
const QUEUE_URL = `${ADMIN}/profile-photos`;

interface QueueItem {
  photoId: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  branchId: number | null;
  origin: string;
  status: string;
  reportCount: number;
  lastReportedAt: string | null;
  uploadedAt: string;
  url: string;
}

interface QueueBody {
  items: QueueItem[];
  counts: { pending: number; reported: number };
}

interface MeBody {
  photoUrl: string | null;
  photo: {
    url: string | null;
    status: "none" | "pendiente" | "aprobada" | "rechazada";
    pendingUrl: string | null;
    rejectionReason: string | null;
  };
}

let app: FastifyInstance;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * La foto que el staff "vio" en la cola: la última pendiente del alumno o, si no
 * hay, la última aprobada con reportes. Sin ninguna devuelve un id inexistente.
 * Los tests de carrera pasan un `photoId` explícito (el viejo).
 */
async function photoSeenByStaff(userId: number): Promise<number> {
  const rows = await photoRowsOf(app, userId);
  const seen =
    [...rows].reverse().find((row) => row.status === "pendiente") ??
    [...rows]
      .reverse()
      .find((row) => row.status === "aprobada" && row.reportCount > 0);
  return seen?.id ?? 2_000_000_000;
}

async function approve(token: string, userId: number, photoId?: number) {
  return app.inject({
    method: "POST",
    url: `${ADMIN}/${userId}/profile-photo/approve`,
    headers: auth(token),
    payload: { photoId: photoId ?? (await photoSeenByStaff(userId)) },
  });
}

async function reject(
  token: string,
  userId: number,
  payload?: Record<string, unknown>,
  photoId?: number,
) {
  return app.inject({
    method: "POST",
    url: `${ADMIN}/${userId}/profile-photo/reject`,
    headers: auth(token),
    payload: {
      photoId: photoId ?? (await photoSeenByStaff(userId)),
      ...(payload ?? {}),
    },
  });
}

function removeAsStaff(token: string, userId: number) {
  return app.inject({
    method: "DELETE",
    url: `${ADMIN}/${userId}/profile-photo`,
    headers: auth(token),
  });
}

async function readQueue(token: string): Promise<QueueBody> {
  const res = await app.inject({
    method: "GET",
    url: QUEUE_URL,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  return res.json<QueueBody>();
}

async function readMe(token: string): Promise<MeBody> {
  const res = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  return res.json<MeBody>();
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await cleanAllTestData(app);
  await app.close();
});

// ── cola ────────────────────────────────────────────────────────────

describe("GET /profile-photos (cola de revisión)", () => {
  it("un coach ve las pendientes y las aprobadas reportadas (reportadas primero), con URL firmada y conteos", async () => {
    mockPrivateMedia();
    const coach = await createConquerStaff(app, "coach");
    const pendiente = await createTestMember(app);
    const reportada = await createTestMember(app);
    const fichaReportada = await createTestMember(app);
    const fichaSana = await createTestMember(app);
    const quitada = await createTestMember(app);
    const rechazada = await createTestMember(app);

    const fPendiente = await seedMemberPhoto(app, pendiente.id);
    const fReportada = await seedMemberPhoto(app, reportada.id, {
      status: "aprobada",
      reportCount: 2,
      reporterIds: [pendiente.id, quitada.id],
    });
    const fFichaReportada = await seedMemberPhoto(app, fichaReportada.id, {
      origin: "ficha",
      status: "aprobada",
      reportCount: 1,
      reporterIds: [pendiente.id],
    });
    await seedMemberPhoto(app, fichaSana.id, {
      origin: "ficha",
      status: "aprobada",
    });
    await seedMemberPhoto(app, quitada.id, { status: "quitada" });
    await seedMemberPhoto(app, rechazada.id, { status: "rechazada" });

    const body = await readQueue(coach.token);

    expect(body.counts).toEqual({ pending: 1, reported: 2 });
    const ids = body.items.map((item) => item.photoId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids.slice(0, 2))).toEqual(
      new Set([fReportada.id, fFichaReportada.id]),
    );
    expect(ids[2]).toBe(fPendiente.id);
    for (const item of body.items) {
      expect(item.url.startsWith("https://r2.test/get/")).toBe(true);
    }
    const reportadaItem = body.items.find((i) => i.photoId === fReportada.id);
    expect(reportadaItem?.reportCount).toBe(2);
    expect(reportadaItem?.origin).toBe("alumno");
    expect(reportadaItem?.userId).toBe(reportada.id);
    expect(
      body.items.find((i) => i.photoId === fFichaReportada.id)?.origin,
    ).toBe("ficha");
  });

  it("sin storage configurado y con fotos en la cola: 503 FOTO_PERFIL_NO_DISPONIBLE", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const coach = await createConquerStaff(app, "coach");
    const m = await createTestMember(app);
    await seedMemberPhoto(app, m.id);

    const res = await app.inject({
      method: "GET",
      url: QUEUE_URL,
      headers: auth(coach.token),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json<{ code?: string }>().code).toBe(
      "FOTO_PERFIL_NO_DISPONIBLE",
    );
  });
});

// ── aprobar ─────────────────────────────────────────────────────────

describe("POST /:userId/profile-photo/approve", () => {
  it("aprueba la pendiente y acredita 5 puntos con reference_id = userId", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    const foto = await seedMemberPhoto(app, m.id);

    const res = await approve(staff.token, m.id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "aprobada", auraAwarded: true });
    const row = await photoRowById(app, foto.id);
    expect(row.status).toBe("aprobada");
    expect(row.reviewedBy).toBe(staff.id);
    expect(row.reviewedAt).not.toBeNull();
    const ledger = await profilePhotoAuraRows(app, m.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.amount).toBe(5);
    expect(ledger[0]?.referenceId).toBe(m.id);
    expect(ledger[0]?.referenceType).toBe("profile_photo");
  });

  it("una sola vez en la vida: quitar, volver a subir y aprobar no vuelve a pagar", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);

    await uploadAndConfirmAsMember(app, m.token);
    const primera = await approve(staff.token, m.id);
    expect(primera.json<{ auraAwarded: boolean }>().auraAwarded).toBe(true);

    const quitar = await app.inject({
      method: "DELETE",
      url: "/api/members/profile-photo",
      headers: auth(m.token),
    });
    expect(quitar.statusCode).toBe(204);

    await uploadAndConfirmAsMember(app, m.token);
    const segunda = await approve(staff.token, m.id);

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json<{ auraAwarded: boolean }>().auraAwarded).toBe(false);
    expect(await profilePhotoAuraRows(app, m.id)).toHaveLength(1);
    const rows = await photoRowsOf(app, m.id);
    expect(rows.map((row) => row.status)).toEqual(["quitada", "aprobada"]);
  });

  it("con una aprobada previa: la previa queda reemplazada y se borra su objeto", async () => {
    const remove = vi.fn(async () => undefined);
    mockPrivateMedia({ remove });
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    const previa = await seedMemberPhoto(app, m.id, { status: "aprobada" });
    const nueva = await seedMemberPhoto(app, m.id);

    const res = await approve(staff.token, m.id);

    expect(res.statusCode).toBe(200);
    expect((await photoRowById(app, previa.id)).status).toBe("reemplazada");
    expect((await photoRowById(app, nueva.id)).status).toBe("aprobada");
    expect(remove).toHaveBeenCalledWith(previa.storageKey);
  });

  it("una aprobada reportada sin pendiente: reportes en 0 y sin Aura nueva", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    const otro = await createTestMember(app);
    const foto = await seedMemberPhoto(app, m.id, {
      status: "aprobada",
      reportCount: 1,
      reporterIds: [otro.id],
    });

    const res = await approve(staff.token, m.id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "aprobada", auraAwarded: false });
    const row = await photoRowById(app, foto.id);
    expect(row.status).toBe("aprobada");
    expect(row.reportCount).toBe(0);
    expect(row.reporterIds).toBeNull();
    expect(await profilePhotoAuraRows(app, m.id)).toHaveLength(0);
  });

  it("aprobar una reportada la saca de la cola y quien reportó puede volver a reportarla", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const dueno = await createTestMember(app);
    const reporter = await createTestMember(app);
    const foto = await seedMemberPhoto(app, dueno.id, {
      status: "aprobada",
      reportCount: 1,
      reporterIds: [reporter.id],
    });
    expect((await readQueue(staff.token)).counts.reported).toBe(1);

    await approve(staff.token, dueno.id);

    expect((await readQueue(staff.token)).items).toHaveLength(0);
    const again = await app.inject({
      method: "POST",
      url: `/api/members/profile-photos/${foto.id}/report`,
      headers: auth(reporter.token),
    });
    expect(again.statusCode).toBe(204);
    expect((await photoRowById(app, foto.id)).reportCount).toBe(1);
  });

  it("carrera: si el alumno subió otra foto después de que el staff vio la vieja, 409 y no aprueba nada", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    const vista = await seedMemberPhoto(app, m.id);
    // El alumno sube otra: la vista pasa a reemplazada y la nueva queda pendiente.
    await app.db
      .update(schema.memberPhotos)
      .set({ status: "reemplazada" })
      .where(eq(schema.memberPhotos.id, vista.id));
    const nueva = await seedMemberPhoto(app, m.id);

    const res = await approve(staff.token, m.id, vista.id);

    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe("FOTO_PERFIL_CAMBIO");
    expect((await photoRowById(app, nueva.id)).status).toBe("pendiente");
    expect((await photoRowById(app, vista.id)).status).toBe("reemplazada");
    expect(await profilePhotoAuraRows(app, m.id)).toHaveLength(0);
  });

  it("un photoId de otro alumno no aprueba nada: 409", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    const otro = await createTestMember(app);
    const mia = await seedMemberPhoto(app, m.id);
    const ajena = await seedMemberPhoto(app, otro.id);

    const res = await approve(staff.token, m.id, ajena.id);

    expect(res.statusCode).toBe(409);
    expect((await photoRowById(app, mia.id)).status).toBe("pendiente");
    expect((await photoRowById(app, ajena.id)).status).toBe("pendiente");
  });

  it("sin photoId en el cuerpo: 400", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    await seedMemberPhoto(app, m.id);

    const res = await app.inject({
      method: "POST",
      url: `${ADMIN}/${m.id}/profile-photo/approve`,
      headers: auth(staff.token),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("sin foto para revisar: 404", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);

    const res = await approve(staff.token, m.id);

    expect(res.statusCode).toBe(404);
    expect(await profilePhotoAuraRows(app, m.id)).toHaveLength(0);
  });
});

// ── rechazar ────────────────────────────────────────────────────────

describe("POST /:userId/profile-photo/reject", () => {
  it("rechaza con motivo: guarda el motivo, borra el objeto y encola el aviso", async () => {
    const remove = vi.fn(async () => undefined);
    mockPrivateMedia({ remove });
    const staff = await createConquerStaff(app, "coach");
    const m = await createTestMember(app);
    await new NotificationService(app.db, app.log).registerToken(
      m.id,
      `tok-${m.id}-${Date.now()}`,
      "android",
    );
    const foto = await seedMemberPhoto(app, m.id);

    const res = await reject(staff.token, m.id, { reason: "sin_cara" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "rechazada" });
    const row = await photoRowById(app, foto.id);
    expect(row.status).toBe("rechazada");
    expect(row.rejectionReason).toBe("sin_cara");
    expect(row.reviewedBy).toBe(staff.id);
    expect(remove).toHaveBeenCalledWith(foto.storageKey);
    const avisos = await app.db
      .select()
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, FOTO_CTX),
          eq(schema.pendingNotifications.userId, m.id),
        ),
      );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.title).toBe("Tu foto no fue aprobada");
    expect(avisos[0]?.body).toBe(PHOTO_REJECTION_PUSH_BODY.sin_cara);
    expect(await profilePhotoAuraRows(app, m.id)).toHaveLength(0);
  });

  it("sin motivo o con un motivo fuera de la lista: 400 y la foto sigue pendiente", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    const foto = await seedMemberPhoto(app, m.id);

    const sin = await reject(staff.token, m.id, {});
    const invalido = await reject(staff.token, m.id, { reason: "porque_si" });

    expect(sin.statusCode).toBe(400);
    expect(invalido.statusCode).toBe(400);
    expect((await photoRowById(app, foto.id)).status).toBe("pendiente");
  });

  it("carrera: si la foto vista ya no es la pendiente, 409 y no rechaza la nueva", async () => {
    const remove = vi.fn(async () => undefined);
    mockPrivateMedia({ remove });
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    const vista = await seedMemberPhoto(app, m.id);
    await app.db
      .update(schema.memberPhotos)
      .set({ status: "reemplazada" })
      .where(eq(schema.memberPhotos.id, vista.id));
    const nueva = await seedMemberPhoto(app, m.id);

    const res = await reject(staff.token, m.id, { reason: "otro" }, vista.id);

    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe("FOTO_PERFIL_CAMBIO");
    expect((await photoRowById(app, nueva.id)).status).toBe("pendiente");
    expect(remove).not.toHaveBeenCalled();
  });

  it("sin pendiente: 404", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    await seedMemberPhoto(app, m.id, { status: "aprobada" });

    const res = await reject(staff.token, m.id, { reason: "otro" });

    expect(res.statusCode).toBe(404);
  });
});

// ── quitar ──────────────────────────────────────────────────────────

describe("DELETE /:userId/profile-photo", () => {
  it("el staff quita la foto visible: quitada, photo_url en NULL y el ledger no cambia", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    await seedMemberPhoto(app, m.id);
    await approve(staff.token, m.id);
    await setUserPhotoUrl(app, m.id, `${FOTO_PUBLIC_URL}/x.jpg`);
    const antes = await profilePhotoAuraRows(app, m.id);

    const res = await removeAsStaff(staff.token, m.id);

    expect(res.statusCode).toBe(204);
    const rows = await photoRowsOf(app, m.id);
    expect(rows.every((row) => row.status === "quitada")).toBe(true);
    expect(rows[0]?.reviewedBy).toBe(staff.id);
    expect(await readUserPhotoUrl(app, m.id)).toBeNull();
    expect(await profilePhotoAuraRows(app, m.id)).toEqual(antes);
    expect(antes).toHaveLength(1);
  });
});

// ── permisos y sedes ────────────────────────────────────────────────

describe("permisos", () => {
  it("un socio recibe 403 en las 4 rutas del staff", async () => {
    mockPrivateMedia();
    const socio = await createTestMember(app);
    const otro = await createTestMember(app);

    const cola = await app.inject({
      method: "GET",
      url: QUEUE_URL,
      headers: auth(socio.token),
    });
    const aprobar = await approve(socio.token, otro.id);
    const rechazar = await reject(socio.token, otro.id, { reason: "otro" });
    const quitar = await removeAsStaff(socio.token, otro.id);

    expect(cola.statusCode).toBe(403);
    expect(aprobar.statusCode).toBe(403);
    expect(rechazar.statusCode).toBe(403);
    expect(quitar.statusCode).toBe(403);
  });

  it("un admin_sede ve solo su sede y recibe 404 al revisar alumnos de otra sede", async () => {
    mockPrivateMedia();
    const u = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const [b] = await app.db
      .insert(schema.branches)
      .values({
        name: `Fotos sede B ${u}`,
        code: `FB-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    if (!b) throw new Error("no se pudo crear la sede B");
    const email = `admin-sede-fotos-${u}@test.local`;
    await createStaffUser(app, {
      email,
      password: "test1234",
      firstName: "Admin",
      lastName: "Sede",
      role: "admin_sede",
      branchId: 1,
    });
    const token = await getAuthToken(app, email, "test1234");
    const propio = await createTestMember(app, { branchId: 1 });
    const ajeno = await createTestMember(app, { branchId: b.id });
    const fPropia = await seedMemberPhoto(app, propio.id);
    const fAjena = await seedMemberPhoto(app, ajeno.id);

    const cola = await readQueue(token);
    expect(cola.items.map((item) => item.photoId)).toEqual([fPropia.id]);
    expect(cola.counts.pending).toBe(1);

    const aprobar = await approve(token, ajeno.id);
    const rechazar = await reject(token, ajeno.id, { reason: "otro" });
    const quitar = await removeAsStaff(token, ajeno.id);
    expect(aprobar.statusCode).toBe(404);
    expect(rechazar.statusCode).toBe(404);
    expect(quitar.statusCode).toBe(404);
    expect((await photoRowById(app, fAjena.id)).status).toBe("pendiente");
    expect(await profilePhotoAuraRows(app, ajeno.id)).toHaveLength(0);

    const propia = await approve(token, propio.id);
    expect(propia.statusCode).toBe(200);
    expect((await photoRowById(app, fPropia.id)).status).toBe("aprobada");
  });
});

// ── GET /auth/me ────────────────────────────────────────────────────

describe("GET /auth/me (foto)", () => {
  it("sin foto: status none y photoUrl nulo", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);

    const me = await readMe(m.token);

    expect(me.photoUrl).toBeNull();
    expect(me.photo).toEqual({
      url: null,
      status: "none",
      pendingUrl: null,
      rejectionReason: null,
    });
  });

  it("con una pendiente: status pendiente y pendingUrl firmada", async () => {
    mockPrivateMedia();
    const m = await createTestMember(app);
    await uploadAndConfirmAsMember(app, m.token);

    const me = await readMe(m.token);

    expect(me.photo.status).toBe("pendiente");
    expect(me.photo.pendingUrl).not.toBeNull();
    expect(me.photo.pendingUrl?.startsWith("https://r2.test/get/")).toBe(true);
    expect(me.photoUrl).toBeNull();
  });

  it("con una aprobada: photoUrl firmada", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    await uploadAndConfirmAsMember(app, m.token);
    await approve(staff.token, m.id);

    const me = await readMe(m.token);

    expect(me.photo.status).toBe("aprobada");
    expect(me.photoUrl).not.toBeNull();
    expect(me.photoUrl).toBe(me.photo.url);
    expect(me.photo.pendingUrl).toBeNull();
  });

  it("rechazada: devuelve el motivo y, al subir otra, vuelve a pendiente sin motivo", async () => {
    mockPrivateMedia();
    const staff = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    await uploadAndConfirmAsMember(app, m.token);
    await reject(staff.token, m.id, { reason: "sin_cara" });

    const rechazada = await readMe(m.token);
    expect(rechazada.photo.status).toBe("rechazada");
    expect(rechazada.photo.rejectionReason).toBe("sin_cara");

    await uploadAndConfirmAsMember(app, m.token);
    const otra = await readMe(m.token);
    expect(otra.photo.status).toBe("pendiente");
    expect(otra.photo.rejectionReason).toBeNull();
  });

  it("solo con la foto de la ficha: photoUrl firmada del bucket privado, sin la URL pública ni el id", async () => {
    vi.stubEnv("R2_PUBLIC_URL", FOTO_PUBLIC_URL);
    mockPrivateMedia();
    const m = await createTestMember(app);
    const publicUrl = `${FOTO_PUBLIC_URL}/members/photos/${m.id}-1700000000000.jpg`;
    await setUserPhotoUrl(app, m.id, publicUrl);
    await seedMemberPhoto(app, m.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: publicUrl,
    });

    const me = await readMe(m.token);

    expect(me.photoUrl).not.toBeNull();
    expect(me.photoUrl?.startsWith("https://r2.test/get/private/")).toBe(true);
    expect(me.photoUrl).not.toContain("members/photos/");
    expect(me.photoUrl).not.toContain(FOTO_PUBLIC_URL);
    const segmento = /private\/avatars\/1\/([^/]+)\//.exec(me.photoUrl ?? "");
    expect(segmento?.[1]).toBeDefined();
    expect(segmento?.[1]).not.toBe(String(m.id));
    expect(me.photo.status).toBe("aprobada");
  });

  it("sin storage configurado: /me responde igual, con las URLs nulas", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await createTestMember(app);
    await seedMemberPhoto(app, m.id, { status: "aprobada" });
    await seedMemberPhoto(app, m.id);

    const me = await readMe(m.token);

    expect(me.photoUrl).toBeNull();
    expect(me.photo.pendingUrl).toBeNull();
    expect(me.photo.status).toBe("pendiente");
  });
});

// ── borrar la cuenta ────────────────────────────────────────────────

describe("POST /auth/me/delete-account (fotos)", () => {
  it("las fotos propias y de ficha quedan quitadas y se borra el objeto público de la ficha", async () => {
    vi.stubEnv("R2_PUBLIC_URL", FOTO_PUBLIC_URL);
    const remove = vi.fn(async () => undefined);
    const removePublic = vi.fn(async () => undefined);
    mockPrivateMedia({ remove, removePublic });
    const m = await createTestMember(app);
    const publicUrl = `${FOTO_PUBLIC_URL}/members/photos/${m.id}-1700000000000.jpg`;
    await setUserPhotoUrl(app, m.id, publicUrl);
    const propia = await seedMemberPhoto(app, m.id, { status: "aprobada" });
    const ficha = await seedMemberPhoto(app, m.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: publicUrl,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/me/delete-account",
      headers: auth(m.token),
      payload: { password: "pass123456" },
    });

    expect(res.statusCode).toBe(200);
    const rows = await photoRowsOf(app, m.id);
    expect(rows.map((row) => row.status)).toEqual(["quitada", "quitada"]);
    expect(remove).toHaveBeenCalledWith(propia.storageKey);
    expect(remove).toHaveBeenCalledWith(ficha.storageKey);
    expect(removePublic).toHaveBeenCalledWith(
      publicKeyFromFichaUrl(publicUrl, m.id),
    );
    expect(await readUserPhotoUrl(app, m.id)).toBeNull();
  });

  it("sin storage configurado el borrado de la cuenta sigue y las filas igual quedan quitadas", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await createTestMember(app);
    const foto = await seedMemberPhoto(app, m.id, { status: "aprobada" });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/me/delete-account",
      headers: auth(m.token),
      payload: { password: "pass123456" },
    });

    expect(res.statusCode).toBe(200);
    expect((await photoRowById(app, foto.id)).status).toBe("quitada");
  });
});
