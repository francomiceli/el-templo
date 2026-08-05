# Phase 169: Capa de escritura — helpers `tenantWhere`/`tenantValues` y `TenantContext` - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-27
**Phase:** 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
**Areas discussed:** Alcance de los crons, Webhook sin gym mapeado, CLI: mecanismo y retrofit, Grado de adopción en 169

---

## Alcance de los crons

**Q1: ¿Qué crons adoptan el loop por-tenant-activo en esta fase?**

| Option                   | Description                                                                                             | Selected |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | -------- |
| Los 7 jobs (Recomendada) | Todos tocan gym-owned; un helper compartido itera tenants activos; ningún cron "que se acuerde después" | ✓        |
| Solo los 4 del ROADMAP   | wellhub-sync, reassign-multibranch, notification-cron, streaks; el resto a la adopción                  |          |
| Solo wellhub-sync piloto | Mínimo esfuerzo, máximo riesgo de que "después" no llegue                                               |          |

**Q2: ¿Hasta dónde baja el TenantContext dentro de cada cron?**

| Option                               | Description                                                                     | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------- | -------- |
| Solo al cuerpo del job (Recomendada) | Services mantienen firma actual hasta su fase de adopción (172-175); diff chico | ✓        |
| Plumbing completo ahora              | Cambiar firmas de services ya; infla la fase y duplica review de la adopción    |          |

**Q3: Si el job falla para un tenant, ¿qué hace el loop?**

| Option                        | Description                                                 | Selected |
| ----------------------------- | ----------------------------------------------------------- | -------- |
| Aislar y seguir (Recomendada) | Catch por tenant, log.error + Sentry con tenantId, continúa | ✓        |
| Abortar el run completo       | Un tenant problemático bloquea a los sanos                  |          |

---

## Webhook sin gym mapeado

**Q1: Cuando el gym.id no mapea a ninguna sede, ¿cómo responde el API?**

| Option                             | Description                                                                              | Selected |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| 200 'skipped' actual (Recomendada) | Fail-closed lógico: nada se crea, log + métrica; 200 evita reintentos eternos de Wellhub | ✓        |
| 4xx explícito                      | Rechazo HTTP literal; provoca reintentos y cambia comportamiento desplegado              |          |

**Q2: ¿Y si el gym mapea a una sede de un tenant suspended/archived?**

| Option                   | Description                                                                          | Selected |
| ------------------------ | ------------------------------------------------------------------------------------ | -------- |
| No procesa (Recomendada) | 200 'skipped' + log con tenantId; coherente con CD-01 (suspensión total) y con crons | ✓        |
| Procesa igual            | Conserva asistencia pero agujerea la suspensión como palanca                         |          |

---

## CLI: mecanismo y retrofit

**Q1: ¿A qué scripts aplica la regla "tenant obligatorio o aborta"?**

| Option                                          | Description                                                                                                                     | Selected |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Solo a los que escriben gym-owned (Recomendada) | Retrofit de seed-onboarding-aura; plataforma (run-migrations, verify-\*, seeds locales) y wellhub-sandbox exentos con anotación | ✓        |
| A todos los scripts                             | Rompe db:migrate y db:verify-\* en CI/deploy                                                                                    |          |
| Solo scripts nuevos                             | Deja el ejemplo viejo contradiciendo la regla                                                                                   |          |

**Q2: Al recibir --tenant=<id>, ¿qué valida contra la DB?**

| Option                                      | Description                                                                       | Selected |
| ------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Que exista, sin exigir status (Recomendada) | Typo aborta en seco; permite operar sobre tenant suspendido (tooling de operador) | ✓        |
| Que exista Y esté active                    | Bloquearía soporte sobre suspendidos; pediría un --force después                  |          |
| Solo parseo, sin query                      | Un typo lo frena recién la FK con el script a medio correr                        |          |

**Notes:** Franco pidió aclaración de qué significaba "este CLI" antes de responder; se
explicó que son los scripts sueltos `npx tsx scripts/*.ts` y el helper que parsea
`--tenant` al arrancar.

---

## Grado de adopción en 169

**Q1: ¿Cuánto adopta la 169 más allá de helpers + caminos sin request?**

| Option                                   | Description                                                                                              | Selected |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| Cero migración de services (Recomendada) | Helpers + TenantContext + crons/webhook/CLI + tests + auditoría de mass-assignment; adopción real en 172 | ✓        |
| Migrar un módulo chico de muestra        | Duplica el rol de piloto de finance                                                                      |          |

**Q2: El test de tenantId:2 en body, ¿sobre qué rutas corre?**

| Option                               | Description                                                                                                      | Selected |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Batería representativa (Recomendada) | Una ruta de escritura clave por módulo crítico; cada adopción la extiende; el 100% llega con el manifiesto (171) | ✓        |
| Barrido exhaustivo ya                | Lista a mano sin manifiesto, se solapa con ISO-03                                                                |          |
| Una sola ruta ejemplo                | Débil: el riesgo de mass-assignment es por ruta                                                                  |          |

---

## Claude's Discretion

- Ubicación y forma del iterador de tenants activos (`forEachActiveTenant` en `tenant.ts`, secuencial).
- Forma del test del criterio 3 (unit del iterador + integración con un cron representativo).
- Selección exacta de rutas de la batería representativa (mayor riesgo de mass-assignment).
- Cómo el webhook construye y pasa el `TenantContext` sin cambiar firmas de services.

## Deferred Ideas

- Plumbing del `TenantContext` a los services (fases 172-175).
- Barrido 100% de rutas de escritura (fases 171-172, manifiesto + ISO-03).
- Remover el `DEFAULT 1` de `tenant_id` post-adopción (no roadmapeado, anotado).
- Todo `v51-milestone-data-rollout.md` revisado y NO foldeado (falso positivo por keyword, ya descartado en la 166).
