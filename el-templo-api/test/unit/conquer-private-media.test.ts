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
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONQUER_POSES,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  PhotoStorageUnavailableError,
  isOwnPhotoKey,
  privateCheckPhotoKey,
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
