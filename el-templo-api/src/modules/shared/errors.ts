/**
 * Typed HTTP Error Classes
 *
 * Used in route handlers to throw errors with consistent HTTP status codes.
 * Fastify error handler can inspect `statusCode` for proper responses.
 */

export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
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
