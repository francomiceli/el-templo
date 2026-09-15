/**
 * Olvidé mi contraseña por código de 6 dígitos (2026-09-15).
 *
 * Flujo self-serve en dos pasos, sin link ni deep link (en iOS los Universal
 * Links están deshabilitados a propósito — ver el entitlement comentado en
 * `el-templo-app/src-capacitor/ios/App/App/App.entitlements` — así que un
 * código tipeado en la app funciona igual en Android, iOS, web y admin):
 *
 *   1. `requestCode(email)`: si el email existe (y la cuenta puede loguear),
 *      genera un código aleatorio de 6 dígitos, guarda SOLO su HMAC-SHA256 en
 *      `users.password_reset_code_hash` con vencimiento de 15 minutos y
 *      devuelve el código en claro para que la ruta lo mande por mail. Si el
 *      email no existe devuelve `null` y la ruta responde EXACTAMENTE igual
 *      (anti-enumeración: mismo 200, mismo mensaje).
 *   2. `resetPassword(email, code, newPassword)`: valida el código (firma,
 *      vencimiento, intentos), pisa la contraseña con argon2, limpia el
 *      código y revoca TODOS los refresh tokens del usuario (desloguea otros
 *      dispositivos, mismo criterio que `/me/change-password`).
 *
 * Fuerza bruta: 6 dígitos son 1M de combinaciones. Se mitiga con tres capas
 * independientes: vencimiento corto, máximo de intentos por código (al
 * llegar al tope el código queda inutilizable y hay que pedir otro) y el
 * rate limit por IP de las rutas (`@fastify/rate-limit`).
 *
 * Multi-tenant: el email NO es único global (uq_users_tenant_email). Como el
 * login, este flujo no recibe selector de gimnasio y busca a propósito
 * cross-tenant con `.limit(1)` — hereda la misma deuda documentada en
 * `/login` (fase 168/CON-01) sin empeorarla: ambos pasos usan la MISMA
 * query, así el código se manda y se valida contra la misma fila.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import argon2 from "argon2";
import * as schema from "../../db/schema";
import { users } from "../../db/schema/users";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { RefreshTokenService } from "./refresh-token-service";

/** Vida del código desde que se emite. */
export const PASSWORD_RESET_CODE_TTL_MS = 15 * 60 * 1000;
/** Intentos fallidos tolerados contra UN código antes de inutilizarlo. */
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;
/**
 * Ventana mínima entre dos códigos para el mismo usuario. Evita que un
 * tercero le llene la casilla a alguien a fuerza de POST /forgot-password
 * (complementa el rate limit por IP, que un atacante distribuido esquiva).
 */
export const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
export const PASSWORD_RESET_CODE_LENGTH = 6;

export interface ResetCodeIssued {
  code: string;
  user: { id: number; email: string; firstName: string | null };
}

export type ResetOutcome = "ok" | "invalid";

/** Código de 6 dígitos con ceros a la izquierda ("004217"), CSPRNG. */
export function generateResetCode(): string {
  return randomInt(0, 10 ** PASSWORD_RESET_CODE_LENGTH)
    .toString()
    .padStart(PASSWORD_RESET_CODE_LENGTH, "0");
}

/**
 * HMAC-SHA256 (hex) del código, atado al `userId` para que el mismo código
 * no produzca el mismo hash en dos cuentas. Firmado con `JWT_SECRET`, como
 * los tokens de campaña (`campaigns/token-service.ts`).
 */
export function hashResetCode(userId: number, code: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required to hash password reset codes");
  }
  return createHmac("sha256", secret).update(`${userId}:${code}`).digest("hex");
}

