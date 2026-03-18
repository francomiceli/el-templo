# Phase 66: Roles & Permissions - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Branch staff see only the features their role allows. Four predefined roles (owner, admin, coach, recepcionista) with page-level permission enforcement. Owner can manage staff users and assign roles. No per-action restrictions — if a role can see a page, they can do everything on it.

Requirements: ROLES-01, ROLES-02, ROLES-03, ROLES-04

</domain>

<decisions>
## Implementation Decisions

### Role Definitions & Naming

- **Rename `superadmin` to `owner`** in DB enum via migration. All existing superadmin users become owner.
- **Add `recepcionista` to DB enum** via migration. Currently only in frontend type, not in MySQL enum.
- **Final DB role enum:** `member`, `coach`, `admin`, `owner`, `recepcionista`
- **Frontend AdminRole type:** `'recepcionista' | 'coach' | 'admin' | 'owner'`
- **Hierarchy:** owner > admin > coach = recepcionista (coach and recepcionista are parallel, not ranked)

### Permission Matrix (Page-Level Only)

- **Page-level permissions only** — no per-button or per-action restrictions. If a role can see the page, they can do everything on it.
- **Redirect on denied** — forbidden URL silently redirects to the role's default landing page (no 403 page).

| Page           | owner | admin | coach | recepcionista |
| -------------- | ----- | ----- | ----- | ------------- |
| Sesiones       | ✓     | ✓     | ✓     | ✗             |
| Generar        | ✓     | ✓     | ✓     | ✗             |
| Ejercicios     | ✓     | ✓     | ✓     | ✗             |
| Alumnos        | ✓     | ✓     | ✓     | ✓             |
| Horarios       | ✓     | ✓     | ✓     | ✗             |
| Asistencia     | ✓     | ✓     | ✓     | ✓             |
| Planes         | ✓     | ✓     | ✗     | ✗             |
| Caja           | ✓     | ✓     | ✗     | ✓             |
| Analiticas     | ✓     | ✓     | ✗     | ✗             |
| Reportes       | ✓     | ✓     | ✗     | ✓             |
| Configuracion  | ✓     | ✓     | ✗     | ✗             |
| Blog           | ✓     | ✗     | ✗     | ✗             |
| Gladius        | ✓     | ✗     | ✗     | ✗             |
| Academy        | ✓     | ✗     | ✗     | ✗             |
| App Waitlist   | ✓     | ✗     | ✗     | ✗             |
| Labs Inquiries | ✓     | ✗     | ✗     | ✗             |
| Franquicias    | ✓     | ✗     | ✗     | ✗             |
| Usuarios       | ✓     | ✗     | ✗     | ✗             |

- **Default landing pages (redirect target for denied routes):**
  - owner → /sesiones
  - admin → /sesiones
  - coach → /sesiones
  - recepcionista → /alumnos

### Role Assignment Rules

- **Only owner can assign roles** — no one else can change roles, not even admin.
- Owner can assign any role: owner, admin, coach, recepcionista.

### User Management Interface (ROLES-03)

- **New "Usuarios" page** at route `/usuarios` — owner-only
- Sidebar item "Usuarios" with icon `people`, placed in the owner-only section alongside Franquicias
- Simple QTable listing all staff users (non-member roles)
- **Columns:** Nombre, Email, Rol, Sede, Estado (activo/inactivo), Acciones
- **Create staff user dialog** — fields: Nombre, Apellido, Email, Contraseña, Rol (dropdown), Sede (dropdown). All required.
- **Edit dialog** — same fields, password optional (only if changing it)
- **Deactivate/Activate toggle** — reuses existing `isActive` field on users table. Deactivated users can't log in (already enforced in auth). No hard delete.
- Row actions: [Editar] [Desactivar/Activar]

### Claude's Discretion

- How to structure the centralized permission registry (hardcoded map vs config file vs constants)
- Migration strategy for renaming superadmin → owner in MySQL enum
- Migration strategy for adding recepcionista to MySQL enum
- How to update all scattered ADMIN_ROLES arrays across API modules to use the centralized permission config
- API endpoint structure for user management CRUD
- Create user dialog layout and validation
- Whether to add a filter/search to the Usuarios page
- How to handle the existing `isSuperadminRole`, `isAdminRole`, `isCajaRole` computed properties in AdminLayout (refactor to use permission registry or keep as convenience helpers)
- API route guard refactoring (centralize the role check pattern)
- Test strategy for permission enforcement

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Phase context

