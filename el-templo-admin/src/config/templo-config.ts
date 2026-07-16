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
 *
 * v5.4 (Reforma del Admin): la categoría monolítica "Templo" se disolvió y sus
 * entradas se redistribuyeron en Gestión / Entrenamiento / Landing; Deudas quedó
 * como herramienta coach-only del Templo (owner/admin la ven dentro de Reportes).
 */

/**
 * Central gate for the Templo-specific feature surface (Entrenamiento, Campañas,
 * Profes, landing). When multi-tenancy lands this becomes per-tenant config
 * (D-06 + `.docs/saas-multitenancy/04-mecanismo-modulos.md`): a fresh white-label
 * tenant gets `false`, El Templo keeps `true`. Kept as a single constant so the
 * whole Templo layer flips with one edit.
 */
export const TEMPLO_ENABLED = true;

/**
 * Surface gate for the Greek-level system (Alfa..Omega ranks shown in AlumnosPage
 * / AlumnoDetailPage). Like TEMPLO_ENABLED this is a per-INSTALLATION surface flag
 * (D-08) — NOT a per-user gate, so do NOT reuse canAccessTraining here. El Templo
 * keeps the Greek levels visible (`true`); a fresh white-label tenant would set
 * this to `false` to hide the level column/filter/badges. Consumed by Plan 05
 * (AlumnosPage / AlumnoDetailPage). Defaults to TEMPLO_ENABLED so the whole Templo
 * surface flips together, while staying an independent knob for future tenants.
 */
export const TEMPLO_GREEK_LEVELS = TEMPLO_ENABLED;

/**
 * Surface gate for the "Rutinas de entrenamiento" (`/programas`) nav item. Like
 * TEMPLO_GREEK_LEVELS this is a per-INSTALLATION surface flag (D-02/D-07/D-08) —
 * NOT a per-user gate, so do NOT reuse canAccessTraining here (that is the
 * owner-vs-Fran per-user knob of 149 D-15, which still applies on top via the
 * item's `roles`). El Templo keeps the routines surface visible (`true`); a fresh
 * white-label tenant would set this to `false` to hide the /programas item. The
 * nav only HIDES the item — the real gate stays the API (dueño-only by role, 149
 * D-15). Defaults to TEMPLO_ENABLED so the whole Templo surface flips together,
 * while staying an independent knob for future tenants.
 */
export const TEMPLO_TRAINING_ROUTINES = TEMPLO_ENABLED;

/**
 * Copy del precio de $0 (precio "Zero"). En El Templo se llama "Precio Zero"; en un
 * white-label SaaS el mismo mecanismo se ofrece como "Precio promocional" (revisión
 * v5.4). Deriva de TEMPLO_ENABLED para que el copy cambie con el mismo flag que el
 * resto de la superficie Templo. `SHORT` es la variante sin la palabra "Precio"
 * (labels de campos/toggles donde el contexto ya dice "precio").
 */
export const ZERO_PRICE_LABEL = TEMPLO_ENABLED ? 'Precio Zero' : 'Precio promocional';
export const ZERO_PRICE_LABEL_SHORT = TEMPLO_ENABLED ? 'Zero' : 'Promocional';

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
 * Deudas detail tabs ("Por deuda" / "Vencidos"): Dueño + gestion, coach EXCLUDED
 * (D-12). Mirrors CAJA_ROLES of the API (the reports plugin guard). The coach
 * only sees "Por socio" (the minimal projection the coach endpoint exposes);
 * the detail tabs are business management → gestion/admin/owner. This only HIDES
 * the tabs — the real gate is the API (reports/outstanding-balances returns 403
 * to coach, plan 153-01 + plugin guard). Do NOT rely on this for security (D-04).
 */
export const DEUDAS_DETAIL_ROLES: AdminRole[] = ['gestion', 'admin', 'owner'];

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
  /** Routines surface (D-02) — additionally gated by TEMPLO_TRAINING_ROUTINES (per-installation). */
  routines?: boolean;
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
 * Categorías del drawer, en orden de arriba hacia abajo (revisión v5.4):
 * Entrenamiento / Gestión / Planes / Finanzas / Configuración / Landing.
 * Los paths reflejan las rutas del router. Un header solo se muestra si ≥1 de sus
 * ítems es visible para el usuario (isNavCategoryVisible — Pitfall 4: sin headers vacíos).
 */
