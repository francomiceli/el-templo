/**
 * Google Business Profile — obtener el refresh token (fase 195, plan 09, D-21.3).
 *
 * HERRAMIENTA LOCAL: se corre UNA vez en la PC de Franco (nunca en el server):
 *
 *   GBP_OAUTH_CLIENT_ID=... GBP_OAUTH_CLIENT_SECRET=... \
 *     pnpm exec tsx scripts/gbp-authorize.ts
 *
 * (o con las dos variables en `.env.development`). Levanta un servidor HTTP
 * solo en `127.0.0.1:53682`, imprime la URL de consentimiento, recibe el
 * `code` en `/callback`, lo canjea por tokens y muestra el `refresh_token`.
 * Se cierra solo al terminar (o a los 5 minutos).
 *
 * Requisitos en Google Cloud (ver la guía de la fase 195):
 *   - Cliente OAuth de tipo "Aplicación web" con la redirect URI
 *     `http://127.0.0.1:53682/callback`.
 *   - Pantalla de consentimiento en "In production": en "Testing" el refresh
 *     token vence a los 7 días.
 *   - Entrar con el usuario owner/manager de las fichas.
 *
 * Nunca imprime el client secret ni el access token; el único secreto que sale
 * por pantalla es el refresh token, que es justo lo que hay que copiar.
 */

/* tenant-safe: no toca la DB: solo habla con Google por OAuth desde la PC de Franco */

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.development" });
loadEnv({ path: ".env" });

export const AUTH_PORT = 53682;
export const REDIRECT_URI = `http://127.0.0.1:${AUTH_PORT}/callback`;
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/business.manage";
const TIMEOUT_MS = 5 * 60 * 1000;

/** URL de consentimiento (offline + prompt=consent para que Google devuelva refresh token). */
export function buildConsentUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Canjea el `code` por tokens y devuelve el refresh token. Errores sin secretos. */
export async function exchangeAuthorizationCode(creds: {
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: creds.code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    let code = "";
    try {
      const parsed: unknown = JSON.parse(raw);
      const err =
        parsed && typeof parsed === "object"
          ? (parsed as { error?: unknown }).error
          : undefined;
      if (typeof err === "string" && /^[a-z_]{1,40}$/.test(err)) code = err;
    } catch {
      // Cuerpo que no es JSON: sin detalle.
    }
    throw new Error(
      `Google rechazó el canje del código (${response.status}${code ? `, ${code}` : ""})`,
    );
  }
  const parsed: unknown = JSON.parse(raw);
  const refresh =
    parsed && typeof parsed === "object"
      ? (parsed as { refresh_token?: unknown }).refresh_token
      : undefined;
  if (typeof refresh !== "string" || refresh.length === 0) {
    throw new Error(
      "Google no devolvió refresh_token. Revocá el acceso de la app en https://myaccount.google.com/permissions y repetí.",
    );
  }
  return refresh;
}

function out(text: string): void {
  process.stdout.write(`${text}\n`);
}

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function main(): Promise<void> {
  const clientId = (process.env.GBP_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GBP_OAUTH_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) {
    fail(
      "Faltan GBP_OAUTH_CLIENT_ID y/o GBP_OAUTH_CLIENT_SECRET (cliente OAuth de Google Cloud).",
      2,
    );
  }

  const state = randomBytes(16).toString("hex");

  await new Promise<void>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${AUTH_PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const finish = (status: number, message: string, error?: Error) => {
        res
          .writeHead(status, { "content-type": "text/plain; charset=utf-8" })
          .end(message);
        server.close();
        if (error) reject(error);
        else resolve();
      };

      const denied = url.searchParams.get("error");
      if (denied) {
        finish(
          400,
          "Autorización rechazada. Volvé a la terminal.",
          new Error(`Google devolvió error=${denied.slice(0, 40)}`),
        );
        return;
      }
      if (url.searchParams.get("state") !== state) {
        finish(
          400,
          "El parámetro state no coincide. Volvé a la terminal.",
          new Error(
            "El state del callback no coincide (posible intento ajeno): abortado.",
          ),
        );
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        finish(
          400,
          "Falta el code. Volvé a la terminal.",
          new Error("El callback llegó sin code."),
        );
        return;
      }

      exchangeAuthorizationCode({ clientId, clientSecret, code })
        .then((refreshToken) => {
          out("");
          out("Listo. Tu refresh token es:");
          out("");
          out(refreshToken);
          out("");
          out(
            "Cargalo como secret GBP_REFRESH_TOKEN en GitHub (prod). Recordá pasar la pantalla de consentimiento a 'In production': en 'Testing' el token vence a los 7 días",
          );
          finish(
            200,
            "Listo. Ya podés cerrar esta pestaña y volver a la terminal.",
          );
        })
        .catch((err: unknown) => {
          const error =
            err instanceof Error ? err : new Error("Error desconocido");
          finish(500, "Falló el canje del código. Mirá la terminal.", error);
        });
    });

    const timer = setTimeout(() => {
      server.close();
      reject(
        new Error("Se agotaron los 5 minutos sin recibir la autorización."),
      );
    }, TIMEOUT_MS);
    server.on("close", () => clearTimeout(timer));
    server.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    server.listen(AUTH_PORT, "127.0.0.1", () => {
      out(`Servidor local escuchando en ${REDIRECT_URI}`);
      out("");
      out(
        "Abrí esta URL en el navegador, entrá con el usuario owner de las fichas y aceptá:",
      );
      out("");
      out(buildConsentUrl(clientId, state));
      out("");
    });
  });
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : "Error desconocido");
  });
}
