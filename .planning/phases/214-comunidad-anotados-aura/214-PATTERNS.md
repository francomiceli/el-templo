# Fase 214: Comunidad: anotados en la clase y Aura visible - Mapa de patrones

**Mapeado:** 2026-11-17
**Base:** `feat/comunidad-anotados-aura` sobre `a51a00271` (migraciones hasta `0343`, la próxima es `0344`)
**Archivos analizados:** 41 (31 de la API, 10 de app y admin)
**Análogos encontrados:** 41 / 41 (ninguno sin análogo. Los de pantalla solo se nombran)
**Rutas:** relativas a `/home/franco/projects/et-comunidad`. Las de la API empiezan en `el-templo-api/`.

Alcance: planes A1 a A7 del RESEARCH (servidor, datos, migraciones, tests y lógica) con extractos. Las pantallas (B2, B3, B4, B5, B6) solo con el análogo más cercano, porque el diseño sigue en definición.

## Discrepancias con el RESEARCH (para que el planificador las resuelva)

1. **Interruptor de la lista.** El RESEARCH dice `community.attendees_enabled` en `system_settings`. La regla v6.1 es "todo parámetro nuevo en `tenant_settings` con default en código" (`src/modules/referrals/invitation-settings.ts:1-12`, `src/modules/conquer/settings.ts:1-30`). `system_settings` está exenta de tenant (`src/db/tenant-tables.ts` la lista como exenta, y los tests la afirman exenta) y un interruptor global rompe el modelo SaaS. Recomiendo `tenant_settings`, clave con prefijo, patrón de `conquer/settings.ts`. Si Franco prefiere global, queda como está en el RESEARCH.
2. **`member_photos` va en el módulo `members` ya existente.** Hay que agregarla en DOS lugares con la misma lista: `src/db/tenant-tables.ts:679-688` (`TENANT_STRICT_MODULES.members`) y el espejo de test `test/db/tenant-tables.test.ts:457-466`. No hace falta un módulo nuevo ni tocar `MODULOS_DECLARADOS`. Si en cambio se crea un módulo nuevo (por ejemplo `profile-photos`), hay que sumarlo también a `MODULOS_DECLARADOS`.
3. **Solo dos prefijos de ISO-03 aplican a esta fase.** `/api/members/scheduling` (`iso-03-cobertura-subs-sched.test.ts:117`) y `/api/admin/members` (`iso-03-cobertura-members.test.ts:117`). `/api/members/aura/*` y `/api/members/profile-photo*` **no** están bajo ningún prefijo ISO-03: esas rutas solo piden entrada en el manifiesto (ISO-01). El cálculo del RESEARCH (7 casos ISO-03: 3 de scheduling y 4 de members) es correcto.
4. **`attendanceRecordSchema` no se exporta** (`src/modules/attendance/schemas.ts:17`, `const` local). El schema nuevo del check-in va en el mismo archivo, así que puede usar `attendanceRecordSchema.properties` sin exportarlo.
5. **El test de la 0183 solo toma el primer `UPDATE`** (`test/backfill-lost-leads.test.ts:56-58`, `.find`). El test de la 0344 tiene que recorrer **todos** los `UPDATE` con `.filter`.
6. **`streak-reward.ts` todavía lee overrides de `system_settings`** (`:76-120`) con `STREAK_DEFAULTS` como respaldo. Para que `amounts.ts` sea la única fuente, `STREAK_DEFAULTS` tiene que salir de `AURA_STREAK` (importado). Si se deja la lectura de config, un override futuro en `system_settings` gana. Decisión del planificador: se recomienda dejarla (no hay claves en prod) y decirlo en el plan.

## Clasificación de archivos

### API (A1 a A7)

| Archivo nuevo o modificado | Rol | Flujo de datos | Análogo más cercano | Calidad |
|---|---|---|---|---|
| `src/modules/aura/amounts.ts` (nuevo) | config / constantes | transform | `src/modules/aura/streak-reward.ts:36-50` + `src/modules/shared/tenure-milestones.ts:40-45` | role-match |
| `src/modules/aura/daily-award.ts` (mod, `amount`) | utilidad | event-driven | él mismo (`:24-66`) | exacto |
| `src/modules/aura/types.ts` (mod, `profile_photo`) | tipo | — | `types.ts:3-20` (`stretch` de la 213) | exacto |
| `src/modules/attendance/service.ts`, `onboarding/service.ts`, `sessions/routes.ts`, `goal-plans/routes.ts`, `free-blocks-service.ts`, `stretch-service.ts`, `programs/service.ts`, `jobs/tenure-milestones.ts` (mod, monto explícito) | servicio | CRUD | ellos mismos | exacto |
| `src/db/migrations/0344_aura_revaluation.sql` (nuevo) | migración de datos | batch | `0183_backfill_lost_leads.sql` (respaldo + UPDATE) | exacto |
| `test/migrations/0344-aura-revaluation.test.ts` (nuevo) | test | batch | `test/backfill-lost-leads.test.ts` | exacto |
| `src/modules/sessions/proposed-time.ts` (nuevo) | utilidad pura | transform | `src/modules/tv/timer-spec.ts:63-110` | role-match |
| `test/unit/proposed-time.test.ts` (nuevo) | test unitario | transform | `test/unit/tenure-milestones.test.ts` | exacto |
| `test/sessions/complete-aura-rule.test.ts` (nuevo) y refactor de `complete-aura-cap.test.ts` y otros 4 a 6 | test integración | request-response | `test/sessions/complete-aura-cap.test.ts` | exacto |
| `src/modules/aura/earned.ts` (nuevo) | servicio | transform (GROUP BY) | `src/modules/aura/service.ts:155-162` (`getBalance`) | parcial |
| `src/modules/aura/movement-labels.ts` (nuevo) | utilidad pura | transform | `shared/tenure-milestones.ts:51-55` (`formatMilestoneLabel`) | parcial |
| `src/modules/aura/member-routes.ts` (nuevo) | ruta | request-response | `src/modules/bar-challenge/routes.ts:36-76` + `sponsors/member-routes.ts:22-42` | exacto |
| `src/modules/aura/module.ts` (mod, suma la ruta) | config de módulo | — | él mismo (`:34-42`) | exacto |
| `test/aura/member-aura.test.ts` (nuevo) | test integración | request-response | `test/scheduling/my-bookings-weeks.test.ts` + `test/tenancy/mod-01-guard.test.ts:199-225` | role-match |
| `src/modules/attendance/schemas.ts` y `routes.ts` (mod, `auraAwarded` y `auraTotal`) | schema + ruta | request-response | `attendance/schemas.ts:17-32,70-82` y `routes.ts:219-241` | exacto |
| `src/db/schema/member-photos.ts` (nuevo) | modelo | CRUD | `src/db/schema/stretch.ts` (tabla strict nueva) | exacto |
| `src/db/migrations/0345_aura_source_profile_photo.sql` (nuevo) | migración | — | `0342_aura_source_stretch.sql` | exacto |
| `src/db/migrations/0346_member_photos.sql` (nuevo) | migración | — | `0340_stretch_tables.sql:27-48` | exacto |
| `src/modules/conquer/private-media.ts` (mod, tercer parámetro de `presignGet`) | servicio | file-I/O | él mismo (`:99-110`, `:256-264`) | exacto |
| `src/modules/members/profile-photo-service.ts` (nuevo) | servicio | file-I/O + CRUD | `src/modules/conquer/body-check-service.ts:388-480` | exacto |
| `src/modules/members/profile-photo-routes.ts` (nuevo) | ruta alumno | request-response | `src/modules/conquer/member-routes.ts:318-376` | exacto |
| `src/modules/members/routes.ts` (mod, rutas admin por `:userId`) | ruta admin | request-response | `members/routes.ts:2018-2085` (photo upload-url) | exacto |
| `src/modules/auth/routes.ts` (mod, `/me` y delete-account) | ruta | request-response | él mismo (`:1092-1163`, `:1585`) | exacto |
| `src/db/tenant-tables.ts` + 4 tests de conteo + `test/helpers.ts` (mod) | registro | — | commit de `stretch_*` de la 213 | exacto |
| `test/members/profile-photo.test.ts` (nuevo) | test integración | file-I/O | `test/conquer/body-checks.test.ts` + `mockPrivateMedia` | exacto |
| `src/db/migrations/0347_member_profiles_community.sql` (nuevo) | migración | — | `0240_intro_stories.sql` | exacto |
| `src/db/schema/member-profiles.ts` (mod, 2 columnas) | modelo | — | él mismo (`:63-72`) | exacto |
| `src/modules/scheduling/attendees-service.ts` (nuevo) | servicio | CRUD (lectura con joins) | `scheduling/service.ts:384-399` (conteo de reservas) | role-match |
| `src/modules/scheduling/routes.ts` (mod, 3 rutas en `schedulingMemberRoutes`) | ruta | request-response | `scheduling/routes.ts:1403-1418` (`/trial-eligibility`) | exacto |
| `src/modules/scheduling/schemas.ts` (mod) | schema | — | `scheduling/schemas.ts:928-949` | exacto |
| `src/modules/shared/rate-limits.ts` (mod, `attendees`) | config | — | él mismo (`:7-20`) | exacto |
| Ajuste de tenant para el interruptor (nuevo, p. ej. `src/modules/scheduling/community-settings.ts`) | config | CRUD | `src/modules/conquer/settings.ts` | exacto |
| `test/scheduling/attendees.test.ts` (nuevo) | test integración | request-response | `test/scheduling/my-bookings-weeks.test.ts` | exacto |
| Manifiesto e ISO-03 (`test/tenant-manifest.ts`, `iso-01-manifiesto.test.ts`, `iso-03-*`) | gate | — | ver "Gates de tenancy" | exacto |
| `consultas/05`, `06`, `07` (SQL de solo lectura) | consulta | batch | `consultas/01-03` ya corridas | exacto |

