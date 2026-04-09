import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  boolean,
  date,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";

export const roleEnum = mysqlEnum("role", [
  "member",
  "coach",
  "admin",
  "owner",
  "gestion",
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

export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    role: roleEnum.default("member").notNull(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
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
    isActive: boolean("is_active").default(true).notNull(),
    deletedAt: timestamp("deleted_at"),
    boardingPassUsed: boolean("boarding_pass_used").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_users_branch_id").on(table.branchId),
    index("idx_users_role").on(table.role),
    index("idx_users_created_at").on(table.createdAt),
    index("idx_users_is_active").on(table.isActive),
  ],
);

export const usersRelations = relations(users, ({ one }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
}));
