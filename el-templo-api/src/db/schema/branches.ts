// Module: branches
import {
  mysqlTable,
  int,
  bigint,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenants } from "./tenants";

export const branches = mysqlTable(
  "branches",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 166 (FUND-02): ancla de tenancy. `branches` es una de las dos anclas
    // del modelo (la otra es `users`): el resto de las tablas gym-owned cuelga
    // de acá en la fase 167.
    // - El valor SALE SIEMPRE DEL SERVIDOR (`scope.tenantId`, derivado de
    //   `users.tenant_id`). JAMÁS de un payload, de una query string ni del JWT
    //   — el tenant no viaja por el borde (D-02/D-03).
    // - Lleva DEFAULT 1 a propósito, no por comodidad: durante el rolling deploy
    //   convive código viejo que no manda `tenant_id`, y `test/setup.ts` inserta
    //   branches con `INSERT IGNORE` sin la columna (PATTERNS §0.3) — sin
    //   DEFAULT esas filas no se insertarían y la suite se cae en cascada. El
    //   DEFAULT se re-evalúa cuando exista un tenant 2, fuera de v6.0.
    // - El orden en este archivo es de LECTURA y no refleja el orden físico: el
    //   ALTER de la migración 0191 agrega la columna al final de la tabla.
    tenantId: int("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenants.id),
    name: varchar("name", { length: 255 }).notNull(),
    // Fase 168 (CON-01): el código de sede dejó de ser único global — la unique
    // vive en el callback de tabla como uq_branches_tenant_code (tenant_id, code).
    code: varchar("code", { length: 20 }).notNull(),
    timezone: varchar("timezone", { length: 50 })
      .default("America/Argentina/Buenos_Aires")
      .notNull(),
    country: varchar("country", { length: 2 }).default("AR").notNull(),
    // D-24: street address for the trial-campaign email (D-13) + general reuse.
    // Nullable; existing rows backfilled by migration 0132 from the canonical
    // sede addresses in el-templo-web/data/sedes.ts.
    address: varchar("address", { length: 255 }),
    maxCapacity: int("max_capacity").default(22).notNull(),
    // Integración Wellhub (2026-07, migración 0186): id del gimnasio en la
    // plataforma Wellhub/Gympass. NULL = sede sin Wellhub (integración apagada).
    // El webhook entrante resuelve la sede por este id (event_data.gym.id) y la
    // sincronización de clases/slots solo publica sedes con valor no-NULL.
    // tenant-global (M8) a proposito: id de plataforma externa — la unique global es lo que impide que dos tenants reclamen el mismo gimnasio de Wellhub, y el webhook entrante resuelve la sede por este id SIN scope. NO es un olvido de la fase 168: el motivo esta registrado en TENANT_GLOBAL_UNIQUES de src/db/tenant-tables.ts (lista M8, aprobada 2026-07-26, doc 06 §8-Q4).
    wellhubGymId: bigint("wellhub_gym_id", { mode: "number" }).unique(),
    romEnabled: boolean("rom_enabled").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    isVirtual: boolean("is_virtual").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // Fase 166 (FUND-02): toda query gym-owned filtra por tenant_id.
    index("idx_branches_tenant_id").on(table.tenantId),
    // Fase 168 (CON-01): unicidad POR TENANT — el código de sede es único dentro
    // del gimnasio, no del mundo. Sin índice secundario sobre `code` (D-06):
    // branches es un catálogo de decenas de filas. Índice byte-for-byte con la
    // migración 0196.
    uniqueIndex("uq_branches_tenant_code").on(table.tenantId, table.code),
    // Fase 173 (ADO-07, D-05b/D-18): la FK compuesta de `users` necesita una
    // unique compuesta del lado referenciado. `id` ya es PK (y por lo tanto
    // único), pero MySQL exige que el par completo `(tenant_id, id)` tenga su
    // propia unique key para poder ser el destino de una FK compuesta — no
    // alcanza con que una de las dos columnas ya sea única por separado.
    // Byte-for-byte con la migración 0200.
    uniqueIndex("uq_branches_tenant_id_id").on(table.tenantId, table.id),
  ],
);

export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
}));
