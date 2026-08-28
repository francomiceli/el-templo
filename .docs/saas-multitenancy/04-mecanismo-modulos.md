# Fase 2 — Mecanismo de módulos/flags: diseño propuesto

> **Estado:** ✅ VALIDADO con Nacho (2026-07-02) — las 6 decisiones de §8 aprobadas tal
> como se propusieron. Dirección hooks/eventos acordada previamente (README §6, doc 02
> §4.2); este doc la baja a diseño concreto. Evidencia: lectura del wiring real de
> `el-templo-api` (instanciación de services, cadena de pricing, los 4 acoples de
> AuraService, `system_settings`, gating existente).

## Resumen ejecutivo

El mecanismo propuesto son **3 piezas mínimas, tipadas y explícitas**:

1. **Flags por tenant** en `tenant_settings` (`module.<nombre>.enabled`).
2. **Gating de rutas** por módulo (`requireModule(...)` → 404 si el módulo está apagado
   para el tenant del request).
3. **Registry de hooks tipado con DOS clases**: *filters* (transforman un valor, errores
   propagan) y *events* (best-effort, aislados).

Sin event bus genérico, sin DI container, sin auto-discovery. El dimensionamiento sale de
un hallazgo del código (§1): **los puntos core→Templo reales hoy son 2, no 4**.

---

## 1. Hallazgo que dimensiona el problema: la superficie real de hooks es 2

El doc 02 §4.2 lista 4 acoples de `AuraService` en services "core". Releídos con el
inventario ya cerrado (onboarding = Templo, programs = Templo), **dos de los cuatro son
módulo-Templo → módulo-Templo**, que no necesitan hooks:

| Acople | Dirección | ¿Hook? |
|---|---|---|
| `subscriptions` → AURA + boarding pass en pricing (`service.ts:1045-1112`) | **core → Templo** | ✅ SÍ — filter `pricing.adjust` |
| `streaks` → recompensa AURA en milestone (`service.ts:244`) | **core → Templo** | ✅ SÍ — event `streak.milestone` |
| `onboarding` → award 50 AURA (`service.ts:54`) | Templo → Templo | ❌ import directo, legal |
| `programs` → awards de programa (`service.ts:867-914`) | Templo → Templo | ❌ import directo, legal |

El caso `sessions/routes.ts:830-863` (post-completar sesión: aura + streak + programs en
secuencia) es **Templo llamando a core y a otros módulos Templo** — también legal sin hooks
(SPOM puede llamar al `StreakService` core como cualquier consumidor de su API pública).

