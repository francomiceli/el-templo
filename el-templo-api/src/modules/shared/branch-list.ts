/**
 * Lista de sedes visibles para un `scope` (2026-09-07).
 *
 * Extraído de `GET /api/admin/members/branches` para que la sección TV pueda
 * ofrecer EXACTAMENTE el mismo filtro por rol desde su propio módulo
 * (`GET /api/admin/tv/branches`) sin abrirle a la cuenta de los televisores
 * (`TV_ACCOUNT_ROLE`) todo el plugin de socios, cuyo guard es de plugin
 * entero (`MEMBER_ROLES`). Fuente única: el handler de socios y el de TV
 * llaman acá.
 *
 * Reglas (espejo de `canAccessBranch`, `branch-access.ts`):
 *   - owner: todas; con `?country=` filtra por país (D-08).
 *   - admin/gestion: las de su país (+ virtuales). `country` null → solo virtuales.
 *   - coach/recepcion: `user_branches` (+ virtuales).
 *   - inversor: `user_branches`, SIN virtuales (su alcance es su sede física —
 *     ver `enforcedBranchIds`, branch-access.ts).
 *   - tv: TODAS las del gimnasio (Regla 2b) — sin `user_branches`.
 *   - cualquier otro rol: todas (defensivo; los guards de plugin cortan antes).
 * `tenantWhere` inline: el selector de sedes es la puerta de entrada directa
 * a la divergencia de anclas que ADO-07 protege.
 */
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { assertTenant, tenantWhere } from "./tenant";
import type { CountryScope } from "./country-scope";
import { INVERSOR_ROLE, TV_ACCOUNT_ROLE } from "./permissions";

export interface BranchListItem {
  id: number;
  name: string;
  isVirtual: boolean;
  country: string;
  timezone: string;
}

export async function listBranchesForScope(
  db: MySql2Database<typeof schema>,
  scope: CountryScope,
  queryCountry: unknown,
  where: string,
): Promise<BranchListItem[]> {
  const ctx = assertTenant(scope, where);
  const allRows = await db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      country: schema.branches.country,
      isVirtual: schema.branches.isVirtual,
      timezone: schema.branches.timezone,
    })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.isActive, true),
      ),
    )
    .orderBy(schema.branches.name);

  const { isOwner, country, branchIds, role } = scope;
  let filtered = allRows;

  if (isOwner) {
    // D-08: owner con ?country= filtra; sin ?country= ve todas (reales + virtuales).
    // attachCountryScope ya refleja ?country=AR|ES en scope.country para owners,
    // pero "sin toggle = ver todas" se decide mirando el query param crudo.
    if (queryCountry === "AR" || queryCountry === "ES") {
      filtered = allRows.filter((b) => b.isVirtual || b.country === country);
    }
  } else if (role === "admin" || role === "gestion") {
    // scope.country null (fail-closed por datos corruptos) degenera a
    // solo-virtuales — consistente con canAccessBranch Regla 3.
    filtered = allRows.filter((b) => b.isVirtual || b.country === country);
  } else if (role === "coach" || role === "recepcion") {
    const allowed = new Set(branchIds);
    filtered = allRows.filter((b) => b.isVirtual || allowed.has(b.id));
  } else if (role === INVERSOR_ROLE) {
    // 2026-09-08: alcance FORZADO — SOLO sus sedes. A diferencia de
    // coach/recepción no se le suman las virtuales (Templo Online): el selector
    // de sede del inversor tiene que ofrecer exactamente aquello sobre lo que
    // los listados le van a dejar operar (`enforcedBranchIds`), y una sede
    // virtual ahí sería un 403 seguro al elegirla.
    const allowed = new Set(branchIds);
    filtered = allRows.filter((b) => allowed.has(b.id));
  } else if (role === TV_ACCOUNT_ROLE) {
    // Regla 2b: la cuenta de los televisores ve todas las sedes del gimnasio.
    filtered = allRows;
  }
  // member / otros: allRows (defensivo, inalcanzable detrás de los guards).

  return filtered.map(({ id, name, isVirtual, country: c, timezone }) => ({
    id,
    name,
    isVirtual: !!isVirtual,
    country: c,
    timezone,
  }));
}