### Admin (A7) y pantallas (B1 a B6), solo se nombra el análogo

| Archivo | Rol | Análogo más cercano |
|---|---|---|
| `el-templo-admin/src/components/AssignPlanDialog.vue` (A7, quitar selector de descuento) | componente | bloque del boarding pass retirado, mismo archivo `:373-378` |
| `el-templo-admin/src/components/ProgramWizardDialog.vue` (A7, defaults 8 y 50) | componente | él mismo (`:427-428`, `:669-670`) |
| `el-templo-app/src/modules/*/composables/useProfilePhoto.ts` (B1, lógica sin pantalla) | composable | `el-templo-app/src/modules/conquer/composables/useBodyCheckCamera.ts` |
| Encabezado único de Mi Templo (B2) | componente | `el-templo-app/src/layouts/MainLayout.vue:34-61` y `:111-139` (los dos bloques que se unifican) + `components/VeteranSeal.vue` |
| Lista de anotados y aviso (B3) | componente | `el-templo-app/src/pages/ReservasPage.vue` (diálogo de `onSlotTap`, ~836-853 y ~1895-1950) |
| Perfil: foto, interruptor, detalle de Aura (B4) | página | `el-templo-app/src/pages/ProfilePage.vue:17, 307-376` (iniciales inline y toggles de notificaciones) |
| Aviso de asistencia (B5) | página | `el-templo-app/src/pages/CheckInPage.vue:33-41, 143-150` |
| Revisión de fotos en el admin (B6) | página | `el-templo-admin/src/pages/FeedbackPage.vue:57-73` (pestañas con `canSee`) + `components/MemberPhotoUpload.vue` |

---

## Asignación de patrones

### A1. `src/modules/aura/amounts.ts` (nuevo, constantes)

**Análogos:** `src/modules/aura/streak-reward.ts:36-50` (forma de las constantes) y `src/modules/shared/tenure-milestones.ts:40-45` (función de monto por hito).

Forma a copiar (`streak-reward.ts:44-50`):

```typescript
export const STREAK_DEFAULTS = {
  MILESTONE_7_AURA: 20,
  MILESTONE_14_AURA: 35,
  MILESTONE_30_AURA: 50,
  MILESTONE_60_AURA: 100,
  MILESTONE_100_AURA: 200,
} as const;
```

`tenure-milestones.ts:40-45` es hoy la función `milestoneAura(months)` (3→50, 6→100, resto→250). Se mantiene la función con el mismo nombre (la usan `jobs/tenure-milestones.ts` y `shared/tenure-milestones.ts:125`) pero leyendo de `TENURE_AURA`. Los tests existentes la importan por nombre: `test/unit/tenure-milestones.test.ts:54-58,144-154`.

**Llamadas a `award` que hay que pasar a monto explícito** (todas verificadas por `grep -rn "\.award(\|awardOncePerLocalDay(" src`):

| Archivo:línea | Hoy | Nuevo |
|---|---|---|
| `attendance/service.ts:391, 563, 1041` | `amount: 10` | `AURA_AMOUNTS.attendance` (5) |
| `attendance/service.ts:1301` (reversa, `spend`) | `amount: 10` | `AURA_AMOUNTS.attendanceReversal` (5) |
| `onboarding/service.ts:71, 176` | `amount: 50` | `AURA_AMOUNTS.onboarding` (5) |
| `sessions/routes.ts:568` | sin monto (lee `aura_config`) | `AURA_AMOUNTS.training` (3) |
| `goal-plans/routes.ts:426` | sin monto | `AURA_AMOUNTS.goalPlan` (3) |
| `sessions/free-blocks-service.ts:542` | sin monto | `AURA_AMOUNTS.extraBlock` (2) |
| `sessions/stretch-service.ts:835` | sin monto | `AURA_AMOUNTS.stretch` (1) |
| `programs/service.ts:914, 930, 961` | `auraWeeklyBonus` y `auraCompletionBonus` de la fila | solo cambian los fallbacks `?? 15` y `?? 100` en `:108-109` y `:198-199`, y el default de `schema/micro-programs.ts:34-35` |
| `jobs/tenure-milestones.ts:173` | `milestone.aura` | sin cambio (sale de `milestoneAura`) |
| `aura/streak-reward.ts:136` | `bonusAmount` de config o `STREAK_DEFAULTS` | cambian los valores de `STREAK_DEFAULTS` (ver discrepancia 6) |

**`awardOncePerLocalDay` necesita `amount`.** Hoy no lo acepta y por eso las cuatro fuentes diarias leen `aura_config`. Parche exacto sobre `src/modules/aura/daily-award.ts:24-31` y `:44-50`:

```typescript
export interface DailyAwardInput {
  userId: number;
  sourceType: AuraSourceType;
  referenceType: string;
  /** Fecha local de la sede del socio, `YYYY-MM-DD`. */
  localDate: string;
  description?: string;
}
// ...
    await auraService.award({
      userId: input.userId,
      sourceType: input.sourceType,
      referenceType: input.referenceType,
      referenceId: Number(input.localDate.replace(/-/g, "")),
      description: input.description,
    });
```

Se agrega `amount: number` (obligatorio, para que ningún llamador vuelva a depender de la config) y se pasa en el `award`. Efecto colateral buscado: `AuraService.award` (`service.ts:54-67`) deja de tirar "No AURA config found" en los tests, porque `cleanAllTestData` vacía `aura_config`.

**Error a corregir de paso (onboarding).** `onboarding/service.ts:67-72` guarda en `auraAwarded` el valor que devuelve `award`, que es el **saldo nuevo**, no el monto:

```typescript
    let auraAwarded = 0;
    try {
      auraAwarded = await this.auraService.award({
        userId: input.userId,
        sourceType: "onboarding_completion",
        amount: 50,
        description: "Onboarding quiz completed",
      });
```

El arreglo es `await award(...)` seguido de `auraAwarded = AURA_AMOUNTS.onboarding`. Igual en `:173-176`.

**`AuraSourceType`:** agregar `"profile_photo"` al final de la unión (`aura/types.ts:3-20`), igual que se hizo con `"stretch"` (`:19-20`). Mismo valor al final de los dos enums de Drizzle: `schema/aura-transactions.ts:13-29` (`sourceTypeEnum`) y `schema/aura-config.ts` (`aura_config_source_type`).

---

### A2. `src/db/migrations/0344_aura_revaluation.sql` (nuevo, migración de datos)

**Análogo:** `src/db/migrations/0183_backfill_lost_leads.sql` (respaldo con `CREATE TABLE … AS SELECT` en `:40-44`, UPDATE por regla, sin `--> statement-breakpoint`).

Estructura del respaldo (`0183:40-44`):

```sql
CREATE TABLE users_lead_backup_0183 AS
SELECT id, status, lead_status, lead_status_source, converted_at, updated_at
FROM users
WHERE lead_status IS NOT NULL
   OR converted_at IS NOT NULL;
```

El fragmento SQL completo de la 0344 ya está escrito en `214-RESEARCH.md` ("Code Examples", líneas 1007-1039). No repetirlo acá: copiarlo tal cual. Lo que importa del análogo:

- **El runner parte por `;` antes de sacar comentarios** (`src/db/run-migrations.ts:47-65`). Si el archivo NO tiene `--> statement-breakpoint`, cada `;` corta. **Ningún `;` en comentarios ni en literales.**
- Si el archivo tiene `--> statement-breakpoint`, parte solo por esa marca y deja los comentarios dentro del statement (así está la 0340 y la 0342). Cualquiera de las dos formas sirve. La 0183 usa la primera, la 0342 la segunda.
- **Reejecución:** si un statement falla con "already exists", el runner marca `alreadyApplied` y saltea los errores siguientes (`run-migrations.ts:121-141`). Por eso el `CREATE TABLE …_backup_0344` va primero y los UPDATE siguen idempotentes.
- El nombre del respaldo **tiene que** terminar en `_backup_<n>` (`verify-tenant-uniques` lo reconoce como efímero), **sin** `tenant_id` y sin índices (nada de `CREATE TABLE … LIKE`). `users_lead_backup_0183` pasa hoy los gates 0192-0195 y 0196 con ese mismo patrón.

**Test analogo: `test/migrations/0344-aura-revaluation.test.ts`.** Copiar la mecánica de `test/backfill-lost-leads.test.ts`:

Extracción de los statements reales (`:54-58`):

