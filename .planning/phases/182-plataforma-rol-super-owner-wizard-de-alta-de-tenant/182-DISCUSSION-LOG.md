# Phase 182: Plataforma — rol super-owner + wizard de alta de tenant - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-28
**Phase:** 182-Plataforma — rol super-owner + wizard de alta de tenant
**Areas discussed:** Dominio de plataforma y subdominios, Superficie y acceso del super-owner, Pasos del wizard y owner inicial, Aprovisionamiento y aislamiento

---

## Dominio de plataforma y subdominios

| Option                                             | Description                                                          | Selected |
| -------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| Env var `PLATFORM_DOMAIN` + registrar en paralelo  | Dominio configurable, registro del definitivo no bloquea la fase     | ✓        |
| Elegir y registrar el dominio ahora                | Bloquea la planificación hasta comprar y delegar DNS                 |          |
| Subdominio de eltemplo.org como provisorio         | Barato pero branding de El Templo (D-12)                             |          |

**User's choice:** Opción 1, tras preguntar si podría poner un subdominio de eltemplo.org como `PLATFORM_DOMAIN` en el futuro (sí: es solo un string; `kaia.eltemplo.org` queda como valor válido de arranque).

| Option                                          | Description                                                            | Selected |
| ----------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| API completa + infra real en staging/prod       | Resolución por Host + CORS + nginx wildcard + certbot DNS-01 en el EC2 | ✓        |
| Solo API; nginx/cert en la 192                  | Runbook escrito, infra recién en el onboarding real                    |          |
| Solo API + vhost provisorio manual              | Un subdominio fijo sin wildcard                                        |          |

| Option                                   | Description                                                      | Selected |
| ---------------------------------------- | ---------------------------------------------------------------- | -------- |
| localtest.me local + wildcard de staging | Cada entorno con su dominio y cert; tests inyectan Host          | ✓        |
| Solo tests con Host inyectado            | UAT real directo en prod                                         |          |
| Vos decidís                              |                                                                  |          |

| Option                            | Description                                                        | Selected |
| --------------------------------- | ------------------------------------------------------------------ | -------- |
| 404 genérico sin filtrar info     | Host desconocido → 404; suspendido → 403 existente; nunca tenant 1 | ✓        |
| Redirigir a landing de plataforma | 404 + UX en el front                                               |          |
| Vos decidís                       |                                                                    |          |

| Option                                     | Description                                                     | Selected |
| ------------------------------------------ | --------------------------------------------------------------- | -------- |
| Hosts de El Templo siguen como están       | Capa nueva solo para hosts bajo PLATFORM_DOMAIN                 | ✓        |
| Registrarlos como tenant 1 ahora           | Tabla `tenant_hosts`, toca el login de prod                     |          |

**Notes:** El usuario pidió aclarar qué son los "hosts" y el "mapeo de Kaia" y dejó la regla firme: **"no quiero tocar nada del templo"**. La posibilidad de migrar los hosts de El Templo al mecanismo por host (que el doc 08 dejaba abierta) queda descartada para el milestone. Resumen del área confirmado explícitamente.

---

## Superficie y acceso del super-owner

| Option                                        | Description                                                | Selected |
| --------------------------------------------- | ---------------------------------------------------------- | -------- |
| Sección `/plataforma` dentro de el-templo-admin | Login propio, store separado, mismo build y deploy       | ✓        |
| Frontend aparte                               | Quinta app / vhost propio                                  |          |
| Solo API + CLI en la 182, UI en la 183        | PLAT-02 pide wizard                                        |          |

| Option                                   | Description                                             | Selected |
| ---------------------------------------- | ------------------------------------------------------- | -------- |
| Script CLI idempotente en el API         | Contraseña por stdin, sin hash en git/migraciones       | ✓        |
| Migración con hash desde env             | Mezcla credenciales con el runner                       |          |
| Alta desde UI por otro super-owner + seed | Suma alcance                                           |          |

| Option                                              | Description                                                       | Selected |
| --------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| Email + contraseña fuerte, sesión corta, sin 2FA v1 | JWT audience platform, ~8 h, rate limit, log de auditoría         | ✓        |
| Email + contraseña + 2FA TOTP desde el día uno      | Más seguro, más trabajo                                           |          |
| Vos decidís                                         |                                                                   |          |

