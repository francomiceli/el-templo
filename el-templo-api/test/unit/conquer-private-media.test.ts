/**
 * Fase 201 Plan 12: tienda privada de fotos del control fisico (S12-8, T-201-39,
 * T-201-41).
 *
 * Sin DB ni R2 real: el fastify es un doble minimo. Lo central es que el
 * resolver NUNCA cae al bucket publico (`r2Bucket`) y que la clave de una foto
 * se valida con una regex anclada a tenant, alumno, control y pose.
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_KEY_PREFIX,
  CONQUER_POSES,
  CORRECTION_KEY_PREFIX,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  PRIVATE_KEY_PREFIX,
  PhotoStorageUnavailableError,
  VideoStorageUnavailableError,
  avatarOwnerSegment,
  fichaMirrorKey,
  isCorrectionReplyKey,
  isOwnAvatarKey,
  isOwnCorrectionVideoKey,
  isOwnPhotoKey,
  privateAvatarKey,
  privateCheckPhotoKey,
  privateCorrectionReplyKey,
  privateCorrectionVideoKey,
  privateMediaResolver,
  publicKeyFromFichaUrl,
  stableHourlySigningDate,
} from "../../src/modules/conquer/private-media";

/** Doble de fastify con R2 "configurado" y un bucket PUBLICO de videos. */
function fakeFastify(withR2: boolean): FastifyInstance {
  const base = withR2 ? { r2: {}, r2Bucket: "bucket-publico" } : {};
  return base as unknown as FastifyInstance;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("privateMediaResolver.resolve (fail-closed)", () => {
  it("sin R2_PRIVATE_BUCKET_NAME tira 503 aunque exista el bucket publico", () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const attempt = () => privateMediaResolver.resolve(fakeFastify(true));
    expect(attempt).toThrow(PhotoStorageUnavailableError);
    try {
      attempt();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PhotoStorageUnavailableError);
      if (err instanceof PhotoStorageUnavailableError) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe("CONQUER_FOTOS_NO_DISPONIBLES");
        expect(err.message).toBe("Las fotos no están disponibles por ahora");
      }
    }
  });

  it("sin R2 (plugin desactivado) tira 503 aunque la variable este", () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "bucket-privado");
    expect(() => privateMediaResolver.resolve(fakeFastify(false))).toThrow(
      PhotoStorageUnavailableError,
    );
  });

  it("con R2 y bucket privado devuelve la tienda con las tres operaciones", () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "bucket-privado");
    const store = privateMediaResolver.resolve(fakeFastify(true));
    expect(typeof store.presignPut).toBe("function");
    expect(typeof store.presignGet).toBe("function");
    expect(typeof store.head).toBe("function");
  });
});