export class PasswordResetService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Misma búsqueda que `/login`: por email, cross-tenant a propósito, primer
   * match. Usada por los DOS pasos para que apunten a la misma fila.
   */
  private async findByEmail(email: string) {
    /* tenant-safe: recuperación de contraseña sin selector de gimnasio, busca a propósito cross-tenant — misma deuda documentada que /login (fase 168) */
    const rows = await this.db
      .select({
        id: users.id,
        tenantId: users.tenantId,
        email: users.email,
        firstName: users.firstName,
        role: users.role,
        deletedAt: users.deletedAt,
        staffDisabled: users.staffDisabled,
        passwordResetCodeHash: users.passwordResetCodeHash,
        passwordResetExpiresAt: users.passwordResetExpiresAt,
        passwordResetAttempts: users.passwordResetAttempts,
      })
      .from(users)
      .where(
        sql`/* tenant-safe: recuperación de contraseña sin selector de gimnasio, busca a propósito cross-tenant — misma deuda documentada que /login (fase 168) */ ${eq(users.email, email)}`,
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Mismos gates que el login: cuenta eliminada o staff desactivado no entra. */
  private canLogin(user: {
    deletedAt: Date | null;
    role: string;
    staffDisabled: boolean | null;
  }): boolean {
    if (user.deletedAt) return false;
    if (user.role !== "member" && user.staffDisabled === true) return false;
    return true;
  }

  /**
   * Paso 1. Devuelve el código en claro (para el mail) o `null` cuando no
   * corresponde mandar nada: email inexistente, cuenta que no puede loguear,
   * o un código emitido hace menos de `PASSWORD_RESET_RESEND_COOLDOWN_MS`.
   * En ningún caso lanza por "no encontrado" — la ruta responde igual.
   */
  async requestCode(email: string): Promise<ResetCodeIssued | null> {
    const user = await this.findByEmail(email);
    if (!user || !user.email || !this.canLogin(user)) {
      this.log.info("Password reset requested for unknown or blocked account");
      return null;
    }

    const now = Date.now();
    if (user.passwordResetExpiresAt) {
      const issuedAt =
        user.passwordResetExpiresAt.getTime() - PASSWORD_RESET_CODE_TTL_MS;
      if (now - issuedAt < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
        this.log.info(
          { userId: user.id },
          "Password reset code requested inside the resend cooldown, skipping",
        );
        return null;
      }
    }

    const code = generateResetCode();
    const ctx: TenantContext = { tenantId: user.tenantId };
    await this.db
      .update(users)
      .set({
        passwordResetCodeHash: hashResetCode(user.id, code),
        passwordResetExpiresAt: new Date(now + PASSWORD_RESET_CODE_TTL_MS),
        passwordResetAttempts: 0,
      })
      .where(and(tenantWhere(users, ctx), eq(users.id, user.id)));

    this.log.info({ userId: user.id }, "Password reset code issued");
    return {
      code,
      user: { id: user.id, email: user.email, firstName: user.firstName },
    };
  }

  /**
   * Paso 2. `"invalid"` cubre TODO lo que no sea un canje limpio (email
   * desconocido, sin código pendiente, vencido, agotado o incorrecto) para
   * que la ruta responda un único mensaje genérico. Un código incorrecto
   * suma un intento; al llegar a `PASSWORD_RESET_MAX_ATTEMPTS` el código
   * queda inutilizable aunque después se acierte.
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<ResetOutcome> {
    const user = await this.findByEmail(email);
    if (!user || !this.canLogin(user)) return "invalid";
    if (!user.passwordResetCodeHash || !user.passwordResetExpiresAt) {
      return "invalid";
    }

    const ctx: TenantContext = { tenantId: user.tenantId };

    if (user.passwordResetExpiresAt.getTime() <= Date.now()) {
      this.log.info({ userId: user.id }, "Password reset code expired");
      return "invalid";
    }
    if (user.passwordResetAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      this.log.warn(
        { userId: user.id },
        "Password reset code locked after too many attempts",
      );
      return "invalid";
    }

    const expected = Buffer.from(user.passwordResetCodeHash, "hex");
    const provided = Buffer.from(hashResetCode(user.id, code), "hex");
    const matches =
      expected.length === provided.length &&
      timingSafeEqual(expected, provided);

    if (!matches) {
      await this.db
        .update(users)
        .set({
          passwordResetAttempts: sql`${users.passwordResetAttempts} + 1`,
        })
        .where(and(tenantWhere(users, ctx), eq(users.id, user.id)));
      this.log.info({ userId: user.id }, "Password reset code mismatch");
      return "invalid";
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.db
      .update(users)
      .set({
        passwordHash,
        passwordResetCodeHash: null,
        passwordResetExpiresAt: null,
        passwordResetAttempts: 0,
      })
      .where(and(tenantWhere(users, ctx), eq(users.id, user.id)));

    // Mismo criterio que /me/change-password: cambiar la contraseña
    // desloguea todos los dispositivos. El que hizo el reset vuelve a entrar
    // con la contraseña nueva (los frontends hacen el login acto seguido).
    await new RefreshTokenService(this.db, this.log).revokeAllForUser(user.id);

    this.log.info({ userId: user.id }, "Password reset completed");
    return "ok";
  }
}
