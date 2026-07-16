// Module: improvement-proposals
//
// Canal de "propuestas de mejora" por sucursal (brief Nacho 2026-07-15):
// append-only log de texto libre enviado por el socio desde la app. Sin
// categorías ni score por decisión deliberada del brief — el análisis de
// temas se hace después sobre el export (keyword search + IA).
//
// `branchId` se resuelve server-side desde users.branch_id al momento del
// submit (el socio nunca la elige) y se DENORMALIZA acá a propósito: si el
// socio se muda de sede después, la propuesta sigue atribuida a la sede
// donde la escribió. Anti-spam (3 por ventana de 24h) se garantiza en el
// service, no a nivel DB — mismo criterio que coach_ratings.
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";

export const improvementProposals = mysqlTable(
  "improvement_proposals",
  {
    id: int("id").primaryKey().autoincrement(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    proposal: varchar("proposal", { length: 1000 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Listado admin: filtro por sucursal + rango de fechas.
    index("idx_improvement_proposals_branch_created").on(
      table.branchId,
      table.createdAt,
    ),
    // Guard anti-spam: count de envíos recientes por socio.
    index("idx_improvement_proposals_member_created").on(
      table.memberId,
      table.createdAt,
    ),
  ],
);

export const improvementProposalsRelations = relations(
  improvementProposals,
  ({ one }) => ({
    member: one(users, {
      fields: [improvementProposals.memberId],
      references: [users.id],
    }),
    branch: one(branches, {
      fields: [improvementProposals.branchId],
      references: [branches.id],
    }),
  }),
);