describe("constantes de fotos", () => {
  it("poses, tipos y tope", () => {
    expect([...CONQUER_POSES]).toEqual(["frente", "perfil", "espalda"]);
    expect([...PHOTO_CONTENT_TYPES]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(PHOTO_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe("privateCheckPhotoKey", () => {
  it("respeta el formato private/conquer/<t>/<u>/<c>/<pose>-<uuid>.<ext>", () => {
    const key = privateCheckPhotoKey({
      tenantId: 1,
      userId: 22,
      checkId: 333,
      pose: "perfil",
      contentType: "image/webp",
    });
    expect(key).toMatch(
      /^private\/conquer\/1\/22\/333\/perfil-[0-9a-f-]{36}\.webp$/,
    );
    expect(isOwnPhotoKey(key, 1, 22, 333, "perfil")).toBe(true);
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ] as const)("%s -> .%s", (contentType, ext) => {
    const key = privateCheckPhotoKey({
      tenantId: 1,
      userId: 2,
      checkId: 3,
      pose: "frente",
      contentType,
    });
    expect(key.endsWith(`.${ext}`)).toBe(true);
  });

  it("dos claves del mismo control y pose no se repiten", () => {
    const input = {
      tenantId: 1,
      userId: 2,
      checkId: 3,
      pose: "espalda",
      contentType: "image/png",
    } as const;
    expect(privateCheckPhotoKey(input)).not.toBe(privateCheckPhotoKey(input));
  });
});

describe("isOwnPhotoKey", () => {
  const UUID = "123e4567-e89b-42d3-a456-426614174000";
  const good = `private/conquer/1/22/333/frente-${UUID}.jpg`;

  it.each([
    ["clave buena", good, 1, 22, 333, "frente", true],
    ["otro tenant", good, 2, 22, 333, "frente", false],
    ["otro usuario", good, 1, 23, 333, "frente", false],
    ["otro control", good, 1, 22, 334, "frente", false],
    ["otra pose", good, 1, 22, 333, "perfil", false],
    [
      "extension gif",
      `private/conquer/1/22/333/frente-${UUID}.gif`,
      1,
      22,
      333,
      "frente",
      false,
    ],
    [
      "path traversal",
      `private/conquer/1/22/333/../../../2/9/9/frente-${UUID}.jpg`,
      1,
      22,
      333,
      "frente",
      false,
    ],
    [
      "prefijo ajeno",
      `otra/conquer/1/22/333/frente-${UUID}.jpg`,
      1,
      22,
      333,
      "frente",
      false,
    ],
    ["sufijo extra", `${good}/../x`, 1, 22, 333, "frente", false],
    [
      "uuid corto",
      "private/conquer/1/22/333/frente-abc.jpg",
      1,
      22,
      333,
      "frente",
      false,
    ],
    ["pose inventada", good, 1, 22, 333, "lateral", false],
    ["id con prefijo comun", good, 1, 2, 333, "frente", false],
  ] as const)("%s", (_nombre, key, t, u, c, pose, expected) => {
    expect(isOwnPhotoKey(key, t, u, c, pose)).toBe(expected);
  });
});

// ── Videos de las correcciones (Fase 202 plan 02, DA-38, DA-45, D-27) ──

const UUID_V4 = "123e4567-e89b-42d3-a456-426614174000";

describe("privateMediaResolver.resolve para videos (fail-closed, D-27)", () => {
  function catchError(fn: () => unknown): unknown {
    try {
      fn();
    } catch (err: unknown) {
      return err;
    }
    return null;
  }

  it("sin R2_PRIVATE_BUCKET_NAME tira el 503 de videos aunque exista el bucket publico", () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const attempt = () =>
      privateMediaResolver.resolve(fakeFastify(true), "videos");
    expect(attempt).toThrow(VideoStorageUnavailableError);
    const err = catchError(attempt);
    expect(err).toBeInstanceOf(VideoStorageUnavailableError);
    expect(err).not.toBeInstanceOf(PhotoStorageUnavailableError);
    if (err instanceof VideoStorageUnavailableError) {
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe("CONQUER_VIDEOS_NO_DISPONIBLES");
      expect(err.message).toBe("Los videos no están disponibles por ahora");
    }
  });

  it("sin R2 (plugin desactivado) tira el 503 de videos aunque la variable este", () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "bucket-privado");
    expect(() =>
      privateMediaResolver.resolve(fakeFastify(false), "videos"),
    ).toThrow(VideoStorageUnavailableError);
  });

  it("sin bucket y sin proposito sigue tirando el 503 de fotos", () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const err = catchError(() =>
      privateMediaResolver.resolve(fakeFastify(true)),
    );
    expect(err).toBeInstanceOf(PhotoStorageUnavailableError);
    expect(err).not.toBeInstanceOf(VideoStorageUnavailableError);
    const explicit = catchError(() =>
      privateMediaResolver.resolve(fakeFastify(true), "fotos"),
    );
    expect(explicit).toBeInstanceOf(PhotoStorageUnavailableError);
  });

  it("con R2 y bucket privado la tienda tiene remove", () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "bucket-privado");
    const store = privateMediaResolver.resolve(fakeFastify(true), "videos");
    expect(typeof store.remove).toBe("function");
    expect(typeof store.head).toBe("function");
  });
});

