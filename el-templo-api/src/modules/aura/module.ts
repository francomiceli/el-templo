// Module: aura — manifest `ModuleDef` de `templo-gamification`
//
// POR QUÉ VIVE ACÁ
// -----------------
// Fase 176 Plan 04 (MOD-01): `temploGamificationModule` es el manifest que el
// composition root (`src/modules-boot.ts`) consume para registrar las
// rutas HTTP de este módulo bajo `moduleScope`. Vive DENTRO de la carpeta
// `aura/` (y no en `modules-boot.ts`, a diferencia de marketing/onboarding)
// porque este es el módulo que en los planes 176-07/08 va a tener también
// `filters` (pricing) y `events` (streak.milestone) — doc
// `.docs/saas-multitenancy/04-mecanismo-modulos.md` §4.2-4.3. Cuando esos
// planes agreguen esos campos al manifest, van a vivir en este mismo archivo.
//
// QUÉ RUTAS TIENE
// -----------------
// AURA es sobre todo un service interno (`AuraService`, `service.ts`)
// consumido in-process por otros módulos (subscriptions, analytics). Desde la
// fase 214 (D-13) expone además `GET /api/members/aura/movements` (`member-routes.ts`):
// el detalle privado de la Aura del propio usuario. La otra ruta clasificada
// `templo-gamification` en el manifiesto de tenancy es
// `POST /api/bar-challenge/result` (Phase 115), que vive en la carpeta
// `bar-challenge/` pero pertenece al mismo módulo Templo; por eso este archivo
// importa `barChallengeRoutes` de esa carpeta.
//
// QUIÉN LO CONSUME
// -----------------
// `src/modules-boot.ts` (176-04, este plan): `registerModules` llama
// `registerModule(app, temploGamificationModule)`.
import type { ModuleDef } from "../../modules-boot";
import { barChallengeRoutes } from "../bar-challenge/routes";
import { auraMemberRoutes } from "./member-routes";
import { streakMilestoneRewardHandler } from "./streak-reward";
import { pricingAdjustHandler } from "./pricing-benefits";

export const temploGamificationModule: ModuleDef = {
  name: "templo-gamification",
  routes: [
    { plugin: barChallengeRoutes, prefix: "/api/bar-challenge" },
    { plugin: auraMemberRoutes, prefix: "/api/members/aura" },
  ],
  // `filters` (pricing.adjust, plan 176-08): boarding pass + descuento AURA
  // de la cadena de pricing de subscriptions — ver docblock de
  // `pricing-benefits.ts`.
  filters: { "pricing.adjust": pricingAdjustHandler },
  events: { "streak.milestone": streakMilestoneRewardHandler },
};
