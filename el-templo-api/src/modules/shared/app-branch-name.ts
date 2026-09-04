/**
 * Compat shim del nombre de sede para la APP de miembros.
 *
 * Las sedes se renombraron en la DB a nombres cortos ("Alem", "Mario Bravo"). El admin,
 * la TV y los exports usan ese nombre corto tal cual. Pero la app de miembros
 * tiene BAKED en el bundle (celulares ya instalados) un regex que hace
 * `name.replace(/^El Templo\s+/i, 'Sede ')` para mostrar "Sede X". Con el
 * nombre corto ese regex no matchea y mostraria "Alem" pelado.
 *
 * Para no depender de un build a tiendas, los HANDLERS de las rutas que
 * consume la app reconstruyen el prefijo con este helper: "Alem" -> "El Templo
 * Alem", que el regex del front convierte de nuevo en "Sede Alem". Asi la app
 * queda identica a hoy sin tocar el frontend.
 *
 * ES ESPECIFICO DE EL TEMPLO (tenant 1): el prefijo "El Templo" es branding de
 * este gimnasio. Para otros tenants se devuelve el nombre real sin tocar, asi
 * la app de otro gimnasio (o los tests de aislamiento) ven su propio nombre.
 * `tenantId` es opcional: sin el (caso pre-tenancy en master) se asume El
 * Templo y se aplica; con tenant != 1 no se toca.
 *
 * SOLO se aplica en respuestas member-facing y a nivel handler (nunca dentro de
 * services compartidos con el admin, que deben devolver el nombre corto).
 * Idempotente: si el nombre ya trae el prefijo, no lo duplica. Es deuda
 * temporal -- se retira cuando salga un build de la app con la logica corregida.
 */
const TEMPLO_TENANT_ID = 1;

export function appBranchName<T extends string | null | undefined>(
  name: T,
  tenantId?: number,
): T {
  if (!name) return name;
  // Otro gimnasio: su nombre real, sin el branding de El Templo.
  if (tenantId != null && tenantId !== TEMPLO_TENANT_ID) return name;
  return (
    /^El Templo\s/i.test(name) ? name : `El Templo ${name}`
  ) as T;
}
