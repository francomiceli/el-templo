import { mysqlTable, int, varchar, index } from "drizzle-orm/mysql-core";

export const formats = mysqlTable(
  "formats",
  {
    id: int("id").primaryKey().autoincrement(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    type: varchar("type", { length: 50 }),
    description: varchar("description", { length: 255 }),
  },
  (table) => [index("formats_name_idx").on(table.name)],
);
