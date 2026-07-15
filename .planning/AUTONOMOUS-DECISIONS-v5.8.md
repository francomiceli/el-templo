# Decisiones autónomas — v5.8 Sesiones de Prueba

Franco pidió encadenar plan + ejecución de las 3 fases (163-165) automáticamente
mientras está afuera (2026-07-15). Este archivo registra toda decisión tomada sin
consulta, para revisión al volver. Guardrails de la corrida: **sin push, sin SSH, sin
instalar dependencias, sin tocar prod**; todo local en la rama
`feat/sesiones-prueba-v58`; typecheck local api + `vue-tsc` en frontends tocados.

## Gates del workflow auto-aprobados

1. **Requirements v5.8 auto-aprobados** — son la transcripción directa del repaso punto
   por punto del brief que Franco validó en la sesión (Ganado sin ventana, p90 en
   system_settings, teléfono obligatorio, contador derivado, source auto/manual,
   backfill con backup). Sin scope agregado.
2. **Roadmap auto-aprobado** — estructura de 3 fases (163 foundational → 164, 165)
   idéntica a la que Franco aprobó al crear el milestone.
3. **Discuss-phase salteado en las 3 fases** — el contexto ya se levantó en la sesión
   (brief + 3 mapeos de codebase + repaso con Franco). SELF-04 (fricciones de UX de
   gestión) se acota a mejoras evidentes en el flujo actual; lo que requiera input de
   Nacho queda como pendiente humano, no se inventa.

## Decisiones técnicas tomadas sin consulta

4. **p90 sin acceso a prod:** la migración calcula el p90 dinámicamente sobre los datos
   de la DB donde corre (Ganados con booking is_trial y primera suscripción), con
   default de resguardo si hay menos de N casos usables. Así el seed en prod usa los
   datos reales de prod sin SSH previo. El valor efectivo sembrado en prod queda como
   ítem de verificación humana post-deploy.
5. **Dry-run del backfill:** sin acceso a prod, el dry-run exigido por el brief se
   implementa como script/query commiteado + verificación contra la DB local de tests;
   la corrida del dry-run contra prod antes del deploy queda como pendiente humano
   (checklist de la fase).
6. **Migraciones:** tomar los siguientes números libres tras el máximo aplicado (0180),
   verificando el árbol (hay un 0181 en rama no ejecutada — se documenta la colisión y
   v5.6 renumera después, patrón ya usado por v5.5/v5.7).
7. **UAT humana:** todo lo que requiera ojos/celular (UAT visual del self-service en
   staging/prod, confirmación de textos con Nacho) va a `1XX-HUMAN-UAT.md` de cada
   fase, no bloquea la ejecución.

## Pendientes que quedan para Franco al volver

- Revisar este archivo + SUMMARYs de las fases.
- Decidir push a staging (nunca lo hago solo).
- Correr/validar dry-run del backfill contra prod y el p90 real sembrado.
- UAT humana de las 3 fases + fricciones reales de gestión para SELF-04 con Nacho.