- `.planning/REQUIREMENTS.md` — ROLES-01, ROLES-02, ROLES-03, ROLES-04 requirements (v4.1 scope)
- `.planning/phases/63-cash-box/63-CONTEXT.md` — Recepcionista role addition to frontend type, Caja page access

### Key codebase files

- `el-templo-api/src/db/schema/users.ts` — Current role enum (member, coach, admin, superadmin)
- `el-templo-api/src/plugins/auth.ts` — JWT authenticate hook, token payload
- `el-templo-admin/src/types/admin.ts` — AdminRole type, AdminUser interface
- `el-templo-admin/src/stores/useAuthStore.ts` — Auth store, ADMIN_ROLES check on login
- `el-templo-admin/src/layouts/AdminLayout.vue` — Sidebar visibility (isAdminRole, isCajaRole, isSuperadminRole)
- `el-templo-admin/src/router/routes.ts` — Route meta.allowedRoles
- `el-templo-admin/src/router/index.ts` — Route guard checking allowedRoles

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-admin/src/types/admin.ts`: AdminRole type and AdminUser interface — update with new roles
- `el-templo-admin/src/layouts/AdminLayout.vue`: Existing `isAdminRole`, `isCajaRole`, `isSuperadminRole` computed helpers — refactor to use permission registry
- `el-templo-admin/src/router/index.ts`: Route guard already checks `meta.allowedRoles` — just needs consistent route meta
- `el-templo-api/src/plugins/auth.ts`: JWT authenticate hook — no changes needed, role comes from DB
- `el-templo-api/src/modules/auth/routes.ts`: Login already blocks `isActive=false` users
- `el-templo-admin/src/stores/useAuthStore.ts`: Auth store with `ADMIN_ROLES` validation on login — update list

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts (Phase 45)
- Constructor DI for services (Phase 56)
- QTable with server-side pagination and @request handler
- QDialog for create/edit forms
- API composables: loading/error refs + async methods + cleanup()
- Route meta `allowedRoles` pattern already established

### Integration Points

- `el-templo-api/src/db/schema/users.ts`: Modify role enum (rename superadmin→owner, add recepcionista)
- `el-templo-api/src/db/migrations/`: New migration for enum changes
- `el-templo-api/src/modules/*/routes.ts`: Update all ADMIN_ROLES arrays across every module to match new role names
- `el-templo-admin/src/types/admin.ts`: Update AdminRole type
- `el-templo-admin/src/layouts/AdminLayout.vue`: Refactor sidebar visibility to match permission matrix
- `el-templo-admin/src/router/routes.ts`: Update all route meta.allowedRoles to match permission matrix
- `el-templo-admin/src/stores/useAuthStore.ts`: Update ADMIN_ROLES and default redirect logic
- New: `el-templo-api/src/modules/users/` — User management CRUD module
- New: `el-templo-admin/src/pages/UsuariosPage.vue` — Staff user management page

</code_context>

<specifics>
## Specific Ideas

- Permission matrix is intentionally simple: page-level only, no per-action restrictions. This avoids complexity while still providing meaningful access control for branch staff.
- Owner replaces superadmin — this is the franchise owner who manages everything including staff and franchise operations.
- Coach and recepcionista are parallel roles with different page access, not a hierarchy — a coach is not "above" a recepcionista.
- Deactivation over deletion — never delete staff users, just toggle isActive to preserve audit trail.

</specifics>

<deferred>
## Deferred Ideas

- **Per-action permissions** — Restricting specific buttons/actions within a page (e.g., coach can view members but not create). Not needed now — page-level is sufficient.
- **Custom permission sets** — Admin-configurable permissions per role (REQUIREMENTS.md explicitly lists this as out of scope).
- **Branch-scoped access** — Coach only sees members from their branch. Currently all staff see all branches. Future enhancement.
- **Permission audit logging** — Tracking who accessed what. Not operationally needed now.
- **Self-service password reset** — Staff resetting their own password. Owner can set it for now.

</deferred>

---

_Phase: 66-roles-permissions_
_Context gathered: 2026-03-18_
