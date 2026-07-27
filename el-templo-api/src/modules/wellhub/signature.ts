/**
 * Wellhub — verificación de la firma de webhooks (X-Api-Signature /
 * X-Gympass-Signature).
 *
 * Ni el mail de onboarding ni la documentación pública fijan el algoritmo
 * exacto, y el secreto no lo revela (es un string opaco): la única forma de
 * saberlo es ver una firma generada POR Wellhub — cosa que ni el sandbox
 * permite, porque sus simuladores devuelven el payload sin firmar y lo
 * firmamos nosotros. Así que verificamos contra los formatos plausibles de
 * HMAC del RAW body con el secreto compartido: sha1/sha256, en hex o base64,
 * con o sin prefijo "sha1=" / "sha256=". El hex se compara sin distinguir
 * mayúsculas (la primera prueba real de Wellhub llegó en hex MAYÚSCULA y un
 * 401 la rechazó). Cada candidato se compara en tiempo constante
 * (timingSafeEqual, patrón de campaigns/token-service.ts CR-03).
 *
 * Devuelve el formato que coincidió (para loguearlo): con el primer webhook
 * real de Wellhub, ese log identifica la receta definitiva y esta lista se
 * reduce a uno.
 *
 * IMPORTANTE: la firma se calcula sobre el body CRUDO (Buffer), no sobre el
 * JSON re-serializado — el route debe parsear con parseAs: "buffer".
 */

import { createHmac, timingSafeEqual } from "crypto";

export interface WellhubSignatureFormat {
  algorithm: "sha1" | "sha256";
  encoding: "hex" | "base64" | "base64url";
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Formato que coincidió, o null si la firma es inválida en todos. */
export function verifyWellhubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): WellhubSignatureFormat | null {
  if (!signatureHeader || typeof signatureHeader !== "string") return null;

  // Tolerar prefijo estilo GitHub ("sha1=abc...", "sha256=abc...").
  const provided = signatureHeader.replace(/^sha(1|256)=/i, "").trim();
  if (provided.length === 0) return null;
  const providedBuf = Buffer.from(provided);
  // El hex es case-insensitive: la comparación usa la firma normalizada a
  // minúscula (digest.toString("hex") emite minúscula).
  const providedHexBuf = Buffer.from(provided.toLowerCase());

  for (const algorithm of ["sha1", "sha256"] as const) {
    const hmac = createHmac(algorithm, secret).update(rawBody);
    const digest = hmac.digest();
    for (const encoding of ["hex", "base64", "base64url"] as const) {
      const candidate = encoding === "hex" ? providedHexBuf : providedBuf;
      if (safeEqual(candidate, Buffer.from(digest.toString(encoding)))) {
        return { algorithm, encoding };
      }
    }
  }
  return null;
}
