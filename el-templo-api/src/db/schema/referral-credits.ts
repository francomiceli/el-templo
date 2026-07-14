// Module: referral_credits — registro auditable append-only del descuento por
// referido aplicado en un cobro (D-18). NO infla el saldo AURA gastable: es solo
// una anotación de trazabilidad. El descuento real reduce pricePaid en subscriptions
// (D-19/D-23). Una carga (subscriptionId) = a lo sumo una fila (idempotencia D-18).
import {
  mysqlTable,
  int,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { subscriptions } from "./subscriptions";

export const referralCredits = mysqlTable(
  "referral_credits",
  {
    id: int("id").primaryKey().autoincrement(),
    // El socio que recibió el descuento en este cobro (referidor o referido: D-02 simétrico).
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    // El cargo concreto sobre el que se aplicó el descuento.
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id)
      .notNull(),
    // % efectivamente aplicado (acumulado por vínculos activos, con tope: DESC-04).
    percent: int("percent").notNull(),
    // Monto en dinero descontado (Math.floor(basePrice * percent/100)).
    amount: int("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Idempotencia POR CARGO (D-18): una carga = una fila. Evita duplicar la
    // anotación si el cobro se reintenta. Clave = subscriptionId (NO referralId,
    // que colisionaría mes a mes).
    uniqueIndex("unique_referral_credit_sub").on(table.subscriptionId),
  ],
);

export const referralCreditsRelations = relations(
  referralCredits,
  ({ one }) => ({
    user: one(users, {
      fields: [referralCredits.userId],
      references: [users.id],
    }),
    subscription: one(subscriptions, {
      fields: [referralCredits.subscriptionId],
      references: [subscriptions.id],
    }),
  }),
);