```typescript
const MIGRATION_PATH = path.join(
  __dirname,
  "../src/db/migrations/0183_backfill_lost_leads.sql",
);
const reclassifyStmt = splitSqlStatements(
  fs.readFileSync(MIGRATION_PATH, "utf-8"),
).find((s) => s.trim().toUpperCase().startsWith("UPDATE"));
```

Cambios para la 0344: `.filter(...)` en vez de `.find(...)` (hay ~15 `UPDATE`), y también quedarse con los `UPDATE aura_balances … JOIN`. El test corre **dos veces** la lista completa y compara filas sembradas antes, después de la primera y después de la segunda (idempotencia). Además siembra una fila de monto raro y afirma que no se toca. Corre los statements con `app.db.execute(sql.raw(stmt))` (`backfill-lost-leads.test.ts:176-190`).

Exención de sentinel: `aura_transactions`, `aura_balances`, `aura_config` **no** son strict, así que no hace falta el comentario `/* tenant-safe: ... */` que sí lleva el test de la 0183 (`:154-165`, porque ahí el UPDATE toca `users`). `programs` está en `GYM_OWNED_TABLES` (`tenant-tables.ts:173`) pero no en `TENANT_STRICT_MODULES`, así que tampoco hace falta. Confirmarlo corriendo `lint:tenant` y el sentinel en CI.

Guard estático de punto y coma, copiar de `test/migrations/0342-aura-source-stretch.test.ts:88-95`:

```typescript
  it("guard estatico: ningun comentario SQL contiene punto y coma", () => {
    const source = readFileSync(MIGRATION, "utf8");
    const offenders = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("--") && line.includes(";"));
    expect(offenders).toEqual([]);
  });
```

**Gates de tenancy que dispara la 0344:** ninguno de ruta ni de tabla (solo datos y dos tablas de respaldo que ya tienen precedente). Sí hay que correr antes `grep -rn "termina en\|values.length - 1" test/migrations/` para la 0345 (ver A5).

**Tests de fuentes que afirman montos y hay que actualizar en el mismo plan que A1** (lista del RESEARCH §4, verificada en parte): `test/attendance/attendance.test.ts:346` y `:896-909` (`r.amount === 10` y `filter((r) => r.amount === 10)`), `test/attendance/attendance-cross-tenant.test.ts`, `test/onboarding/onboarding.test.ts`, `test/unit/tenure-milestones.test.ts`, `test/jobs/tenure-milestones.test.ts`, `test/scheduling/scheduling.test.ts:3155`, `test/sessions/stretch-complete.test.ts:293`, `test/sessions/free-blocks-complete.test.ts:291,358`, `test/streaks/streak-service.test.ts:244`, `test/sessions/session-complete-streak.test.ts:125`. Regla: afirmar contra `AURA_AMOUNTS.*` y no contra literales.

---

### A3. `src/modules/sessions/proposed-time.ts` (nuevo, utilidad pura)

**Análogo principal:** `src/modules/tv/timer-spec.ts:63-110` (`toTimerSpec`), la tabla de formatos a tiempo que el RESEARCH §5 manda reutilizar. Es pura y ya está testeada.

Excerpt (`timer-spec.ts:63-86`):

```typescript
export function toTimerSpec(
  params: FormatParams | null,
  exerciseCount = 1,
): TimerSpec {
  if (!params) return COUNTUP;

  switch (params.type) {
    case "tabata": {
      const workMs = sanitizeMs(params.workSeconds, MS_PER_SECOND);
      const restMs = sanitizeMs(params.restSeconds, MS_PER_SECOND);
      if (workMs + restMs <= 0) return COUNTUP;
      return {
        kind: "work_rest",
        workMs,
        restMs,
        rounds: sanitizeRounds(params.rounds),
      };
    }
```

El `TimerSpec` (`tv/types.ts:35-43`) es una unión de cuatro formas:

```typescript
export type TimerSpec =
  | { kind: "work_rest"; workMs: number; restMs: number; rounds: number }
  | { kind: "interval"; intervalMs: number; rounds: number }
  | { kind: "countdown"; totalMs: number }
  | { kind: "countup" };
```

Cómo mapear a segundos propuestos: `countdown` → `totalMs/1000`; `work_rest` → `(workMs+restMs)*rounds/1000`; `interval` → `intervalMs*rounds/1000`; **`countup` → estimación por repeticiones** (copiar la fórmula de la app, `el-templo-app/src/modules/training/utils/blockMeta.ts:103-114`):

```typescript
export function estimatedMinutes(b: Pick<Block, 'exercises' | 'formatParams'>): number {
  let seconds = 0
  for (const ex of b.exercises) {
    const hasSeconds = ex.seconds !== null && ex.seconds > 0
    const work = hasSeconds ? (ex.seconds ?? 0) : (ex.reps ?? 0) * SECONDS_PER_REP
    seconds += work + (ex.rest > 0 ? ex.rest : 0)
  }
  const rounds =
    positiveNumber(b.formatParams?.rounds) ?? positiveNumber(b.formatParams?.totalRounds)
  const total = seconds * (rounds ?? 1)
  return Math.max(1, Math.round(total / 60))
}
```

(`SECONDS_PER_REP = 3` según el RESEARCH, constante del mismo archivo.) En la API los campos equivalentes son `ExercisePrescription.reps`, `.seconds`, `.rest` (`sessions/types.ts:141-150`, todos `number`, no `null`).

**Trampa para el planificador:** `toTimerSpec` colapsa "con tope" (`for_time`, `death_by`…) a `countdown` por medio de `capOrCountup` (`timer-spec.ts:50-52`), pero la regla del RESEARCH pide `min(estimación, tope)`. Con `countdown` ya no se distingue "tiempo fijo" de "tope". Opciones: (a) usar `toTimerSpec` y tratar siempre `countdown` como tiempo propuesto (más simple, y terminar antes del tope sigue contando porque el piso es 80 % del tope, **más duro** para el alumno que termina rápido), o (b) mirar `params.type` antes. El RESEARCH recomienda (b) para esos formatos. Decirlo en el plan.

**Bloques requeridos** (copiar la lógica de `el-templo-app/src/modules/training/composables/useSessionPlayer.ts:66-120`, que el RESEARCH §5 cita): con `DEUTEROS_1`/`DEUTEROS_2` presentes, requeridos = `INITIUM`, `NUCLEUS`, el Deuteros presente en `blocksCompleted` y `ATHLOS` o `EPIKOS`. Sin Deuteros, todos. El cuerpo trae `blocksCompleted: string[]` con roles (`sessions/schemas.ts:328-351`). `BlockPlan.role` es el rol (`sessions/types.ts:165-178`).

**Origen de los bloques:** `sessionService.getSessionByDayId(dayId, true)` devuelve `DaySession` con `blocks: BlockPlan[]` (`sessions/service.ts:574-600`). El plan a medida usa la misma reconstrucción (`goal-plans/service.ts:735-738`).

**Punto de integración en el handler `/sessions/complete`** (`sessions/routes.ts`):

- Duración del servidor, `:477-485`:

```typescript
      const completedAt = new Date();
      const startedAtDate = new Date(startedAt);
      const durationSec = Math.max(
        0,
        Math.floor((completedAt.getTime() - startedAtDate.getTime()) / 1000),
      );
```

- Premio, `:556-575` (envuelto en `try/catch` que **nunca rompe el cierre**; esa forma se conserva):

```typescript
      try {
        const localDate = await localDateForBranch(
          fastify.db,
          ctx,
          user.branchId,
        );
        await awardOncePerLocalDay(auraService, request.log, {
          userId,
          sourceType: "training_completion",
          referenceType: "training_day",
          localDate,
        });
      } catch (auraErr: unknown) {
        request.log.warn(
          { err: auraErr, userId, dayId },
          "AURA award failed for session completion",
        );
      }
```

Se inserta la decisión de la regla **antes** de `awardOncePerLocalDay` y dentro del mismo `try`. La racha (`streakService.updateStreak`) y el programa (`recordSessionForProgram`) quedan abajo, sin condición. El plan a medida (`goal-plans/routes.ts:350-372` arma `startedAtDate` y `updateFields` sin `duration`; el premio está en `:418-440`) repite el mismo punto.

**Asistencia del mismo día** (D-20): consulta a `schema.attendance` con `tenantWhere(schema.attendance, ctx)`, `eq(attendance.memberId, userId)` y `eq(attendance.sessionDate, localDate)`. Columnas reales: `sessionDate` (`schema/attendance.ts:47`, `date` modo string) y `source` (`:50`). Cualquier origen cuenta.

**Log obligatorio** (RESEARCH §5 punto 5): `request.log.info({ dayId, proposedSec, durationSec, ratio, blocksOk, attendedToday, awarded }, "Regla de Aura de la sesión")`. Nunca `console.log`.

