import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  boolean,
  date,
  index,
  uniqueIndex,
  foreignKey,
  text,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";
import { tenants } from "./tenants";
import { subscriptionPlans } from "./subscription-plans";

export const roleEnum = mysqlEnum("role", [
  "member",
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
]);
// Phase 129 (KAIROS-01, D-01): `kairos` is the new entry-level tier, added FIRST.
// Order: kairos -> alfa -> delta -> sigma -> omega -> spartan. The column DEFAULT
// stays "alfa" this phase (the default change to kairos is phase 130). The enum
// value list/order here MUST stay byte-identical to migration 0140's ALTER to
// avoid enum drift (lesson 125/126). First arg "level" is the column name — unchanged.
export const levelEnum = mysqlEnum("level", [
  "kairos",
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
]);
export const genderEnum = mysqlEnum("gender", [
  "male",
  "female",
  "other",
  "unspecified",
]);
export const documentTypeEnum = mysqlEnum("document_type", [
  "DNI",
  "Pasaporte",
  "NIE",
  "NIF",
  "Otro",
]);
// Phase 103: User lifecycle status. Nullable at DB level — staff rows stay NULL,
// member-creating endpoints set the value explicitly per their intent
// (POST /register → 'freemium', POST /api/admin/members → 'prueba',
// POST /api/admin/trials → 'prueba'). Subscription create/cancel transitions
// recompute the value via SubscriptionService.recomputeUserStatus.
// Phase 117 (D-10): exported value list so user-status-history.ts can declare
// from_status / to_status columns sharing the exact same enum values without
// reusing the column-bound userStatusEnum (which hardcodes the column name
// "status").
// Integración Wellhub (2026-07, migración 0186): 'wellhub' identifica al
// visitante que entra por la plataforma Wellhub/Gympass. NO participa del
// pipeline de leads (lead_status queda NULL) ni de recomputeUserStatus (no
// tiene suscripciones). Append-last y byte-idéntico al ALTER de la 0186 en
// users.status, user_status_history.from_status y .to_status (los tres
// comparten esta lista) para evitar enum drift (lesson 125/126).
export const USER_STATUS_VALUES = [
  "freemium",
  "prueba",
  "activo",
  "inactivo",
  "wellhub",
] as const;
export const userStatusEnum = mysqlEnum("status", USER_STATUS_VALUES);
// Phase 114 (D-15): lead lifecycle status for users with status='prueba'.
// NULL for staff/freemium/activo/inactivo. Set to 'en_seguimiento' on
// POST /admin/members/trial (Plan 02). Overridden to 'ganado' by the
// subscription create hook (Plan 03). Editable by admin via PATCH
// /api/admin/leads/:userId (Plan 04).
// Hotfix 2026-07: 'cerrado' renamed to 'ganado' (migration 0170) — the old
// value conflated "compró" with "cerrado sin compra". Invariant enforced in
// MemberService.updateLead: lead_status='ganado' ⇔ purchased_plan_id IS NOT NULL.
export const leadStatusEnum = mysqlEnum("lead_status", [
  "en_seguimiento",
  "ganado",
  "perdido",
]);
// Phase 163 (D-07): audit del origen del lead_status. 'auto' = puesto por el
// automatismo (hook de compra recomputeUserStatus, cron de vencimiento
// expire-lost-leads, reset al re-agendar, alta de lead); 'manual' = puesto a
// mano por gestión vía PATCH /api/admin/leads/:userId. NULL = histórico/
// desconocido, tratado como 'auto' por el cron (que NUNCA pisa un 'manual').
// First arg "lead_status_source" es el nombre físico de la columna — la lista
// de valores DEBE quedar byte-idéntica al ALTER del migration 0182 para evitar
// enum drift (lesson 125/126). Sin índice nuevo (D-05): idx_users_lead_status
// ya existe y el cron filtra por lead_status primero.
export const leadStatusSourceEnum = mysqlEnum("lead_status_source", [
  "auto",
  "manual",
]);

