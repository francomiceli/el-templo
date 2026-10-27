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
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONQUER_POSES,
  CORRECTION_KEY_PREFIX,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  PRIVATE_KEY_PREFIX,
  PhotoStorageUnavailableError,
  VideoStorageUnavailableError,
  isCorrectionReplyKey,
  isOwnCorrectionVideoKey,
  isOwnPhotoKey,
  privateCheckPhotoKey,
  privateCorrectionReplyKey,
  privateCorrectionVideoKey,
  privateMediaResolver,
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