| Option                                       | Description                                       | Selected |
| -------------------------------------------- | ------------------------------------------------- | -------- |
| Sesiones independientes, sin cruce           | Claves de token distintas, cada ruta acepta el suyo | ✓      |
| Exclusivas: entrar a /plataforma cierra tenant | Un login activo por navegador                   |          |

**User's choice:** las cuatro opciones recomendadas. Sin notas adicionales.

---

## Pasos del wizard y owner inicial

| Option                                     | Description                                                                 | Selected |
| ------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| Identidad + localización + branding básico | nombre, slug validado, país/moneda/TZ, brand.* opcional, resumen/confirmar  | ✓        |
| Mínimo: nombre + slug + país/moneda/TZ     | Sin branding en la 182                                                      |          |
| Vos decidís                                |                                                                             |          |

| Option                                              | Description                                                | Selected |
| --------------------------------------------------- | ---------------------------------------------------------- | -------- |
| Sí: email del dueño + contraseña temporal una vez   | users rol owner, cambio forzado al primer login, sin mail  | ✓        |
| Sí, por invitación por mail (magic link)            | Depende del envío de mails para tenants nuevos             |          |
| No: el super-owner crea el owner después            | Deja el tenant sin nadie que pueda entrar                  |          |

| Option                                         | Description                                          | Selected |
| ---------------------------------------------- | ---------------------------------------------------- | -------- |
| Solo la sede virtual, automática e invisible   | Sedes físicas después desde el admin                 |          |
| Virtual automática + primera sede física opcional | Paso extra nombre/dirección/cupo                  | ✓        |

**Notes:** El usuario preguntó qué es la sede virtual; se explicó (sucursal `is_virtual` "Templo Online" que el fallback de `resolveUserBranchId` busca por nombre dentro del gimnasio; sin ella, error de servidor — receta 07 §1.4). Eligió la variante con sede física opcional.

| Option                                   | Description                                                              | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Resumen + credenciales + link al subdominio | URL, email owner, contraseña temporal una vez, checklist aprovisionado | ✓        |
| Resumen mínimo                           | Solo 'creado' + URL                                                      |          |

---

## Aprovisionamiento y aislamiento

| Option                                        | Description                                                        | Selected |
| --------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Un servicio `provisionTenant()` transaccional único | Atómico, idempotente por slug, lo usan wizard, ISO y la 192  | ✓        |
| Servicio + migración de datos por tenant      | Duplica fuente de verdad                                           |          |
| Vos decidís                                   |                                                                    |          |

| Option                                              | Description                                                   | Selected |
| --------------------------------------------------- | ------------------------------------------------------------- | -------- |
| Nuevo iso-04 con tenant creado por provisionTenant() | Aislamiento owner↔tenant 1, super-owner↔tenant, Host resuelve | ✓        |
| Solo reusar iso-01..03                              | No prueba el camino real                                      |          |
| Vos decidís                                         |                                                               |          |

| Option                                    | Description                                                     | Selected |
| ----------------------------------------- | --------------------------------------------------------------- | -------- |
| Tenant `demo` de plataforma en prod       | UAT real de subdominio, login y aislamiento; permanente         | ✓        |
| Solo en staging; prod recién en la 192    | Primer uso real del wizard en prod con un cliente               |          |

| Option                                              | Description                                    | Selected |
| --------------------------------------------------- | ---------------------------------------------- | -------- |
| Explícitos: gimnasio=true y los 4 templo-*=false    | 5 filas auditables                             | ✓        |
| Solo gimnasio=true; templo-* ausentes = OFF         | 1 fila, depende del default                    |          |

---

## Áreas adicionales ofrecidas y no discutidas

Auditoría de acciones de plataforma, contrato de tipos API↔frontends, orden de entrega infra/API/UI, recuperación de acceso del super-owner. El usuario prefirió cerrar el contexto; quedan como discreción del planner o diferidas (ver CONTEXT.md).

## Claude's Discretion

Forma del hook de resolución por Host; estructura del rate limit/auditoría/expiración exacta del JWT; runbook de infra y orden de entrega; nombres del comando CLI y del módulo `src/modules/platform/`; contrato de tipos (espejo manual).

## Deferred Ideas

2FA/TOTP; gestión de usuarios de plataforma en UI; recuperación de contraseña del super-owner más allá del CLI; paquete compartido de tipos; migración de hosts de El Templo (descartada); login scoped por host para la app Kaia (fase de la app de alumnos).
