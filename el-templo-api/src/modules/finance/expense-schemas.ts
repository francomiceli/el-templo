/**
 * Schemas Ajv de Egresos (fase 209, DI-13).
 *
 * Mismo patrón que `schemas.ts`: JSON Schema con `as const`, sin Zod.
 *
 * Plata en ENTEROS (D-23): todo importe es `type: "integer"` con tope
 * `MAX_MONEY`; un decimal da 400. El único decimal es `fxRate` (tipo de cambio
 * informativo). Fastify corre con `removeAdditional` y `coerceTypes`: un campo
 * extra del body se descarta sin 400 y `"1500"` llega como 1500.
 *
 * El país NO viaja en el body: sale del scope del request. Se declara `country`
 * en los querystrings porque el owner lo elige con `?country=` (el hook del
 * plugin lo lee antes de validar).
 */

import { EXPENSE_AMOUNT_STATUSES } from "../../db/schema";
import { MAX_MONEY } from "./expense-math";
import { EXPENSE_PAYMENT_METHODS } from "./expense-types";

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const errorResponses = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  500: errorSchema,
} as const;

// -- Fragmentos compartidos --------------------------------------------------

/** Importe entero de un gasto o de una parte del reparto. */
const moneyAmount = {
  type: "integer",
  minimum: 1,
  maximum: MAX_MONEY,
} as const;

/** Tipo de cambio: pesos por unidad de moneda extranjera, hasta 4 decimales. */
const fxRateSchema = {
  type: ["number", "null"],
  exclusiveMinimum: 0,
  maximum: 99999999.9999,
} as const;

/** Mes de imputación `AAAA-MM`. */
const IMPUTATION_MONTH_PATTERN = "^\\d{4}-(0[1-9]|1[0-2])$";

const imputationMonthSchema = {
  type: "string",
  pattern: IMPUTATION_MONTH_PATTERN,
} as const;

/** El owner elige el país con `?country=`; el resto usa el suyo. */
const countryQuery = {
  country: { type: "string", enum: ["AR", "ES"] },
} as const;

const expenseAllocationSchema = {
  type: "object",
  required: ["branchId", "amount"],
  properties: {
    // null = Casa Matriz
    branchId: { type: ["integer", "null"], minimum: 1 },
    amount: moneyAmount,
  },
  additionalProperties: false,
} as const;

const receiptLinkSchema = {
  type: "object",
  required: ["url"],
  properties: {
    label: { type: "string", maxLength: 80 },
    url: { type: "string", minLength: 1, maxLength: 500 },
  },
  additionalProperties: false,
} as const;

const idParams = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "integer", minimum: 1 },
  },
} as const;

const AMOUNT_STATUS_ENUM = EXPENSE_AMOUNT_STATUSES;
const CURRENCY_ENUM = ["ARS", "USD", "EUR"] as const;

// -- POST /expense-records ----------------------------------------------------

export const createExpenseRecordSchema = {
  querystring: {
    type: "object",
    properties: { ...countryQuery },
  },
  body: {
    type: "object",
    required: [
      "concept",
      "costCenterId",
      "imputationMonth",
      "amount",
      "currency",
      "amountStatus",
      "allocations",
    ],
    properties: {
      concept: { type: "string", minLength: 1, maxLength: 200 },
      beneficiary: { type: ["string", "null"], maxLength: 200 },
      costCenterId: { type: "integer", minimum: 1 },
      imputationMonth: imputationMonthSchema,
      amount: moneyAmount,
      currency: { type: "string", enum: CURRENCY_ENUM },
      amountStatus: { type: "string", enum: AMOUNT_STATUS_ENUM },
      fxRate: fxRateSchema,
      receiptLinks: {
        type: "array",
        maxItems: 10,
        items: receiptLinkSchema,
      },
      notes: { type: ["string", "null"], maxLength: 2000 },
      allocations: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: expenseAllocationSchema,
      },
      idempotencyKey: { type: ["string", "null"], minLength: 1, maxLength: 64 },
    },
    additionalProperties: false,
  },
  response: errorResponses,
} as const;

// -- PATCH /expense-records/:id ----------------------------------------------

