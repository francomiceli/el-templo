// Module: aura — manifest `ModuleDef` de `templo-gamification`
//
// POR QUÉ VIVE ACÁ
// -----------------
// Fase 176 Plan 04 (MOD-01): `temploGamificationModule` es el manifest que el
// composition root (`src/modules-boot.ts`) consume para registrar la única
// ruta HTTP de este módulo bajo `moduleScope`. Vive DENTRO de la carpeta
// `aura/` (y no en `modules-boot.ts`, a diferencia de marketing/onboarding)
// porque este es el módulo que en los planes 176-07/08 va a tener también
// `filters` (pricing) y `events` (streak.milestone) — doc
// `.docs/saas-multitenancy/04-mecanismo-modulos.md` §4.2-4.3. Cuando esos
// planes agreguen esos campos al manifest, van a vivir en este mismo archivo.
//
// QUÉ NO ES
// ----------
// AURA no expone rutas propias — es un service interno (`AuraService`,
// `service.ts`) consumido in-process por otros módulos (subscriptions,
// analytics). No hay `routes.ts` en esta carpeta. La ÚNICA ruta HTTP
// clasificada `templo-gamification` en el manifiesto de tenancy es
// `POST /api/bar-challenge/result` (Phase 115) — vive en la carpeta
// `bar-challenge/`, no acá, pero pertenece al mismo módulo Templo. Por eso
// este archivo importa `barChallengeRoutes` de esa carpeta en vez de
// declarar rutas propias.
//
// QUIÉN LO CONSUME
// -----------------
// `src/modules-boot.ts` (176-04, este plan): `registerModules` llama
// `registerModule(app, temploGamificationModule)`.
import type { ModuleDef } from "../../modules-boot";
import { barChallengeRoutes } from "../bar-challenge/routes";
import { streakMilestoneRewardHandler } from "./streak-reward";

export const temploGamificationModule: ModuleDef = {
  name: "templo-gamification",
  routes: [{ plugin: barChallengeRoutes, prefix: "/api/bar-challenge" }],
  // `filters` (pricing.adjust) se agrega en el plan 176-08 — no adelantado
  // en esta fase.
  events: { "streak.milestone": streakMilestoneRewardHandler },
};
