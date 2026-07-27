import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const blogTags = mysqlTable("blog_tags", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blogPostTags = mysqlTable(
  "blog_post_tags",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    // Mina M9: las dos columnas de abajo apuntan a blog_posts y blog_tags SIN constraint de FK real, asi que la DB no puede garantizar que las tres filas compartan tenant — esa arista la verifica src/db/scripts/verify-tenant-backfill.ts con joins manuales (plan 167-06).
    postId: int("post_id").notNull(),
    tagId: int("tag_id").notNull(),
  },
  (table) => [
    uniqueIndex("post_tag_unique").on(table.postId, table.tagId),
    index("idx_post_tags_post_id").on(table.postId),
    index("idx_post_tags_tag_id").on(table.tagId),
  ],
);
