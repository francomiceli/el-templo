import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  boolean,
  date,
  index,
  text,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";

export const roleEnum = mysqlEnum("role", [
  "member",
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
]);
export const levelEnum = mysqlEnum("level", [
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
export const userStatusEnum = mysqlEnum("status", [
  "freemium",
  "prueba",
  "activo",
  "inactivo",
]);
// Phase 114 (D-15): lead lifecycle status for users with status='prueba'.
// NULL for staff/freemium/activo/inactivo. Set to 'en_seguimiento' on
// POST /admin/members/trial (Plan 02). Overridden to 'cerrado' by the
// subscription create hook (Plan 03). Editable by admin via PATCH
// /api/admin/leads/:userId (Plan 04).
export const leadStatusEnum = mysqlEnum("lead_status", [
  "en_seguimiento",
  "cerrado",
  "perdido",
]);

export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    email: varchar("email", { length: 255 }).unique(),
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
    // Phase 110: Country of management for staff with country-wide scope (admin/gestion).
    // NULL for owner (global access by role), member, coach, recepción.
    // Authoritative source for `attachCountryScope` for admin/gestion (replaces
    // JOIN to branches.country). REQ-1 / D-12.
    country: varchar("country", { length: 2 }),
    level: levelEnum.default("alfa").notNull(),
    phone: varchar("phone", { length: 30 }),
    dni: varchar("dni", { length: 20 }).unique(),
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
    // 'en_seguimiento' on POST /admin/members/trial. Overridden to 'cerrado'
    // by the subscription create hook when a lead converts (Plan 03).
    // Admin-editable via PATCH /api/admin/leads/:userId (Plan 04). No DB
    // default — explicit setter at insert time only (D-15, D-20).
    leadStatus: leadStatusEnum,
    // Phase 114 (D-16): free-text comments on the lead. Editable by admin.
    // Prefilled with the plan name on first conversion if NULL/empty (D-11).
    leadNotes: text("lead_notes"),
    // Phase 114 (D-17): admin (users.id) who created the lead via POST
    // /admin/members/trial. NULL for self-registered freemium, staff, and
    // historical trials (no backfill — D-20). ON DELETE SET NULL guards
    // against admin deletion (in practice we soft-delete, but the FK must
    // hold). Self-referencing FK: typed via AnyMySqlColumn callback to
    // avoid circular-init TypeScript error.
    createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
      onDelete: "set null",
    }),
    // Phase 104 R5: pointer to the program_enrollment the member is currently
    // viewing. NULL means "Templo view" (only valid if user has presencial
    // plan). Set/cleared by PUT /api/members/me/current-program (Plan 04).
    currentProgramEnrollmentId: int("current_program_enrollment_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
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
  ],
);

export const usersRelations = relations(users, ({ one }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
}));
