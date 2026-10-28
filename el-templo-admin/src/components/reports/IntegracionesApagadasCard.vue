<template>
  <q-card
    v-if="pending.length > 0"
    flat
    bordered
    class="bg-orange-1 q-mb-md"
    data-test="integraciones-apagadas"
  >
    <q-card-section class="q-pb-xs">
      <div class="row items-center no-wrap q-gutter-sm">
        <q-icon name="power_off" color="orange-9" size="24px" />
        <div class="text-subtitle1">Integraciones apagadas</div>
      </div>
      <div class="text-caption text-grey-8 q-mt-xs">
        Mientras estén apagadas, este reporte no tiene esos datos. Cada una se prende cargando su
        secret en GitHub (Settings › Secrets and variables › Actions).
      </div>
    </q-card-section>

    <q-list dense>
      <q-item v-for="item in pending" :key="item.key" :data-test="`integracion-${item.key}`">
        <q-item-section avatar top>
          <q-icon :name="item.icon" :color="item.inTest ? 'orange-9' : 'grey-7'" size="20px" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-weight-medium">
            {{ item.label }}
            <q-badge v-if="item.inTest" color="orange-9" class="q-ml-xs">
              {{ item.badge }}
            </q-badge>
          </q-item-label>
          <q-item-label v-if="item.missing.length > 0" caption class="text-grey-9">
            {{ item.missing.length === 1 ? 'Falta el secret' : 'Faltan los secrets' }}
            <template v-for="(name, i) in item.missing" :key="name">
              <code>{{ name }}</code
              >{{ i < item.missing.length - 1 ? ', ' : '' }}
            </template>
          </q-item-label>
          <q-item-label caption>{{ item.step }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-list>

    <q-card-section class="q-pt-xs text-caption text-grey-7">
      Paso a paso completo en <code>docs/guia-195-web-seo-atribucion.md</code>. Los secrets de la
      API (y los IDs de la web en esta card) se aplican con el próximo deploy de la API.
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MeasurementIntegration } from 'src/types/report';

const props = defineProps<{
  /** `integrations` del embudo. Vacío o ausente (API vieja): no se muestra nada. */
  integrations: MeasurementIntegration[];
}>();

interface PendingItem {
  key: MeasurementIntegration['key'];
  label: string;
  missing: string[];
  /** Prendida pero en modo de prueba (GBP dry-run, CAPI con código de prueba). */
  inTest: boolean;
  badge: string;
  icon: string;
  step: string;
}

const ICONS: Record<MeasurementIntegration['key'], string> = {
  ga4: 'insights',
  meta_pixel: 'ads_click',
  meta_capi: 'send',
  meta_spend: 'payments',
  search_console: 'travel_explore',
  gbp: 'storefront',
};

/** El paso corto de la guía (docs/guia-195-web-seo-atribucion.md) para prenderla. */
const STEPS: Record<MeasurementIntegration['key'], string> = {
  ga4: 'Crear la propiedad en GA4 (Administrar › Flujos de datos › Web) y copiar el ID G-XXXX. Después regenerar la web con «solo web». Guía §3.1.',
  meta_pixel:
    'Copiar el ID del Pixel en Meta Events Manager; va con el mismo valor en WEB_META_PIXEL_ID y META_PIXEL_ID. Después regenerar la web con «solo web». Guía §3.2.',
  meta_capi:
    'Con /privacidad nuevo publicado: token y Pixel cargados, validar con META_CAPI_TEST_EVENT_CODE y META_CAPI_START_AT (fecha de ahora) en «Probar eventos». Guía §7.5.',
  meta_spend:
    'Token del usuario del sistema del Business Manager (permiso ads_read) y los IDs de las cuentas publicitarias separados por coma. Guía §7.1 a §7.3.',
  search_console:
    'Cuenta de servicio de Google Cloud con la API de Search Console, agregada como usuario de la propiedad; cargar su JSON en base64. Guía §6.3.',
  gbp: 'Autorizar con scripts/gbp-authorize.ts, cargar los 3 secrets GBP_* y GBP_SYNC_MODE=dry-run una semana antes de pasar a apply. Guía §8.3 y §8.4.',
};

const TEST_STEPS: Partial<Record<MeasurementIntegration['key'], { badge: string; step: string }>> =
  {
    gbp: {
      badge: 'dry-run',
      step: 'Solo valida con Google, no cambia las fichas. Con los teléfonos reales cargados y una semana de logs sin rechazos, pasar GBP_SYNC_MODE a apply. Guía §8.4.',
    },
    meta_capi: {
      badge: 'prueba',
      step: 'Con META_CAPI_TEST_EVENT_CODE los eventos van solo a «Probar eventos» y no se reenvían. Validado, borrar ese secret y deployar la API. Guía §7.5.',
    },
  };

/** Apagadas, o prendidas en modo de prueba. Todas prendidas de verdad: lista vacía y no hay card. */
const pending = computed<PendingItem[]>(() =>
  (props.integrations ?? []).flatMap((integration): PendingItem[] => {
    const inTest =
      integration.enabled && (integration.mode === 'dry-run' || integration.mode === 'test');
    if (integration.enabled && !inTest) return [];
    const test = inTest ? TEST_STEPS[integration.key] : undefined;
    return [
      {
        key: integration.key,
        label: integration.label,
        missing: integration.missing,
        inTest,
        badge: test?.badge ?? '',
        icon: ICONS[integration.key],
        step: test?.step ?? STEPS[integration.key],
      },
    ];
  })
);
</script>
