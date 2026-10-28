/**
 * Fase 202 Plan 02: reglas puras de video y texto de Conquer (D-26, D-27, D-29,
 * DA-39, DA-40, DA-42, DA-43).
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  CORRECTION_COMMENT_MAX,
  CORRECTION_PENDING_MAX,
  CORRECTION_REPLY_MAX,
  CORRECTION_VIDEO_MAX_BYTES,
  CORRECTION_VIDEO_MAX_SECONDS,
  STEP_LABELS,
  TUTORIAL_CONTENT_TYPE,
  TUTORIAL_VIDEO_MAX_BYTES,
  VIDEO_CONTENT_TYPES,
  VIDEO_EXTENSION_BY_CONTENT_TYPE,
  checkUploadedVideo,
  isValidVideoSeconds,
  isVideoContentType,
  normalizeText,
} from "../../src/modules/conquer/video-rules";

describe("constantes de video", () => {
  it("topes de bytes, segundos, cantidad y largos de texto", () => {
    expect(CORRECTION_VIDEO_MAX_BYTES).toBe(104857600);
    expect(TUTORIAL_VIDEO_MAX_BYTES).toBe(209715200);
    expect(CORRECTION_VIDEO_MAX_SECONDS).toBe(30);
    expect(CORRECTION_PENDING_MAX).toBe(3);
    expect(CORRECTION_COMMENT_MAX).toBe(500);
    expect(CORRECTION_REPLY_MAX).toBe(1000);
  });

  it("tipos y extensiones: mp4 y mov para correcciones, solo mp4 en tutoriales", () => {
    expect(VIDEO_EXTENSION_BY_CONTENT_TYPE).toEqual({
      "video/mp4": "mp4",
      "video/quicktime": "mov",
    });
    expect([...VIDEO_CONTENT_TYPES]).toEqual(["video/mp4", "video/quicktime"]);
    expect(TUTORIAL_CONTENT_TYPE).toBe("video/mp4");
  });

  it("STEP_LABELS repite el texto de CqStepRow del app", () => {
    expect(STEP_LABELS.e1).toBe("Escalón 1");
    expect(STEP_LABELS.e2).toBe("Escalón 2");
    expect(STEP_LABELS.e3).toBe("Escalón 3");
    expect(STEP_LABELS.hold).toBe("Hold final");
  });
});

describe("isVideoContentType", () => {
  it.each([
    ["video/mp4", true],
    ["video/quicktime", true],
    ["video/webm", false],
    ["image/jpeg", false],
    ["VIDEO/MP4", false],
    ["", false],
  ] as const)("%s -> %s", (value, expected) => {
    expect(isVideoContentType(value)).toBe(expected);
  });
});

describe("checkUploadedVideo", () => {
  const MAX = CORRECTION_VIDEO_MAX_BYTES;

  it("objeto vacio", () => {
    expect(
      checkUploadedVideo(
        { contentLength: 0, contentType: "video/mp4" },
        MAX,
        VIDEO_CONTENT_TYPES,
      ),
    ).toBe("vacio");
  });

  it("exactamente el tope es ok y un byte mas es pesado", () => {
    expect(
      checkUploadedVideo(
        { contentLength: MAX, contentType: "video/mp4" },
        MAX,
        VIDEO_CONTENT_TYPES,
      ),
    ).toBe("ok");
    expect(
      checkUploadedVideo(
        { contentLength: MAX + 1, contentType: "video/mp4" },
        MAX,
        VIDEO_CONTENT_TYPES,
      ),
    ).toBe("pesado");
  });

  it("tipo fuera de la lista (con tamano valido)", () => {
    expect(
      checkUploadedVideo(
        { contentLength: 1024, contentType: "video/webm" },
        MAX,
        VIDEO_CONTENT_TYPES,
      ),
    ).toBe("tipo");
  });

  it("tutorial: solo mp4, quicktime no pasa", () => {
    expect(
      checkUploadedVideo(
        { contentLength: 1024, contentType: "video/quicktime" },
        TUTORIAL_VIDEO_MAX_BYTES,
        [TUTORIAL_CONTENT_TYPE],
      ),
    ).toBe("tipo");
    expect(
      checkUploadedVideo(
        { contentLength: 1024, contentType: "video/mp4" },
        TUTORIAL_VIDEO_MAX_BYTES,
        [TUTORIAL_CONTENT_TYPE],
      ),
    ).toBe("ok");
  });

  it("el orden de las revisiones: vacio, luego pesado, luego tipo", () => {
    expect(
      checkUploadedVideo(
        { contentLength: 0, contentType: "video/webm" },
        MAX,
        VIDEO_CONTENT_TYPES,
      ),
    ).toBe("vacio");
    expect(
      checkUploadedVideo(
        { contentLength: MAX + 1, contentType: "video/webm" },
        MAX,
        VIDEO_CONTENT_TYPES,
      ),
    ).toBe("pesado");
  });
});

describe("isValidVideoSeconds", () => {
  it.each([
    [1, true],
    [15, true],
    [30, true],
    [0, false],
    [-1, false],
    [31, false],
    [12.5, false],
    ["12", false],
    [null, false],
    [undefined, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ] as const)("%s -> %s", (value, expected) => {
    expect(isValidVideoSeconds(value)).toBe(expected);
  });
});

describe("normalizeText", () => {
  it("recorta los espacios de los bordes", () => {
    expect(normalizeText("  hola  ", CORRECTION_COMMENT_MAX)).toEqual({
      ok: true,
      value: "hola",
    });
  });

  it.each([["   "], [""], ["\n\t "], [null], [undefined]])(
    "%j -> value null",
    (value) => {
      expect(normalizeText(value, CORRECTION_COMMENT_MAX)).toEqual({
        ok: true,
        value: null,
      });
    },
  );

  it("el largo se mide despues de recortar: 500 ok, 501 no", () => {
    expect(normalizeText("x".repeat(500), 500)).toEqual({
      ok: true,
      value: "x".repeat(500),
    });
    expect(normalizeText(` ${"x".repeat(500)} `, 500)).toEqual({
      ok: true,
      value: "x".repeat(500),
    });
    expect(normalizeText("x".repeat(501), 500)).toEqual({ ok: false });
  });

  it.each([[42], [true], [{}], [["a"]]])("%j no es texto", (value) => {
    expect(normalizeText(value, 500)).toEqual({ ok: false });
  });
});
