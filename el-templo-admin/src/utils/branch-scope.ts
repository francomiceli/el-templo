/**
 * Roles cuyo alcance son SUS sedes y a los que el API les FUERZA ese filtro
 * (`enforcedBranchIds` en `el-templo-api/src/modules/shared/branch-access.ts`).
 *
 * Hoy: `inversor` (2026-09-08, migración 0225).
 *
 * Para qué sirve acá: los selectores de sede ofrecen "Todas" y arrancan sin
 * filtro. Para estos roles eso es una opción que el API rechaza — con una sola
 * sede asignada el listado igual sale bien (el server la inyecta), pero con dos
 * o más devuelve 400 `BRANCH_REQUIRED` y el usuario ve un error sin entender por
 * qué. Así que la UI les esconde "Todas" y les preselecciona una sede.
 *
 * ESTO NO ES SEGURIDAD. El recorte real vive en el API; acá sólo se evita
 * ofrecer algo que va a fallar. Punto único de decisión para no repartir
 * `role === 'inversor'` por diez componentes.
 */
export function isBranchScopedRole(role: string | undefined | null): boolean {
  return role === 'inversor';
}
