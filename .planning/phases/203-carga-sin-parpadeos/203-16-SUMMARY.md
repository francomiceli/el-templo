---
phase: 203-carga-sin-parpadeos
plan: 16
subsystem: app-dev-tooling
status: complete
completed: 2026-10-28
requirements: [SC-6, SC-4, D-17]
commits: [51ace09ee, 18b1ead12]
key-files:
  created:
    - el-templo-app/src/utils/dev-latency.ts
    - el-templo-app/src/utils/__tests__/dev-latency.test.ts
  modified:
    - el-templo-app/src/boot/axios.ts
    - el-templo-app/.env.example
    - .claude/skills/el-templo-build-and-run/SKILL.md
---

# Phase 203 Plan 16: Latencia artificial y contador de pedidos solo en dev (SUMMARY)

Red lenta reproducible en local para el UAT (SC-6) y log numerado de pedidos para contarlos (SC-4), imposible en producción.

## Qué quedó

### Task 1 (`51ace09ee`): helper puro + interceptor
- `utils/dev-latency.ts`: `parseDevLatencyMs(raw, isDev)` (0 si no es dev, si falta/vacío, no numérico, NaN/Infinity o <= 0; tope `DEV_LATENCY_MAX_MS = 10_000`; redondea) y `jitteredDelayMs(baseMs, rand)` (`Math.round(base * (0.5 + rand))`, base <= 0 -> 0).
- `boot/axios.ts`: bloque `if (import.meta.env.DEV) { ... }` registrado DESPUÉS del interceptor de auth. Dentro: `devLatencyMs = parseDevLatencyMs(import.meta.env.VITE_DEV_LATENCY_MS as string | undefined, import.meta.env.DEV)`, contador de módulo `devRequestSeq` y un interceptor de request que hace `log.debug('dev request', { n, method, url })` y, si `devLatencyMs > 0`, espera `jitteredDelayMs(devLatencyMs, Math.random())`. El interceptor de auth no se tocó.
- Test `dev-latency.test.ts`: 12 casos (23 `expect`): válido, prod siempre 0 (incluso con valor enorme), sin variable/vacío/blancos, no numérico (abc, NaN, Infinity), 0 y negativo, tope 10000; jitter 0 -> 0.5x, 0.5 -> 1x, 0.999 -> 1199, base 0, base negativa, barrido dentro de [0.5x, 1.5x].

### Task 2 (`18b1ead12`): documentación
- `.env.example`: `# VITE_DEV_LATENCY_MS=800` comentada (no activa por defecto) con su descripción.
- Skill `el-templo-build-and-run` §3.2: variable listada y párrafo "Reproducir red lenta en local (fase 203)".

## Verificación de que no llega a producción (T-203-34)
- Todo el código ejecutable vive dentro de `if (import.meta.env.DEV)`. Vite reemplaza `import.meta.env.DEV` por `false` en `quasar build`, el bloque queda muerto y se elimina; los imports de `dev-latency.ts` quedan sin uso y se tree-shakean (funciones puras sin efectos). No se pudo comprobar con un build real (D-17 prohíbe `quasar build`): comprobación estática. Para confirmarlo cuando haya build: `grep -c "dev request" dist/spa/assets/*.js` debe dar 0.
- Defensa en profundidad: `parseDevLatencyMs` devuelve 0 si `isDev` es false.
- Sin la variable definida: no hay demora; solo se numera el log (y `log.debug` ya es no-op en producción por `import.meta.env.PROD` en `createLogger`).
- T-203-35: el log solo lleva `n`, `method`, `url`. Sin headers ni body.

## Cómo se usa en el UAT

```
# el-templo-app/.env  (copiado de .env.example)
VITE_DEV_LATENCY_MS=800
```
Después, desde `el-templo-app/`: `pnpm dev` (o `quasar dev`), abrir `http://localhost:9000` con la consola del navegador en nivel "Verbose/Debug". Cada pedido muestra `[axios] dev request { n: 1, method: 'get', url: '/...' }`; el `n` más alto al terminar de abrir la app con plan activo es el conteo de SC-4 (meta: menos de 18). Reiniciar la pestaña reinicia el contador (es de módulo). Combinable con DevTools "Slow 4G". Sin la variable: sin demora, solo el log numerado.

## Tests escritos SIN correr (D-17) — los corre el orquestador

1. `el-templo-app/src/utils/__tests__/dev-latency.test.ts` (nuevo, funciones puras, sin mocks).

Typecheck (`vue-tsc`) pendiente del orquestador: el cast `import.meta.env.VITE_DEV_LATENCY_MS as string | undefined` evita `any` (el tipo de `ImportMetaEnv` es indexado).

## Deviations from Plan

**1. [Cosmético] Prettier reformateó una línea ajena en `axios.ts`**: el tipo `RefreshResult` (línea 64) pasó a unión multilínea. Era deriva previa de formato, sin efecto. Por eso el `git diff` de `axios.ts` no es 100% aditivo (1 línea reformateada); el interceptor de auth no cambió.

**2. [Diseño] El bloque va después del interceptor de auth, no justo después de `axios.create`.** Axios corre los interceptores de request en orden inverso al registro, así que la demora ocurre antes de leer el token (el token queda lo más fresco posible y el orden de llegada refleja la latencia).

**3. [Diseño] El `if (import.meta.env.DEV)` ya garantiza dev y aun así se pasa `import.meta.env.DEV` a `parseDevLatencyMs`** (redundante a propósito, defensa en profundidad).

**4. [Verificación] La rama del commit no matchea `worktree-agent-*`** (es `feat/203-carga-sin-parpadeos`, indicada por el orquestador y no protegida); el guard de HEAD genérico no aplica a este worktree compartido.

## Riesgos antes del plan 17

- Las demoras y el conteo solo afectan a la instancia `api`. El pedido de `POST /auth/refresh` usa `refreshClient` (sin interceptores) y NO se cuenta ni se demora; los reintentos tras un 401 sí (pasan por `api`). En un UAT con sesión válida no cambia el conteo.
- En vitest `import.meta.env.DEV` es true: cualquier test que cargue `boot/axios.ts` registra el interceptor y emite `console.debug` vía `log.debug`; inocuo (sin `VITE_DEV_LATENCY_MS` no hay demora), pero si un test existente espiara `console.debug` fallaría. No hay tal test conocido.
- El contador cuenta pedidos que salen por `api` desde que carga el módulo (incluye los del boot), así que para medir "una apertura" hay que recargar la pestaña y leer el último `n`; pedidos por `fetch`/CapacitorHttp directos (si los hay) no entran.
- El log usa el nivel `debug`: en Chrome hay que activar "Verbose" para verlo.
- Nada comprobado en build real (D-17): el grep `dev request` sobre `dist/` del primer build queda como chequeo recomendado.

## Self-Check: PASSED
- Archivos creados/modificados presentes; commits `51ace09ee` y `18b1ead12` existen en `feat/203-carga-sin-parpadeos`.
- Prettier y eslint sobre los 3 archivos de código: 0 errores (1 warning previo `Capacitor` sin usar en `axios.ts`, ajeno).
