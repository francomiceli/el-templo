import type { AdminRole, AdminUser } from 'src/types/admin';
import { canAccessTraining } from 'src/utils/trainingAccess';

/**
 * Templo Config — single declarative source of truth for the admin drawer.
 *
 * Direction-of-imports rule (D-06 + `.docs/saas-multitenancy/04-mecanismo-modulos.md`):
 * this config imports FROM `types/admin.ts` and `utils/trainingAccess.ts`; NOTHING
 * in the core imports this config. It is the tenant/plantilla layer; the core stays
 * free of Templo-isms.
 *
 * The nav only HIDES items — it is NOT security (D-04). The real gate is the API
 * (Plan 01 + existing router/route guards). A hidden item still returns 403 by API.
 */

/**
 * Central gate for the Templo-specific feature surface (Entrenamiento, Campañas,
 * Profes, landing). When multi-tenancy lands this becomes per-tenant config
 * (D-06 + `.docs/saas-multitenancy/04-mecanismo-modulos.md`): a fresh white-label
 * tenant gets `false`, El Templo keeps `true`. Kept as a single constant so the
 * whole Templo layer flips with one edit.
 */
export const TEMPLO_ENABLED = true;

// ---------------------------------------------------------------------------
// Role sets — mirror the backend permission sets in
// `el-templo-api/src/modules/shared/permissions.ts` (D-01/D-02/D-03/D-15).
// "Dueño" = admin + owner; "Empleado" = coach + gestion + recepcion.
// ---------------------------------------------------------------------------

/**
 * Dueño core (admin + owner). Mirrors ADMIN_ROLES / PROGRAMAS_ROLES of the API.
 * Exported so Plan 04 reuses it in the `meta.allowedRoles` of `/programas`
 * (avoids hardcoding roles inline) and here for Caja/Analíticas/Programas.
 */
export const DUENO_ROLES: AdminRole[] = ['admin', 'owner'];

/** All staff (non-member). Mirrors ALL_STAFF_ROLES of the API. */
export const ALL_STAFF_ROLES: AdminRole[] = ['coach', 'gestion', 'recepcion', 'admin', 'owner'];

/**
 * Pagos (PoS): all staff, recepcion INCLUDED. Mirrors FINANCE_LOAD_ROLES
 * (= FINANCE_WRITE_ROLES + coach) of the API.
 */
export const PAGOS_ROLES: AdminRole[] = ['coach', 'gestion', 'recepcion', 'admin', 'owner'];

/**
 * Deudas: Dueño + Templo override (coach + gestion). Mirrors COACH_DEBTS_ROLES
 * of the API (coach so profes can look up what to collect at the door).
 */
export const DEUDAS_ROLES: AdminRole[] = ['coach', 'gestion', 'admin', 'owner'];

/**
 * Reportes: Dueño + Templo override (gestion). Mirrors CAJA_ROLES of the API.
 */
export const REPORTES_ROLES: AdminRole[] = ['gestion', 'admin', 'owner'];

/**
 * Planes (read-only for the employee surface): all staff. Mirrors PLANES_READ_ROLES
 * (= SUBSCRIPTION_ROLES) of the API. Edition is hidden in PlanesPage (Plan 04).
 */
export const PLANES_READ_ROLES: AdminRole[] = ['coach', 'gestion', 'recepcion', 'admin', 'owner'];

/**
 * Caja (saldos/arqueo): Dueño-only. Gestión excluded for now (rollout). Mirrors
 * the /caja route allowedRoles (ADMIN_ROLES).
 */
export const CAJA_SALDOS_ROLES: AdminRole[] = ['admin', 'owner'];

/** Analíticas: Dueño-only. Mirrors the /analiticas route allowedRoles (ADMIN_ROLES). */
export const ANALITICAS_ROLES: AdminRole[] = ['admin', 'owner'];

// ---------------------------------------------------------------------------
// Nav model
// ---------------------------------------------------------------------------

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Roles that see this item. Omitted for `trainingOnly` items (gated by canAccessTraining). */
  roles?: AdminRole[];
  /** Entrenamiento surface: visibility from canAccessTraining (owner or Fran), not roles (D-08). */
  trainingOnly?: boolean;
  /** Belongs to the Templo layer — additionally gated by TEMPLO_ENABLED. */
  templo?: boolean;
  /** Badge slot; 'pending' renders adminStore.pendingCount on Sesiones. */
  badge?: 'pending';
}

export interface NavCategory {
  header: string;
  items: NavItem[];
  /** Category belongs to the Templo layer — gated by TEMPLO_ENABLED. */
  templo?: boolean;
}