**Tests.**
- Unitario de la pura: copiar la estructura de `test/unit/tenure-milestones.test.ts:1-30` (sin DB, solo `describe/it/expect`, importa del módulo por ruta relativa).
- Integración: el esqueleto de `test/sessions/complete-aura-cap.test.ts`. Ojo con el setup (`:93-130`): hoy manda `startedAt: new Date().toISOString()` y `blocksCompleted: ["INITIUM","NUCLEUS"]` (`:51-60`) y siembra `aura_config` con 10. Con la regla **ese test deja de dar Aura**: hay que sembrar una sesión con bloques y prescripciones (`seedApprovedSession` en `test/helpers.ts:831-868` crea la sesión con `blockCount: 0`, sin bloques) y mandar un `startedAt` que alcance el 80 %. Hace falta un helper nuevo en `test/helpers.ts` (o `test/sessions/_aura-fixtures.ts`), pedido por el RESEARCH en Wave 0. Quitar también la siembra de `aura_config` (ya no se lee).
- Archivos que afirman Aura al completar y hay que migrar al helper: `test/sessions/complete-aura-cap.test.ts`, `test/goal-plans/complete-aura-cap.test.ts`, `test/streaks/streak-service.test.ts:244`, `test/sessions/session-complete-streak.test.ts:125`, y revisar `test/sessions/sessions.test.ts` y `test/goal-plans/goal-plans.test.ts`.

**Gates de tenancy:** ninguno nuevo (no hay ruta ni tabla). Solo `lint:tenant` sobre la lectura de `attendance` (ya cubierta por `tenantWhere`).

---

### A4. `src/modules/aura/earned.ts`, `movement-labels.ts`, `member-routes.ts` (nuevos)

#### `earned.ts` (servicio, GROUP BY)

**Análogo:** `src/modules/aura/service.ts:155-162` (`getBalance`), pero **sin** su hueco de tenant. `AuraService` está en la allowlist del lint (`tenant-lint-allowlist.json:211-220`) y **la allowlist no se puede agrandar**: el archivo nuevo usa `tenantWhere(schema.auraTransactions, ctx)`.

Patrón a copiar para el estilo de tenancy (`aura/daily-award.ts:72-86`, un `select` con `and(tenantWhere(...), eq(...))`):

```typescript
  const [branch] = await db
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, branchId)),
    )
    .limit(1);
```

La consulta de "Aura ganada" es la de RESEARCH §Patrón 2 (líneas 246-256): `SUM(amount)` por `user_id IN (:ids)` excluyendo `source_type = 'subscription_discount'` y el canje (`source_type = 'manual_adjustment' AND reference_type = 'subscription'`, que es como `aura/pricing-benefits.ts:208-213` registra un canje). Una sola consulta para los 20 anotados.

#### `movement-labels.ts` (utilidad pura)

**Análogo:** `shared/tenure-milestones.ts:51-55` (`formatMilestoneLabel`, texto en español con voseo). Se importa para el motivo `tenure_milestone`. La tabla de textos está en RESEARCH §7 (líneas 778-792).

#### `member-routes.ts` (ruta del alumno, montada como módulo)

**Análogo A (módulo + estilo de guard):** `src/modules/bar-challenge/routes.ts:36-76`:

```typescript
export const barChallengeRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require an authenticated member token (T-115-11).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  fastify.post<{ Body: SubmitResultBody }>(
    "/result",
    { schema: submitResultSchema },
    async (request, reply) => {
      const { userId } = request.user;
      // ...
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "bar-challenge.submit");
```

**Análogo B (schema de respuesta y `handleServiceError`):** `src/modules/sponsors/member-routes.ts:22-42`:

```typescript
  fastify.get(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: { response: memberSponsorsResponseSchema },
    },
    async (request, reply) => {
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sponsors.member.list");

      try {
        return await service.listForMember(ctx, request.user.userId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.member.list");
      }
    },
  );
```

Reglas para los dos handlers (`GET /summary`, `GET /movements`):
- `userId` solo de `request.user.userId`. **Sin `:userId` en la ruta**: leer lo de otro es imposible por construcción (D-12).
- **Staff → 404** `{ error: "No encontrado" }` si `ALL_STAFF_ROLES.includes(request.user.role)` (`shared/permissions.ts:11-27`). Cuidado con el tipo: `(ALL_STAFF_ROLES as readonly string[]).includes(...)`, igual que `members/routes.ts:168`.
- Schemas de respuesta declarados completos (fast-json-stringify recorta lo no declarado).
- Paginación por keyset `id DESC` con `limit + 1` (RESEARCH §7), `amount <> 0`, límite máximo 50, con `type: "integer", minimum, maximum` en el querystring.

**Registro:** `src/modules/aura/module.ts:34-37`:

```typescript
export const temploGamificationModule: ModuleDef = {
  name: "templo-gamification",
  routes: [{ plugin: barChallengeRoutes, prefix: "/api/bar-challenge" }],
```

Se agrega `{ plugin: auraMemberRoutes, prefix: "/api/members/aura" }` al arreglo `routes`. Hay que actualizar también el docblock de `module.ts:14-24`, que hoy afirma "AURA no expone rutas propias" (quedaría falso).

**Test.** Nuevo `test/aura/member-aura.test.ts` (el directorio `test/aura/` no existe, se crea). Esqueleto: `test/scheduling/my-bookings-weeks.test.ts:34-70` (`createTestApp`, `cleanAllTestData`, `registerUser`, `getAuthToken`). Para sembrar movimientos: INSERT directo a `schema.auraTransactions` más `seedAuraBalance` (`test/helpers.ts:812-824`). Casos del RESEARCH §7 (líneas 794-799) y D-37: cada alumno ve solo lo suyo, staff 404, filas de 0 no salen, paginación sin repetir ni saltear, suma de movimientos = `earned`. Agregar un caso de módulo apagado con el patrón de `test/tenancy/mod-01-guard.test.ts:199-225` (`setModuleFlag(app, TENANT_DOS, "templo-gamification", false)` → 404 con `BODY_404_DEL_GUARD`).

**Gates de tenancy:**
- **ISO-01:** 2 entradas nuevas, `categoria: "templo-module", modulo: "templo-gamification"`. Ubicar junto a `test/tenant-manifest.ts:2055-2060` (bloque `templo-gamification`):

```typescript
  "POST /api/bar-challenge/result": {
    categoria: "templo-module",
    modulo: "templo-gamification",
  },
```

- **ISO-03:** no aplica (`/api/members/aura` no está bajo ningún prefijo ISO-03, ver discrepancia 3).
- **Conteos de tabla:** ninguno (no hay tabla nueva).
- **`lint:tenant`:** `earned.ts` con `tenantWhere`.

#### Check-in con `auraAwarded` y `auraTotal` (mismo plan)

**Análogo:** `attendance/schemas.ts:70-82` y `attendance/routes.ts:219-241`.

Schema actual (`schemas.ts:70-82`):

```typescript
export const memberCheckInSchema = {
  body: { type: "object", required: ["qrToken"], properties: { qrToken: { type: "string", minLength: 1 } } },
  response: {
    201: attendanceRecordSchema,
    400: errorSchema,
  },
};
```

La respuesta del handler (`routes.ts:229-240`) hace `reply.code(201).send({ ...record, branchName: appBranchName(...) })`. Se crea `memberCheckInResponseSchema` **en el mismo archivo** (RESEARCH, Code Examples líneas 1068-1081) y se cambia solo `201:` de `memberCheckInSchema`. **No tocar `attendanceRecordSchema`**: lo comparten el check-in forzado y el del admin. `auraAwarded` y `auraTotal` van `null` para staff y con el módulo apagado (`isModuleEnabled(ctx.tenantId, "templo-gamification", fastify.db)`, firma en `shared/module-flags.ts:121-128`).

Tests: ampliar `test/attendance/attendance.test.ts` (casos de `:335-350`).

---

### A5. Foto propia del lado del servidor

#### `src/db/schema/member-photos.ts` (modelo) y migración `0346_member_photos.sql`

**Análogo:** `src/db/schema/stretch.ts` (tabla strict nueva con `tenantIdColumn()` y FKs) y `src/db/migrations/0340_stretch_tables.sql:27-48`:

```sql
CREATE TABLE `stretch_catalog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  ...
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stretch_catalog_tenant_exercise` (`tenant_id`, `exercise_id`),
  KEY `idx_stretch_catalog_tenant_family` (`tenant_id`, `family`, `sort_order`),
  CONSTRAINT `fk_stretch_catalog_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_stretch_catalog_exercise` FOREIGN KEY (`exercise_id`) REFERENCES `exercises` (`id`)
);
```

Reglas: `tenant_id int NOT NULL DEFAULT 1` + FK a `tenants`, FK a `users` con `ON DELETE CASCADE` como `fk_stretch_offers_user`, **sin uniques nuevas** (solo `KEY`, así no hay entrada en `TENANT_UNIQUE_ALLOWLIST`; el RESEARCH §2 impone la invariante "una pendiente y una aprobada" en el service). El primer argumento de `mysqlEnum` es el **nombre físico** de la columna: `member_photo_status` byte a byte igual en schema y SQL (hard rule 6 de `el-templo-db-migrations`). Timestamps NULL con `NULL DEFAULT NULL` explícito (`stretch_offers` lo hace) para que MySQL no auto-pueble el primero. Exportar desde `src/db/schema/index.ts` (la 213 está en `:28`).

