/**
 * Tanda 2 de seguridad (H5) — validacion del token QR con comparacion de firma
 * en tiempo constante. Unitario, sin DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateQrToken,
  validateQrToken,
} from "../../src/modules/shared/qr-token";

const SECRET_ORIGINAL = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = "qr-token-test-secret-0123456789abcdef";
});

afterAll(() => {
  if (SECRET_ORIGINAL === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = SECRET_ORIGINAL;
});

/** Cambia un caracter del string por otro distinto del alfabeto base64url. */
function alterarUnCaracter(s: string, idx: number): string {
  const original = s[idx];
  const reemplazo = original === "A" ? "B" : "A";
  return s.slice(0, idx) + reemplazo + s.slice(idx + 1);
}

describe("validateQrToken", () => {
  it("token valido devuelve el payload", () => {
    const token = generateQrToken(7);
    expect(validateQrToken(token)).toEqual({ branchId: 7, type: "checkin" });
  });

  it("firma alterada en un caracter devuelve null", () => {
    const token = generateQrToken(7);
    const [payload, firma] = token.split(".");
    expect(
      validateQrToken(`${payload}.${alterarUnCaracter(firma, 0)}`),
    ).toBeNull();
    expect(
      validateQrToken(
        `${payload}.${alterarUnCaracter(firma, firma.length - 1)}`,
      ),
    ).toBeNull();
  });

  it("firma de otro largo (mas corta o mas larga) devuelve null sin lanzar", () => {
    const token = generateQrToken(7);
    const [payload, firma] = token.split(".");
    expect(validateQrToken(`${payload}.${firma.slice(0, -1)}`)).toBeNull();
    expect(validateQrToken(`${payload}.${firma}A`)).toBeNull();
    expect(validateQrToken(`${payload}.`)).toBeNull();
  });

  it("payload alterado con la firma original devuelve null", () => {
    const token = generateQrToken(7);
    const [, firma] = token.split(".");
    const otroPayload = Buffer.from(
      JSON.stringify({ branchId: 8, type: "checkin" }),
    ).toString("base64url");
    expect(validateQrToken(`${otroPayload}.${firma}`)).toBeNull();
  });

  it("token sin punto o con mas de un punto devuelve null", () => {
    const token = generateQrToken(7);
    expect(validateQrToken(token.replace(".", ""))).toBeNull();
    expect(validateQrToken(`${token}.extra`)).toBeNull();
    expect(validateQrToken("")).toBeNull();
  });

  it("firmado con otro secreto devuelve null", () => {
    const token = generateQrToken(7);
    process.env.JWT_SECRET = "otro-secreto-distinto-0123456789abcdef";
    try {
      expect(validateQrToken(token)).toBeNull();
    } finally {
      process.env.JWT_SECRET = "qr-token-test-secret-0123456789abcdef";
    }
  });
});
