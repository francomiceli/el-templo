import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, createStaffUser } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  LOGIN_REJECTED_MSG,
  type LoginRejectReason,
} from "../../src/modules/auth/routes";

/**
 * Login rechazado deja rastro en el log (hotfix 2026-11-13): dos profes no
 * podían entrar y el log no decía si erraban el email, la clave o si la cuenta
 * estaba bloqueada. Cada 401 de /login loguea `warn` con motivo + userId, y
 * NUNCA el email ni la clave tipeados.
 */

interface LogLine {
  level: number;
  msg: string;
  reason?: LoginRejectReason;
  userId?: number | null;
}

const WARN = 40;
const PASSWORD = "coachpass123";

/** Sufijo único por llamada: los emails no se pisan entre casos del mismo worker. */
function uniq(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

describe("POST /api/auth/login: log de rechazos", () => {
  let app: FastifyInstance;
  const raw: string[] = [];

  beforeAll(async () => {
    app = await createTestApp({
      logDestination: { write: (line: string) => void raw.push(line) },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    raw.length = 0;
  });

  function rejections(): LogLine[] {
    return raw
      .map((l) => JSON.parse(l) as LogLine)
      .filter((l) => l.msg === LOGIN_REJECTED_MSG);
  }

  async function login(email: string, password: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });
  }

  async function newCoach(): Promise<{ id: number; email: string }> {
    const email = `login-log-${uniq()}@test.com`;
    const id = await createStaffUser(app, {
      email,
      password: PASSWORD,
      firstName: "Coach",
      lastName: "Log",
      role: "coach",
      branchId: 1,
    });
    return { id, email };
  }

  async function setUser(
    id: number,
    patch: { staffDisabled?: boolean; deletedAt?: Date },
  ): Promise<void> {
    await app.db
      .update(schema.users)
      .set(patch)
      .where(
        and(
          tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
          eq(schema.users.id, id),
        ),
      );
  }

  it("clave incorrecta → 401 y warn bad_password con el userId", async () => {
    const coach = await newCoach();

    const res = await login(coach.email, "otra-clave-999");

    expect(res.statusCode).toBe(401);
    expect(rejections()).toEqual([
      expect.objectContaining({
        level: WARN,
        reason: "bad_password",
        userId: coach.id,
      }),
    ]);
  });

  it("email inexistente → 401 y warn unknown_email con userId null", async () => {
    const res = await login(`nadie-${uniq()}@test.com`, PASSWORD);

    expect(res.statusCode).toBe(401);
    expect(rejections()).toEqual([
      expect.objectContaining({
        level: WARN,
        reason: "unknown_email",
        userId: null,
      }),
    ]);
  });

  it("staff deshabilitado → 401 y warn disabled", async () => {
    const coach = await newCoach();
    await setUser(coach.id, { staffDisabled: true });

    const res = await login(coach.email, PASSWORD);

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toBe("Cuenta desactivada");
    expect(rejections()).toEqual([
      expect.objectContaining({ reason: "disabled", userId: coach.id }),
    ]);
  });

  it("cuenta borrada → 401 y warn deleted", async () => {
    const coach = await newCoach();
    await setUser(coach.id, { deletedAt: new Date() });

    const res = await login(coach.email, PASSWORD);

    expect(res.statusCode).toBe(401);
    expect(rejections()).toEqual([
      expect.objectContaining({ reason: "deleted", userId: coach.id }),
    ]);
  });

  it("login correcto → 200 y ningún warn de rechazo", async () => {
    const coach = await newCoach();

    const res = await login(coach.email, PASSWORD);

    expect(res.statusCode).toBe(200);
    expect(rejections()).toEqual([]);
  });

  it("nunca loguea el email ni la clave tipeados", async () => {
    const coach = await newCoach();
    const typedPassword = `clave-tipeada-${uniq()}`;
    const typedEmail = `tipeado-${uniq()}@test.com`;

    await login(coach.email, typedPassword);
    await login(typedEmail, typedPassword);

    expect(rejections()).toHaveLength(2);
    const all = raw.join("\n");
    expect(all).not.toContain(typedPassword);
    expect(all).not.toContain(typedEmail);
    expect(all).not.toContain(coach.email);
  });
});
