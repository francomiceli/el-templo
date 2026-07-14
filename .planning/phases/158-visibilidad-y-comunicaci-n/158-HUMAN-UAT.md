---
status: partial
phase: 158-visibilidad-y-comunicaci-n
source: [158-VERIFICATION.md]
started: 2026-07-11T15:00:00Z
updated: 2026-07-11T15:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Pantalla "Mis referidos" (app) — recorrido visual

Abrir la app como socio → Mi perfil → "Mis referidos". Verificar los 3 bloques según UI-SPEC S1: código prominente con botón "Compartir mi código", descuento con desglose pedagógico (o headline 0%), y vínculos con chips Pendiente/Activo/Suspendido.
expected: Pantalla renderiza según el contrato visual aprobado (cards dark de ProfilePage, terracotta, copy es-AR); el bloque código+share visible SIEMPRE, incluso con cero vínculos.
result: [pending]

### 2. Share nativo + fallback

En un dispositivo (Android o iOS), tocar "Compartir mi código". En web/desktop, provocar el fallback (o probar donde Share no está disponible).
expected: En dispositivo abre el share sheet nativo con el link https://app.eltemplo.org/register?ref=CODE; donde falla, copia el link al portapapeles y muestra el notify warning con el copy de UI-SPEC.
result: [pending]

### 3. Push de activación end-to-end (staging)

En staging: crear un vínculo pending (alta con "¿Quién lo trajo?") y cobrar el primer plan del referido. El referidor debe tener la app instalada con device token.
expected: El referidor recibe UN push "¡Tu referido pagó!" con el nombre del referido en el cuerpo; al tocarlo la app navega a /mis-referidos. El referido no recibe push.
result: [pending]

### 4. Navegación entre fichas del admin (fix 68aa3661)

En el admin: abrir la ficha de un alumno con referidos → tab "Referidos" → clickear el nombre en "Lo trajo" o "Trajo a".
expected: La URL cambia a la ficha del otro alumno Y toda la ficha (perfil, suscripción, finanzas, referidos) muestra los datos del alumno destino, no los del anterior.
result: [pending]

### 5. Decisión de rol WR-05 — quién ve el tab Referidos

Login en el admin con un usuario rol "gestion" (o coach/recepción) → ficha de cualquier alumno → tab "Referidos".
expected: DECISIÓN DE NEGOCIO PENDIENTE: hoy el tab es visible para todos los roles que entran a la ficha, pero el endpoint responde 403 a todo lo que no sea admin/owner → gestión ve el tab y recibe el toast de error. Confirmar con Nacho/negocio si gestión debe ver referidos (cambiar guard a MEMBER_LIFECYCLE_ROLES) o si el tab debe ocultarse para roles sin acceso.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