#### `0345_aura_source_profile_photo.sql`

**Análogo exacto:** `0342_aura_source_stretch.sql` completo. Copiar sus 3 secciones cambiando `'stretch'` por `'profile_photo'` en los **dos** `MODIFY COLUMN ... ENUM(...)` (nombres físicos distintos: `source_type` en `aura_transactions`, `aura_config_source_type` en `aura_config`), valores existentes + `profile_photo` al final, y la sección 3 (`:80-83`):

```sql
INSERT IGNORE INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
VALUES ('stretch', 5, 'Estiramiento post-clase del día', 1);
```

→ `('profile_photo', 5, 'Foto de perfil subida', 1)`. Sin `;` en comentarios.

**Test:** copiar `test/migrations/0342-aura-source-stretch.test.ts:45-95` cambiando `stretch` por `profile_photo` (INFORMATION_SCHEMA, "las dos listas son idénticas", "conserva los anteriores", guard estático de `INSERT IGNORE` y de `;`). Mantener el comentario de no afirmar "termina en" (`:56-58`). **Antes de commitear:** `grep -rn "termina en\|values.length - 1" el-templo-api/test/migrations/` (el `stretch` de la 0342 ya rompió una vez los tests 0285-0286).

#### Registro de la tabla y los 5 conteos fijos (mismo commit que el schema y la 0346)

Es lo que `tsc` y `lint:tenant` no ven. Basado en cómo entró `stretch_*`:

| # | Archivo:línea | Cambio |
|---|---|---|
| 1 | `src/db/tenant-tables.ts:~149` (`GYM_OWNED_TABLES`, orden alfabético, junto a `"member_logins"`/`"member_notes"`/`"member_profiles"`) | agregar `"member_photos"` |
| 2 | `src/db/tenant-tables.ts:679-688` (`TENANT_STRICT_MODULES.members`) | agregar `"member_photos"` en orden alfabético |
| 3 | `test/db/tenant-tables.test.ts:135-140` | `GYM_OWNED_TABLES.length` 135 → 136, `schemaTables.size` 140 → 141, más el comentario histórico (`:146-148` es el modelo) |
| 4 | `test/db/tenant-tables.test.ts:457-466` (espejo de `members`) | agregar `"member_photos"` |
| 5 | `test/migrations/0192-0195-tenant-columns.test.ts:~207` (`gymOwnedChecked`) | 135 → 136, y la línea de comentario `// + member_photos (fase 214, mig 0346, nace strict) = 136.` |
| 6 | `test/migrations/0196-tenant-unique-contracts.test.ts:~651-665` | 135 → 136 en los dos `toBe(135)` y en el texto del mensaje (`"las 135 tablas gym-owned"`) más el sumando `+ member_photos de la fase 214 mig 0346` |
| 7 | `test/helpers.ts:~248-249` (`TABLES_TO_CLEAN`) | `schema.memberPhotos` junto a `schema.stretchOffers` (línea 249), antes de `users` (FK a `users`) |

Excerpt del modelo (`test/helpers.ts:247-249`):

```typescript
  // Estiramiento post-clase (0340): FK a users, attendance y branches, sale antes.
  schema.stretchOffers,
```

Verificar con `grep -rn "gymOwnedChecked\|MODULOS_DECLARADOS\|GYM_OWNED_TABLES.length" el-templo-api/test` antes de cerrar (Pitfall 7 del RESEARCH).

Además: la limpieza del segundo gimnasio en fixtures (`test/fixtures/second-tenant.ts`, `limpiarSegundoGimnasio`) si los tests ISO-03 siembran filas de `member_photos` del gimnasio 2.

#### `private-media.ts` (mod): tercer parámetro de `presignGet`

**Análogo:** el mismo archivo. Interfaz (`private-media.ts:99-110`) y implementación (`:256-264`):

```typescript
export interface PrivateMediaStore {
  presignPut(key: string, contentType: string, expiresSec: number): Promise<string>;
  presignGet(key: string, expiresSec: number): Promise<string>;
  head(key: string): Promise<PrivateMediaHead | null>;
  remove(key: string): Promise<void>;
}
// ...
      presignGet: (key, expiresSec) =>
        getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseCacheControl: "no-store",
          }),
          { expiresIn: expiresSec },
        ),
```

Extender con un tercer parámetro **opcional** `opts?: { stableHourly?: boolean }` (el patrón 3 del RESEARCH, `signingDate` redondeada a la hora y `ResponseCacheControl: "private, max-age=3600"`). Conquer no cambia (parámetro opcional) y sus tests usan `vi.spyOn(privateMediaResolver, "resolve")`. **El `mockPrivateMedia` del helper** (`test/conquer/_helpers.ts:1241-1255`) construye un `PrivateMediaStore` completo: agregar el parámetro no lo rompe porque las firmas de los dobles son `async (key) => ...`.

Test unitario: `test/unit/conquer-private-media.test.ts` (existe) para la regla del `signingDate` redondeado y de la clave del avatar.

Constantes de clave nuevas (`private/avatars/{tenant}/{user}/{uuid}.jpg`) y `isOwnAvatarKey`: copiar `privateCorrectionVideoKey` y `isOwnCorrectionVideoKey` (`private-media.ts:134-143` y `:155-165`) con un solo tipo de contenido (`jpg`):

```typescript
export function isOwnCorrectionVideoKey(key: string, tenantId: number, userId: number): boolean {
  if (![tenantId, userId].every((n) => Number.isInteger(n))) return false;
  return new RegExp(
    `^${CORRECTION_KEY_PREFIX}/${tenantId}/${userId}/alumno-${UUID_PATTERN}\\.(mp4|mov)$`,
  ).test(key);
}
```

El prefijo nuevo **no** debe empezar con `private/conquer/` ni `private/conquer-corrections/` (la regla de 60 días de R2 va sobre el segundo). `private/avatars/` no cae en ninguno.

#### `profile-photo-service.ts` (nuevo, servicio file-I/O + CRUD)

**Análogo exacto:** `src/modules/conquer/body-check-service.ts:388-480`. Tres piezas a copiar:

`callStore` (`:388-402`), traduce cualquier falla de R2 a 503 genérico sin loguear claves:

```typescript
async function callStore<T>(
  fastify: FastifyInstance,
  info: { checkId: number; pose: ConquerPose },
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (err: unknown) {
    fastify.log.warn(
      { ...info, errName: err instanceof Error ? err.name : "unknown" },
      "conquer photo storage call failed",
    );
    throw new PhotoStorageUnavailableError();
  }
}
```

`requestPhotoUpload` (`:412-440`). Orden de errores: **propio (404) → storage (503) → tipo (400)**. Reutilizar `PhotoStorageUnavailableError` de `private-media.ts:77-81` (código `CONQUER_FOTOS_NO_DISPONIBLES`: para la foto de perfil conviene una subclase o un código propio, para no filtrar "conquer" en un mensaje del alumno):

```typescript
  const store = privateMediaResolver.resolve(fastify);
  if (!isPhotoContentType(contentType)) {
    throw new AppError("Solo se aceptan fotos JPG, PNG o WebP", 400, "CONQUER_FOTO_TIPO_INVALIDO");
  }
  const key = privateCheckPhotoKey({ ... });
  const uploadUrl = await callStore(fastify, { checkId: check.id, pose }, () =>
    store.presignPut(key, contentType, PRIVATE_PUT_EXPIRES_SEC),
  );
  return { uploadUrl, key, contentType, expiresIn: PRIVATE_PUT_EXPIRES_SEC };
```

`confirmPhoto` (`:447-480`). Clave propia con regex anclada (400) → HEAD (409 si no existe, 400 si `contentLength <= 0`, `> PHOTO_MAX_BYTES` o tipo distinto de `image/jpeg`) → guardar:

```typescript
  if (!isOwnPhotoKey(key, ctx.tenantId, userId, check.id, pose)) {
    throw new AppError("La foto no es válida", 400, "CONQUER_FOTO_CLAVE_INVALIDA");
  }
  const head = await callStore(fastify, { checkId: check.id, pose }, () => store.head(key));
  if (head === null) {
    throw new AppError("Todavía no se subió esa foto", 409, "CONQUER_FOTO_NO_SUBIDA");
  }
```

Cambios: solo `image/jpeg`, tope `PHOTO_MAX_BYTES` (8 MB, `private-media.ts:68`) y `PRIVATE_PUT_EXPIRES_SEC = 600` (`:71`) reutilizados.

**Estados y transacción:** una pendiente y una aprobada por persona, impuesto con `SELECT … FOR UPDATE` dentro de `db.transaction` (RESEARCH §2). El patrón de transacción con `FOR UPDATE` está en `aura/service.ts:113-124`:

```typescript
    return await this.db.transaction(async (tx) => {
      const balanceRows = await tx.execute(
        sql`SELECT balance FROM aura_balances WHERE user_id = ${userId} FOR UPDATE`,
      );
```

**Aura al aprobar, una sola vez de por vida.** Copiar el manejo de duplicado de `aura/daily-award.ts:44-65`:

