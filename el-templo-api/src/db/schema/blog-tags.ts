import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const blogTags = mysqlTable("blog_tags", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blogPostTags = mysqlTable(
  "blog_post_tags",
  {
    id: int("id").primaryKey().autoincrement(),
    postId: int("post_id").notNull(),
    tagId: int("tag_id").notNull(),
  },
  (table) => [
    uniqueIndex("post_tag_unique").on(table.postId, table.tagId),
    index("idx_post_tags_post_id").on(table.postId),
    index("idx_post_tags_tag_id").on(table.tagId),
  ],
);
