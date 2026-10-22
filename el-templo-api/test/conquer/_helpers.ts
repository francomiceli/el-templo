/**
 * Fábricas de la fase 201 (Conquer v2). Cada plan las amplía: NO duplicar en
 * los archivos de test (201-07 suma `insertConquerSession`).
 *
 * Reglas (EXECUTOR-RULES): usuarios SIEMPRE con fábricas, nunca ids fijos de
 * `users`; INSERT directos con `tenantValues(TEMPLO_CTX, ...)` y lecturas
 * directas con `tenantWhere(tabla, TEMPLO_CTX)`.
 */
import { and, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createStaffUser, getAuthToken } from "../helpers";

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
