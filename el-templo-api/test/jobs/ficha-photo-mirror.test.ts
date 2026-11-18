/**
 * Espejo de la foto de ficha (fase 214-13): `mirrorFichaPhotos` y el barrido
 * `runFichaPhotoMirror`.
 *
 * Contra MySQL real, con la tienda privada reemplazada por un doble
 * (`mockPrivateMedia`). Cubre: copia única por `photo_url` (éxito y `fallida`),
 * cambio de `photo_url` por el staff, URL con otro formato, URL reciente (la
 * foto todavía se está subiendo) y aislamiento por gimnasio.
 *
 * Sin ids de `users` hardcodeados.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import { mockPrivateMedia } from "../conquer/_helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  FICHA_PHOTO_MIN_AGE_MS,
  mirrorFichaPhotos,
} from "../../src/modules/members/ficha-photo-mirror";
import { runFichaPhotoMirror } from "../../src/jobs/ficha-photo-mirror";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";

const PUBLIC_BASE = "https://pub.test";
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const DOS_CTX = { tenantId: TENANT_DOS };

/** `photo_url` con la forma real y una antigüedad de `ageMs` (default 1 hora). */
function fichaUrl(userId: number, ageMs = 60 * 60 * 1000, ext = "jpg") {
  return `${PUBLIC_BASE}/members/photos/${userId}-${Date.now() - ageMs}.${ext}`;
}

