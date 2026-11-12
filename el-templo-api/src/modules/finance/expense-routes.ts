/**
 * Rutas del gasto de Egresos (fase 209, DI-13).
 *
 * Viven DENTRO del plugin finance (`registerExpenseRoutes` se llama desde
 * `financeRoutes`): heredan el prefijo `/api/admin/finance` y el hook
 * `onRequest` (autenticación, rol de lectura de finance y `attachCountryScope`).
 *
 * Permisos (DI-14): el hook del plugin deja pasar a `admin_sede` y `recepcion`
 * (están en FINANCE_READ_ROLES), así que CADA handler chequea por su cuenta
 * `EXPENSES_ROLES` (operar) o `EXPENSES_VOID_ROLES` (anular) y responde 403.
 *
 * Sin el guard de alcance por caja (DI-07): da 404 a un no-owner en cuentas sin
 * sede (bancos, Caja central) y gestion tiene que verlas al elegir de dónde
 * pagar. Estas rutas validan país y gimnasio en el service (`assertTenant` acá
 * + `tenantWhere` allá).
 *
 * País: sale del scope, nunca del body. El owner elige con `?country=` (lo lee
 * el hook del plugin); el resto usa el suyo. Por id, el owner ve gastos de
 * cualquier país y el resto solo los del suyo (un gasto de otro país es 404).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { handleServiceError } from "../shared/error-handler";
import { BadRequestError } from "../shared/errors";
import { EXPENSES_ROLES, EXPENSES_VOID_ROLES } from "../shared/permissions";
import { assertTenant } from "../shared/tenant";
import type { TransactionService } from "./transaction-service";
import type { CashRegisterService } from "./cash-register-service";
import { ExpenseRecordService } from "./expense-record-service";
import { ExpensePaymentService } from "./expense-payment-service";
import {
  createExpenseRecordSchema,
  expenseFormOptionsSchema,
  expenseRecordIdSchema,
  listExpenseRecordsSchema,
  updateExpenseRecordSchema,
  voidExpenseRecordSchema,
} from "./expense-schemas";
import type {
  CreateExpenseRecordInput,
  ExpenseCountry,
  ExpenseListFilters,
  ExpensePaymentStatus,
  UpdateExpenseRecordInput,
} from "./expense-types";

interface CountryQuery {
  country?: ExpenseCountry;
}

interface IdParams {
  id: number;
}

interface ListQuery extends CountryQuery {
  month?: string;
  destination?: string;
  costCenterId?: number;
  status?: ExpensePaymentStatus | "por_pagar";
  q?: string;
  includeVoided?: boolean;
  page?: number;
  limit?: number;
}

const FORBIDDEN_MESSAGE = "No tenés permiso para Egresos";
const FORBIDDEN_VOID_MESSAGE = "Solo owner y admin pueden anular en Egresos";
const COUNTRY_ERROR_MESSAGE = "No se pudo determinar el país";

/**
 * Chequea el rol del handler. Devuelve `true` si ya respondió 403 (el handler
 * tiene que cortar).
 */
function denyUnlessRole(
  request: FastifyRequest,
  reply: FastifyReply,
  roles: readonly string[],
  message: string,
): boolean {
  if (roles.includes(request.user.role)) return false;
  void reply.code(403).send({ error: "Acceso denegado", message });
  return true;
}

/** País del request para escribir y listar: el del scope (owner: `?country=`). */
function resolveCountry(request: FastifyRequest): ExpenseCountry {
  const country = request.scope.country;
  if (country === "AR" || country === "ES") return country;
  throw new BadRequestError(COUNTRY_ERROR_MESSAGE);
}

/**
 * País para leer o tocar un gasto por id: `null` para el owner (ve cualquier
 * país), el del scope para el resto (un gasto de otro país es 404). Un no-owner
 * sin país resoluble falla cerrado, nunca queda como "cualquiera".
 */
function byIdCountry(request: FastifyRequest): ExpenseCountry | null {
  if (request.scope.isOwner) return null;
  return resolveCountry(request);
}

function parseDestination(
  destination: string | undefined,
): ExpenseListFilters["destination"] {
  if (destination === undefined) return undefined;
  return destination === "casa_matriz" ? "casa_matriz" : Number(destination);
}