describe("PrivateMediaStore.remove", () => {
  function storeWithSend(send: (cmd: unknown) => Promise<unknown>) {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "bucket-privado");
    const fastify = { r2: { send }, r2Bucket: "bucket-publico" };
    return privateMediaResolver.resolve(
      fastify as unknown as FastifyInstance,
      "videos",
    );
  }

  it("manda un DeleteObjectCommand al bucket PRIVADO con la clave", async () => {
    const send = vi.fn(async (_cmd: unknown) => ({}));
    const store = storeWithSend(send);
    await store.remove("private/conquer-corrections/1/7/alumno-x.mp4");
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0]?.[0];
    expect(cmd).toBeInstanceOf(DeleteObjectCommand);
    if (cmd instanceof DeleteObjectCommand) {
      expect(cmd.input.Bucket).toBe("bucket-privado");
      expect(cmd.input.Key).toBe(
        "private/conquer-corrections/1/7/alumno-x.mp4",
      );
    }
  });

  it.each([
    ["NotFound", { name: "NotFound" }],
    ["NoSuchKey", { name: "NoSuchKey" }],
    ["HTTP 404", { name: "Otro", $metadata: { httpStatusCode: 404 } }],
  ] as const)(
    "un %s no es error (el objeto ya no estaba)",
    async (_n, props) => {
      const store = storeWithSend(async () => {
        throw Object.assign(new Error("no existe"), props);
      });
      await expect(store.remove("k")).resolves.toBeUndefined();
    },
  );

  it("cualquier otro error se re-tira", async () => {
    const store = storeWithSend(async () => {
      throw Object.assign(new Error("boom"), {
        name: "InternalError",
        $metadata: { httpStatusCode: 500 },
      });
    });
    await expect(store.remove("k")).rejects.toThrow("boom");
  });
});

describe("prefijos de claves", () => {
  it("el de correcciones NO empieza con el de fotos (regla de 60 dias, T-201-123)", () => {
    expect(CORRECTION_KEY_PREFIX).toBe("private/conquer-corrections");
    expect(
      `${CORRECTION_KEY_PREFIX}/`.startsWith(`${PRIVATE_KEY_PREFIX}/`),
    ).toBe(false);
  });

  it("una clave de foto no cae bajo el prefijo de correcciones", () => {
    const foto = privateCheckPhotoKey({
      tenantId: 1,
      userId: 7,
      checkId: 3,
      pose: "frente",
      contentType: "image/jpeg",
    });
    expect(foto.startsWith(`${CORRECTION_KEY_PREFIX}/`)).toBe(false);
  });
});

describe("privateCorrectionVideoKey / isOwnCorrectionVideoKey", () => {
  it("formato private/conquer-corrections/<t>/<u>/alumno-<uuid>.<ext>", () => {
    const key = privateCorrectionVideoKey({
      tenantId: 1,
      userId: 7,
      contentType: "video/quicktime",
    });
    expect(key).toMatch(
      /^private\/conquer-corrections\/1\/7\/alumno-[0-9a-f-]{36}\.mov$/,
    );
    expect(isOwnCorrectionVideoKey(key, 1, 7)).toBe(true);
  });

  it.each([
    ["video/mp4", "mp4"],
    ["video/quicktime", "mov"],
  ] as const)("%s -> .%s", (contentType, ext) => {
    const key = privateCorrectionVideoKey({
      tenantId: 1,
      userId: 7,
      contentType,
    });
    expect(key.endsWith(`.${ext}`)).toBe(true);
  });

  it("dos claves del mismo alumno no se repiten", () => {
    const input = {
      tenantId: 1,
      userId: 7,
      contentType: "video/mp4",
    } as const;
    expect(privateCorrectionVideoKey(input)).not.toBe(
      privateCorrectionVideoKey(input),
    );
  });

  const good = `private/conquer-corrections/1/7/alumno-${UUID_V4}.mp4`;
  it.each([
    ["clave buena mp4", good, 1, 7, true],
    [
      "clave buena mov",
      `private/conquer-corrections/1/7/alumno-${UUID_V4}.mov`,
      1,
      7,
      true,
    ],
    ["otro tenant", good, 2, 7, false],
    ["otro alumno", good, 1, 8, false],
    ["id con prefijo comun (7 vs 77)", good, 1, 77, false],
    ["tenant con prefijo comun (1 vs 11)", good, 11, 7, false],
    [
      "path traversal",
      `private/conquer-corrections/1/7/../../2/9/alumno-${UUID_V4}.mp4`,
      1,
      7,
      false,
    ],
    [
      "prefijo de fotos",
      `private/conquer/1/7/alumno-${UUID_V4}.mp4`,
      1,
      7,
      false,
    ],
    ["con prefijo delante (sin ancla de inicio)", `x/${good}`, 1, 7, false],
    [
      "extension webm",
      `private/conquer-corrections/1/7/alumno-${UUID_V4}.webm`,
      1,
      7,
      false,
    ],
    ["sufijo extra", `${good}/../x`, 1, 7, false],
    [
      "uuid corto",
      "private/conquer-corrections/1/7/alumno-abc.mp4",
      1,
      7,
      false,
    ],
    [
      "clave de coach",
      `private/conquer-corrections/1/7/coach-33-${UUID_V4}.mp4`,
      1,
      7,
      false,
    ],
    ["id no entero", good, 1.5, 7, false],
    ["id NaN", good, Number.NaN, 7, false],
  ] as const)("%s", (_nombre, key, t, u, expected) => {
    expect(isOwnCorrectionVideoKey(key, t, u)).toBe(expected);
  });
});

