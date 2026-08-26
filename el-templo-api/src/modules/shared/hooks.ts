// Module: shared — registry de hooks tipado y cerrado (pieza 3 del doc 04)
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ----------------------------
// Fase 176 (MOD-02): el core (subscriptions, streaks) hoy importa `AuraService`
// directo en ~18 sitios para descontar/premiar AURA. Eso viola la regla de
// dirección de imports del doc 04 §1 (`core → módulo` PROHIBIDO salvo vía
// hooks). Este archivo es el ÚNICO mecanismo legal para que un módulo Templo
// reaccione a un evento del core sin que el core conozca su existencia.
// `.docs/saas-multitenancy/04-mecanismo-modulos.md` §4 es el diseño que este
// archivo implementa al pie de la letra.
//
// EL CONTRATO ES CERRADO
// ------------------------
// `FilterMap`/`EventMap` son las ÚNICAS dos superficies de extensión.
// Agregar un hook nuevo = agregar una entrada a uno de los dos mapas — un
// cambio visible en el diff del PR, no un registro dinámico ni un
// auto-discovery. Hoy hay exactamente 2 hooks reales (doc 04 §1): el filter
// `pricing.adjust` y el event `streak.milestone`. No se agrega un tercero sin
// releer el doc 04 y encontrar la necesidad real (YAGNI).
//
// SEMÁNTICA DE ERRORES — NO NEGOCIABLE (doc 04 §4.1)
// -----------------------------------------------------
// - `runFilter` (filters, ej. `pricing.adjust`): los errores PROPAGAN. Hoy
//   `subscriptions/service.ts:1825` deja salir `InsufficientBalanceError` sin
//   `catch` y el alta del plan aborta — el socio eligió gastar AURA, cobrar
//   con descuento sin descontar el saldo sería un bug de cobro. `runFilter`
//   NO tiene try/catch en su cuerpo. Envolverlo sería reintroducir ese bug.
// - `emit` (events, ej. `streak.milestone`): try/catch POR HANDLER +
//   `log.warn` + seguir. Espeja literalmente `streaks/service.ts:296-302`
//   (graceful degradation: la racha se registra aunque la recompensa AURA
//   falle). Un handler de event roto JAMÁS aborta la operación principal.
//
// FILTRADO POR MÓDULO HABILITADO — DENTRO del registry, no en el call site
// ---------------------------------------------------------------------------
// `runFilter`/`emit` consultan `isModuleEnabled(hook.tenantId, module, hook.db)`
// (el MISMO resolver que usa el guard `requireModule`, `module-flags.ts`) por
// cada handler registrado, antes de invocarlo. El core que llama
// `hooks.runFilter(...)`/`hooks.emit(...)` NO sabe a qué módulo pertenece el
// handler que corre o no corre — esa es la frontera que hace que el core
// pueda operar con el módulo apagado, sin ifs de "está prendido este módulo".
//
// ALMACENAMIENTO IDEMPOTENTE
// -----------------------------
// `Map<hookKey, Map<ModuleName, handler>>`. Registrar dos veces el mismo par
// (módulo, hook) REEMPLAZA el handler anterior, nunca acumula. Es deliberado:
// `createTestApp()` construye un app de Fastify por archivo de test en el
// MISMO proceso Node, y con `hookRegistry` como singleton de proceso, un
// almacenamiento por array acumularía handlers y ejecutaría el `spend` de
// AURA una vez por archivo de test que llame `registerModules` — un bug real
// de doble cobro, no solo un problema de tests (T-176-15).
//
// `moduleInput`/`moduleOutput` SON OPACOS
// -------------------------------------------
// `Record<string, unknown>`. El core NUNCA le hace `as` a estos campos — los
// campos Templo del request (`auraSpend`, `boardingPass`) viajan ahí sin que
// el core conozca sus formas. Es el módulo quien valida lo suyo.
//
// TRANSACCIONALIDAD — STATUS QUO, NO UN PROBLEMA QUE ESTA FASE RESUELVA
// --------------------------------------------------------------------------
// (doc 04 §4.5) Los efectos de AURA hoy NO son atómicos con la operación
// principal: el `spend` corre ANTES de la tx que inserta la subscription, y
// los `award` abren su propia tx aunque el caller esté dentro de otra. Este
// registry no introduce transacciones distribuidas ni outbox — los filters
// corren donde el core los llama y los events quedan best-effort no-atómicos,
// exactamente como hoy. Se documenta y se revisa solo si aparece un bug real
// de consistencia.
//
// ORDEN DE EJECUCIÓN
// --------------------
// El orden de invocación de los handlers de un mismo hook es el orden de
// inserción del `Map` interno, que a su vez es el orden en que
// `registerModules` (composition root, `src/modules-boot.ts`) registró cada
// módulo (doc 04 §4.4). Con un solo módulo por hook hoy no hay contención
// real; no se agrega `priority` (YAGNI) — si algún día dos módulos compiten
// por el mismo filter, se agrega ahí, no antes.
//
// QUÉ NO ES ESTE ARCHIVO
// -----------------------
// - No es un event bus genérico ni un DI container (doc 04 §7): los módulos
//   corren in-process con acceso total a la DB — "módulo" es frontera de
//   organización y activación, NO de seguridad.
// - No conecta todavía ningún cliente real (176-06 solo define el contrato).
//   Los planes 176-07 (event `streak.milestone`) y 176-08/09/10 (filter
//   `pricing.adjust`, un call site por plan) enchufan encima de este archivo.
//
// QUIÉN LO CONSUME
// -----------------
// `src/modules-boot.ts` (`registerModule` cuelga `def.filters`/`def.events`
// de cada `ModuleDef`), y a término `subscriptions/service.ts` (`runFilter`)
// y `streaks/service.ts` (`emit`) vía el singleton `hookRegistry` exportado
// más abajo.