export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 166 (FUND-02): ancla de tenancy. `users` es una de las dos anclas del
    // modelo (la otra es `branches`): el resto de las tablas gym-owned cuelga de
    // acá en la fase 167.
    // - El valor SALE SIEMPRE DEL SERVIDOR (`scope.tenantId`, resuelto por
    //   attachScope leyendo esta misma columna). JAMÁS de un payload, de una
    //   query string ni del JWT — el tenant no viaja por el borde (D-02/D-03).
    // - Lleva DEFAULT 1 a propósito, no por comodidad: durante el rolling deploy
    //   convive código viejo que no manda `tenant_id`, y `test/setup.ts` inserta
    //   users/branches con `INSERT IGNORE` sin la columna (PATTERNS §0.3) — sin
    //   DEFAULT esas filas no se insertarían y la suite se cae en cascada. El
    //   DEFAULT se re-evalúa cuando exista un tenant 2, fuera de v6.0.
    // - El orden en este archivo es de LECTURA y no refleja el orden físico: el
    //   ALTER de la migración 0191 agrega la columna al final de la tabla.
    tenantId: int("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenants.id),
    // Fase 168 (CON-01): el email dejó de ser único global — la unique vive en el
    // callback de tabla como uq_users_tenant_email (tenant_id, email).
    email: varchar("email", { length: 255 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    role: roleEnum.default("member").notNull(),
    // Phase 110: branch_id is the user's "sede personal de entrenamiento" — the
    // branch they train at as a member. This is distinct from the operational
    // scope tables (`country` for admin/gestion country-wide scope; `user_branches`
    // for coach/recepción multi-branch operational reach). Stays NOT NULL for ALL
    // roles (REQ-4). Members + staff who also train use this column.
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    // Recategorización multisucursal (2026-07, migración 0185): tracking de la
    // última vez que cambió branch_id y quién lo hizo. El cron mensual reasigna
    // la sede de un miembro multisucursal a la que más asistió, pero NO pisa una
    // reasignación 'manual' reciente (ventana de 45 días). 'auto' = el propio
    // cron. NULL/NULL en filas previas a la 0185 (no protegidas hasta su próximo
    // cambio). Se escriben SIEMPRE juntos con branchId — ver setMemberBranch().
    branchUpdatedAt: timestamp("branch_updated_at"),
    branchSource: mysqlEnum("branch_source", ["manual", "auto"]),
    // Phase 110: Country of management for staff with country-wide scope (admin/gestion).
    // NULL for owner (global access by role), member, coach, recepción.
    // Authoritative source for `attachCountryScope` for admin/gestion (replaces
    // JOIN to branches.country). REQ-1 / D-12.
    country: varchar("country", { length: 2 }),
    // Phase 130 (KAIROS-04, D-01): new members are born kairos. The DEFAULT
    // flip is additive — migration 0141 changes only the column DEFAULT, not
    // existing rows (D-05). Enum value list/order lives in levelEnum above and
    // must stay byte-identical to migration 0141's ALTER.
    level: levelEnum.default("kairos").notNull(),
    // Phase 130 (KAIROS-06, D-03): sticky coach override. Set true when a coach
    // manually changes a member's level via PUT /api/admin/members/:userId.
    // Auto-graduation (Plan 02) SKIPS members with level_override=true so a
    // manual coach decision is never reverted by the automatic kairos→alfa
    // promotion. Defaults false; existing rows backfill to 0 in migration 0141.
    levelOverride: boolean("level_override").notNull().default(false),
    phone: varchar("phone", { length: 30 }),
    // Fase 168 (CON-01): el DNI dejó de ser único global — la unique vive en el
    // callback de tabla como uq_users_tenant_dni (tenant_id, dni).
    dni: varchar("dni", { length: 20 }),
    documentType: documentTypeEnum,
    address: varchar("address", { length: 500 }),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    gender: genderEnum,
    emergencyContactName: varchar("emergency_contact_name", { length: 150 }),
    emergencyContactPhone: varchar("emergency_contact_phone", { length: 30 }),
    emergencyContactRelationship: varchar("emergency_contact_relationship", {
      length: 50,
    }),
    photoUrl: varchar("photo_url", { length: 500 }),
    // Phase 103: status is nullable; DB DEFAULT NULL. Member-creating endpoints
    // set the value explicitly per intent. Staff inserts omit the field (stays NULL).
    status: userStatusEnum,
    // Phase 103: staff disable flag (semantically only applies to non-member roles).
    staffDisabled: boolean("staff_disabled").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    boardingPassUsed: boolean("boarding_pass_used").default(false).notNull(),
    // Phase 102-07: trial→alumno conversion timestamp. Set once, on first
    // subscription creation if the user has any is_trial=1 booking.
    convertedAt: timestamp("converted_at"),
    // Phase 114 (D-15): lead lifecycle status; NULL for non-leads. Set to
    // 'en_seguimiento' on POST /admin/members/trial. Overridden to 'ganado'
    // by the subscription create hook when a lead converts (Plan 03).
    // Admin-editable via PATCH /api/admin/leads/:userId (Plan 04). No DB
    // default — explicit setter at insert time only (D-15, D-20).
    leadStatus: leadStatusEnum,
    // Phase 163 (D-07): origen del lead_status (auto|manual). NULL = histórico/
    // desconocido, tratado como 'auto' por el cron. Ver leadStatusSourceEnum.
    leadStatusSource: leadStatusSourceEnum,
    // Phase 114 (D-16): free-text comments on the lead. Editable by admin.
    // Hotfix 2026-07 (migration 0170): notes are free-text ONLY — the plan
    // the lead bought lives in purchasedPlanId, never here. The old
    // "prefill plan name on conversion" behavior moved to purchasedPlanId.
    leadNotes: text("lead_notes"),
    // Hotfix 2026-07 (migration 0170): plan the lead bought when they
    // converted ("Plan comprado" in the trial sessions report). Set by the
    // conversion hook (recomputeUserStatus) from the first subscription, or
    // manually via PATCH /api/admin/leads/:userId. NULL until the lead buys.
    // ON DELETE SET NULL — plans are soft-archived in practice, but the FK
    // must hold if one is ever hard-deleted.
    purchasedPlanId: int("purchased_plan_id").references(
      () => subscriptionPlans.id,
      { onDelete: "set null" },
    ),
    // Phase 114 (D-17): admin (users.id) who created the lead via POST
    // /admin/members/trial. NULL for self-registered freemium, staff, and
    // historical trials (no backfill — D-20). ON DELETE SET NULL guards
    // against admin deletion (in practice we soft-delete, but the FK must
    // hold). Self-referencing FK: typed via AnyMySqlColumn callback to
    // avoid circular-init TypeScript error.
    createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
      onDelete: "set null",
    }),
    // Phase 157 (REF-01): código de referido compartible tipo FRAN-A3B2 (D-16),
    // único por socio. Nullable: se genera eager para socios nuevos (D-25) y por
    // backfill idempotente para los ~2000 existentes (no en la migración).
    // Fase 168 (CON-01): dejó de ser único global — la unique vive en el callback
    // de tabla como uq_users_tenant_referral_code (tenant_id, referral_code).
    referralCode: varchar("referral_code", { length: 16 }),
    // Phase 157 (REF-01/D-08): quién lo refirió (self-FK a users). Lo escriben
    // ambos canales de atribución. Clona el patrón de createdBy (AnyMySqlColumn +
    // ON DELETE SET NULL). El vínculo canónico vive en la tabla referrals; esto
    // es el puntero denormalizado en users.
    referredBy: int("referred_by").references((): AnyMySqlColumn => users.id, {
      onDelete: "set null",
    }),
    // Integración Wellhub (2026-07, migración 0186): gympass_id de 13 dígitos
    // que identifica al usuario en Wellhub (llega como `unique_token` en los
    // webhooks). Único y nullable — solo lo tienen los visitantes Wellhub (o
    // un socio existente al que se le vincula la visita por match de email).
    // Se auto-crea el usuario en el primer webhook con status='wellhub'.
    // tenant-global (M8) a proposito: id de plataforma externa — la unique global es lo que impide que dos tenants reclamen el mismo usuario de Wellhub, que ya viene unico del lado de la plataforma. NO es un olvido de la fase 168: el motivo esta registrado en TENANT_GLOBAL_UNIQUES de src/db/tenant-tables.ts (lista M8, aprobada 2026-07-26, doc 06 §8-Q4).
    gympassId: varchar("gympass_id", { length: 16 }).unique(),
    // Phase 104 R5: pointer to the program_enrollment the member is currently
    // viewing. NULL means "Templo view" (only valid if user has presencial
    // plan). Set/cleared by PUT /api/members/me/current-program (Plan 04).
    currentProgramEnrollmentId: int("current_program_enrollment_id"),
    // Phase 115 (R1, D-15): bar challenge attempt fields. NULL en las 3 = no
    // participó. Single-attempt enforced via UPDATE condicional en POST
    // /api/bar-challenge/result (WHERE bar_challenge_attempted_at IS NULL).
    // Exposed siempre por GET /me (D-15), independientemente de la ventana del
    // evento — el frontend lee userStore.profile para decidir el estado del card.
    barChallengeCompleted: boolean("bar_challenge_completed"),
    barChallengeSeconds: int("bar_challenge_seconds"),
    barChallengeAttemptedAt: timestamp("bar_challenge_attempted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // Fase 166 (FUND-02): toda query gym-owned filtra por tenant_id.
    index("idx_users_tenant_id").on(table.tenantId),
    index("idx_users_branch_id").on(table.branchId),
    index("idx_users_role").on(table.role),
    index("idx_users_created_at").on(table.createdAt),
    // Phase 103: idx_users_is_active replaced by idx_users_status; the legacy
    // is_active column is dropped in migration 0100.
    index("idx_users_status").on(table.status),
    index("idx_users_converted_at").on(table.convertedAt),
    // Phase 114 (D-18): filter performance for the trial sessions report.
    index("idx_users_lead_status").on(table.leadStatus),
    index("idx_users_created_by").on(table.createdBy),
    // Phase 157 (REF-01): lookup de referidos por referidor.
    index("idx_users_referred_by").on(table.referredBy),
    // Fase 168 (CON-01): unicidad POR TENANT. El email, el DNI y el código de
    // referido son de cada gimnasio, no del mundo: dos tenants pueden tener el
    // mismo valor sin pisarse. Índices byte-for-byte con la migración 0196.
    uniqueIndex("uq_users_tenant_email").on(table.tenantId, table.email),
    uniqueIndex("uq_users_tenant_dni").on(table.tenantId, table.dni),
    uniqueIndex("uq_users_tenant_referral_code").on(
      table.tenantId,
      table.referralCode,
    ),
    // Fase 168 (D-05): al anteponer tenant_id, la unique deja de servir para
    // buscar SOLO por el valor. Estos tres índices no-unique reponen los lookups
    // por el valor pelado: login (src/modules/auth/routes.ts), registro por DNI
    // (src/modules/auth/routes.ts) y resolveReferralCode
    // (src/modules/referrals/service.ts). Byte-for-byte con la migración 0196.
    index("idx_users_email").on(table.email),
    index("idx_users_dni").on(table.dni),
    index("idx_users_referral_code").on(table.referralCode),
    // Fase 173 (ADO-07, D-05b/D-18): índice compuesto que respalda la FK de
    // abajo — sin él, MySQL igual crea uno automático para la FK, pero lo
    // declaramos explícito para que el schema Drizzle documente la intención
    // y el índice tenga el nombre que el resto del repo espera.
    index("idx_users_tenant_id_branch_id").on(table.tenantId, table.branchId),
    // Fase 173 (ADO-07, D-05b/D-18): la mina M10 — el par de anclas
    // (`users.tenant_id`, `users.branch_id`) podía divergir de la sede si
    // algún camino escribía `branch_id` sin validar el gimnasio (SQL crudo,
    // script, backfill). Esta FK compuesta hace que la base rechace esa fila,
    // sin depender de que la app se acuerde de filtrar.
    // - Semántica MATCH SIMPLE (el default de MySQL, no configurable): una
    //   FK compuesta pasa si CUALQUIERA de las columnas referenciantes es
    //   NULL. Hoy es inalcanzable en la práctica porque `branch_id` es
    //   NOT NULL para TODOS los roles (REQ-4, ver comentario arriba) — nunca
    //   existe una fila de `users` con `branch_id IS NULL` para ejercer esa
    //   rama. Se documenta igual porque es el comportamiento que ESTA FK
    //   tendría si esa invariante cambiara, y porque `ON DELETE`/`ON UPDATE`
    //   están declarados pensando en ese contrato, no en el actual.
    // - `ON DELETE RESTRICT` / `ON UPDATE RESTRICT`: el default seguro. Un
    //   `CASCADE` sobre `tenant_id` borraría en cascada TODOS los usuarios de
    //   un gimnasio si alguna vez se borra su fila de `tenants` — un blast
    //   radius que ningún flujo de este sistema necesita ni espera.
    foreignKey({
      name: "fk_users_tenant_branch",
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
  ],
);

export const usersRelations = relations(users, ({ one }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
}));