export function registerExpenseRoutes(
  fastify: FastifyInstance,
  deps: {
    transactionService: TransactionService;
    cashRegisterService: CashRegisterService;
  },
): void {
  const recordService = new ExpenseRecordService(fastify.db, fastify.log);
  const paymentService = new ExpensePaymentService(
    fastify.db,
    fastify.log,
    deps.transactionService,
    deps.cashRegisterService,
    recordService,
  );

  // GET /expense-records/form-options — cuentas (sin saldos), destinos del
  // reparto y rubros activos del país. Estática: va ANTES de /:id.
  fastify.get<{ Querystring: CountryQuery }>(
    "/expense-records/form-options",
    { schema: expenseFormOptionsSchema },
    async (request, reply) => {
      try {
        if (denyUnlessRole(request, reply, EXPENSES_ROLES, FORBIDDEN_MESSAGE)) {
          return reply;
        }
        const ctx = assertTenant(
          request.scope,
          "finance.expense-records.form-options",
        );
        const country = resolveCountry(request);
        return await paymentService.getFormOptions(ctx, country);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "expense records form options",
        );
        return reply;
      }
    },
  );

  // GET /expense-records — listado paginado con filtros. Lectura.
  fastify.get<{ Querystring: ListQuery }>(
    "/expense-records",
    { schema: listExpenseRecordsSchema },
    async (request, reply) => {
      try {
        if (denyUnlessRole(request, reply, EXPENSES_ROLES, FORBIDDEN_MESSAGE)) {
          return reply;
        }
        const ctx = assertTenant(request.scope, "finance.expense-records.list");
        const country = resolveCountry(request);
        const { destination, ...query } = request.query;
        return await recordService.list(ctx, {
          month: query.month,
          costCenterId: query.costCenterId,
          status: query.status,
          q: query.q,
          includeVoided: query.includeVoided,
          page: query.page,
          limit: query.limit,
          country,
          destination: parseDestination(destination),
        });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list expense records");
        return reply;
      }
    },
  );

  // POST /expense-records — alta. 201 si lo creó, 200 si la `idempotencyKey`
  // ya existía (devuelve el mismo gasto).
  fastify.post<{ Body: CreateExpenseRecordInput; Querystring: CountryQuery }>(
    "/expense-records",
    { schema: createExpenseRecordSchema },
    async (request, reply) => {
      try {
        if (denyUnlessRole(request, reply, EXPENSES_ROLES, FORBIDDEN_MESSAGE)) {
          return reply;
        }
        const ctx = assertTenant(
          request.scope,
          "finance.expense-records.create",
        );
        const country = resolveCountry(request);
        const { record, created } = await recordService.create(
          ctx,
          country,
          request.body,
          request.user.userId,
        );
        return reply.code(created ? 201 : 200).send({ record });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "create expense record");
        return reply;
      }
    },
  );

  // GET /expense-records/:id — detalle con pagos e historial. Lectura.
  fastify.get<{ Params: IdParams; Querystring: CountryQuery }>(
    "/expense-records/:id",
    { schema: expenseRecordIdSchema },
    async (request, reply) => {
      try {
        if (denyUnlessRole(request, reply, EXPENSES_ROLES, FORBIDDEN_MESSAGE)) {
          return reply;
        }
        const ctx = assertTenant(
          request.scope,
          "finance.expense-records.detail",
        );
        const record = await recordService.getDetail(ctx, request.params.id, {
          country: byIdCountry(request),
        });
        return { record };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "expense record detail");
        return reply;
      }
    },
  );

  // PATCH /expense-records/:id — edición (DI-09).
  fastify.patch<{
    Params: IdParams;
    Body: UpdateExpenseRecordInput;
    Querystring: CountryQuery;
  }>(
    "/expense-records/:id",
    { schema: updateExpenseRecordSchema },
    async (request, reply) => {
      try {
        if (denyUnlessRole(request, reply, EXPENSES_ROLES, FORBIDDEN_MESSAGE)) {
          return reply;
        }
        const ctx = assertTenant(
          request.scope,
          "finance.expense-records.update",
        );
        const record = await recordService.update(
          ctx,
          request.params.id,
          request.body,
          request.user.userId,
          { country: byIdCountry(request) },
        );
        return { record };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "update expense record");
        return reply;
      }
    },
  );

  // POST /expense-records/:id/void — anulación (DI-10). Solo owner y admin;
  // 409 si el gasto tiene pagos vigentes.
  fastify.post<{
    Params: IdParams;
    Body: { reason: string };
    Querystring: CountryQuery;
  }>(
    "/expense-records/:id/void",
    { schema: voidExpenseRecordSchema },
    async (request, reply) => {
      try {
        if (
          denyUnlessRole(
            request,
            reply,
            EXPENSES_VOID_ROLES,
            FORBIDDEN_VOID_MESSAGE,
          )
        ) {
          return reply;
        }
        const ctx = assertTenant(request.scope, "finance.expense-records.void");
        const record = await recordService.void(
          ctx,
          request.params.id,
          request.body.reason,
          request.user.userId,
          { country: byIdCountry(request) },
        );
        return { record };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "void expense record");
        return reply;
      }
    },
  );
}
