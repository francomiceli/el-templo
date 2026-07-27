// Module: user_sepa_details — domiciliación bancaria (SEPA) para socios de
// sedes de España. Tabla 1:1 con users (mismo patrón que member_profiles):
// estos 7 campos solo aplican a sucursales ES, por eso no viven en users.
// El "deudor" (titular de la cuenta) puede no ser el socio (p. ej. madre/padre),
// por eso debtor_name/nif son independientes de users.first_name/dni.
import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

export const userSepaDetails = mysqlTable("user_sepa_details", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  userId: int("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  // Titular de la cuenta bancaria que el banco debita.
  debtorName: varchar("debtor_name", { length: 150 }),
  address: varchar("address", { length: 255 }),
  postalCode: varchar("postal_code", { length: 10 }),
  city: varchar("city", { length: 100 }),
  // ISO-3166 alfa-2 del domicilio del deudor. Default ES — cuentas SEPA de
  // otros países son válidas para domiciliar, por eso es editable.
  country: varchar("country", { length: 2 }).default("ES").notNull(),
  // NIF/CIF del deudor (equivalente español del DNI/CUIT). Sin validación de
  // dígito de control: puede ser NIF, CIF o NIE y el banco lo valida igual.
  nif: varchar("nif", { length: 20 }),
  // Normalizado server-side (sin espacios, mayúsculas) y validado mod-97 en
  // MemberService.updateMember antes de persistir.
  iban: varchar("iban", { length: 34 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const userSepaDetailsRelations = relations(
  userSepaDetails,
  ({ one }) => ({
    user: one(users, {
      fields: [userSepaDetails.userId],
      references: [users.id],
    }),
  }),
);
