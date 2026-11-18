/**
 * Espejo de la foto de ficha (fase 214-13): `mirrorFichaPhotos` y el barrido
 * `runFichaPhotoMirror`.
 *
 * Contra MySQL real, con la tienda privada reemplazada por un doble
 * (`mockPrivateMedia`). Cubre: copia única por `photo_url` exitosa, reintentos
 * de las fallidas (hasta 4 intentos y luego se abandona, fase 215), cambio de
 * `photo_url` por el staff, URL con otro formato, URL reciente (la foto todavía
 * se está subiendo) y aislamiento por gimnasio.
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
  FICHA_MIRROR_MAX_ATTEMPTS,
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

  it("si la copia devuelve false deja una fila fallida y la corrida siguiente la reintenta", async () => {
    const member = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, member.id, fichaUrl(member.id));
    const copyFromPublic = vi.fn(async () => false);
    mockPrivateMedia({ copyFromPublic });

    const first = await mirrorFichaPhotos(app, TEMPLO_CTX);
    expect(first.failed).toBe(1);
    expect(await fichaRows(TEMPLO_CTX, member.id)).toHaveLength(1);

    const second = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(second).toEqual({ mirrored: 0, failed: 1, skipped: 0 });
    expect(copyFromPublic).toHaveBeenCalledTimes(2);
    const rows = await fichaRows(TEMPLO_CTX, member.id);
    expect(rows.map((r) => r.status)).toEqual(["fallida", "fallida"]);
  });

  it("falla 3 veces y la 4ª copia sale: queda aprobada y ya no se vuelve a intentar", async () => {
    const member = await createTestMember(app);
    const url = fichaUrl(member.id);
    await setPhotoUrl(TEMPLO_CTX, member.id, url);
    let llamadas = 0;
    const copyFromPublic = vi.fn(async () => {
      llamadas += 1;
      if (llamadas < FICHA_MIRROR_MAX_ATTEMPTS) throw new Error("R2 caído");
      return true;
    });
    mockPrivateMedia({ copyFromPublic });

    const resultados = [];
    for (let i = 0; i < FICHA_MIRROR_MAX_ATTEMPTS; i += 1) {
      resultados.push(await mirrorFichaPhotos(app, TEMPLO_CTX));
    }
    const quinta = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(resultados.map((r) => r.failed)).toEqual([1, 1, 1, 0]);
    expect(resultados[3]?.mirrored).toBe(1);
    expect(quinta).toEqual({ mirrored: 0, failed: 0, skipped: 0 });
    expect(copyFromPublic).toHaveBeenCalledTimes(4);
    const rows = await fichaRows(TEMPLO_CTX, member.id);
    expect(rows.map((r) => r.status)).toEqual([
      "fallida",
      "fallida",
      "fallida",
      "aprobada",
    ]);
    expect(rows.every((r) => r.sourceUrl === url)).toBe(true);
  });

  it("falla las 4 veces: queda fallida para siempre y la 5ª corrida no copia", async () => {
    const member = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, member.id, fichaUrl(member.id));
    const copyFromPublic = vi.fn(async () => false);
    mockPrivateMedia({ copyFromPublic });

    for (let i = 0; i < FICHA_MIRROR_MAX_ATTEMPTS; i += 1) {
      const res = await mirrorFichaPhotos(app, TEMPLO_CTX);
      expect(res.failed).toBe(1);
    }
    const quinta = await mirrorFichaPhotos(app, TEMPLO_CTX);
    const sexta = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(FICHA_MIRROR_MAX_ATTEMPTS).toBe(4);
    expect(quinta).toEqual({ mirrored: 0, failed: 0, skipped: 0 });
    expect(sexta).toEqual({ mirrored: 0, failed: 0, skipped: 0 });
    expect(copyFromPublic).toHaveBeenCalledTimes(4);
    const rows = await fichaRows(TEMPLO_CTX, member.id);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === "fallida")).toBe(true);
  });

  it("una URL abandonada no ocupa el tope de la corrida: los demás usuarios se siguen copiando", async () => {
    const abandonado = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, abandonado.id, fichaUrl(abandonado.id));
    const copyFromPublic = vi.fn(async () => false);
    mockPrivateMedia({ copyFromPublic });
    for (let i = 0; i < FICHA_MIRROR_MAX_ATTEMPTS; i += 1) {
      await mirrorFichaPhotos(app, TEMPLO_CTX);
    }

    const otro = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, otro.id, fichaUrl(otro.id));
    vi.restoreAllMocks();
    mockPrivateMedia({ copyFromPublic: async () => true });
    const res = await mirrorFichaPhotos(app, TEMPLO_CTX, { limit: 1 });

    expect(res.mirrored).toBe(1);
    expect((await fichaRows(TEMPLO_CTX, otro.id))[0]?.status).toBe("aprobada");
    expect(await fichaRows(TEMPLO_CTX, abandonado.id)).toHaveLength(4);
  });

  it("si la copia tira un error queda una fila fallida por intento y el log no lleva la URL", async () => {
    const member = await createTestMember(app);
    const url = fichaUrl(member.id);
    await setPhotoUrl(TEMPLO_CTX, member.id, url);
    mockPrivateMedia({
      copyFromPublic: async () => {
        throw new Error("boom");
      },
    });
    const warn = vi.spyOn(app.log, "warn");

    const res = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(res.failed).toBe(1);
    expect((await fichaRows(TEMPLO_CTX, member.id))[0]?.status).toBe("fallida");
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(url);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("members/photos");
  });

  it("si el staff cambia la photo_url después de fallar, el contador de intentos arranca de cero", async () => {
    const member = await createTestMember(app);
    await setPhotoUrl(TEMPLO_CTX, member.id, fichaUrl(member.id, 2 * 3600_000));
    mockPrivateMedia({ copyFromPublic: async () => false });
    for (let i = 0; i < FICHA_MIRROR_MAX_ATTEMPTS; i += 1) {
      await mirrorFichaPhotos(app, TEMPLO_CTX);
    }

    await setPhotoUrl(
      TEMPLO_CTX,
      member.id,
      fichaUrl(member.id, 3600_000, "png"),
    );
    vi.restoreAllMocks();
    mockPrivateMedia({ copyFromPublic: async () => true });
    const res = await mirrorFichaPhotos(app, TEMPLO_CTX);

    expect(res.mirrored).toBe(1);
    const rows = await fichaRows(TEMPLO_CTX, member.id);
    expect(rows[rows.length - 1]?.status).toBe("aprobada");
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

  it("una photo_url con otro formato queda fallida sin llamar a la copia, también al reintentar", async () => {
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

    // Cada corrida suma un intento fallido, sin tocar nunca el bucket público,
    // hasta el tope: a la 5ª ya no hay nada que hacer.
    for (let i = 1; i < FICHA_MIRROR_MAX_ATTEMPTS; i += 1) {
      await mirrorFichaPhotos(app, TEMPLO_CTX);
    }
    const despues = await mirrorFichaPhotos(app, TEMPLO_CTX);
    expect(despues).toEqual({ mirrored: 0, failed: 0, skipped: 0 });
    expect(await fichaRows(TEMPLO_CTX, member.id)).toHaveLength(
      FICHA_MIRROR_MAX_ATTEMPTS,
    );
    expect(copyFromPublic).not.toHaveBeenCalled();
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
