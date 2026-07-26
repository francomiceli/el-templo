# Phase 164: Pantalla TV de sucursal — plani viva por bloque - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-24
**Phase:** 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
**Areas discussed:** Vinculación y seguridad, TV fuera de clase, Fallback sin sesión, Sonido de beeps, Control remoto (sede y concurrencia), Qué sesión muestra el TV, Multi-TV y monitoreo, Setup del kiosco, Timer (pausa y cuenta previa), Fin de la clase, TV vs deploys

---

## Vinculación y seguridad

| Option              | Description                                            | Selected |
| ------------------- | ------------------------------------------------------ | -------- |
| Dueño + coach       | El que está en la sede frente al TV suele ser el profe | ✓        |
| Solo Dueño          | Máximo control, pero nadie más re-vincula un sábado    |          |
| Cualquier rol staff | Más laxo, amplía la superficie                         |          |

**User's choice:** Dueño + coach pueden vincular.

| Option             | Description                                  | Selected |
| ------------------ | -------------------------------------------- | -------- |
| ~10 min, rota solo | Ventana corta contra códigos fotografiados   |          |
| Hasta que se use   | Código fijo hasta vincularse, más simple     | ✓        |
| ~1 hora            | Ventana amplia para coordinación a distancia |          |

**User's choice:** Pairing code sin expiración, fijo hasta usarse.

| Option                   | Description                                    | Selected |
| ------------------------ | ---------------------------------------------- | -------- |
| Sin expirar, revocable   | Fila en tv_devices desactivable desde el admin | ✓        |
| Expira a los 6-12 meses  | Rotación forzada, el TV amanece desvinculado   |          |
| Stateless HMAC (como QR) | Mínimo código, sin revocación individual       |          |

**User's choice:** Token sin expiración, revocable por fila.

---

## TV fuera de clase

| Option                | Description                                         | Selected |
| --------------------- | --------------------------------------------------- | -------- |
| Reloj gigante + logo  | Estética PDF, cumple el pedido #1 incluso sin clase | ✓        |
| Reloj + próxima clase | Requiere leer la grilla de horarios                 |          |
| Solo logo             | No aprovecha el segundero pedido                    |          |

**User's choice:** Reloj gigante + logo. **Ampliado en ronda 3:** mantener también la quote/frase del PDF.

| Option                 | Description                                    | Selected          |
| ---------------------- | ---------------------------------------------- | ----------------- |
| Fin del día automático | El TV amanece siempre en reposo, lazy sin cron | ✓ (final)         |
| Inactividad ~2h        | Puede apagar una clase larga legítima          |                   |
| Solo manual            | El TV puede quedar mostrando el bloque de ayer | (elegida primero) |

**User's choice:** Eligió "solo manual"; ante la repregunta del borde del día siguiente ("¿qué hace el TV a la mañana con el estado de ayer?") respondió "bueno entonces hace limpieza automática" → limpieza automática al fin del día (TZ sede) + botón manual "terminar clase".

---

## Fallback sin sesión aprobada

| Option                  | Description                                      | Selected |
| ----------------------- | ------------------------------------------------ | -------- |
| Reposo, sin mensaje     | Los socios nunca ven un error interno            | ✓        |
| Reposo + aviso discreto | Expone cocina interna                            |          |
| Última sesión aprobada  | Riesgo de plani equivocada sin que nadie lo note |          |

**User's choice:** TV en reposo sin mensaje.

| Option                 | Description                                | Selected |
| ---------------------- | ------------------------------------------ | -------- |
| Aviso explícito        | El profe sabe por qué el TV está en reposo | ✓        |
| Mismo reposo que el TV | Genera confusión ("¿se rompió?")           |          |

**User's choice:** Control remoto con aviso explícito y controles deshabilitados.

---

## Sonido de beeps

| Option                            | Description                                   | Selected |
| --------------------------------- | --------------------------------------------- | -------- |
| OFF default, profe activa         | Evita beeps inesperados; convive con autoplay | ✓        |
| ON default                        | Exige resolver autoplay en cada kiosco        |          |
| ON solo en formatos de intervalos | Default inteligente, convención extra         |          |

**User's choice:** OFF por default; el profe activa desde el celular.

---

## Control remoto: sede y concurrencia

| Option                     | Description                                 | Selected |
| -------------------------- | ------------------------------------------- | -------- |
| Default su sede + selector | Cubre profes que rotan y al Dueño           | ✓        |
| Solo su sede asignada      | Deja afuera al profe que cubre en otra sede |          |
| Selector libre siempre     | Tap extra para el caso común                |          |

**User's choice:** Default = sede asignada + selector.

| Option                      | Description                                      | Selected |
| --------------------------- | ------------------------------------------------ | -------- |
| Última escritura gana       | Sin locks; en la práctica hay un profe por clase | ✓        |
| Aviso "X está controlando"  | Informa sin bloquear                             |          |
| Lock exclusivo con takeover | Fricción y estados raros                         |          |

**User's choice:** Última escritura gana.

| Option                | Description                    | Selected        |
| --------------------- | ------------------------------ | --------------- |
| Estado compacto       | El profe opera sin mirar el TV |                 |
| Solo botones          | Control ciego, más simple      | ✓ (con detalle) |
| Réplica visual del TV | Dos renders del mismo layout   |                 |

