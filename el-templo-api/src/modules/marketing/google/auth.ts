/**
 * Google — autenticación sin SDK (fase 195, plan 09).
 *
 * `fetch` nativo + `node:crypto`: sin `googleapis` ni `google-auth-library`.
 *   - Service account (Search Console): JWT RS256 firmado con la clave privada
 *     y canjeado en el token endpoint (`urn:ietf:params:oauth:grant-type:jwt-bearer`).
 *   - OAuth con refresh token (Business Profile): `grant_type=refresh_token`.
 *
 * Los errores salen con el status y el CÓDIGO de error de Google (`invalid_grant`,
 * `invalid_client`...) y nada más: jamás la clave privada, la assertion, el
 * client secret ni el refresh token (T-195-36). No se loguea la URL ni el body.
 */
import { createSign } from "node:crypto";
import type { GoogleServiceAccount } from "./config";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";

const TOKEN_TIMEOUT_MS = 15_000;
const JWT_LIFETIME_SECONDS = 3600;

/** Error de Google (o de red). `message` no contiene secretos. */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/**
 * JWT RS256 de una service account. `nowSeconds` se inyecta para poder testear
 * (iat/exp). Lanza un error SIN el detalle de OpenSSL si la clave no sirve.
 */
export function buildServiceAccountJwt(
  sa: GoogleServiceAccount,
  scope: string,
  nowSeconds: number,
): string {
  const header = b64url(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      ...(sa.private_key_id ? { kid: sa.private_key_id } : {}),
    }),
  );
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: GOOGLE_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + JWT_LIFETIME_SECONDS,
    }),
  );
  const signingInput = `${header}.${claims}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256")
      .update(signingInput)
      .sign(sa.private_key)
      .toString("base64url");
  } catch {
    throw new GoogleApiError(
      "No se pudo firmar el JWT de la service account (clave privada inválida)",
      0,
    );
  }
  return `${signingInput}.${signature}`;
}

/** Código de error de Google (`invalid_grant`...) si es seguro mostrarlo. */
function safeErrorCode(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const code = (parsed as { error?: unknown }).error;
      if (typeof code === "string" && /^[a-z_]{1,40}$/.test(code)) return code;
    }
  } catch {
    // Cuerpo que no es JSON: sin detalle.
  }
  return null;
}

async function requestAccessToken(
  params: Record<string, string>,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : "Error";
    throw new GoogleApiError(
      `Error de red pidiendo el token de Google (${name})`,
      0,
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    const code = safeErrorCode(raw);
    throw new GoogleApiError(
      `Google rechazó el pedido de token (${response.status}${code ? `, ${code}` : ""})`,
      response.status,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GoogleApiError(
      "Google devolvió un token que no es JSON",
      response.status,
    );
  }
  const token =
    parsed && typeof parsed === "object"
      ? (parsed as { access_token?: unknown }).access_token
      : undefined;
  if (typeof token !== "string" || token.length === 0) {
    throw new GoogleApiError(
      "Google respondió sin access_token",
      response.status,
    );
  }
  return token;
}

/** Access token de una service account para `scope`. */
export async function serviceAccountAccessToken(
  sa: GoogleServiceAccount,
  scope: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const assertion = buildServiceAccountJwt(sa, scope, nowSeconds);
  return requestAccessToken({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
}

export interface RefreshTokenCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Access token de un usuario que consintió antes (refresh token OAuth). */
export async function refreshTokenAccessToken(
  creds: RefreshTokenCredentials,
): Promise<string> {
  return requestAccessToken({
    grant_type: "refresh_token",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
  });
}