describe("privateCorrectionReplyKey / isCorrectionReplyKey", () => {
  it("formato .../<t>/<u>/coach-<correccion>-<uuid>.<ext>", () => {
    const key = privateCorrectionReplyKey({
      tenantId: 1,
      userId: 7,
      correctionId: 33,
      contentType: "video/mp4",
    });
    expect(key).toMatch(
      /^private\/conquer-corrections\/1\/7\/coach-33-[0-9a-f-]{36}\.mp4$/,
    );
    expect(isCorrectionReplyKey(key, 1, 7, 33)).toBe(true);
    expect(isCorrectionReplyKey(key, 1, 7, 34)).toBe(false);
  });

  it("una clave de alumno no pasa como respuesta y una de coach no pasa como del alumno", () => {
    const alumno = privateCorrectionVideoKey({
      tenantId: 1,
      userId: 7,
      contentType: "video/mp4",
    });
    const coach = privateCorrectionReplyKey({
      tenantId: 1,
      userId: 7,
      correctionId: 33,
      contentType: "video/mp4",
    });
    expect(isCorrectionReplyKey(alumno, 1, 7, 33)).toBe(false);
    expect(isOwnCorrectionVideoKey(coach, 1, 7)).toBe(false);
  });

  const good = `private/conquer-corrections/1/7/coach-33-${UUID_V4}.mov`;
  it.each([
    ["clave buena", good, 1, 7, 33, true],
    ["otro tenant", good, 2, 7, 33, false],
    ["otro alumno", good, 1, 8, 33, false],
    ["otra correccion", good, 1, 7, 34, false],
    ["correccion con prefijo comun (3 vs 33)", good, 1, 7, 3, false],
    ["correccion con prefijo comun (33 vs 333)", good, 1, 7, 333, false],
    [
      "path traversal",
      `private/conquer-corrections/1/7/../../2/9/coach-33-${UUID_V4}.mov`,
      1,
      7,
      33,
      false,
    ],
    [
      "prefijo de fotos",
      `private/conquer/1/7/coach-33-${UUID_V4}.mov`,
      1,
      7,
      33,
      false,
    ],
    ["con prefijo delante", `x/${good}`, 1, 7, 33, false],
    [
      "extension webm",
      `private/conquer-corrections/1/7/coach-33-${UUID_V4}.webm`,
      1,
      7,
      33,
      false,
    ],
    ["sufijo extra", `${good}/../x`, 1, 7, 33, false],
    ["id no entero", good, 1, 7, 33.5, false],
  ] as const)("%s", (_nombre, key, t, u, c, expected) => {
    expect(isCorrectionReplyKey(key, t, u, c)).toBe(expected);
  });
});

// ── Fase 214 plan 13: claves de avatar sin id de usuario y firma estable ─────

