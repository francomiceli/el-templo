// Módulo: referrals — definición ÚNICA de "compró" para una invitación (Fase 194, ME-07)
//
// Antes había tres copias del mismo predicado (el EXISTS de "Mis invitados", el gate
// SQL de conversión y la búsqueda de la sub a atribuir) que podían divergir. Ahora
// hay UNA base y UN calificador, ambos fragmentos SQL para componer dentro del
// EXISTS / SELECT de quien consulta (que aporta `tenant_id` y `user_id` inline):
//
//   COMPRÓ (`paidSinceActivationSql`): una sub de membresía real (plan que NO es
//     `is_trial`, D-03) con `price_paid > 0`, creada en o después de la activación de
//     la invitación. Cualquier estado de la sub. Es historia: alimenta el estado del
//     invitado en "Mis invitados" (`inactivo` = compró y ya no tiene membresía).
//
//   COMPRA VIGENTE (`paidMembershipInEffectSql`): lo anterior Y la sub está vigente
//     hoy (`membershipInEffectSql`: activa/pausada, ya arrancada, no vencida). Es lo
//     que cuenta para CONVERTIR (`converted_at`, lead `ganado`, reporte).
//
// Las dos preguntas son distintas a propósito: una compra cancelada o programada
// "compró" pero todavía no "convirtió". Lo que cambia entre ellas queda a la vista
// en este archivo en vez de repartido en tres. Decisión de producto pendiente (no
// resuelta en esta fase): si una compra cancelada o programada debe contar como
// conversión.
import { sql, type SQL } from "drizzle-orm";
import { membershipInEffectSql, notTrialPlanSql } from "../shared/membership";
import type { SubAlias } from "../shared/membership";

/**
 * Base de "compró": sub de membresía paga creada desde `activatedAtExpr` (la columna
 * `activated_at` de la invitación, con su alias del lado de quien consulta).
 */
export function paidSinceActivationSql(
  alias: SubAlias,
  activatedAtExpr: SQL,
): SQL {
  const a = sql.raw(alias);
  /* tenant-safe: fragmento de condiciones sobre columnas de la sub del alias; solo viaja dentro de un EXISTS/SELECT cuyo statement ya acota subscriptions por tenant_id inline. */
  return sql`${a}.price_paid > 0
    AND ${a}.created_at >= ${activatedAtExpr}
    AND ${notTrialPlanSql(alias)}`;
}

/** Compra vigente hoy: la base de "compró" más membresía en efecto (gate de conversión). */
export function paidMembershipInEffectSql(
  alias: SubAlias,
  activatedAtExpr: SQL,
): SQL {
  /* tenant-safe: compone paidSinceActivationSql y membershipInEffectSql, ambos fragmentos sobre columnas de la sub del alias dentro de un statement ya acotado por tenant_id inline. */
  return sql`${paidSinceActivationSql(alias, activatedAtExpr)}
    AND ${membershipInEffectSql(alias)}`;
}