```typescript
  try {
    await auraService.award({ ... });
    return true;
  } catch (err: unknown) {
    const { isDuplicate, detail } = isDuplicateKeyError(err);
    if (isDuplicate) {
      log.info(logCtx, "AURA del dia ya cobrada");
    } else {
      log.warn({ ...logCtx, detail }, "No se pudo acreditar la AURA del dia");
    }
    return false;
  }
```

con `sourceType: "profile_photo"`, `referenceType: "profile_photo"`, **`referenceId: userId`** (no NULL: el unique del ledger no protege `reference_id` NULL), `amount: AURA_AMOUNTS.profilePhoto`. `isDuplicateKeyError` está en `shared/sql-errors.ts:6-27`.

**Rechazo con push:** `queueAdHocNotification` como `jobs/tenure-milestones.ts:193-201`:

```typescript
      await notifications.queueAdHocNotification(
        {
          userId: member.id,
          title: `🎉 ¡${milestone.label} en El Templo!`,
          body: `Hoy cumplís ${milestone.label} entrenando con nosotros. ¡Gracias por bancar la barra! 💪`,
          category: "motivacion",
        },
        ctx,
      );
```

(Firma en `notifications/service.ts:509`. Elegir categoría adecuada y envolver en `try/catch` best-effort, como allí.)

#### `profile-photo-routes.ts` (rutas del alumno)

**Análogo exacto:** `src/modules/conquer/member-routes.ts:318-376` (upload-url y confirm). Patrón de la ruta:

```typescript
  fastify.post<{ Params: ...; Body: { contentType: string } }>(
    "/body-checks/:checkId/photos/:pose/upload-url",
    { onRequest: [fastify.authenticate], schema: photoUploadUrlSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.photo_upload");
        return await requestPhotoUpload(fastify, ctx, request.user.userId, ...);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.photo_upload");
      }
    },
  );
```

Para el módulo de miembros usar `handleServiceError` (`shared/error-handler`), no `sendConquerError`. Rutas y prefijo: un plugin con prefijo `/api/members` y rutas `/profile-photo/upload-url`, `/profile-photo/confirm`, `DELETE /profile-photo`, `POST /profile-photos/:photoId/report`. Registro en `src/app.ts` junto a `attendanceMemberRoutes` (`:282-285`):

```typescript
  await app.register(attendanceMemberRoutes, {
    prefix: "/api/members/attendance",
  });
```

Estas rutas son **core, `tenant-scoped`**, no `templo-module` (a diferencia de las de Conquer, `tenant-manifest.ts:1800`). Reporte: `photoId` es un id opaco solo para reportar; recurso ajeno = 404 (tenantWhere en el SELECT).

#### Rutas del admin (en `members/routes.ts`, por `:userId`)

**Análogo exacto:** `members/routes.ts:2018-2085`, la ruta `POST /:userId/photo/upload-url`. Lo que hay que copiar:

1. Resolver el socio **antes** que la disponibilidad de storage, con `tenantWhere` + `isNull(users.deletedAt)`, y 404 indistinguible:

```typescript
      const ctx = assertTenant(request.scope, "members.photo");
      const [target] = await fastify.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, ctx),
            eq(schema.users.id, request.params.userId),
            isNull(schema.users.deletedAt),
          ),
        )
        .limit(1);
      if (!target) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }
```

2. Validar el input antes del 503 de storage. El plugin ya aplica `enforceMemberBranchScope(fastify.db)` como `preHandler` (`:183`) y el guard `MEMBER_ROLES` (`:167-176`): **por eso las rutas deben ser `/:userId/profile-photo/approve|reject` y `DELETE /:userId/profile-photo`**. `enforceMemberBranchScope` solo lee `params.userId` o `params.memberId` (`shared/branch-access.ts:491-501`); con `:photoId` el `admin_sede` pasaría a otra sede.

3. **La cola** `GET /profile-photos` **no tiene `:userId`**, el hook no la cubre. Hay que acotar a mano por sede, como el listado de `members/routes.ts:622-634`:

```typescript
      branchIds: enforcedBranchIds(request.scope) ?? undefined,
```

(`enforcedBranchIds` en `shared/branch-access.ts:338`. Un arreglo vacío significa "no ve nada".) Registrar `GET /profile-photos` antes de las rutas con `/:userId` (el archivo ya lo hace con `/branches`, `:174-175`).

**Roles que aprueban:** `MEMBER_ROLES` (decisión 9 del RESEARCH, recomendación), la misma lista del guard del plugin, sin cambios.

#### `/auth/me` y delete-account (mod en `auth/routes.ts`)

- `/me` (`:1119-1163`, sin schema de respuesta, no recorta campos). Los campos nuevos (`photo`, `communityVisible`, `auraVisible`) van al lado de `memberSince`. La lectura de `member_profiles` ya existe en `:1092-1107` (agregar `communityVisible` al `select`). `auraVisible = !ALL_STAFF_ROLES.includes(user.role)`.
- delete-account (`:1570-1588`): el `update(users).set({ ..., photoUrl: null, ... })` de `:1585`. Agregar, después, marcar `quitada` las filas de `member_photos` del usuario y `remove` best-effort de los objetos (con `privateMediaResolver.resolve` dentro de `try/catch`: si R2 no está configurado no debe romper el borrado).

#### Test: `test/members/profile-photo.test.ts`

**Análogo exacto:** `test/conquer/body-checks.test.ts:1-70` (cabecera de rutas, imports de `isOwnPhotoKey`/`PHOTO_MAX_BYTES`, `mockPrivateMedia`, `cleanAllTestData`, `seedSecondTenant`) y el doble de storage `test/conquer/_helpers.ts:1241-1255`:

