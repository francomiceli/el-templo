/**
 * QR token generation and validation utilities.
 *
 * Stateless HMAC-SHA256 signed tokens used for member check-in.
 * Token format: base64url(payload).base64url(signature)
 */

import { createHmac } from "crypto";

export interface QrPayload {
  branchId: number;
  type: "checkin";
}

export function generateQrToken(branchId: number): string {
  const payload: QrPayload = { branchId, type: "checkin" };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required for QR token generation");
  }

  const signature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

export function validateQrToken(token: string): QrPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, providedSignature] = parts;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  const expectedSignature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  if (providedSignature !== expectedSignature) return null;

  try {
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr) as Record<string, unknown>;

    if (typeof payload.branchId !== "number" || payload.type !== "checkin") {
      return null;
    }

    return { branchId: payload.branchId, type: "checkin" };
  } catch {
    return null;
  }
}
