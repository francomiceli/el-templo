import { mysqlTable, int, timestamp, check } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { tenantIdColumn } from './tenant-column';

// Mina M1 (doc 05 §6): el CHECK de fila unica de mas abajo fuerza UNA fila para
// TODO el sistema, o sea que `current_week` es global y no por gimnasio. Queda
// INTACTO en v6.0 porque hoy solo el tenant 1 corre SPOM. El dia que un tenant
// distinto de 1 lo use, esto migra a un unique por `tenant_id` — el mismo
// movimiento que ya hizo `tv_class_state` con `branch_id`.
export const spomConfig = mysqlTable('spom_config', {
  id: int('id').primaryKey().default(1),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  currentWeek: int('current_week').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (table) => [
  check('spom_config_single_row', sql`${table.id} = 1`),
]);
