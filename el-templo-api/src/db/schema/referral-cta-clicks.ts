// Module: referral-cta-clicks — evento de clic en el CTA "Compartir código" de la
// card de referidos (v5.5 follow-up, A/B copy test). Instrumentación mínima: una
// fila por tap, con la variante recomputada server-side desde el user id (par='A'
// / impar='B'), nunca tomada del cliente. Es el "top del funnel" que el copy mueve
// — el fondo (conversión) ya vive en referrals.status='qualified'.
import {
  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// mysqlEnum 1er-arg = nombre físico de la columna ("variant").
export const referralCtaClickVariantEnum = mysqlEnum("variant", ["A", "B"]);

export const referralCtaClicks = mysqlTable(
  "referral_cta_clicks",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    variant: referralCtaClickVariantEnum.notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // Índice (variant, user_id): el reporte agrupa por variante y cuenta clickers
  // únicos (COUNT DISTINCT user_id) — este orden cubre ambas operaciones.
  (table) => [
    index("idx_referral_cta_clicks_variant_user").on(
      table.variant,
      table.userId,
    ),
  ],
);

export const referralCtaClicksRelations = relations(
  referralCtaClicks,
  ({ one }) => ({
    user: one(users, {
      fields: [referralCtaClicks.userId],
      references: [users.id],
    }),
  }),
);
