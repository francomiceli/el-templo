/**
 * Olvidé mi contraseña por código de 6 dígitos (2026-09-15).
 *
 * POST /api/auth/forgot-password + POST /api/auth/reset-password. El mail se
 * intercepta con un spy sobre `EmailService.prototype.sendPasswordResetEmail`
 * (sin RESEND_API_KEY el método real lanza — y eso también se prueba).
 *
 * Rate limit: es por IP y la ventana es de 15 minutos, así que cada test que
 * pega varias veces usa su propia `remoteAddress` para no contaminar al
 * siguiente (fastify.inject la acepta y `request.ip` la refleja).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";
import { EmailService } from "../../src/modules/email/service";
import {
  PASSWORD_RESET_CODE_TTL_MS,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
  generateResetCode,
  hashResetCode,
} from "../../src/modules/auth/password-reset-service";
// `users` está en TENANT_STRICT_MODULES: toda lectura/escritura de conveniencia
// por id se acota con `tenantWhere` (categoría 2 del docblock de helpers.ts).
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const OLD_PASSWORD = "vieja-123";
const NEW_PASSWORD = "nueva-456";

let ipCounter = 0;
/** IP única por test: el rate limit es por IP y la ventana es de 15 min. */
function freshIp(): string {
  ipCounter += 1;
  return `10.99.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

let emailCounter = 0;
function freshEmail(): string {
  emailCounter += 1;
  return `reset-${Date.now()}-${emailCounter}@test.com`;
}

describe("Olvidé mi contraseña (código de 6 dígitos)", () => {
  let app: FastifyInstance;
  let sendSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sendSpy = vi
      .spyOn(EmailService.prototype, "sendPasswordResetEmail")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  async function createMember(): Promise<{ email: string; id: number }> {
    const email = freshEmail();
    const { user } = await registerUser(app, {
      email,
      password: OLD_PASSWORD,
      branchId: 1,
      // `dni` es varchar(20): corto, como el default de `registerUser`.
      dni: `R${Date.now().toString(36)}${emailCounter}`,
    });
    return { email, id: user.id as number };
  }

  async function forgot(email: string, ip: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      remoteAddress: ip,
      payload: { email },
    });
  }

  async function reset(
    email: string,
    code: string,
    ip: string,
    newPassword = NEW_PASSWORD,
  ) {
    return app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      remoteAddress: ip,
      payload: { email, code, newPassword },
    });
  }

  /** El código en claro que la ruta le pasó al mail (último envío). */
  function lastSentCode(): string {
    const calls = sendSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][2] as string;
  }

  async function login(email: string, password: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });
  }

  async function readResetRow(userId: number) {
    const rows = await app.db
      .select({
        hash: schema.users.passwordResetCodeHash,
        expiresAt: schema.users.passwordResetExpiresAt,
        attempts: schema.users.passwordResetAttempts,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, userId)),
      )
      .limit(1);
    return rows[0];
  }

  /** Simula el paso del tiempo moviendo el vencimiento guardado. */
  async function shiftExpiry(userId: number, deltaMs: number) {
    const row = await readResetRow(userId);
    expect(row.expiresAt).not.toBeNull();
    await app.db
      .update(schema.users)
      .set({
        passwordResetExpiresAt: new Date(
          (row.expiresAt as Date).getTime() + deltaMs,
        ),
      })
      .where(
        and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, userId)),
      );
  }

  // ---------------------------------------------------------------
  // Helpers puros
  // ---------------------------------------------------------------
  describe("generateResetCode / hashResetCode", () => {
    it("genera 6 dígitos con ceros a la izquierda", () => {
      for (let i = 0; i < 50; i++) {
        expect(generateResetCode()).toMatch(/^[0-9]{6}$/);
      }
    });

    it("el hash depende del userId: el mismo código no colisiona entre cuentas", () => {
      expect(hashResetCode(1, "123456")).not.toBe(hashResetCode(2, "123456"));
      expect(hashResetCode(1, "123456")).toBe(hashResetCode(1, "123456"));
      expect(hashResetCode(1, "123456")).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ---------------------------------------------------------------
  // POST /forgot-password
  // ---------------------------------------------------------------
  describe("POST /api/auth/forgot-password", () => {
    it("manda un código de 6 dígitos al email del socio y lo guarda hasheado", async () => {
      const { email, id } = await createMember();
      const res = await forgot(email, freshIp());

      expect(res.statusCode).toBe(200);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const [to, , code, minutes] = sendSpy.mock.calls[0];
      expect(to).toBe(email);
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(minutes).toBe(PASSWORD_RESET_CODE_TTL_MS / 60_000);

      const row = await readResetRow(id);
      expect(row.hash).toBe(hashResetCode(id, code as string));
      expect(row.hash).not.toContain(code);
      expect(row.attempts).toBe(0);
      const ttl = (row.expiresAt as Date).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(PASSWORD_RESET_CODE_TTL_MS - 10_000);
      expect(ttl).toBeLessThanOrEqual(PASSWORD_RESET_CODE_TTL_MS);
    });

    it("anti-enumeración: un email desconocido responde el MISMO 200 sin mandar mail", async () => {
      const { email } = await createMember();
      const known = await forgot(email, freshIp());
      const unknown = await forgot("nadie-" + email, freshIp());

      expect(unknown.statusCode).toBe(200);
      expect(JSON.parse(unknown.body)).toEqual(JSON.parse(known.body));
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it("una cuenta eliminada responde 200 pero no recibe código", async () => {
      const { email, id } = await createMember();
      await app.db
        .update(schema.users)
        .set({ deletedAt: new Date() })
        .where(
          and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, id)),
        );

      const res = await forgot(email, freshIp());
      expect(res.statusCode).toBe(200);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("cooldown: un segundo pedido inmediato no manda otro mail ni pisa el código", async () => {
      const { email, id } = await createMember();
      await forgot(email, freshIp());
      const first = await readResetRow(id);

      const again = await forgot(email, freshIp());
      expect(again.statusCode).toBe(200);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect((await readResetRow(id)).hash).toBe(first.hash);
    });

    it("pasado el cooldown, un nuevo pedido emite otro código y el anterior deja de servir", async () => {
      const { email, id } = await createMember();
      await forgot(email, freshIp());
      const firstCode = lastSentCode();
      await shiftExpiry(id, -(PASSWORD_RESET_RESEND_COOLDOWN_MS + 1000));

      await forgot(email, freshIp());
      expect(sendSpy).toHaveBeenCalledTimes(2);
      const secondCode = lastSentCode();
      expect((await readResetRow(id)).hash).toBe(hashResetCode(id, secondCode));

      if (firstCode !== secondCode) {
        const stale = await reset(email, firstCode, freshIp());
        expect(stale.statusCode).toBe(400);
      }
      const ok = await reset(email, secondCode, freshIp());
      expect(ok.statusCode).toBe(200);
    });

    it("si el mail no se puede mandar responde 500 (nunca un 200 sin mail)", async () => {
      sendSpy.mockRestore();
      // Sin RESEND_API_KEY el método real lanza en vez de degradar en silencio.
      const previous = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      try {
        const { email } = await createMember();
        const res = await forgot(email, freshIp());
        expect(res.statusCode).toBe(500);
      } finally {
        if (previous !== undefined) process.env.RESEND_API_KEY = previous;
        // afterEach hace mockRestore sobre un spy ya restaurado: re-armar
        // para que no falle.
        sendSpy = vi
          .spyOn(EmailService.prototype, "sendPasswordResetEmail")
          .mockResolvedValue(undefined);
      }
    });

    it("valida el body: email malformado → 400", async () => {
      const res = await forgot("no-es-un-email", freshIp());
      expect(res.statusCode).toBe(400);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("rate limit por IP: el sexto pedido en la ventana responde 429", async () => {
      const ip = freshIp();
      const email = "rate-limit-" + freshEmail();
      for (let i = 0; i < 5; i++) {
        expect((await forgot(email, ip)).statusCode).toBe(200);
      }
      const blocked = await forgot(email, ip);
      expect(blocked.statusCode).toBe(429);
      expect(JSON.parse(blocked.body).message).toMatch(/Demasiados intentos/);

      // Otra IP no está afectada.
      expect((await forgot(email, freshIp())).statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // POST /reset-password
  // ---------------------------------------------------------------
  describe("POST /api/auth/reset-password", () => {
    it("con el código correcto cambia la contraseña, limpia el código y desloguea otros dispositivos", async () => {
      const { email, id } = await createMember();
      const session = await login(email, OLD_PASSWORD);
      expect(session.statusCode).toBe(200);
      const { refreshToken } = JSON.parse(session.body);

      await forgot(email, freshIp());
      const code = lastSentCode();

      const res = await reset(email, code, freshIp());
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({
        message: "Contraseña actualizada",
      });

      const row = await readResetRow(id);
      expect(row.hash).toBeNull();
      expect(row.expiresAt).toBeNull();
      expect(row.attempts).toBe(0);

      expect((await login(email, NEW_PASSWORD)).statusCode).toBe(200);
      expect((await login(email, OLD_PASSWORD)).statusCode).toBe(401);

      const refreshed = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken },
      });
      expect(refreshed.statusCode).toBe(401);
    });

    it("el código sirve una sola vez", async () => {
      const { email } = await createMember();
      await forgot(email, freshIp());
      const code = lastSentCode();

      expect((await reset(email, code, freshIp())).statusCode).toBe(200);
      const again = await reset(email, code, freshIp(), "otra-789");
      expect(again.statusCode).toBe(400);
      expect((await login(email, "otra-789")).statusCode).toBe(401);
      expect((await login(email, NEW_PASSWORD)).statusCode).toBe(200);
    });

    it("un código incorrecto responde 400 genérico, suma un intento y no toca la contraseña", async () => {
      const { email, id } = await createMember();
      await forgot(email, freshIp());
      const code = lastSentCode();
      const wrong = code === "000000" ? "000001" : "000000";

      const res = await reset(email, wrong, freshIp());
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe("Código inválido o vencido");
      expect((await readResetRow(id)).attempts).toBe(1);
      expect((await login(email, OLD_PASSWORD)).statusCode).toBe(200);
      expect((await login(email, NEW_PASSWORD)).statusCode).toBe(401);
    });

    it(`tras ${PASSWORD_RESET_MAX_ATTEMPTS} intentos fallidos el código queda inutilizable aunque después se acierte`, async () => {
      const { email, id } = await createMember();
      await forgot(email, freshIp());
      const code = lastSentCode();
      const wrong = code === "000000" ? "000001" : "000000";

      for (let i = 0; i < PASSWORD_RESET_MAX_ATTEMPTS; i++) {
        expect((await reset(email, wrong, freshIp())).statusCode).toBe(400);
      }
      expect((await readResetRow(id)).attempts).toBe(
        PASSWORD_RESET_MAX_ATTEMPTS,
      );

      const locked = await reset(email, code, freshIp());
      expect(locked.statusCode).toBe(400);
      expect((await login(email, NEW_PASSWORD)).statusCode).toBe(401);
    });

    it("un código vencido responde 400", async () => {
      const { email, id } = await createMember();
      await forgot(email, freshIp());
      const code = lastSentCode();
      await shiftExpiry(id, -(PASSWORD_RESET_CODE_TTL_MS + 1000));

      expect((await reset(email, code, freshIp())).statusCode).toBe(400);
      expect((await login(email, OLD_PASSWORD)).statusCode).toBe(200);
    });

    it("sin código pendiente (nunca pidió uno) responde 400", async () => {
      const { email } = await createMember();
      expect((await reset(email, "123456", freshIp())).statusCode).toBe(400);
    });

    it("email desconocido responde el mismo 400 genérico", async () => {
      const res = await reset("nadie-" + freshEmail(), "123456", freshIp());
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe("Código inválido o vencido");
    });

    it("el código de un socio no sirve para otro socio", async () => {
      const victim = await createMember();
      const attacker = await createMember();
      await forgot(attacker.email, freshIp());
      const attackerCode = lastSentCode();

      const res = await reset(victim.email, attackerCode, freshIp());
      expect(res.statusCode).toBe(400);
      expect((await login(victim.email, OLD_PASSWORD)).statusCode).toBe(200);
    });

    it("valida el body: código que no son 6 dígitos o contraseña corta → 400 sin consumir intentos", async () => {
      const { email, id } = await createMember();
      await forgot(email, freshIp());

      const badCode = await reset(email, "12345", freshIp());
      expect(badCode.statusCode).toBe(400);
      const letters = await reset(email, "12345a", freshIp());
      expect(letters.statusCode).toBe(400);
      const shortPassword = await reset(email, "123456", freshIp(), "abc");
      expect(shortPassword.statusCode).toBe(400);

      expect((await readResetRow(id)).attempts).toBe(0);
    });

    it("rate limit por IP: el undécimo intento en la ventana responde 429", async () => {
      const ip = freshIp();
      const { email } = await createMember();
      for (let i = 0; i < 10; i++) {
        expect((await reset(email, "123456", ip)).statusCode).toBe(400);
      }
      expect((await reset(email, "123456", ip)).statusCode).toBe(429);
    });
  });
});