describe("espejo de la foto de ficha", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    vi.stubEnv("R2_PUBLIC_URL", PUBLIC_BASE);
    await cleanAllTestData(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function setPhotoUrl(
    ctx: { tenantId: number },
    userId: number,
    photoUrl: string,
  ): Promise<void> {
    await app.db
      .update(schema.users)
      .set({ photoUrl })
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));
  }

  async function fichaRows(ctx: { tenantId: number }, userId: number) {
    return app.db
      .select()
      .from(schema.memberPhotos)
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          eq(schema.memberPhotos.userId, userId),
          eq(schema.memberPhotos.origin, "ficha"),
        ),
      )
      .orderBy(asc(schema.memberPhotos.id));
  }

  it("copia la foto con la forma real y deja una fila ficha aprobada", async () => {
    const member = await createTestMember(app);
    const url = fichaUrl(member.id);
    await setPhotoUrl(TEMPLO_CTX, member.id, url);
    const copyFromPublic = vi.fn(async () => true);
    mockPrivateMedia({ copyFromPublic });

    const res = await runFichaPhotoMirror(app);

    expect(res.mirrored).toBe(1);
    expect(copyFromPublic).toHaveBeenCalledTimes(1);
    const rows = await fichaRows(TEMPLO_CTX, member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("aprobada");
    expect(rows[0]?.sourceUrl).toBe(url);
    expect(rows[0]?.storageKey).toMatch(
      /^private\/avatars\/\d+\/[0-9a-f]{24}\/ficha-[0-9a-f]{16}\.jpg$/,
    );
    expect(rows[0]?.storageKey).not.toContain(`/${member.id}/`);
    // El origen sale de la URL pública, la clave destino es la del espejo.
    expect(copyFromPublic).toHaveBeenCalledWith(
      url.slice(`${PUBLIC_BASE}/`.length),
      rows[0]?.storageKey,
    );
  });

  it("una segunda corrida no vuelve a copiar la misma photo_url", async () => {
    const member = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, member.id, fichaUrl(member.id));
    const copyFromPublic = vi.fn(async () => true);
    mockPrivateMedia({ copyFromPublic });

    await mirrorFichaPhotos(app, TEMPLO_CTX);
    const second = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(second).toEqual({ mirrored: 0, failed: 0, skipped: 0 });
    expect(copyFromPublic).toHaveBeenCalledTimes(1);
    expect(await fichaRows(TEMPLO_CTX, member.id)).toHaveLength(1);
  });

  it("si la copia devuelve false deja una fila fallida y no se reintenta", async () => {
    const member = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, member.id, fichaUrl(member.id));
    const copyFromPublic = vi.fn(async () => false);
    mockPrivateMedia({ copyFromPublic });

    const first = await mirrorFichaPhotos(app, TEMPLO_CTX);
    const second = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(first.failed).toBe(1);
    expect(second).toEqual({ mirrored: 0, failed: 0, skipped: 0 });
    expect(copyFromPublic).toHaveBeenCalledTimes(1);
    const rows = await fichaRows(TEMPLO_CTX, member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("fallida");
  });

  it("si la copia tira un error tambien queda fallida", async () => {
    const member = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, member.id, fichaUrl(member.id));
    mockPrivateMedia({
      copyFromPublic: async () => {
        throw new Error("boom");
      },
    });

    const res = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(res.failed).toBe(1);
    expect((await fichaRows(TEMPLO_CTX, member.id))[0]?.status).toBe("fallida");
  });

  it("si el staff cambia la photo_url el espejo viejo queda reemplazado y se copia el nuevo", async () => {
    const member = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, member.id, fichaUrl(member.id, 2 * 3600_000));
    const copyFromPublic = vi.fn(async () => true);
    const remove = vi.fn(async () => undefined);
    mockPrivateMedia({ copyFromPublic, remove });
    await mirrorFichaPhotos(app, TEMPLO_CTX);
    const [first] = await fichaRows(TEMPLO_CTX, member.id);

    await setPhotoUrl(
      TEMPLO_CTX,
      member.id,
      fichaUrl(member.id, 3600_000, "png"),
    );
    const res = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(res.mirrored).toBe(1);
    expect(copyFromPublic).toHaveBeenCalledTimes(2);
    const rows = await fichaRows(TEMPLO_CTX, member.id);
    expect(rows.map((r) => r.status)).toEqual(["reemplazada", "aprobada"]);
    expect(rows[1]?.storageKey.endsWith(".png")).toBe(true);
    expect(remove).toHaveBeenCalledWith(first?.storageKey);
  });

  it("una photo_url con otro formato queda fallida sin llamar a la copia", async () => {
    const member = await createTestMember(app);
    await setPhotoUrl(
      TEMPLO_CTX,
      member.id,
      `https://otro.example/fotos/${member.id}-1700000000000.jpg`,
    );
    const copyFromPublic = vi.fn(async () => true);
    mockPrivateMedia({ copyFromPublic });

    const res = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(res.failed).toBe(1);
    expect(copyFromPublic).not.toHaveBeenCalled();
    expect((await fichaRows(TEMPLO_CTX, member.id))[0]?.status).toBe("fallida");
  });

  it("ignora una photo_url de menos de 15 minutos y la copia cuando madura", async () => {
    const member = await createTestMember(app);
    const fresh = fichaUrl(member.id, 60_000);
    await setPhotoUrl(TEMPLO_CTX, member.id, fresh);
    const copyFromPublic = vi.fn(async () => true);
    mockPrivateMedia({ copyFromPublic });

    const early = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(early).toEqual({ mirrored: 0, failed: 0, skipped: 1 });
    expect(copyFromPublic).not.toHaveBeenCalled();
    expect(await fichaRows(TEMPLO_CTX, member.id)).toHaveLength(0);

    const later = await mirrorFichaPhotos(app, TEMPLO_CTX, {
      now: new Date(Date.now() + FICHA_PHOTO_MIN_AGE_MS + 1000),
    });

    expect(later.mirrored).toBe(1);
    expect(copyFromPublic).toHaveBeenCalledTimes(1);
  });

  it("no toca a los usuarios del otro gimnasio", async () => {
    const gym2 = await seedSecondTenant(app);
    const socio = gym2.socios[0];
    await setPhotoUrl(DOS_CTX, socio.id, fichaUrl(socio.id));
    const copyFromPublic = vi.fn(async () => true);
    mockPrivateMedia({ copyFromPublic });

    const fromTemplo = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(fromTemplo).toEqual({ mirrored: 0, failed: 0, skipped: 0 });
    expect(copyFromPublic).not.toHaveBeenCalled();
    expect(await fichaRows(DOS_CTX, socio.id)).toHaveLength(0);

    const fromDos = await mirrorFichaPhotos(app, DOS_CTX);

    expect(fromDos.mirrored).toBe(1);
    const rows = await fichaRows(DOS_CTX, socio.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(TENANT_DOS);
  });
});