import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import type { PlanCategory, PriceType } from "../subscriptions/types";
import { isModuleEnabled } from "./module-flags";
import type { ModuleName } from "./modules";

type DbInstance = MySql2Database<typeof schema>;

// ─── Contexto compartido por toda llamada a un hook ─────────────────────────

/**
 * Lo mínimo que `runFilter`/`emit` necesitan para resolver qué módulos están
 * habilitados y para loguear: el tenant del request, la conexión de DB (para
 * `isModuleEnabled`) y el logger (para el `log.warn` de `emit`).
 */
export interface HookCallCtx {
  tenantId: number;
  db: DbInstance;
  log: FastifyBaseLogger;
}

// ─── Filter `pricing.adjust` (doc 04 §4.2) ──────────────────────────────────

/** Un beneficio que ya tocó el precio — trazabilidad para la respuesta/logs. */
export interface AppliedBenefit {
  module: ModuleName;
  benefit: string;
}

/**
 * Los 4 call sites reales de pricing (`assignPlan`, `changePlanNow`,
 * `changePlanAfterCurrent`/`renewSubscription`, `getPricingPreview`). NO son
 * simétricos — de ahí `PricingSupports` en vez de un booleano único.
 */
export type PricingCallSite =
  | "assign"
  | "change-now"
  | "change-after-current"
  | "preview";

/**
 * Qué clase de ajuste soporta el call site que invoca el filter.
 * `exclusiveBenefits`: soporta un beneficio que reemplaza el precio y corta
 * la cadena (boarding pass) — `changePlanNow` lo soporta, `getPricingPreview`
 * NO tiene esa rama.
 * `discounts`: soporta descuentos porcentuales sobre el precio (AURA) —
 * `changePlanNow` NO soporta AURA, `getPricingPreview` sí la calcula.
 */
export interface PricingSupports {
  exclusiveBenefits: boolean;
  discounts: boolean;
}