describe("claves de avatar (fase 214, D-34)", () => {
  const PUBLIC_BASE = "https://pub.example";

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "secreto-de-prueba-214");
    vi.stubEnv("R2_PUBLIC_URL", PUBLIC_BASE);
  });

  it("AVATAR_KEY_PREFIX no cae bajo private/conquer", () => {
    expect(AVATAR_KEY_PREFIX).toBe("private/avatars");
    expect(AVATAR_KEY_PREFIX.startsWith("private/conquer")).toBe(false);
  });

  it("privateAvatarKey lleva un segmento HMAC y no el id del usuario", () => {
    const key = privateAvatarKey({ tenantId: 1, userId: 42 });
    expect(key).toMatch(
      /^private\/avatars\/1\/[0-9a-f]{24}\/[0-9a-f-]{36}\.jpg$/,
    );
    expect(key).not.toContain("/42/");
    expect(key).not.toContain("42-");
  });

  it("avatarOwnerSegment es estable y distinto por usuario y por gimnasio", () => {
    expect(avatarOwnerSegment(1, 42)).toBe(avatarOwnerSegment(1, 42));
    expect(avatarOwnerSegment(1, 42)).toMatch(/^[0-9a-f]{24}$/);
    expect(avatarOwnerSegment(1, 42)).not.toBe(avatarOwnerSegment(1, 43));
    expect(avatarOwnerSegment(1, 42)).not.toBe(avatarOwnerSegment(2, 42));
  });

  it("avatarOwnerSegment tira un error claro sin JWT_SECRET", () => {
    vi.stubEnv("JWT_SECRET", "");
    expect(() => avatarOwnerSegment(1, 42)).toThrow(/JWT_SECRET/);
  });

  it("isOwnAvatarKey acepta la propia y rechaza otro usuario o gimnasio", () => {
    const key = privateAvatarKey({ tenantId: 1, userId: 42 });
    expect(isOwnAvatarKey(key, 1, 42)).toBe(true);
    expect(isOwnAvatarKey(key, 1, 43)).toBe(false);
    expect(isOwnAvatarKey(key, 2, 42)).toBe(false);
    expect(isOwnAvatarKey(key, 1, 42.5)).toBe(false);
  });

  it("isOwnAvatarKey rechaza traversal, otra extension, otro prefijo, sufijo y ficha", () => {
    const own = privateAvatarKey({ tenantId: 1, userId: 42 });
    const seg = avatarOwnerSegment(1, 42);
    const uuid = own.split("/").pop() as string;
    expect(isOwnAvatarKey(`private/avatars/1/${seg}/../${uuid}`, 1, 42)).toBe(
      false,
    );
    expect(isOwnAvatarKey(own.replace(/\.jpg$/, ".png"), 1, 42)).toBe(false);
    expect(
      isOwnAvatarKey(own.replace("private/avatars", "private/conquer"), 1, 42),
    ).toBe(false);
    expect(isOwnAvatarKey(`${own}/x`, 1, 42)).toBe(false);
    expect(isOwnAvatarKey(`x/${own}`, 1, 42)).toBe(false);
    expect(
      isOwnAvatarKey(
        `private/avatars/1/${seg}/ficha-0123456789abcdef.jpg`,
        1,
        42,
      ),
    ).toBe(false);
  });

  it("fichaMirrorKey es determinística, conserva la extension y comparte segmento", () => {
    const sourceUrl = `${PUBLIC_BASE}/members/photos/42-1700000000000.png`;
    const a = fichaMirrorKey({ tenantId: 1, userId: 42, sourceUrl });
    const b = fichaMirrorKey({ tenantId: 1, userId: 42, sourceUrl });
    expect(a).toBe(b);
    expect(a.endsWith(".png")).toBe(true);
    expect(a).toContain("/ficha-");
    expect(
      a.startsWith(`${AVATAR_KEY_PREFIX}/1/${avatarOwnerSegment(1, 42)}/`),
    ).toBe(true);
    expect(a).not.toContain("/42/");
    const other = fichaMirrorKey({
      tenantId: 1,
      userId: 42,
      sourceUrl: `${PUBLIC_BASE}/members/photos/42-1700000000001.png`,
    });
    expect(other).not.toBe(a);
  });

  it("publicKeyFromFichaUrl acepta solo la foto de ficha del propio usuario", () => {
    expect(
      publicKeyFromFichaUrl(
        `${PUBLIC_BASE}/members/photos/42-1700000000000.jpg`,
        42,
      ),
    ).toBe("members/photos/42-1700000000000.jpg");
    expect(
      publicKeyFromFichaUrl(
        `${PUBLIC_BASE}/members/photos/42-1700000000000.jpg`,
        43,
      ),
    ).toBeNull();
    expect(
      publicKeyFromFichaUrl(`${PUBLIC_BASE}/videos/42-1700000000000.jpg`, 42),
    ).toBeNull();
    expect(
      publicKeyFromFichaUrl(
        `${PUBLIC_BASE}/members/photos/../42-1700000000000.jpg`,
        42,
      ),
    ).toBeNull();
    expect(
      publicKeyFromFichaUrl(
        `${PUBLIC_BASE}/members/photos/42-1700000000000.gif`,
        42,
      ),
    ).toBeNull();
    expect(
      publicKeyFromFichaUrl(
        `https://otro.example/members/photos/42-1700000000000.jpg`,
        42,
      ),
    ).toBeNull();
  });
});

