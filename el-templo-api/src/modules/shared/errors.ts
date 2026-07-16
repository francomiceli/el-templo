/**
 * Typed HTTP Error Classes
 *
 * Used in route handlers to throw errors with consistent HTTP status codes.
 * Fastify error handler can inspect `statusCode` for proper responses.
 */

export class AppError extends Error {
  readonly statusCode: number;
  /**
   * Optional machine-readable discriminator for callers that need to branch on
   * a specific error beyond the HTTP status (e.g. the app shows a tailored
   * dialog). The default route error handler does NOT serialize this — a route
   * must surface it explicitly (see scheduling/routes.ts /reserve).
   */
  readonly code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Datos invalidos") {
    super(message, 400);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Solicitud invalida") {
    super(message, 400);
  }
}

/**
 * Phase 144-04 (BOOK-BLOCK, D-12) — a member tried to reserve a presencial
 * class dated AFTER their plan's covered-until. Carries a distinguishable
 * `code = "COVERAGE_EXPIRED"` so the /reserve route can surface it and the app
 * can open the renewal dialog instead of the generic negative notify.
 */
export class CoverageExpiredError extends BadRequestError {
  readonly code = "COVERAGE_EXPIRED";

  constructor(
    message = "Necesitás renovar tu membresía para reservar esta clase",
  ) {
    super(message);
  }
}

/**
 * Fase 161 (PASE-01, GATE-01) — un member intentó reservar una actividad especial
 * (Verticales, Acrobacias, Open Gym) sin un pase "Actividades con Aura" activo.
 * Carga un `code = "PASS_REQUIRED"` distinguible para que la ruta /reserve lo
 * surface y la app abra el diálogo de compra del pase en vez del notify genérico.
 * Espejo exacto de CoverageExpiredError.
 */
export class PassRequiredError extends BadRequestError {
  readonly code = "PASS_REQUIRED";

  constructor(
    message = "Necesitás el pase de actividades para reservar esta clase",
  ) {
    super(message);
  }
}

/**
 * Fase 165 (SELF-02, D-04) — un freemium intentó reservar su sesión de prueba
 * self-service sin teléfono (ni en el perfil ni en el body). Carga un
 * `code = "PHONE_REQUIRED"` distinguible para que la app abra el input de
 * teléfono en el diálogo de confirmación en vez del notify genérico.
 * Espejo exacto de PassRequiredError.
 */
export class PhoneRequiredError extends BadRequestError {
  readonly code = "PHONE_REQUIRED";

  constructor(
    message = "Necesitamos tu teléfono para reservar la sesión de prueba",
  ) {
    super(message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflicto") {
    super(message, 409);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acceso denegado") {
    super(message, 403);
  }
}