/**
 * Contexto mutable que el core arma y pasa a `runFilter("pricing.adjust", ...)`.
 * Cada filter registrado puede leer y mutar `priceType`/`basePrice`/`price`,
 * dejar trazabilidad en `applied`, y cortar la cadena con `exclusive = true`.
 * `moduleInput`/`moduleOutput` son opacos (ver docblock del archivo).
 */
export interface PricingAdjustCtx {
  callSite: PricingCallSite;
  userId: number;
  planId: number;
  planCategory: PlanCategory;
  /** MUTABLE — el handler puede pisarlo (p.ej. a "zero"). */
  priceType: PriceType;
  /** MUTABLE. */
  basePrice: number;
  /** MUTABLE — cada filter lo ajusta. */
  price: number;
  /** El core ya fijó el precio por una regla core (override/prorrateo). */
  priceLocked: "prorate" | "override" | null;
  /**
   * Fase 179 (D-10/D-20): percent de un descuento CORE que compite con los
   * beneficios del módulo (hoy, el descuento de partner). El módulo decide
   * su regla frente a él — `templo-gamification` NO aplica (ni gasta) su
   * descuento AURA cuando el competidor lo iguala o supera (empate a favor
   * del core: el socio conserva sus puntos). Las validaciones del módulo
   * (tier/categoría → 400) corren igual, gane quien gane. El core no revela
   * QUÉ compite — solo el percent; `null` = sin competidor.
   */
  competingDiscountPercent: number | null;
  /** false = preview: calcular sin gastar ni marcar. */
  commit: boolean;
  supports: PricingSupports;
  /** Opaco: el core NO lo tipa ni le hace `as`. */
  moduleInput: Record<string, unknown>;
  /** El handler deja acá lo que el response necesita. */
  moduleOutput: Record<string, unknown>;
  /** Trazabilidad de qué benefit tocó el precio. */
  applied: AppliedBenefit[];
  /** true ⇒ la cadena corta. */
  exclusive: boolean;
  /** Callback provisto por el core. */
  resolvePriceType: (t: PriceType) => Promise<PriceType>;
  /** Callback provisto por el core. */
  basePriceFor: (t: PriceType) => number;
}

// ─── Event `streak.milestone` (doc 04 §4.3) ─────────────────────────────────

export interface StreakMilestoneEvent {
  userId: number;
  milestone: number;
  streakDays: number;
}

// ─── Los dos mapas cerrados ──────────────────────────────────────────────────

/**
 * Filters: transforman un valor. Orden importa (orden de registro). Errores
 * PROPAGAN — ver "SEMÁNTICA DE ERRORES" arriba.
 */
export interface FilterMap {
  "pricing.adjust": (
    ctx: PricingAdjustCtx,
    hook: HookCallCtx,
  ) => Promise<void>;
}

/**
 * Events: notifican un hecho consumado. Best-effort — ver "SEMÁNTICA DE
 * ERRORES" arriba. JAMÁS afectan la respuesta ni la operación principal.
 */
export interface EventMap {
  "streak.milestone": (
    evt: StreakMilestoneEvent,
    hook: HookCallCtx,
  ) => Promise<void>;
}

// ─── El registry ─────────────────────────────────────────────────────────────

/**
 * Registry de hooks del proceso. Almacenamiento idempotente por
 * `Map<hookKey, Map<ModuleName, handler>>` — ver "ALMACENAMIENTO IDEMPOTENTE"
 * arriba. Los tests instancian `new HookRegistry()` propia (nunca el
 * singleton `hookRegistry` exportado más abajo) para no contaminar el resto
 * de la suite.
 */
export class HookRegistry {
  private readonly filterHandlers = new Map<
    keyof FilterMap,
    Map<ModuleName, FilterMap[keyof FilterMap]>
  >();
  private readonly eventHandlers = new Map<
    keyof EventMap,
    Map<ModuleName, EventMap[keyof EventMap]>
  >();

