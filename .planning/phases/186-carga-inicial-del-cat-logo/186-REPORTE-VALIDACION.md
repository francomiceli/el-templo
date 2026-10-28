# Reporte de validación del catálogo — paso 2 del protocolo del brief

**Fecha:** 2026-09-02 (03:42 UTC)
**Comando exacto:** `pnpm db:validate-gym-catalog` (modo completo, sin `--file`), corrido desde `el-templo-api/`
**Worktree / rama / commit:** `/home/franco/projects/et-182`, rama `feat/186-carga-catalogo`, commit `183f8d12` (docs(186-07): unificar formato prettier de los 9 lotes del dataset)
**Dataset validado:** los 9 lotes de `el-templo-api/src/db/seed-data/gym-catalog/*.json` (01 a 09), 62 fichas

Este es el conteo que exige el paso 2 del protocolo de carga del brief ("Antes de publicar nada, validar: total de ejercicios generados, cuántos por grupo muscular, cuántos por patrón de movimiento... cuántos por equipamiento, y cuántos nombres colisionan o son sinónimos entre sí. El conteo de duplicados es el que más importa.").

## Salida del validador (`formatReport`)

```
========================================================================
Dataset del catálogo de ejercicios — modo completo
========================================================================
Total de ejercicios: 62

Por grupo muscular primario:
  - abdominales: 6
  - aductores: 1
  - antebrazo: 1
  - bíceps: 2
  - cuádriceps: 10
  - espalda: 12
  - gemelos: 2
  - glúteos: 3
  - hombros: 7
  - isquiotibiales: 5
  - lumbares: 1
  - pecho: 9
  - tríceps: 3

Por patrón de movimiento:
  - aislamiento: 11
  - cardio: 4
  - core: 6
  - dominante de cadera: 7
  - dominante de rodilla: 8
  - empuje horizontal: 7
  - empuje vertical: 6
  - tracción horizontal: 7
  - tracción vertical: 6

Por equipamiento:
  - TRX o similar: 1
  - banco inclinado: 4
  - banco plano: 10
  - barra EZ: 1
  - barra de dominadas: 2
  - barra olímpica: 10
  - barra recta: 4
  - cajón: 2
  - colchoneta: 8
  - kettlebell: 1
  - mancuernas: 14
  - máquina: 9
  - paralelas: 1
  - peso corporal: 16
  - polea alta: 4
  - polea baja: 2
  - prensa: 1
  - soga: 1

Por dificultad:
  - avanzado: 5
  - intermedio: 20
  - principiante: 37

Duplicados de nombre/alias normalizado: 0
Patrones de movimiento sin cubrir: 0
Taxonomías fuera de lista: 0
Campos inválidos: 0
Alternativas colgadas: 0
Variantes colgadas: 0
Caracteres peligrosos para SQL: 0
Volumen total fuera de rango (40-80): no

OK: true
```

## Lectura del conteo que más importa (duplicados)

**Cero.** Ningún nombre canónico ni alias normalizado colisiona con otro, en los 9 lotes juntos (62 fichas, hasta 4 alias por ficha). Tampoco hay punteros colgados: las `alternatives`, `easierVariant` y `harderVariant` de las 62 fichas resuelven todas dentro del propio dataset. Los 9 patrones de movimiento del §2.3 están cubiertos y el volumen total (62) cae dentro del rango 40-80 exigido por D-12.

## Correcciones aplicadas

**Ninguna corrección de contenido fue necesaria.** El plan 06 (lotes 7-9, que cerró el dataset) ya había corrido la validación completa y reportado exit 0 sin hallazgos bloqueantes; esta corrida (plan 07) lo confirma de forma independiente sobre el estado actual del dataset y no encontró ningún duplicado, puntero colgado, taxonomía inválida ni carácter peligroso para corregir.

Sí se aplicó una corrección de **formato** (no de contenido), documentada como deuda pendiente por los planes 05 y 06:

- **Unificación de formato con `prettier` del API sobre los 9 archivos JSON del dataset.** Los lotes se habían escrito a mano con arrays de strings inline (2 espacios) para no romper el estilo lote a lote durante la generación, mientras que el prettier del proyecto (3.8.1, printWidth 80 por defecto) parte esos arrays en una línea por elemento. Con el dataset completo, se corrió `pnpm exec prettier --write` sobre los 9 archivos para que todos compartan un único formato reproducible y determinista. **El formato canónico elegido es el que produce el prettier del API con su configuración por defecto** (no hay `.prettierrc` propio en el repo, así que aplican los defaults de la herramienta) — no un estilo "bonito" ad hoc, sino el que cualquiera puede reproducir corriendo `prettier --write` sobre el directorio.
  - Se verificó que el reformateo es puramente sintáctico: `JSON.parse` + `JSON.stringify` de cada archivo antes y después del `--write` produce strings idénticos en los 9 archivos (comparación byte a byte del contenido semántico).
  - `09-cardio.json` ya estaba prettier-clean (el ejecutor del plan 06 lo había escrito con un formateador de un solo uso que coincidió con el default de prettier) — sin diff.
  - El validador completo se volvió a correr después del reformateo: mismo resultado, `OK: true`.
  - Archivos modificados: `el-templo-api/src/db/seed-data/gym-catalog/01-empuje-horizontal.json` a `08-core.json` (8 de los 9; `09-cardio.json` sin cambios).
  - Commit: `183f8d12` en la rama `feat/186-carga-catalogo` del worktree `et-182`.

## Hallazgos de contenido diferidos a la revisión humana (plan 09)

Este reporte es sobre lo que el **validador automático** marca como bloqueante — cero hallazgos ahí. Los planes 04, 05 y 06 documentaron además una serie de observaciones de contenido (grupos musculares con un solo ejercicio, alternativas de otro grupo muscular, alias informales, cobertura de cardio de bajo impacto, equipamiento sin usar, etc.) que **no son errores del validador** y quedan explícitamente para la revisión humana del plan 09, tal como indica el diseño de la fase. Ver la sección "Hallazgos sobre la lista congelada" de `186-04-SUMMARY.md`, `186-05-SUMMARY.md` y `186-06-SUMMARY.md` en el worktree de ejecución.