```typescript
export function mockPrivateMedia(overrides: Partial<PrivateMediaStore> = {}) {
  const fakeStore: PrivateMediaStore = {
    presignPut: async (key) => `https://r2.test/put/${key}`,
    presignGet: async (key) => `https://r2.test/get/${key}`,
    head: async () => ({ contentLength: 1024, contentType: "image/jpeg" }),
    remove: async () => undefined,
    ...overrides,
  };
  return vi.spyOn(privateMediaResolver, "resolve").mockReturnValue(fakeStore);
}
```

`mockPrivateMedia` vive en `test/conquer/_helpers.ts`: importarlo desde ahí o moverlo a un helper compartido (decisión del plan; moverlo toca los tests de Conquer). Casos: subir, pendiente, aprobar (Aura 5 una sola vez), rechazar, quitar, reportar, HEAD que rechaza no-JPEG y > 8 MB, 503 sin storage, `admin_sede` limitado a su sede. En `afterEach`: `vi.restoreAllMocks()`.

**Gates de tenancy de A5:**
- **ISO-01:** 8 entradas `tenant-scoped` nuevas (4 de alumno + 4 de admin, ver lista en "Gates de tenancy").
- **ISO-03 members:** 4 casos (`GET /api/admin/members/profile-photos`, `POST .../:userId/profile-photo/approve`, `.../reject`, `DELETE .../:userId/profile-photo`), cada uno con aislamiento (404 sobre un socio de El Templo desde el gimnasio 2) + control positivo. `CASOS_BASELINE` 38 → 42 en `iso-03-cobertura-members.test.ts:~187`. Modelo del caso: `iso-03-members-ficha.test.ts:1057-1125`:

```typescript
describe("URL de subida de foto — POST /api/admin/members/:userId/photo/upload-url", () => {
  const RUTA = "POST /api/admin/members/:userId/photo/upload-url";

  it("aislamiento: pedir la URL para un socio de El Templo se rechaza, y su photo_url NO cambia (T-173-27-06)", async () => {
    const fotoAntes = await fotoDelUsuario(templo.userId);
    const res = await comoGimnasioDos("POST", `/${templo.userId}/photo/upload-url`, { filename: "intento.jpg" });
    expect(res.statusCode, porQueImportaLaFicha(RUTA, templo.userId) + ` Respuesta: ${res.body}`).toBe(404);
```

  El control positivo de este análogo ya contempla que **R2 no está configurado en CI** (`:1081-1085`): se afirma "no 404" y 503 cuando no hay storage. En el caso nuevo se puede usar `mockPrivateMedia` para llegar a 200.
  El archivo de destino es `iso-03-members-ficha.test.ts` (los `describe` deben llevar la clave de manifiesto `POST /api/admin/members/:userId/...` literal, porque el gate las extrae con regex: `iso-03-cobertura-members.test.ts`, `clavesDeLosDescribe`).
- **Conteos de tabla:** los 7 de la tabla de arriba.
- **ISO-03 de las rutas del alumno:** no aplica (sin prefijo).

---

### A6. Anotados, visibilidad y preferencia

#### `0347_member_profiles_community.sql` + `schema/member-profiles.ts`

**Análogo exacto:** `src/db/migrations/0240_intro_stories.sql`:

```sql
ALTER TABLE member_profiles
  ADD COLUMN intro_stories_seen_at TIMESTAMP NULL,
  ADD COLUMN intro_stories_completed_at TIMESTAMP NULL,
  ADD COLUMN intro_stories_last_slide INT NULL;
```

→ `ADD COLUMN community_visible TINYINT(1) NULL, ADD COLUMN community_notice_seen_at TIMESTAMP NULL`. Todas NULL: NULL = regla por defecto. Schema: agregar las dos columnas a `member-profiles.ts:63-72` (`communityVisible: boolean("community_visible")`, `communityNoticeSeenAt: timestamp("community_notice_seen_at")`). Agregar columnas **no** dispara los conteos fijos de tabla.

El upsert contra carreras, para `PUT visibility` y `POST notice-seen`, ya está probado: `auth/routes.ts:1448-1465`:

```typescript
        await fastify.db
          .insert(memberProfiles)
          .values(
            tenantValues(ctx, {
              userId,
              introStoriesSeenAt: event === "seen" ? now : null,
              ...
            }),
          )
          .onDuplicateKeyUpdate({
            set: {
              introStoriesSeenAt: sql`COALESCE(intro_stories_seen_at, VALUES(intro_stories_seen_at))`,
              ...
            },
          });
```

Para `notice-seen` usar `COALESCE(community_notice_seen_at, VALUES(community_notice_seen_at))` (idempotente). Para `visibility` el `set` pisa `community_visible`. No mirar `affectedRows` (FOUND_ROWS de mysql2, comentario de `:1440-1447`, `reference_mysql2_found_rows`). Un socio freemium puede no tener fila de `member_profiles` (`:1434-1440`), por eso el insert-o-update.

#### `attendees-service.ts` (nuevo, lectura con joins)

**Análogo:** `scheduling/service.ts:384-399`, el conteo de reservas vigentes (la grilla semanal), del que sale `bookedCount`:

```typescript
      const bookingCounts = await this.db
        .select({
          scheduleId: schema.bookings.scheduleId,
          bookingDate: schema.bookings.bookingDate,
          bookedCount: sql<number>`SUM(CASE WHEN ${schema.bookings.isTrial} = FALSE THEN 1 ELSE 0 END)`,
          ...
        })
        .from(schema.bookings)
        .where(
          and(
            tenantWhere(schema.bookings, ctx),
            inArray(schema.bookings.scheduleId, scheduleIds),
            gte(schema.bookings.bookingDate, weekStartDate),
            lte(schema.bookings.bookingDate, weekRangeEnd),
            sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
          ),
        )
```

La consulta de anotados es la del RESEARCH §6 (líneas 671-684). En Drizzle: `schema.bookings.status` (columna física `booking_status`), `schema.bookings.isTrial`, `schema.bookings.bookedAt`, `schema.bookings.source` (`schema/bookings.ts:40-47`); índice `idx_bookings_schedule_date_status` (`:50`). **Cada join lleva `tenantWhere`** (`users`, `bookings`, `member_profiles`, `branches`, `schedules` son strict, el sentinel tira si falta). `LEFT(last_name, 1)` en SQL para que el apellido completo no salga de la base. Zona horaria de la sede y ventana de fecha: `localDateForBranch` / `todayInTz` (`aura/daily-award.ts:88-95`, `shared/date-utils`).

Aura de los visibles: `earnedAuraByUsers(db, ctx, ids)` de `aura/earned.ts` (A4). `null` para staff y Wellhub (`status = 'wellhub'`, `schema/users.ts:76`; o reserva con `source = 'wellhub'`, ver `shared/wellhub-sources.ts`), y `null` si el módulo `templo-gamification` está apagado.

URL firmada de la foto: `privateMediaResolver.resolve(fastify).presignGet(key, 2 * 3600, { stableHourly: true })`. Si R2 no está configurado, la lista **no debe romper**: devolver `photoUrl: null` (capturar `PhotoStorageUnavailableError`).

Regla "quién ve la lista" y menores/exterior: RESEARCH §6 (líneas 691-706). "Plan vigente" = `users.status = 'activo'`.

#### Rutas dentro de `schedulingMemberRoutes` (mod en `scheduling/routes.ts`)

**Análogo exacto:** `/trial-eligibility`, `scheduling/routes.ts:1403-1418`:

```typescript
  fastify.get(
    "/trial-eligibility",
    { schema: trialEligibilitySchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "scheduling.trialEligibility");
        const result = await trialService.getTrialEligibility(ctx, request.user.userId);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "member trial eligibility");
      }
    },
  );
```

Guard heredado del hook del plugin (`:1233-1236`):

```typescript
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    await attachCountryScope(request, fastify.db);
  });
```

La ruta nueva agrega `config: { rateLimit: RATE_LIMITS.attendees }` (patrón de `auth/routes.ts:115,673`: `{ schema: registerSchema, config: { rateLimit: RATE_LIMITS.register } }`). Entrada nueva en `shared/rate-limits.ts:7-20`:

```typescript
  siteData: { max: 60, timeWindow: "1 minute" },
```

→ `attendees: { max: 120, timeWindow: "1 minute" }` (por IP, Wi-Fi compartido). El schema de querystring/params con `date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }` como `memberWeeklyGridSchema` (`scheduling/schemas.ts:928-949`, `weekStart` en `:932-935`) y **schema de respuesta declarado completo** (RESEARCH §6, líneas 710-718). Un horario ajeno o inexistente = 404 con `tenantWhere(schema.schedules, ctx)`.

Se instancia el servicio dentro del plugin (`:1171-1230` instancia todos los servicios al inicio, con `fastify.db` y `fastify.log`).

#### Ajuste del interruptor (nuevo)

**Análogo:** `src/modules/conquer/settings.ts:1-60` (lectura con default en código y validación, `tenant_settings`, `tenantWhere`/`tenantValues`, prefijo en constante, "no re-declarar este literal"). Sembrarlo apagado **por default de código** (sin fila = apagado), no por migración con datos. Encenderlo en prod es una migración posterior (0348), por regla de Franco ("prod data por migraciones"), con `INSERT ... tenant_settings` para el tenant 1. Revisar cómo siembra una migración previa en `tenant_settings` antes de escribirla.

**Tests: `test/scheduling/attendees.test.ts`** (nuevo). Esqueleto: `test/scheduling/my-bookings-weeks.test.ts:34-100` (siembra de `activities` + `schedules` + `bookings` por INSERT directo y `registerUser` + `getAuthToken`). Para casos de gimnasio 2 y fixtures: `test/fixtures/second-tenant.ts` y `test/fixtures/subs-sched-gimnasio-dos.ts` (como `iso-03-sched-lecturas.test.ts`). Un helper de reservas con `isTrial` ya existe como patrón (`crearReservaDirecta`, `iso-03-sched-lecturas.test.ts:~270-290`). Aserciones obligatorias de D-37 y RESEARCH Pitfall 4: recorrer el JSON y verificar que no aparezca ninguna de las claves `lastName`, `phone`, `email`, `userId`; ocultos sin fila y contados en `hiddenCount`; sin `is_trial`, cancelados, `no_show`, lista de espera ni borrados; reciprocidad (quien se oculta no ve la lista); plan vencido ve solo el número; staff y Wellhub sin puntos; menores y sedes fuera de AR ocultos por defecto; interruptor apagado → `reason: "apagado"`. Fechas relativas a "hoy" (memorias `test_arpu_dependiente` y `test_shifts_utc_vs_tz`), ids de usuario nunca hardcodeados.

**Gates de tenancy de A6:**
- **ISO-01:** 3 entradas `tenant-scoped` nuevas (attendees, visibility, notice-seen). Ubicar en el bloque `// ── /api/members/scheduling ──` (`test/tenant-manifest.ts:1248-1277`), formato:

```typescript
  "GET /api/members/scheduling/trial-eligibility": { ... },
  "POST /api/members/scheduling/cancel-trial": { categoria: "tenant-scoped" },
```

- **ISO-03 subs+sched:** 3 casos (GET va en `iso-03-sched-lecturas.test.ts` con `getMemberComo`, `:~180-190`; PUT y POST en `iso-03-sched-escritura.test.ts`, junto a `describe("reservar clase (socio) — POST /api/members/scheduling/reserve"` `:1522`), cada uno con aislamiento + control. `CASOS_BASELINE` 74 → 77 en `iso-03-cobertura-subs-sched.test.ts:~198`, y comentario de movimiento como los de `:~165-197`. Para las rutas app-facing "self-scoped" el aislamiento se afirma leyendo el `tenant_id` real de cada fila devuelta (patrón del docblock de `iso-03-sched-lecturas.test.ts:55-78`).
- **Conteos de tabla:** ninguno (solo columnas).
- **Conteos de `ENTRADAS_BASELINE`:** ver tabla final.

---

### A7. Admin: apagar el descuento por Aura

**Análogo:** el propio bloque del boarding pass ya retirado, `el-templo-admin/src/components/AssignPlanDialog.vue:373-378` (comentario que documenta que el soporte sigue en la API y que el toggle ya no se ofrece). El selector a quitar está en `:380-399` y `auraOptions` en `:1579-1589`. Dejar `assignForm.auraSpend = null` siempre (`:1279`, `:1981`, `:2011`, `:2177`, `:2328` ya lo ponen a `null`). No tocar `SubscriptionCard.vue:120-122` (descuentos históricos).

Defaults de programas: `el-templo-admin/src/components/ProgramWizardDialog.vue:427-428, 669-670` (15 → 8 y 100 → 50).