**User's choice (texto libre):** "Solo botones grandes, es importante que sean grandes ya que necesitan agilidad para manejarlo en el medio de una clase; separadores tipo: BLOQUES, NIVELES, EJERCICIO, TIMER".

---

## Qué sesión muestra el TV

| Option                           | Description                         | Selected |
| -------------------------------- | ----------------------------------- | -------- |
| Siempre la plani regular         | V1 simple, igual que la ve un socio | ✓        |
| Selector de sesión en el control | Más flexible, más lógica            |          |

**User's choice:** Siempre la plani regular del día.

| Option                     | Description                          | Selected |
| -------------------------- | ------------------------------------ | -------- |
| Persiste entre bloques     | Arranca en α, se mantiene al avanzar | ✓        |
| Resetea a α en cada bloque | Obliga a re-elegir nivel por bloque  |          |

**User's choice:** Nivel persiste entre bloques.

---

## Multi-TV y monitoreo

| Option                | Description                                | Selected |
| --------------------- | ------------------------------------------ | -------- |
| Sí, espejan el estado | Estado por sede, sale gratis con el diseño | ✓        |
| Uno solo por sede     | Restricción sin ganancia clara             |          |

**User's choice:** Varios TVs por sede espejando el mismo estado.

| Option                            | Description                               | Selected |
| --------------------------------- | ----------------------------------------- | -------- |
| Sí, en la pantalla de vinculación | "Visto hace X" + revocar, costo mínimo    | ✓        |
| Sin monitoreo en v1               | Se descubre mirando el TV                 |          |
| Monitoreo + aviso al profe        | Más código; el profe tiene el TV enfrente |          |

**User's choice:** last_seen en la pantalla de vinculación.

---

## Setup del kiosco por sede

| Option                                | Description                             | Selected        |
| ------------------------------------- | --------------------------------------- | --------------- |
| Probar browser del TV, stick si falla | Decisión por sede, sin gasto anticipado |                 |
| Stick/mini-PC en todas                | Entorno controlable, costo día 1        |                 |
| Solo browser del smart TV             | Riesgo de compatibilidad                | (≈, endurecida) |

**User's choice (texto libre):** "Necesitamos que funcione sí o sí en lo que traiga el TV, por lo que es importante que el desarrollo tenga en cuenta esto" → restricción dura de compatibilidad con browsers de smart TV (CSS conservador/fallback de `cqw`, H.264 básico, WebAudio opcional, sin flags de Chrome).

| Option           | Description                 | Selected |
| ---------------- | --------------------------- | -------- |
| Sí, doc corto    | Runbook por sede en el repo | ✓        |
| No, setup ad-hoc | Conocimiento en cabezas     |          |

**User's choice:** Runbook corto incluido en la fase.

---

## Timer: pausa y cuenta previa

| Option            | Description                | Selected |
| ----------------- | -------------------------- | -------- |
| 10s PREPARADOS    | Estándar en apps de tabata |          |
| 3-2-1 corto       | Más ágil                   |          |
| Sin cuenta previa | El profe avisa a viva voz  | ✓        |

**User's choice:** Sin cuenta previa.

| Option                        | Description                        | Selected |
| ----------------------------- | ---------------------------------- | -------- |
| Congela y reanuda donde quedó | pausedAt/acumulado en el estado    | ✓        |
| Solo reset                    | Estado más simple, pierde la ronda |          |

**User's choice:** Pausa real que congela y reanuda.

| Option        | Description               | Selected |
| ------------- | ------------------------- | -------- |
| No en v1      | Solo iniciar/pausar/reset | ✓        |
| Sí, ronda ◀ ▶ | Más botones y estados     |          |

**User's choice:** Sin saltar rondas en v1.

---

## Fin de la clase

| Option             | Description                             | Selected        |
| ------------------ | --------------------------------------- | --------------- |
| Pantalla de cierre | Estética PDF hasta que el profe termine | ✓ (con detalle) |
| Directo a reposo   | Un estado menos                         |                 |

**User's choice (texto libre):** "Pantalla de cierre con logo, reloj y frase de las quotes que se usan hoy en el pdf".

---

## TV siempre abierto vs deploys

| Option                  | Description                                  | Selected |
| ----------------------- | -------------------------------------------- | -------- |
| Auto-reload por versión | Poll lleva versión; reload en momento seguro | ✓        |
| Reload diario fijo      | Deploy de la mañana llega al día siguiente   |          |
| Manual                  | Dolor operativo con 6 sedes                  |          |

**User's choice:** Auto-reload por versión (nunca en medio de un bloque).

---

## Claude's Discretion

- Naming/estructura de tablas nuevas (tv_devices, tv_class_state) y forma del pairing code.
- Intervalo exacto de polling dentro del rango 2-3s del UI-SPEC.
- Rollout: sin flag ni piloto (área ofrecida, no seleccionada).
- Nombres de campos del contrato de estado.

## Deferred Ideas

- Selector de sesión en el control (especiales/Aura en el TV).
- "Próxima clase" en la pantalla de reposo.
- Saltar/ajustar rondas del timer.
- Aviso al profe "el TV no responde" durante la clase.
- Upgrade de polling a SSE (previsto en UI-SPEC como cambio de transporte).
- Todo revisado y no incorporado: "Rollout de datos v5.1 — poblar milestone_exercise_id" (falso positivo del matcher).