export const updateExpenseRecordSchema = {
  params: idParams,
  querystring: {
    type: "object",
    properties: { ...countryQuery },
  },
  body: {
    type: "object",
    minProperties: 1,
    properties: {
      concept: { type: "string", minLength: 1, maxLength: 200 },
      beneficiary: { type: ["string", "null"], maxLength: 200 },
      costCenterId: { type: "integer", minimum: 1 },
      imputationMonth: imputationMonthSchema,
      amount: moneyAmount,
      amountStatus: { type: "string", enum: AMOUNT_STATUS_ENUM },
      fxRate: fxRateSchema,
      receiptLinks: {
        type: "array",
        maxItems: 10,
        items: receiptLinkSchema,
      },
      notes: { type: ["string", "null"], maxLength: 2000 },
      allocations: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: expenseAllocationSchema,
      },
      reason: { type: ["string", "null"], maxLength: 500 },
    },
    additionalProperties: false,
  },
  response: errorResponses,
} as const;

// -- POST /expense-records/:id/void ------------------------------------------

export const voidExpenseRecordSchema = {
  params: idParams,
  querystring: {
    type: "object",
    properties: { ...countryQuery },
  },
  body: {
    type: "object",
    required: ["reason"],
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
    additionalProperties: false,
  },
  response: errorResponses,
} as const;

// -- GET /expense-records -----------------------------------------------------

export const listExpenseRecordsSchema = {
  querystring: {
    type: "object",
    properties: {
      month: imputationMonthSchema,
      // id de sede o "casa_matriz"
      destination: { type: "string", pattern: "^(\\d+|casa_matriz)$" },
      costCenterId: { type: "integer", minimum: 1 },
      status: {
        type: "string",
        enum: ["pendiente", "parcial", "pagado", "por_pagar"],
      },
      q: { type: "string", maxLength: 100 },
      includeVoided: { type: "boolean" },
      page: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      ...countryQuery,
    },
  },
  response: errorResponses,
} as const;

// -- GET /expense-records/:id -------------------------------------------------

export const expenseRecordIdSchema = {
  params: idParams,
  querystring: {
    type: "object",
    properties: { ...countryQuery },
  },
  response: errorResponses,
} as const;

// -- GET /expense-records/form-options ---------------------------------------

export const expenseFormOptionsSchema = {
  querystring: {
    type: "object",
    properties: { ...countryQuery },
  },
  response: errorResponses,
} as const;

// -- POST /expense-records/:id/payments --------------------------------------

/** Fecha `AAAA-MM-DD` (sin `format`: la validez del calendario la chequea el service). */
const ISO_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

export const registerExpensePaymentSchema = {
  params: idParams,
  querystring: {
    type: "object",
    properties: { ...countryQuery },
  },
  body: {
    type: "object",
    required: ["paidOn", "cashRegisterId", "paymentMethod", "amount"],
    properties: {
      paidOn: { type: "string", pattern: ISO_DATE_PATTERN },
      cashRegisterId: { type: "integer", minimum: 1 },
      paymentMethod: { type: "string", enum: EXPENSE_PAYMENT_METHODS },
      // Importe en la moneda de la cuenta, entero (D-23).
      amount: moneyAmount,
      fxRate: fxRateSchema,
      reference: { type: ["string", "null"], maxLength: 100 },
      notes: { type: ["string", "null"], maxLength: 2000 },
      idempotencyKey: { type: ["string", "null"], minLength: 1, maxLength: 64 },
    },
    additionalProperties: false,
  },
  response: errorResponses,
} as const;

// -- POST /expense-records/:id/payments/:paymentId/void ----------------------

export const voidExpensePaymentSchema = {
  params: {
    type: "object",
    required: ["id", "paymentId"],
    properties: {
      id: { type: "integer", minimum: 1 },
      paymentId: { type: "integer", minimum: 1 },
    },
  },
  querystring: {
    type: "object",
    properties: { ...countryQuery },
  },
  body: {
    type: "object",
    required: ["reason"],
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
    additionalProperties: false,
  },
  response: errorResponses,
} as const;
