import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { extractError, isExpectedClientError, parseActiveTransactionsBlock } from '../extract-error';

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const response: AxiosResponse = {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    response
  );
}

describe('extractError', () => {
  // Caso real 2026-10-08: anular un cobro incluido en un retiro de caja
  // mostraba "Request failed with status code 409" en vez del motivo.
  it('devuelve el mensaje del servidor en un 409 (cobro en un retiro)', () => {
    const err = axiosErrorWith(409, {
      message:
        'Este cobro está incluido en el retiro #2597 del 2026-10-06. Anulá primero ese retiro.',
    });
    expect(extractError(err, 'Error anulando transacción')).toBe(
      'Este cobro está incluido en el retiro #2597 del 2026-10-06. Anulá primero ese retiro.'
    );
  });

  it('usa data.error cuando no hay data.message', () => {
    const err = axiosErrorWith(400, { error: 'Razon de anulacion requerida' });
    expect(extractError(err, 'fallback')).toBe('Razon de anulacion requerida');
  });

  it('cae al mensaje del error si el cuerpo no trae texto', () => {
    const err = axiosErrorWith(500, {});
    expect(extractError(err, 'fallback')).toBe('Request failed with status code 500');
  });

  it('usa el fallback para valores que no son errores', () => {
    expect(extractError('boom', 'fallback')).toBe('fallback');
  });
});

describe('isExpectedClientError', () => {
  it('es true para 4xx con respuesta', () => {
    expect(isExpectedClientError(axiosErrorWith(409, {}))).toBe(true);
    expect(isExpectedClientError(axiosErrorWith(400, {}))).toBe(true);
  });

  it('es false para 5xx y errores sin respuesta HTTP', () => {
    expect(isExpectedClientError(axiosErrorWith(500, {}))).toBe(false);
    expect(isExpectedClientError(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(isExpectedClientError(new Error('x'))).toBe(false);
  });
});

describe('parseActiveTransactionsBlock (fase 207: centavos)', () => {
  const block = (totalAmount: number) =>
    axiosErrorWith(409, {
      code: 'SUB_HAS_ACTIVE_TRANSACTIONS',
      details: { transactionIds: [1, 2], totalAmount, currency: 'ARS' },
    });

  it('total entero: sin decimales (igual que antes)', () => {
    const r = parseActiveTransactionsBlock(block(15000), 'cancelar');
    expect(r?.formatted).toContain('15.000');
    expect(r?.formatted).not.toContain(',');
  });

  it('total con centavos: 2 decimales', () => {
    const r = parseActiveTransactionsBlock(block(77570.82), 'cancelar');
    expect(r?.formatted).toContain('77.570,82');
    expect(r?.message).toContain('2 cobros activos');
  });

  it('otro error devuelve null', () => {
    expect(parseActiveTransactionsBlock(new Error('x'), 'cancelar')).toBeNull();
  });
});
