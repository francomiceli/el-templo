/**
 * Fábricas de la fase 201 (Conquer v2). Cada plan las amplía: NO duplicar en
 * los archivos de test (201-07 suma `insertConquerSession`).
 *
 * Reglas (EXECUTOR-RULES): usuarios SIEMPRE con fábricas, nunca ids fijos de
 * `users`; INSERT directos con `tenantValues(TEMPLO_CTX, ...)` y lecturas
 * directas con `tenantWhere(tabla, TEMPLO_CTX)`.
 */
import { and, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import type { Level } from "../../src/modules/conquer/rules";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createStaffUser, createTestMember, getAuthToken } from "../helpers";

/** Contexto de El Templo (tenant 1): el único con Conquer en la fase 201. */
export const TEMPLO_CTX: TenantContext = { tenantId: 1 };

/** Contraseña de los usuarios de staff creados por estas fábricas. */
const STAFF_PASSWORD = "conquer-staff-123";

/**
 * Usuario de staff de El Templo (sede 1) con el rol pedido, ya autenticado.
 * El email es único por llamada.
 */
export async function createConquerStaff(
  app: FastifyInstance,
  role: string,
): Promise<{ id: number; token: string }> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `conquer-${role}-${suffix}@test.com`;
  const id = await createStaffUser(app, {
    email,
    password: STAFF_PASSWORD,
    firstName: "Staff",
    lastName: `Conquer ${role}`,
    role,
    branchId: 1,
  });
  const token = await getAuthToken(app, email, STAFF_PASSWORD);
  return { id, token };
}

type ConquerMemberOverrides = Partial<
  Omit<typeof schema.conquerMembers.$inferInsert, "id" | "tenantId" | "userId">
>;

/**
 * Fila directa de `conquer_members` para `userId`. Por defecto `status:
 * 'pedido'`; para un alumno activo pasar `status: "activo"` más `level`,
 * `daysCount` y `activationDate`.
 */
export async function insertConquerMember(
  app: FastifyInstance,
  userId: number,
  overrides: ConquerMemberOverrides = {},
): Promise<number> {
  const [row] = await app.db
    .insert(schema.conquerMembers)
    .values(
      tenantValues(TEMPLO_CTX, {
        status: "pedido" as const,
        ...overrides,
        userId,
      }),
    )
    .$returningId();
  return row.id;
}

/** Borra los parámetros `conquer.%` de `tenant_settings` del gimnasio 1. */
export async function clearConquerSettings(
  app: FastifyInstance,
): Promise<void> {
  await app.db
    .delete(schema.tenantSettings)
    .where(
      and(
        tenantWhere(schema.tenantSettings, TEMPLO_CTX),
        like(schema.tenantSettings.settingKey, "conquer.%"),
      ),
    );
}

/** Ruta de alta del admin (201-06). */
export const CONQUER_MEMBERS_URL = "/api/admin/conquer/members";

/**
 * Activa a un alumno por la API (201-06). Devuelve la respuesta cruda para que
 * el test decida qué afirmar (201 / 4xx).
 */
export async function activateViaApi(
  app: FastifyInstance,
  adminToken: string,
  userId: number,
  level: Level,
  daysCount: number,
  extra: { coachUserId?: number | null } = {},
) {
  return app.inject({
    method: "POST",
    url: CONQUER_MEMBERS_URL,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { userId, level, daysCount, ...extra },
  });
}

/**
 * Alumno de El Templo (sin plan, D-17) ya ACTIVO en Conquer, más el token de
 * un admin. Falla fuerte si el alta no responde 201.
 */
export async function createActiveConquerMember(
  app: FastifyInstance,
  opts: { level: Level; daysCount: number },
): Promise<{ userId: number; token: string; adminToken: string }> {
  const member = await createTestMember(app);
  const admin = await createConquerStaff(app, "admin");
  const res = await activateViaApi(
    app,
    admin.token,
    member.id,
    opts.level,
    opts.daysCount,
  );
  if (res.statusCode !== 201) {
    throw new Error(`createActiveConquerMember: ${res.statusCode} ${res.body}`);
  }
  return { userId: member.id, token: member.token, adminToken: admin.token };
}

/** Un escalón del alumno resuelto a códigos legibles. */
export interface StepSnapshot {
  rungId: number;
  rungCode: string;
  mode: string;
  sinceDate: string | null;
  calibration: string;
}

/**
 * Escalones del alumno `userId` indexados por `"<ejercicio>:<e1|e2|e3|hold>"`
 * (código del ejercicio y del peldaño, no ids).
 */
export async function readConquerSteps(
  app: FastifyInstance,
  userId: number,
): Promise<Map<string, StepSnapshot>> {
  const rows = await app.db
    .select({
      exerciseCode: schema.conquerExercises.code,
      step: schema.conquerSteps.step,
      rungId: schema.conquerSteps.rungId,
      rungCode: schema.conquerRungs.code,
      mode: schema.conquerSteps.mode,
      sinceDate: schema.conquerSteps.sinceDate,
      calibration: schema.conquerSteps.calibration,
    })
    .from(schema.conquerSteps)
    .innerJoin(
      schema.conquerMembers,
      eq(schema.conquerMembers.id, schema.conquerSteps.memberId),
    )
    .innerJoin(
      schema.conquerExercises,
      eq(schema.conquerExercises.id, schema.conquerSteps.exerciseId),
    )
    .innerJoin(
      schema.conquerRungs,
      eq(schema.conquerRungs.id, schema.conquerSteps.rungId),
    )
    .where(
      and(
        tenantWhere(schema.conquerSteps, TEMPLO_CTX),
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        tenantWhere(schema.conquerExercises, TEMPLO_CTX),
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return new Map(
    rows.map((r) => [
      `${r.exerciseCode}:${r.step}`,
      {
        rungId: r.rungId,
        rungCode: r.rungCode,
        mode: r.mode,
        sinceDate: r.sinceDate,
        calibration: r.calibration,
      },
    ]),
  );
}