/**
 * The 6 MVP categories (D-07/D-08/D-12): Finanzas / Alumnos / Horarios / Planes
 * + Configuración + Templo. Paths mirror the current router routes; the retired
 * Caja-config item is intentionally absent (D-13).
 */
export const NAV_MODEL: NavCategory[] = [
  {
    header: 'Finanzas',
    items: [
      { path: '/pagos', label: 'Pagos', icon: 'point_of_sale', roles: PAGOS_ROLES },
      { path: '/deudas', label: 'Deudas', icon: 'request_quote', roles: DEUDAS_ROLES },
      { path: '/reportes', label: 'Reportes', icon: 'summarize', roles: REPORTES_ROLES },
      { path: '/caja', label: 'Caja', icon: 'point_of_sale', roles: CAJA_SALDOS_ROLES },
      { path: '/analiticas', label: 'Analíticas', icon: 'analytics', roles: ANALITICAS_ROLES },
    ],
  },
  {
    header: 'Alumnos',
    items: [{ path: '/alumnos', label: 'Alumnos', icon: 'people', roles: ALL_STAFF_ROLES }],
  },
  {
    header: 'Horarios',
    items: [
      { path: '/horarios', label: 'Horarios', icon: 'calendar_month', roles: ALL_STAFF_ROLES },
    ],
  },
  {
    header: 'Planes',
    items: [
      { path: '/planes', label: 'Planes', icon: 'card_membership', roles: PLANES_READ_ROLES },
      // Programas: Dueño-only (D-15). Router guard (Plan 04) and API (Plan 01) also close it.
      { path: '/programas', label: 'Programas', icon: 'school', roles: DUENO_ROLES },
    ],
  },
  {
    header: 'Configuración',
    items: [
      { path: '/usuarios', label: 'Usuarios', icon: 'manage_accounts', roles: ['owner'] },
      {
        path: '/notificaciones',
        label: 'Notificaciones',
        icon: 'notifications',
        roles: DUENO_ROLES,
      },
    ],
  },
  {
    header: 'Templo',
    templo: true,
    items: [
      {
        path: '/sessions',
        label: 'Sesiones',
        icon: 'fitness_center',
        trainingOnly: true,
        badge: 'pending',
      },
      { path: '/generate', label: 'Programador', icon: 'auto_awesome', trainingOnly: true },
      { path: '/exercises', label: 'Ejercicios', icon: 'sports_gymnastics', trainingOnly: true },
      { path: '/tree-map', label: 'Árbol', icon: 'hub', trainingOnly: true },
      { path: '/campanias', label: 'Campañas', icon: 'campaign', roles: DUENO_ROLES },
      { path: '/puntuaciones', label: 'Profes', icon: 'groups', roles: ['owner'] },
      { path: '/blog', label: 'Blog', icon: 'article', roles: ['owner'] },
      { path: '/gladius', label: 'Gladius', icon: 'fitness_center', roles: ['owner'] },
      { path: '/academy', label: 'Academy', icon: 'school', roles: ['owner'] },
      {
        path: '/app-waitlist',
        label: 'App Waitlist',
        icon: 'notifications_active',
        roles: ['owner'],
      },
      { path: '/labs-inquiries', label: 'Labs Inquiries', icon: 'business', roles: ['owner'] },
      { path: '/franquicias', label: 'Franquicias', icon: 'store', roles: ['owner'] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Visibility helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Whether a nav item is visible for the given user. `trainingOnly` items defer
 * to canAccessTraining (owner or Fran); everything else checks `roles`. Templo
 * items additionally require TEMPLO_ENABLED. The `templo` category flag is
 * threaded in via `isNavCategoryVisible`, so item-level Templo gating is only
 * needed for items whose parent category carries `templo`.
 */
export function isNavItemVisible(item: NavItem, user: AdminUser | null): boolean {
  if (item.templo && !TEMPLO_ENABLED) return false;
  if (item.trainingOnly) {
    return canAccessTraining(user);
  }
  if (!user || !item.roles) return false;
  return item.roles.includes(user.role);
}

/**
 * Whether a category header should render. Templo categories require TEMPLO_ENABLED.
 * A header shows only if ≥1 of its items is visible for the user (Pitfall 4: no
 * empty headers — the empleado sees "Finanzas" only because Pagos is visible).
 */
export function isNavCategoryVisible(cat: NavCategory, user: AdminUser | null): boolean {
  if (cat.templo && !TEMPLO_ENABLED) return false;
  return cat.items.some((item) => isNavItemVisible(item, user));
}