Verificación: `vue-tsc` comparado contra la base (~21 errores preexistentes en el admin). Sin tests de API nuevos: los 14 archivos con `auraSpend` no cambian (RESEARCH §8).

---

## Patrones compartidos

### Tenancy en toda ruta y lectura nueva
**Fuente:** `src/modules/shared/tenant.ts:149-170` (`tenantWhere`, `tenantValues`) y `assertTenant(request.scope, "<módulo.acción>")`.
**Aplica a:** todos los archivos nuevos de la API.

```typescript
export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(
  table: T,
  scope: { tenantId: TenantId },
) {
  return eq(table.tenantId, scope.tenantId);
}
```

Convención: `and(tenantWhere(table, ctx), ...)` como **primer término** de todo `WHERE` sobre tabla gym-owned; `tenantValues(ctx, {...})` en todo `INSERT`; el ctx sale de `request.scope`, nunca del payload ni del JWT. Sin `tenant-lint-allowlist.json` nuevo.

### Guard de plugin member-facing
**Fuente:** `scheduling/routes.ts:1233-1236`.
**Aplica a:** `profile-photo-routes.ts`, `aura/member-routes.ts`, las 3 rutas de scheduling.

```typescript
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    await attachCountryScope(request, fastify.db);
  });
```

### Errores del handler
**Fuente:** `src/modules/shared/error-handler` (`handleServiceError(err, reply, request.log, "<contexto>")`) y `src/modules/shared/errors.ts` (`AppError(message, status, code)`).
**Aplica a:** todos los handlers. `catch (err: unknown)` con `instanceof Error`, nunca `any`, nunca `console.log` (CLAUDE.md).

### Idempotencia de premios por unique del ledger
**Fuente:** `aura/daily-award.ts:44-65` más `shared/sql-errors.ts:6-27`.
**Aplica a:** foto de perfil (A5). `referenceId` no nulo.

### Schema de respuesta declarado
**Fuente:** `scheduling/schemas.ts:928-949`, `sponsors/schemas.ts` (`memberSponsorsResponseSchema`).
**Aplica a:** attendees, aura summary y movements, check-in, profile-photo. fast-json-stringify descarta lo que no se declara.

### Storage privado fail-closed
**Fuente:** `conquer/private-media.ts:225-240` (`resolve` tira 503 sin `fastify.r2` o sin `R2_PRIVATE_BUCKET_NAME`, nunca cae al bucket público). Sin variables de entorno nuevas (`.env.example` no cambia).
**Aplica a:** `profile-photo-service.ts`, `attendees-service.ts` (URL firmada), `/auth/me`, delete-account.

### Migraciones a mano
**Fuente:** `el-templo-db-migrations` y los encabezados de `0342` y `0340`. Numeración `0344`..`0347` (más `0348` de puesta al día en un deploy posterior). SQL en el mismo commit que el schema. **Sin `;` en comentarios ni en literales de texto.** Sin datos de prueba. Test estático del `;` en cada migración nueva.

### Logging
`request.log.info/warn` y `app.log` (Pino). En el frontend, `createLogger()`.

---

## Gates de tenancy: resumen

Todos con `ruta:línea` sobre el worktree.

| Gate | Archivo:línea | Qué se mueve en esta fase |
|---|---|---|
| ISO-01 manifiesto (entradas) | `test/tenant-manifest.ts` (bloques `:1248-1277` scheduling, `:704` members, `:1217-1219` attendance, `:2055-2060` gamification) y `test/tenancy/iso-01-manifiesto.test.ts:473` (`ENTRADAS_BASELINE = 577`) | **577 → 590** (+13). Hay que cambiar también el título del `it` de `:614` ("las 577 entradas") y agregar una línea de historia al bloque de comentarios (`:~455-472`) |
| ISO-03 subs+sched | `test/tenancy/iso-03-cobertura-subs-sched.test.ts:~198` (`CASOS_BASELINE = 74`) | **74 → 77** (3 casos con control positivo en `iso-03-sched-lecturas.test.ts` y `iso-03-sched-escritura.test.ts`) |
| ISO-03 members | `test/tenancy/iso-03-cobertura-members.test.ts:~187` (`CASOS_BASELINE = 38`) | **38 → 42** (4 casos en `iso-03-members-ficha.test.ts`) |
| Tabla gym-owned (5 conteos fijos) | `test/db/tenant-tables.test.ts:135-140`, `test/migrations/0192-0195-tenant-columns.test.ts:~207`, `test/migrations/0196-tenant-unique-contracts.test.ts:~651-665` | 135 → 136 gym-owned, 140 → 141 tablas del schema |
| Registro de tablas | `src/db/tenant-tables.ts` (`GYM_OWNED_TABLES` y `TENANT_STRICT_MODULES.members`) y espejo `test/db/tenant-tables.test.ts:457-466` | + `member_photos` |
| Limpieza de tests | `test/helpers.ts:~249` (`TABLES_TO_CLEAN`) | + `schema.memberPhotos` antes de `users` |
| Lint de tenancy | `pnpm --dir el-templo-api lint:tenant` | `earned.ts` y `attendees-service.ts` con `tenantWhere`. Prohibido agrandar `tenant-lint-allowlist.json` |
| Uniques | `src/db/scripts/verify-tenant-uniques` | `member_photos` sin uniques nuevas, las tablas `*_backup_0344` terminan en `_backup_<n>` |
| MOD-01 guard | `test/tenancy/mod-01-guard.test.ts:199-225` | Caso nuevo (opcional pero recomendado) para `/api/members/aura/*` con el módulo apagado |

**Las 13 claves ISO-01 nuevas** (RESEARCH §6, líneas 745-758):

| Clave | Categoría |
|---|---|
| `GET /api/members/scheduling/slots/:scheduleId/:date/attendees` | `tenant-scoped` |
| `PUT /api/members/scheduling/attendees/visibility` | `tenant-scoped` |
| `POST /api/members/scheduling/attendees/notice-seen` | `tenant-scoped` |
| `GET /api/members/aura/summary` | `templo-module` / `templo-gamification` |
| `GET /api/members/aura/movements` | `templo-module` / `templo-gamification` |
| `POST /api/members/profile-photo/upload-url` | `tenant-scoped` |
| `POST /api/members/profile-photo/confirm` | `tenant-scoped` |
| `DELETE /api/members/profile-photo` | `tenant-scoped` |
| `POST /api/members/profile-photos/:photoId/report` | `tenant-scoped` |
| `GET /api/admin/members/profile-photos` | `tenant-scoped` |
| `POST /api/admin/members/:userId/profile-photo/approve` | `tenant-scoped` |
| `POST /api/admin/members/:userId/profile-photo/reject` | `tenant-scoped` |
| `DELETE /api/admin/members/:userId/profile-photo` | `tenant-scoped` |

Si se agrega un botón de Ajustes para el interruptor (decisión 2 del RESEARCH), suma entradas. **Contar de nuevo las claves al cerrar cada plan** (el número que importa es el de `ENTRADAS_BASELINE`). El ISO-01 también mira `GET` sin `HEAD` sintético (`getsSinHeadSintetico`): las rutas `GET` nuevas no necesitan entrada de `HEAD`.

**Orden recomendado de movimientos para no dejar CI rojo entre planes:** cada plan que agrega rutas sube `ENTRADAS_BASELINE` y las entradas del manifiesto en el mismo commit. A4 (+2: aura), A5 (+8: foto), A6 (+3: scheduling). Si el orden de ejecución cambia, el número intermedio cambia.

---

## Sin análogo

Ninguno de los archivos de la API tiene que usar solo RESEARCH. Los dos puntos con menos cobertura:

| Archivo | Rol | Flujo | Motivo |
|---|---|---|---|
| Recorte y reducción a JPEG en la app (`toAvatarJpeg`, B1) | utilidad | transform | El análogo en la app es `bar-challenge/composables/useImageComposer.ts:53-172` (canvas + `toBlob`), no un recorte cuadrado. El RESEARCH trae el ejemplo completo (Code Examples, líneas 1041-1066) |
| Aviso de primera vez de la lista (`community_notice_seen_at`) | persistencia | event-driven | Solo hay precedente de "visto" en `intro_stories_seen_at` (`member-profiles.ts:63-72`) y `sponsor_views`. Se copia el de `member_profiles` |

---

## Metadatos

**Alcance de la búsqueda de análogos:** `el-templo-api/src/modules/{aura,attendance,onboarding,sessions,goal-plans,programs,members,scheduling,conquer,tv,sponsors,bar-challenge,auth,shared,settings,referrals}`, `el-templo-api/src/db/{schema,migrations,tenant-tables.ts,run-migrations.ts}`, `el-templo-api/src/jobs/tenure-milestones.ts`, `el-templo-api/test/{tenancy,migrations,conquer,scheduling,sessions,attendance,members,unit,db}`, más `el-templo-app/src/modules/{training,conquer}`, `el-templo-app/src/layouts`, `el-templo-admin/src/components`.
**Archivos leídos:** ~45 (los de más de 1.000 líneas con `Grep` y lecturas por rango).
**Fecha de extracción:** 2026-11-17
