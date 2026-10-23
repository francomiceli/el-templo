import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PUSH_TITLE,
  NOVEDAD_PUSH_TITLE_MAX,
  novedadPushStatus,
  pushFieldsForCreate,
  pushFieldsForUpdate,
  pushFormStateFrom,
  pushTitleError,
  pushTitleToSend,
} from '../novedades';

const original = (over: {
  pushRequested?: boolean;
  pushTitle?: string | null;
  pushQueuedAt?: string | null;
}) => ({
  pushRequested: false,
  pushTitle: null,
  pushQueuedAt: null,
  ...over,
});

describe('novedadPushStatus', () => {
  it('sin push pedida: none', () => {
    expect(novedadPushStatus(original({}))).toBe('none');
  });
  it('pedida y sin encolar: pending', () => {
    expect(novedadPushStatus(original({ pushRequested: true }))).toBe('pending');
  });
  it('encolada: sent', () => {
    expect(
      novedadPushStatus(original({ pushRequested: true, pushQueuedAt: '2026-10-23T15:00:00.000Z' }))
    ).toBe('sent');
  });
});

describe('pushTitleError', () => {
  it('rechaza vacío y solo espacios', () => {
    expect(pushTitleError('')).not.toBeNull();
    expect(pushTitleError('   ')).not.toBeNull();
  });
  it('acepta de 1 a 50 caracteres tras recortar', () => {
    expect(pushTitleError('A')).toBeNull();
    expect(pushTitleError(`  ${'t'.repeat(NOVEDAD_PUSH_TITLE_MAX)}  `)).toBeNull();
  });
  it('rechaza más de 50', () => {
    expect(pushTitleError('t'.repeat(NOVEDAD_PUSH_TITLE_MAX + 1))).toContain('50');
  });
});

describe('pushTitleToSend', () => {
  it('el título por defecto se manda como null (el server usa el nombre del gimnasio)', () => {
    expect(pushTitleToSend(DEFAULT_PUSH_TITLE)).toBeNull();
    expect(pushTitleToSend(`  ${DEFAULT_PUSH_TITLE}  `)).toBeNull();
  });
  it('un título propio va recortado', () => {
    expect(pushTitleToSend('  Gran novedad ')).toBe('Gran novedad');
  });
});

describe('pushFormStateFrom', () => {
  it('alta: apagada y con el título por defecto', () => {
    expect(pushFormStateFrom(null)).toEqual({ enabled: false, title: DEFAULT_PUSH_TITLE });
  });
  it('edición: lo guardado, con el título por defecto si era null', () => {
    expect(pushFormStateFrom({ pushRequested: true, pushTitle: 'Promo' })).toEqual({
      enabled: true,
      title: 'Promo',
    });
    expect(pushFormStateFrom({ pushRequested: true, pushTitle: null })).toEqual({
      enabled: true,
      title: DEFAULT_PUSH_TITLE,
    });
  });
});

describe('pushFieldsForCreate', () => {
  it('apagada: no manda nada', () => {
    expect(pushFieldsForCreate({ enabled: false, title: 'Lo que sea' })).toEqual({});
  });
  it('prendida con título propio', () => {
    expect(pushFieldsForCreate({ enabled: true, title: ' Promo ' })).toEqual({
      sendPush: true,
      pushTitle: 'Promo',
    });
  });
  it('prendida con el título por defecto: pushTitle null', () => {
    expect(pushFieldsForCreate({ enabled: true, title: DEFAULT_PUSH_TITLE })).toEqual({
      sendPush: true,
      pushTitle: null,
    });
  });
});

describe('pushFieldsForUpdate', () => {
  it('push ya encolada: nunca manda campos de push, aunque el formulario difiera', () => {
    const queued = original({
      pushRequested: true,
      pushTitle: 'Original',
      pushQueuedAt: '2026-10-23T15:00:00.000Z',
    });
    expect(pushFieldsForUpdate(queued, { enabled: false, title: 'Otro' })).toEqual({});
    expect(pushFieldsForUpdate(queued, { enabled: true, title: 'Otro' })).toEqual({});
  });

  it('sin push antes y sin push ahora: nada', () => {
    expect(
      pushFieldsForUpdate(original({}), { enabled: false, title: DEFAULT_PUSH_TITLE })
    ).toEqual({});
  });

  it('prender la push en una novedad que no la tenía', () => {
    expect(pushFieldsForUpdate(original({}), { enabled: true, title: 'Promo' })).toEqual({
      sendPush: true,
      pushTitle: 'Promo',
    });
    expect(pushFieldsForUpdate(original({}), { enabled: true, title: DEFAULT_PUSH_TITLE })).toEqual(
      { sendPush: true, pushTitle: null }
    );
  });

  it('apagar una push pedida y sin encolar', () => {
    expect(
      pushFieldsForUpdate(original({ pushRequested: true, pushTitle: 'Promo' }), {
        enabled: false,
        title: 'Promo',
      })
    ).toEqual({ sendPush: false });
  });

  it('push pedida sin cambios: nada', () => {
    expect(
      pushFieldsForUpdate(original({ pushRequested: true, pushTitle: 'Promo' }), {
        enabled: true,
        title: 'Promo',
      })
    ).toEqual({});
    // Título guardado null y el formulario con el de por defecto: tampoco cambió.
    expect(
      pushFieldsForUpdate(original({ pushRequested: true, pushTitle: null }), {
        enabled: true,
        title: DEFAULT_PUSH_TITLE,
      })
    ).toEqual({});
  });

  it('cambiar solo el título de una push pedida', () => {
    expect(
      pushFieldsForUpdate(original({ pushRequested: true, pushTitle: 'Promo' }), {
        enabled: true,
        title: 'Otra promo',
      })
    ).toEqual({ pushTitle: 'Otra promo' });
    // Volver al título por defecto = null.
    expect(
      pushFieldsForUpdate(original({ pushRequested: true, pushTitle: 'Promo' }), {
        enabled: true,
        title: DEFAULT_PUSH_TITLE,
      })
    ).toEqual({ pushTitle: null });
  });
});