**Regla de dirección de imports (formaliza el principio rector #2):**

```
módulo  →  core          ✅ (un módulo consume services/tipos core)
módulo  →  módulo Templo ✅ (los módulos Templo se conocen entre sí)
core    →  módulo        ❌ PROHIBIDO — solo vía hooks del registry
composition root → todo  ✅ (el ÚNICO archivo core que importa módulos, §5)
```

Consecuencia de diseño: con 2 hooks reales, el mecanismo se construye **chico** y crece
un hook a la vez cuando aparezca la próxima necesidad real (YAGNI). Cada hook nuevo es
una línea en el contrato tipado, no una re-arquitectura.

## 2. Pieza 1 — Flags por tenant en `tenant_settings`

- Key por módulo: `module.<nombre>.enabled` = `"true"` / `"false"`. Mismo patrón
  `parseOrDefault` que ya usan streaks (`streak.milestone_7_aura`) y finance
  (`finance.pending_overdue_days`) contra `system_settings`.
- **Default en código = OFF (fail-closed)**, coherente con el manifiesto de rutas de la
  capa 5. La migración que crea `tenants` **siembra los flags del Templo en ON** para el
  tenant 1 (compatibilidad total día 1).
- La **config fina** de cada módulo son más keys del mismo namespace
  (ej. `module.templo-gamification.streak_milestone_7_aura` cuando los umbrales de
  streaks migren de `system_settings` — coexistencia gradual ya decidida, README §5).
- **Resolución + cache:** los flags del tenant se resuelven desde `scope.tenantId`
  (capa 1, `attachScope`). Cache in-memory por tenant con TTL corto (~60s) para no pagar
  una query extra por request; con tenant único hoy, el costo es cero. Apagar un módulo
  tarda ≤TTL en propagar — aceptable para una palanca administrativa.

### 2.1 Granularidad: módulos gruesos, no un flag por carpeta

37 módulos API ≠ 37 flags. Propuesta: **módulos comerciales gruesos** que agrupan las
carpetas del inventario (doc 02):

| Módulo declarado | Agrupa (carpetas API) |
|---|---|
| `templo-training` | spom, sessions, admin(editor), exercises, exercise-adjustments, tree-editor, tree-progress, goal-plans, progression, programs, check-ins, formats, routes, day-modes, weekly-rotator, saved-blocks, evaluation-requests |
| `templo-gamification` | aura + aura-*, lifestyle, bar-challenge (+ el handler de recompensa de racha). `bar-challenge` se CONSERVA — decisión revertida tras verificación en prod (doc 02 §4.1) |
| `templo-marketing` | blog, academy, gladius, franchise, app-landing |
| `templo-onboarding` | onboarding, onboarding-analytics |

El core no es un módulo: no tiene flag, está siempre ON.

## 3. Pieza 2 — Gating de rutas por módulo

Cada módulo declara sus rutas; el composition root las registra con un guard:

```ts
// core: src/modules/shared/module-registry.ts
fastify.addHook("onRequest", requireModule("templo-gamification"));
// módulo OFF para scope.tenantId → 404 (no revela existencia del feature)
```

- Se compone con los guards existentes (`authenticate` → `attachScope` → `requireModule`).
- **Interacción con la capa 5 (manifiesto):** toda ruta clasificada `templo-module` en
  `test/tenant-manifest.ts` DEBE tener `requireModule` — el test de aislamiento lo
  verifica (regla mecánica, fail-closed).
- Esto es también lo que "gobierna" las **columnas Templo** de `users.ts` /
  `member_profiles` (decisión doc 02 §4.1): módulo OFF → ninguna superficie las lee ni
  escribe → quedan NULL/ignoradas. No hace falta mecanismo adicional a nivel columna.

## 4. Pieza 3 — Hooks tipados, dos clases

El core define el contrato completo en `src/modules/shared/hooks.ts`. **El contrato es
cerrado y tipado** — agregar un hook = agregar una entrada al tipo (visible en PR, el
CI lint de la capa 4 puede listar los hooks existentes):

```ts
// Filters: transforman un valor. Orden importa. Errores PROPAGAN (bloqueantes).
interface FilterMap {
  "pricing.adjust": (ctx: PricingAdjustCtx) => Promise<void>;
}

// Events: notifican un hecho consumado. Best-effort: try/catch por handler +
// log.warn + Sentry. JAMÁS afectan la respuesta ni la operación principal.
interface EventMap {
  "streak.milestone": (evt: StreakMilestoneEvent) => Promise<void>;
}
```

### 4.1 Semántica de errores (espeja lo que el código ya hace hoy)

- **Filter → propaga.** El `spend` de AURA puede tirar `InsufficientBalanceError` y DEBE
  abortar el alta del plan (el socio eligió gastar AURA; cobrar precio con descuento sin
  descontar sería un bug). Hoy ya es bloqueante (`subscriptions/service.ts:1100`).
- **Event → aislado.** Una recompensa de racha caída no puede tirar el registro de la
  sesión. Hoy ya es `try/catch` + `log.warn` (`streaks/service.ts:257`).

### 4.2 El filter `pricing.adjust` en concreto

La cadena actual `override → boarding_pass → AURA` (`subscriptions/service.ts:1045-1112`,
duplicada en `assignPlan` / `changePlanAfterCurrent` / `renewSubscription` /
`getPricingPreview`) queda:

1. **Core:** resuelve `basePrice` (`getBasePrice`) y aplica **override** (core: cualquier
   gimnasio ajusta precio a mano, con reason). Si hay override, la cadena termina
   (`ctx.exclusive = true`).
2. **Core:** `await hooks.runFilter("pricing.adjust", scope, ctx)` — solo corren handlers
   de módulos ON para el tenant.
3. **Módulo Templo:** UN handler que implementa internamente boarding pass (exclusivo:
   `price = plan.priceZero`, marca `boardingPassUsed`, corta) y si no, descuento AURA
   (`spend` + `price -= floor(base * percent/100)`).

```ts
interface PricingAdjustCtx {
  scope: TenantScope;
  userId: number;
  plan: PlanDetail;
  priceType: PriceType;
  moduleInput?: Record<string, unknown>; // lo Templo del request (auraSpend, boardingPass) viaja acá, core no lo tipa
  basePrice: number;
  price: number;            // mutable — cada filter lo ajusta
  applied: AppliedBenefit[];// trazabilidad de qué benefit tocó el precio
  exclusive: boolean;       // true → la cadena corta (override, boarding pass)
  commit: boolean;          // false = preview (getPricingPreview): calcular sin gastar
}
```

- **`commit: false`** cubre `getPricingPreview` (hoy usa `getBalance`, no `spend`) con el
  mismo handler — se mata la duplicación actual de la cadena en 4 métodos: se extrae UNA
  función core de pricing que llama al filter, y los 4 métodos la usan.
- **`moduleInput`**: los campos Templo del payload (`auraSpend`, `boardingPass`) salen del
  tipo core del request y viajan opacos; el módulo valida los suyos. El core deja de
  conocer los conceptos "aura" y "boarding pass".
- **Beneficio colateral:** `SubscriptionService` pierde `auraService` del constructor
  (hoy se instancia `new AuraService` en ~18 sitios).

### 4.3 El event `streak.milestone` en concreto

`StreakService` (core) pierde `auraService` del constructor; al detectar milestone:
`await hooks.emit("streak.milestone", scope, { userId, milestone, streakDays })`.
El módulo `templo-gamification` registra el handler que hace el `award`. Exactamente la
decisión de la grilla: "núcleo de racha CORE, recompensa como hook de módulo".

### 4.4 Orden de ejecución

**Orden de registro en el composition root = orden de ejecución.** Con un solo módulo por
hook hoy, no hay contención real; la precedencia boarding>AURA vive DENTRO del handler
Templo (es semántica interna del módulo, no del mecanismo). Si algún día dos módulos
compiten por un filter, se agrega `priority` numérica — no antes (YAGNI).

### 4.5 Transaccionalidad — status quo documentado

Hoy los efectos AURA **no** son atómicos con la operación principal (el `spend` corre
ANTES de la tx que inserta la subscription; los `award` abren su propia tx aunque el
caller esté dentro de otra). El mecanismo **no** introduce transacciones distribuidas ni
outbox: filters corren donde el core los llama (si el core está en una tx, puede pasarla
en `ctx` — decisión por-hook), events quedan best-effort no-atómicos como hoy. Se
documenta y se revisa solo si aparece un bug real de consistencia.

## 5. Composition root — el único lugar que ve módulos

```ts
// src/modules-boot.ts — ÚNICO archivo core que importa módulos
import { temploGamificationModule } from "./modules/aura/module";
import { temploTrainingModule } from "./modules/spom/module";
// ...
export function registerModules(app: FastifyInstance, hooks: HookRegistry) {
  registerModule(app, hooks, temploGamificationModule);
  registerModule(app, hooks, temploTrainingModule);
  // orden explícito = orden de hooks
}
```

Cada módulo exporta un manifest chico:

```ts
export const temploGamificationModule: ModuleDef = {
  name: "templo-gamification",
  routes: [{ plugin: auraRoutes, prefix: "/api/aura" }, /* … */],
  filters: { "pricing.adjust": pricingBenefitsHandler },
  events: { "streak.milestone": streakRewardHandler },
};
```

`buildApp()` llama `registerModules(...)` después de los registros core — encaja en el
registro manual actual de `app.ts:100-251` sin re-arquitecturar los plugins `fp` existentes
(los de SPOM pueden migrar al manifest gradualmente, módulo a módulo, como todo lo demás).

## 6. Frontend: cómo se entera el admin

- La respuesta de sesión (`/api/auth/me` o equivalente) incluye
  `enabledModules: string[]` del tenant.
- El nav del admin gatea por módulo + rol (el `AdminLayout` ya gatea por rol — es agregar
  la dimensión módulo, no reinventar).
- El hack actual `canAccessTraining` por email hardcodeado (`Scaine7@hotmail.com`,
  `shared/permissions.ts:44`) se reemplaza a término por `templo-training` ON + RBAC —
  coherente con "coach = core vía roles" (doc 02 §1).

## 7. Qué NO es este mecanismo

- **No es sandbox de terceros.** Los módulos son nuestros, corren in-process con acceso
  total. "Módulo" = frontera de organización y activación, no de seguridad.
- **No es sistema de billing.** El flag dice si el tenant TIENE el módulo; quién paga qué
  es el modelo comercial (diferido, README §5).
- **No es event sourcing ni cola.** Todo síncrono in-process, como hoy.

## 8. Decisiones — ✅ TODAS VALIDADAS con Nacho (2026-07-02)

1. ✅ **Forma general: 3 piezas mínimas** (flags + guard de rutas + registry tipado con
   2 clases). Descartados event bus genérico y framework de plugins: con 2 hooks reales,
   abstracción prematura.
2. ✅ **Hogar de los flags: `tenant_settings` KV** (`module.<nombre>.enabled`). Promover
   a tabla `tenant_modules` solo si el KV queda chico (ej. cuando exista billing).
3. ✅ **Registro: composition root explícito** (`src/modules-boot.ts`, único archivo core
   que importa módulos). Sin auto-discovery.
4. ✅ **Semántica de errores: filters propagan, events aíslan** — espeja el código actual
   (spend bloqueante en pricing, awards best-effort).
5. ✅ **Granularidad: 4 módulos gruesos** — `templo-training`, `templo-gamification`,
   `templo-marketing`, `templo-onboarding` (§2.1). Partir un corte después es barato.
6. ✅ **`moduleInput`: sobre opaco + validación del módulo** (§4.2). El core deja de
   conocer "aura" y "boarding pass"; cero cambio funcional para el Templo.

**Aclaraciones pedidas por Nacho durante la validación** (quedan como contexto):
- Los módulos declarados son SOLO lo clasificado TEMPLO en doc 02; el core no es módulo,
  no tiene flag, está siempre ON para todos los tenants. Otro tenant podría tener sus
  propios módulos a futuro (principio rector #3).
- `moduleInput` no cambia nada funcional para el Templo hoy: mismas pantallas, mismos
  descuentos, mismo precio final — cambia el envoltorio interno del request.

## Registro de cambios

- **2026-07-02** — Creación (trabajo autónomo post-cierre del inventario). Hallazgo
  central: superficie real de hooks core→Templo = 2 (pricing + racha); onboarding/programs
  → AURA son Templo→Templo, legales sin hooks. Diseño de 3 piezas propuesto.
- **2026-07-02 (validación)** — **✅ Las 6 decisiones de §8 validadas con Nacho**, todas
  según lo propuesto (3 piezas / KV / composition root / filters-propagan-events-aíslan /
  4 módulos gruesos / sobre opaco). Con esto **la fase 2 de diseño queda COMPLETA**.
- **2026-08-20 (fase 176, implementación)** — Divergencias entre este diseño y lo
  construido, verificadas contra `2a4f5c92`. Las decisiones de §8 siguen vigentes; esto
  registra CÓMO se construyó, no un cambio de diseño:
  1. El guard NO usa un `addHook("onRequest")` de scope (§3): usa un hook `onRoute` que
     appendea el guard al array `onRequest` por-ruta — es lo único que corre después de
     `authenticate` y queda visible al gate de cobertura.
  2. Al filter `pricing.adjust` cruzan DOS ramas (boarding pass y AURA), no cuatro:
     override, prorrateo y referidos son core (los referidos están clasificados
     `tenant-scoped` en el manifiesto, no Templo).
  3. `renewSubscription` NO es cliente del filter (hereda el precio) y aparecieron dos
     métodos que este doc no menciona: `changePlanNow` (boarding sí, AURA no) y
     `getChangePlanPreview` (ninguno de los dos).
  4. Los números de línea citados en §4.2 son pre-tenancy y están desfasados unas 700
     líneas respecto del código actual.
