/**
 * Wellhub — verificación de la firma de webhooks (X-Gympass-Signature).
 *
 * La documentación pública del sandbox no fija el algoritmo exacto, así que
 * verificamos contra los formatos plausibles de HMAC del RAW body con el
 * secreto compartido: sha1/sha256, en hex o base64, con o sin prefijo
 * "sha1=" / "sha256=". Cada candidato se compara en tiempo constante
 * (timingSafeEqual, patrón de campaigns/token-service.ts CR-03). Cuando
 * Wellhub confirme el formato definitivo, esta lista se reduce a uno.
 *
 * IMPORTANTE: la firma se calcula sobre el body CRUDO (Buffer), no sobre el
 * JSON re-serializado — el route debe parsear con parseAs: "buffer".
 */

import { createHmac, timingSafeEqual } from "crypto";

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyWellhubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  // Tolerar prefijo estilo GitHub ("sha1=abc...", "sha256=abc...").
  const provided = signatureHeader.replace(/^sha(1|256)=/i, "").trim();
  if (provided.length === 0) return false;
  const providedBuf = Buffer.from(provided);

  for (const algorithm of ["sha1", "sha256"] as const) {
    const hmac = createHmac(algorithm, secret).update(rawBody);
    const digest = hmac.digest();
    const candidates = [
      digest.toString("hex"),
      digest.toString("base64"),
      digest.toString("base64url"),
    ];
    if (candidates.some((c) => safeEqual(providedBuf, Buffer.from(c)))) {
      return true;
    }
  }
  return false;
}