describe("stableHourlySigningDate", () => {
  it("redondea hacia abajo a la hora", () => {
    expect(
      stableHourlySigningDate(
        new Date("2026-11-17T10:59:59.999Z"),
      ).toISOString(),
    ).toBe("2026-11-17T10:00:00.000Z");
    expect(
      stableHourlySigningDate(
        new Date("2026-11-17T11:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-11-17T11:00:00.000Z");
  });
});

describe("copia y borrado de la foto de ficha (fase 214, D-43 y D-63)", () => {
  /** Cliente R2 simulado: guarda los comandos y puede fallar con un error dado. */
  function fakeR2(failWith?: Error) {
    const send = vi.fn(async (_command: unknown) => {
      if (failWith) throw failWith;
      return {};
    });
    const fastify = {
      r2: { send },
      r2Bucket: "bucket-publico",
    } as unknown as FastifyInstance;
    return { send, fastify };
  }

  beforeEach(() => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "bucket-privado");
  });

  it("copyFromPublic manda un CopyObjectCommand al bucket privado con el origen publico", async () => {
    const { send, fastify } = fakeR2();
    const store = privateMediaResolver.resolve(fastify);
    const ok = await store.copyFromPublic(
      "members/photos/42-1700000000000.jpg",
      "private/avatars/1/seg/ficha-0123456789abcdef.jpg",
    );
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(CopyObjectCommand);
    if (command instanceof CopyObjectCommand) {
      expect(command.input.Bucket).toBe("bucket-privado");
      expect(command.input.Key).toBe(
        "private/avatars/1/seg/ficha-0123456789abcdef.jpg",
      );
      expect(command.input.CopySource).toBe(
        "bucket-publico/members/photos/42-1700000000000.jpg",
      );
    }
  });

  it("copyFromPublic devuelve false si el origen no existe y propaga otros errores", async () => {
    const missing = new Error("nada");
    missing.name = "NoSuchKey";
    const store = privateMediaResolver.resolve(fakeR2(missing).fastify);
    await expect(
      store.copyFromPublic("members/photos/1-1.jpg", "k"),
    ).resolves.toBe(false);
    const boom = new Error("boom");
    boom.name = "InternalError";
    const store2 = privateMediaResolver.resolve(fakeR2(boom).fastify);
    await expect(
      store2.copyFromPublic("members/photos/1-1.jpg", "k"),
    ).rejects.toBe(boom);
  });

  it("removePublic manda un DeleteObjectCommand al bucket publico", async () => {
    const { send, fastify } = fakeR2();
    const store = privateMediaResolver.resolve(fastify);
    await store.removePublic("members/photos/42-1700000000000.jpg");
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    if (command instanceof DeleteObjectCommand) {
      expect(command.input.Bucket).toBe("bucket-publico");
      expect(command.input.Key).toBe("members/photos/42-1700000000000.jpg");
    }
  });

  it("removePublic tolera un objeto que ya no existe", async () => {
    const missing = new Error("nada");
    missing.name = "NoSuchKey";
    const store = privateMediaResolver.resolve(fakeR2(missing).fastify);
    await expect(
      store.removePublic("members/photos/42-1700000000000.jpg"),
    ).resolves.toBeUndefined();
  });
});
