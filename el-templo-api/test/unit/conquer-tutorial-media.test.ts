/**
 * Fase 202 Plan 07 (D-25, DA-48, T-201-141): tienda PUBLICA de tutoriales.
 *
 * Sin DB ni R2 real: el cliente S3 y el fastify son dobles minimos. Lo central
 * es que la clave se valida con una regex anclada a tenant y objetivo, que el
 * resolver usa el bucket publico (`r2Bucket`) y que `VideoService` trata el
 * "no existe" como `null` / sin error y re-tira cualquier otro fallo.
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoService } from "../../src/modules/admin/video-service";
import { COMBO_KEYS } from "../../src/modules/conquer/combos";
import {
  TUTORIAL_KEY_PREFIX,
  isTutorialKey,
  tutorialKey,
  tutorialMediaResolver,
  TutorialStorageUnavailableError,
} from "../../src/modules/conquer/tutorial-media";

const UUID = "0b9d6f53-6d36-4d3f-8f4e-3f9a1c2b7e10";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tutorialKey", () => {
  it("ejercicio: conquer/tutorials/{tenant}/ejercicio-{id}-{uuid}.mp4", () => {
    const key = tutorialKey({
      tenantId: 7,
      target: "ejercicio",
      exerciseId: 42,
    });

    expect(key).toMatch(
      /^conquer\/tutorials\/7\/ejercicio-42-[0-9a-f-]{36}\.mp4$/,
    );
    expect(key.startsWith(`${TUTORIAL_KEY_PREFIX}/`)).toBe(true);
  });

  it("combo: lleva el comboKey y cada llamada trae un uuid distinto", () => {
    const a = tutorialKey({ tenantId: 1, target: "combo", comboKey: "push" });
    const b = tutorialKey({ tenantId: 1, target: "combo", comboKey: "push" });

    expect(a).toMatch(/^conquer\/tutorials\/1\/combo-push-[0-9a-f-]{36}\.mp4$/);
    expect(a).not.toBe(b);
  });

  it("no cae en el prefijo de fotos ni en el de correcciones (bucket privado)", () => {
    const key = tutorialKey({ tenantId: 1, target: "combo", comboKey: "pull" });

    expect(key.startsWith("private/")).toBe(false);
  });
});

describe("isTutorialKey", () => {
  it("acepta la clave que genera tutorialKey, para su tenant y su objetivo", () => {
    const ejercicio = tutorialKey({
      tenantId: 3,
      target: "ejercicio",
      exerciseId: 9,
    });
    expect(isTutorialKey(ejercicio, 3, "ejercicio", 9)).toBe(true);
    for (const comboKey of COMBO_KEYS) {
      const key = tutorialKey({ tenantId: 3, target: "combo", comboKey });
      expect(isTutorialKey(key, 3, "combo", comboKey)).toBe(true);
    }
  });

  it("rechaza otro tenant, incluso si uno es prefijo del otro (1 vs 11)", () => {
    const key = `conquer/tutorials/11/ejercicio-5-${UUID}.mp4`;

    expect(isTutorialKey(key, 11, "ejercicio", 5)).toBe(true);
    expect(isTutorialKey(key, 1, "ejercicio", 5)).toBe(false);
  });

  it("rechaza otro ejercicio, incluso si uno es prefijo del otro (3 vs 33)", () => {
    const key = `conquer/tutorials/1/ejercicio-33-${UUID}.mp4`;

    expect(isTutorialKey(key, 1, "ejercicio", 33)).toBe(true);
    expect(isTutorialKey(key, 1, "ejercicio", 3)).toBe(false);
  });

  it("rechaza el objetivo equivocado y un combo fuera de COMBO_KEYS", () => {
    const combo = `conquer/tutorials/1/combo-push-${UUID}.mp4`;
    const remo = `conquer/tutorials/1/combo-remo-${UUID}.mp4`;

    expect(isTutorialKey(combo, 1, "combo", "push")).toBe(true);
    expect(isTutorialKey(combo, 1, "combo", "pull")).toBe(false);
    expect(isTutorialKey(combo, 1, "ejercicio", 1)).toBe(false);
    expect(isTutorialKey(remo, 1, "combo", "remo")).toBe(false);
  });

  it.each([
    ["prefijo delante", `x/conquer/tutorials/1/ejercicio-5-${UUID}.mp4`],
    ["sufijo detras", `conquer/tutorials/1/ejercicio-5-${UUID}.mp4.exe`],
    ["extension mov", `conquer/tutorials/1/ejercicio-5-${UUID}.mov`],
    ["path traversal", `conquer/tutorials/1/../2/ejercicio-5-${UUID}.mp4`],
    ["uuid truncado", "conquer/tutorials/1/ejercicio-5-abc.mp4"],
    ["sin uuid", "conquer/tutorials/1/ejercicio-5-.mp4"],
    ["clave de Ejercicios", "exercises/5.mp4"],
    ["vacia", ""],
  ])("rechaza %s", (_nombre, key) => {
    expect(isTutorialKey(key, 1, "ejercicio", 5)).toBe(false);
  });

  it("rechaza referencias que no son enteras o tenants no enteros", () => {
    const key = `conquer/tutorials/1/ejercicio-5-${UUID}.mp4`;

    expect(isTutorialKey(key, 1, "ejercicio", "5")).toBe(false);
    expect(isTutorialKey(key, 1, "ejercicio", 5.5)).toBe(false);
    expect(isTutorialKey(key, 1.5, "ejercicio", 5)).toBe(false);
    expect(isTutorialKey(key, Number.NaN, "ejercicio", 5)).toBe(false);
  });
});

describe("tutorialMediaResolver", () => {
  const log = { warn: vi.fn() } as unknown as FastifyBaseLogger;

  function fakeFastify(extra: Record<string, unknown>): FastifyInstance {
    return { log, ...extra } as unknown as FastifyInstance;
  }

  it("ready exige el cliente R2 Y R2_PUBLIC_URL", () => {
    const r2 = { send: vi.fn() };

    vi.stubEnv("R2_PUBLIC_URL", "https://pub.test");
    expect(tutorialMediaResolver.ready(fakeFastify({ r2 }))).toBe(true);
    expect(tutorialMediaResolver.ready(fakeFastify({}))).toBe(false);

    vi.stubEnv("R2_PUBLIC_URL", "");
    expect(tutorialMediaResolver.ready(fakeFastify({ r2 }))).toBe(false);

    vi.stubEnv("R2_PUBLIC_URL", "///");
    expect(tutorialMediaResolver.ready(fakeFastify({ r2 }))).toBe(false);
  });

  it("resolve sin cliente R2 tira el 503 propio de tutoriales", () => {
    const attempt = () => tutorialMediaResolver.resolve(fakeFastify({}));

    expect(attempt).toThrow(TutorialStorageUnavailableError);
    try {
      attempt();
    } catch (err: unknown) {
      expect(err).toMatchObject({
        statusCode: 503,
        code: "CONQUER_TUTORIALES_NO_DISPONIBLES",
        message: "Los videos tutoriales no están disponibles por ahora",
      });
    }
  });

  it("resolve usa el bucket PUBLICO (r2Bucket) y nunca R2_PRIVATE_BUCKET_NAME", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "bucket-privado");
    const send = vi.fn(async (_cmd: unknown) => ({
      ContentLength: 10,
      ContentType: "video/mp4",
    }));
    const store = tutorialMediaResolver.resolve(
      fakeFastify({ r2: { send }, r2Bucket: "bucket-publico" }),
    );

    await store.head("conquer/tutorials/1/combo-push-x.mp4");
    await store.remove("conquer/tutorials/1/combo-push-x.mp4");

    const [head, remove] = send.mock.calls.map(([cmd]) => cmd as unknown);
    expect(head).toBeInstanceOf(HeadObjectCommand);
    expect((head as HeadObjectCommand).input.Bucket).toBe("bucket-publico");
    expect(remove).toBeInstanceOf(DeleteObjectCommand);
    expect((remove as DeleteObjectCommand).input.Bucket).toBe("bucket-publico");
  });
});

describe("VideoService: subida generica por clave (aditiva)", () => {
  const log = {} as FastifyBaseLogger;

  function service(send: (cmd: unknown) => Promise<unknown>) {
    return new VideoService({ send } as never, "bucket-publico", log);
  }

  it("headObject devuelve tamano y tipo", async () => {
    const send = vi.fn(async (_cmd: unknown) => ({
      ContentLength: 1234,
      ContentType: "video/mp4",
    }));

    const head = await service(send).headObject("k");

    expect(head).toEqual({ contentLength: 1234, contentType: "video/mp4" });
    const cmd = send.mock.calls[0][0] as unknown as HeadObjectCommand;
    expect(cmd.input).toEqual({ Bucket: "bucket-publico", Key: "k" });
  });

  it("headObject sin ContentLength ni ContentType: 0 y vacio", async () => {
    const head = await service(async () => ({})).headObject("k");

    expect(head).toEqual({ contentLength: 0, contentType: "" });
  });

  it.each([
    ["NotFound", Object.assign(new Error("x"), { name: "NotFound" })],
    ["NoSuchKey", Object.assign(new Error("x"), { name: "NoSuchKey" })],
    ["HTTP 404", { $metadata: { httpStatusCode: 404 } }],
  ])("headObject: %s es null (no existe)", async (_nombre, err) => {
    const head = await service(async () => {
      throw err;
    }).headObject("k");

    expect(head).toBeNull();
  });

  it("headObject re-tira cualquier otro error (403, red)", async () => {
    const forbidden = { $metadata: { httpStatusCode: 403 } };
    const network = new Error("ECONNRESET");

    await expect(
      service(async () => {
        throw forbidden;
      }).headObject("k"),
    ).rejects.toBe(forbidden);
    await expect(
      service(async () => {
        throw network;
      }).headObject("k"),
    ).rejects.toBe(network);
  });

  it("deleteObject manda el DeleteObjectCommand al bucket y no falla si ya no existe", async () => {
    const send = vi.fn(async (_cmd: unknown) => ({}));
    await service(send).deleteObject("k");
    const cmd = send.mock.calls[0][0] as unknown as DeleteObjectCommand;
    expect(cmd.input).toEqual({ Bucket: "bucket-publico", Key: "k" });

    await expect(
      service(async () => {
        throw Object.assign(new Error("x"), { name: "NoSuchKey" });
      }).deleteObject("k"),
    ).resolves.toBeUndefined();
  });

  it("deleteObject re-tira cualquier otro error", async () => {
    const boom = new Error("AccessDenied");

    await expect(
      service(async () => {
        throw boom;
      }).deleteObject("k"),
    ).rejects.toBe(boom);
  });
});