export const NAV_MODEL: NavCategory[] = [
  {
    // Entrenamiento (revisión v5.4): la capa de entrenamiento del Templo, arriba de todo.
    // Toda la categoría es Templo (`templo: true`) → un white-label sin Templo no la ve.
    // Sesiones/Programador/Ejercicios/Árbol son trainingOnly (canAccessTraining).
    header: 'Entrenamiento',
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
    ],
  },
  {
    // Gestión (revisión v5.4): Alumnos/Horarios universales; Profes/Campañas quedan
    // Templo-only vía `templo: true` a nivel ítem.
    header: 'Gestión',
    items: [
      { path: '/alumnos', label: 'Alumnos', icon: 'people', roles: ALL_STAFF_ROLES },
      { path: '/horarios', label: 'Horarios', icon: 'calendar_month', roles: ALL_STAFF_ROLES },
      { path: '/puntuaciones', label: 'Profes', icon: 'groups', roles: ['owner'], templo: true },
      {
        // Propuestas de mejora de los socios (espejo de MEMBER_LIFECYCLE_ROLES).
        path: '/propuestas',
        label: 'Propuestas',
        icon: 'emoji_objects',
        roles: ['gestion', 'admin', 'owner'],
        templo: true,
      },
      {
        path: '/campanias',
        label: 'Campañas',
        icon: 'campaign',
        roles: DUENO_ROLES,
        templo: true,
      },
    ],
  },
  {
    // Planes: planes de pago + Rutinas de entrenamiento (mudada acá desde Entrenamiento,
    // revisión v5.4). Rutinas sigue Dueño-only (149 D-15) AND gated como superficie de
    // rutinas (D-02) vía `routines: true` → TEMPLO_TRAINING_ROUTINES. Router/API la cierran.
    header: 'Planes',
    items: [
      { path: '/planes', label: 'Planes', icon: 'card_membership', roles: PLANES_READ_ROLES },
      { path: '/programas', label: 'Rutinas', icon: 'school', roles: DUENO_ROLES, routines: true },
    ],
  },
  {
    // Finanzas. Orden: Caja, Cobros, Reportes, Analíticas (revisión v5.4). Deudas es la
    // herramienta operativa del profe (coach-only + Templo): owner/admin/gestion ven la
    // morosidad DENTRO de Reportes; el coach NO tiene acceso a Reportes, así que ve
    // "Deudas" por fuera. El nav solo HIDE — el gate real sigue en el API/route guard (D-04).
    header: 'Finanzas',
    items: [
      { path: '/caja', label: 'Caja', icon: 'point_of_sale', roles: CAJA_SALDOS_ROLES },
      { path: '/cobros', label: 'Cobros', icon: 'payments', roles: PAGOS_ROLES },
      { path: '/deudas', label: 'Deudas', icon: 'request_quote', roles: ['coach'], templo: true },
      { path: '/reportes', label: 'Reportes', icon: 'summarize', roles: REPORTES_ROLES },
      { path: '/analiticas', label: 'Analíticas', icon: 'analytics', roles: ANALITICAS_ROLES },
    ],
  },
  {
    header: 'Configuración',
    items: [
      { path: '/usuarios', label: 'Usuarios', icon: 'manage_accounts', roles: ['owner'] },
      {
        path: '/configuracion/precios',
        label: 'Reglas de precio',
        icon: 'sell',
        roles: ['owner'],
      },
      {
        path: '/notificaciones',
        label: 'Notificaciones',
        icon: 'notifications',
        roles: DUENO_ROLES,
      },
    ],
  },
  {
    // Landing (revisión v5.4): gestión del sitio público, solo Templo (las "6 de landing").
    header: 'Landing',
    templo: true,
    items: [
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
  if (item.routines && !TEMPLO_TRAINING_ROUTINES) return false;
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
