// Composition root — el ÚNICO archivo de `src/` fuera de las carpetas de
// módulo que puede importar de una carpeta de módulo.
//
// POR QUÉ VIVE ACÁ
// -----------------
// Fase 176 Plan 04 (MOD-01): hasta este plan, `app.ts` importaba y registraba
// las rutas de los 4 módulos Templo directo, mezcladas con los registros
// core (auth, members, subscriptions, etc). Este archivo separa esa
// responsabilidad: es el ÚNICO lugar de `src/` (fuera de `modules/<carpeta>/`
// mismas) que sabe que existen "módulos Templo" y los registra como tales.
// `.docs/saas-multitenancy/04-mecanismo-modulos.md` §5 — "Composition root —
// el único lugar que ve módulos" — es el diseño que este archivo implementa.
//
// QUÉ ES
// -------
// - La interfaz `ModuleDef`: la forma mínima con la que un módulo declara
//   sus rutas HTTP (`filters`/`events` los agrega el plan 176-06, registry
//   de hooks — no adelantados acá).
// - Los `ModuleDef` de `templo-marketing` (5 registros) y `templo-onboarding`
//   (1 registro), declarados ACÁ MISMO porque ninguno de los dos tiene una
//   carpeta de módulo única: marketing son 5 carpetas HTTP distintas
//   (`franchise`, `gladius`, `blog`, `academy`, `app-landing`) sin service
//   compartido, y onboarding no tiene hooks que justifiquen vivir en su
//   propia carpeta como `module.ts`. `temploGamificationModule` SÍ vive en su
//   propia carpeta (`modules/aura/module.ts`) — ver el docblock de ese
//   archivo para el porqué.
// - `registerModule(app, def)`: aplica `moduleScope` (176-03) a cada ruta del
//   `ModuleDef` — una función, no 7 llamadas manuales.
// - `registerModules(app)`: la función que `app.ts` llama una vez.
//
// QUÉ NO ES (todavía)
// ---------------------
// - NO migra los 12 registros de `templo-training` que quedan in-place en
//   `app.ts` con `moduleScope` directo (D-04, decisión híbrida del plan 03).
//   Esos migran al manifest en fases futuras, módulo a módulo.
// - NO tiene el parámetro `hooks: HookRegistry` ni los campos
//   `filters`/`events` del `ModuleDef` — eso es 176-06. La firma de esta fase
//   es deliberadamente `registerModules(app: FastifyInstance): Promise<void>`.
//
// ORDEN DE REGISTRO (doc 04 §4.4)
// ---------------------------------
// El orden en que `registerModules` llama `registerModule` es el orden de
// ejecución de los hooks de cada módulo cuando existan (176-06). Con un solo
// módulo por hook hoy no hay contención real, pero el orden es EXPLÍCITO
// (gamification, marketing, onboarding) y no accidental — no reordenar sin
// releer el doc 04 §4.4.
//
// QUIÉN LO CONSUME
// -----------------
// `src/app.ts`: `await registerModules(app)`, una sola llamada, después de
// los registros core y ANTES de `/health` y del hook de Sentry.
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { temploGamificationModule } from "./modules/aura/module";
import { academyRoutes } from "./modules/academy";
import { appLandingRoutes } from "./modules/app-landing";
import { blogRoutes } from "./modules/blog";
import { franchiseRoutes } from "./modules/franchise";
import { gladiusRoutes } from "./modules/gladius";
import { onboardingRoutes } from "./modules/onboarding";
import { moduleScope } from "./modules/shared/module-registry";
import type { ModuleName } from "./modules/shared/modules";

/**
 * Manifest mínimo de un módulo Templo: sus rutas HTTP. Los campos
 * `filters`/`events` (pricing benefits, streak.milestone) se agregan en el
 * plan 176-06 — no adelantados acá.
 */
export interface ModuleDef {
  name: ModuleName;
  routes?: Array<{ plugin: FastifyPluginAsync; prefix?: string }>;
}

/**
 * `temploMarketingModule` — 5 registros, sin carpeta de módulo única (ver
 * docblock del archivo). Los comentarios que hoy documentaban cada
 * `app.register(...)` en `app.ts` viajan acá.
 */
export const temploMarketingModule: ModuleDef = {
  name: "templo-marketing",
  routes: [
    // Franchise routes (public franchise application form)
    { plugin: franchiseRoutes, prefix: "/api/franchise" },
    // Gladius routes (product catalog + inquiry form)
    { plugin: gladiusRoutes, prefix: "/api/gladius" },
    // Blog routes (public blog + admin CRUD + image upload)
    { plugin: blogRoutes, prefix: "/api/blog" },
    // Academy routes (enrollment inquiry form)
    { plugin: academyRoutes, prefix: "/api/academy" },
    // App landing routes (waitlist + Labs inquiry forms)
    { plugin: appLandingRoutes, prefix: "/api/app" },
  ],
};

/**
 * `temploOnboardingModule` — 1 registro, sin hooks que justifiquen una
 * carpeta de módulo propia.
 */
export const temploOnboardingModule: ModuleDef = {
  name: "templo-onboarding",
  routes: [
    // Onboarding routes (member quiz completion + profile retrieval + analytics)
    { plugin: onboardingRoutes, prefix: "/api/onboarding" },
  ],
};

/**
 * Aplica `moduleScope` (176-03) a cada ruta declarada en `def.routes`.
 * Privada: `app.ts` no llama esto directo, solo `registerModules`.
 */
async function registerModule(
  app: FastifyInstance,
  def: ModuleDef,
): Promise<void> {
  for (const { plugin, prefix } of def.routes ?? []) {
    await moduleScope(app, def.name, plugin, { prefix });
  }
}

/**
 * Punto de entrada único que `app.ts` llama una vez. Orden EXPLÍCITO (ver
 * docblock §"ORDEN DE REGISTRO"): gamification, marketing, onboarding.
 */
export async function registerModules(app: FastifyInstance): Promise<void> {
  await registerModule(app, temploGamificationModule);
  await registerModule(app, temploMarketingModule);
  await registerModule(app, temploOnboardingModule);
}
