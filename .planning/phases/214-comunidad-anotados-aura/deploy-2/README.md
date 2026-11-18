# Deploy 2: repaso de la re-valorizacion de Aura (D-49)

`aura_revaluation_repaso.sql` es la migracion de repaso de D-49. Esta preparada aca, fuera de
`el-templo-api/src/db/migrations/`, a proposito.

## Por que no va en el mismo deploy que la 0344

El deploy hace rsync, migraciones y reinicio. Entre la 0344 y el reinicio, la API vieja sigue
acreditando con los montos fijos de su codigo (asistencia 10, onboarding 50, antiguedad, rachas).
Si el repaso viajara en el mismo push, correria ANTES del reinicio (no repasaria nada) y quedaria
registrado en `_migrations`, asi que no se podria volver a correr. Por eso va en un deploy posterior.

## Cuando moverla

Solo despues de que:

1. la 0344 corrio en staging y en master (cada una en su base), y
2. la API ya reinicio con el codigo nuevo en ese entorno.

La condicion (c) del tope del dia mira `applied_at` de `0344_aura_revaluation.sql` en `_migrations`
y cubre una hora desde ahi: el repaso tiene que correr en esa base despues del reinicio y con la
fila de la 0344 presente. Si la 0344 se renombro, cambiar el nombre en la subconsulta.

## Como

1. `git fetch` y mirar el ultimo numero de `origin/master` y de `origin/staging` en
   `el-templo-api/src/db/migrations/`. Tomar el siguiente libre (0348 si no se colo nada, porque la
   0347 es del plan 16).
2. Copiar el archivo a `el-templo-api/src/db/migrations/NNNN_aura_revaluation_repaso.sql` (sacar la
   primera linea de comentario "sin numero todavia" y poner el nombre real).
3. En `el-templo-api/test/migrations/aura-revaluation-repaso.test.ts` actualizar `REPASO_PATH` para que
   apunte a ese archivo (hay un comentario en la constante).
4. Commit aparte y deploy aparte. No mezclarlo con otros cambios.

## Control

Correr la consulta 05 (`consultas/`) en staging, bloques 1, 4 y 6, antes y despues del repaso. Los
bloques 4 y 6 tienen que dar 0 despues. Recien con eso en 0 se despliegan las pantallas que muestran
puntos.

## Que hace y que no

- Re-mapea solo las fuentes que la API vieja paga con montos fijos: asistencia, su reversa,
  onboarding, antiguedad y rachas.
- Pone en 0 una fila de app o plan a medida de 3 solo si ese dia hay una asistencia de 5 o 10, ninguna
  de 1 a 4, y la fila es de la ventana de la 0344.
- Un dia con app 3 y asistencia 2 (legitimo con el codigo nuevo, D-64) no se toca.
- Sin respaldo propio, sin ALTER, sin configuracion de Aura, sin programas.
