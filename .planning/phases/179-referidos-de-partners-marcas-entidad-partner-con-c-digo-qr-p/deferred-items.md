# Deferred Items - Fase 179

## 179-15: `test/level-display.test.ts` falla, fuera de alcance

- **Detectado en:** verificación final de plan 179-15 (`pnpm exec vitest run --no-watch` en `el-templo-app`)
- **Archivos:** `el-templo-app/test/level-display.test.ts`, `el-templo-app/src/modules/training/level-display.ts`
- **Síntoma:** `TRAINING_LEVELS` exporta 6 niveles (incluye `kairos`) pero el test espera 5 (`['alfa','delta','sigma','omega','spartan']`), sin `kairos`. 2 tests rojos.
- **Por qué está fuera de alcance:** archivo del sistema de niveles de entrenamiento (fase 99), sin relación con el campo de código de registro (179-15) ni con el resto de la fase 179 (referidos de partners). No lo toqué — regla de scope boundary del executor.
- **Confirmado pre-existente:** el resto de la suite de la app (70 tests, 8 archivos) pasa en verde excluyendo este archivo; ningún cambio de esta fase toca `level-display.ts` ni el test.
- **Acción sugerida:** investigar aparte cuándo se agregó el nivel `kairos` a la lógica pero no al tuple/test — probablemente un tren o fase reciente lo dejó a mitad de camino.

## 179-07: hooks de pre-commit (husky + lint-staged) no ejecutan en el worktree `et-179`

- **Detectado en:** verificación final de plan 179-07, al comparar el resultado de `prettier --check` manual contra el estado ya commiteado.
- **Síntoma:** `git config core.hooksPath` apunta a `.husky/_` en este worktree, pero ese directorio NO EXISTE (`.husky/_/husky.sh`, el bootstrap que genera `husky install`, nunca se creó acá) — cada `git commit` de este plan pasó SIN ejecutar lint-staged/prettier, sin error ni warning visible (git simplemente no encuentra el hook y sigue de largo).
- **Por qué está fuera de alcance:** infraestructura de tooling compartida del monorepo (instalación de husky a nivel raíz, probablemente nunca corrida en este worktree porque tampoco hay `node_modules` en la raíz) — no es código de la fase 179 ni algo que un plan de ejecución deba reparar de paso.
- **Verificación de impacto:** confirmado que NO afecta la corrección del código (tsc, lint:tenant y la suite completa de 456 tests pasaron en verde sobre el contenido exacto que quedó commiteado, sin el paso de `prettier --write` del hook). Se descartó "arreglarlo a mano" corriendo `prettier --write` con el binario local de `el-templo-api` (v3.8.1) porque difiere de la versión que el hook real usaría (`prettier@^3.3.3` de la raíz, resuelta vía el PATH que arma `.husky/pre-commit`) — aplicar el binario equivocado podría introducir un formato distinto al que el hook real produciría. CI tampoco corre `prettier --check` (no hay paso de formato en `.github/workflows/*.yml`), así que no bloquea nada.
- **Acción sugerida:** correr `npm install`/`husky install` (o el equivalente del gestor de paquetes de la raíz) en el checkout donde se vaya a seguir trabajando, para que `.husky/_/husky.sh` exista y los hooks vuelvan a correr. Vale la pena revisar si esto afecta a OTROS worktrees vivos del repo (`et-173`, etc.), no sólo `et-179`.