  /**
   * Registra (o reemplaza) el handler de `module` para el filter `key`.
   * Idempotente: una segunda llamada con el mismo (module, key) pisa la
   * primera — nunca acumula (T-176-15).
   */
  setFilter<K extends keyof FilterMap>(
    module: ModuleName,
    key: K,
    handler: FilterMap[K],
  ): void {
    let byModule = this.filterHandlers.get(key);
    if (!byModule) {
      byModule = new Map();
      this.filterHandlers.set(key, byModule);
    }
    byModule.set(module, handler);
  }

  /** Igual que `setFilter`, para events. */
  setEvent<K extends keyof EventMap>(
    module: ModuleName,
    key: K,
    handler: EventMap[K],
  ): void {
    let byModule = this.eventHandlers.get(key);
    if (!byModule) {
      byModule = new Map();
      this.eventHandlers.set(key, byModule);
    }
    byModule.set(module, handler);
  }

  /**
   * Corre todos los handlers de `key` cuyo módulo está habilitado para
   * `hook.tenantId`, en orden de registro. SIN try/catch: un handler que
   * tira aborta esta llamada y el error propaga tal cual al caller (doc 04
   * §4.1 — semántica bloqueante del filter `pricing.adjust`, NO negociable).
   * Sin handlers registrados para `key`, resuelve sin efecto.
   */
  async runFilter<K extends keyof FilterMap>(
    key: K,
    hook: HookCallCtx,
    ctx: PricingAdjustCtx,
  ): Promise<void> {
    const byModule = this.filterHandlers.get(key);
    if (!byModule) return;
    for (const [module, handler] of byModule) {
      if (!(await isModuleEnabled(hook.tenantId, module, hook.db))) continue;
      await handler(ctx, hook);
    }
  }

  /**
   * Corre todos los handlers de `key` cuyo módulo está habilitado para
   * `hook.tenantId`, en orden de registro. try/catch POR HANDLER: un handler
   * que tira se loguea con `log.warn` y NO interrumpe a los demás handlers ni
   * hace rejectar la promesa — espeja `streaks/service.ts:296-302` (doc 04
   * §4.1, semántica best-effort del event `streak.milestone`, NO negociable).
   * Sin handlers registrados para `key`, resuelve sin efecto.
   */
  async emit<K extends keyof EventMap>(
    key: K,
    hook: HookCallCtx,
    evt: StreakMilestoneEvent,
  ): Promise<void> {
    const byModule = this.eventHandlers.get(key);
    if (!byModule) return;
    for (const [module, handler] of byModule) {
      if (!(await isModuleEnabled(hook.tenantId, module, hook.db))) continue;
      try {
        await handler(evt, hook);
      } catch (err: unknown) {
        hook.log.warn(
          { err, module, hook: key, ...evt },
          "module event handler failed (best-effort)",
        );
      }
    }
  }

  /** Solo para tests: vacía el registry por completo. */
  clear(): void {
    this.filterHandlers.clear();
    this.eventHandlers.clear();
  }

  /** Introspección: qué módulos tienen handler registrado para `key`. */
  modulesFor<K extends keyof FilterMap | keyof EventMap>(
    key: K,
  ): ModuleName[] {
    const filterByModule = this.filterHandlers.get(key as keyof FilterMap);
    if (filterByModule) return Array.from(filterByModule.keys());
    const eventByModule = this.eventHandlers.get(key as keyof EventMap);
    if (eventByModule) return Array.from(eventByModule.keys());
    return [];
  }
}

/**
 * Instancia de proceso. `pricing.ts` y `StreakService` la consumen por
 * import directo, evitando tocar los ~18 call sites que hoy instancian
 * `new AuraService(...)`. Segura porque el almacenamiento es idempotente
 * (ver docblock del archivo) — `createTestApp()` puede registrar módulos una
 * vez por archivo de test en el mismo proceso sin acumular handlers.
 */
export const hookRegistry = new HookRegistry();
