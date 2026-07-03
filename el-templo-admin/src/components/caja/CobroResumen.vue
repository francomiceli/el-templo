<template>
  <q-list class="cobro-resumen">
    <!-- Debt indicator (summary-panel, UI-SPEC step 1). Renders nothing when null. -->
    <q-item v-if="debtWarning" class="q-pb-none">
      <q-item-section>
        <q-chip color="warning" text-color="dark" icon="warning" class="q-ma-none">
          {{ debtWarning }}
        </q-chip>
      </q-item-section>
    </q-item>

    <!-- Socio -->
    <q-item>
      <q-item-section>
        <div class="text-subtitle2 text-weight-regular text-grey-7">Socio</div>
        <div
          class="text-body1"
          :class="{ 'text-subtitle2 text-weight-regular text-grey-7': !socio }"
        >
          {{ socio || '—' }}
        </div>
      </q-item-section>
    </q-item>

    <!-- Sede (alta only): branch that will be written on the subscription +
         charge. Hidden when null (renew/misc — branch is server-derived). -->
    <q-item v-if="sede">
      <q-item-section>
        <div class="text-subtitle2 text-weight-regular text-grey-7">Sede</div>
        <div class="text-body1">{{ sede }}</div>
      </q-item-section>
    </q-item>

    <!-- Qué se cobra -->
    <q-item>
      <q-item-section>
        <div class="text-subtitle2 text-weight-regular text-grey-7">Qué se cobra</div>
        <div
          class="text-body1"
          :class="{ 'text-subtitle2 text-weight-regular text-grey-7': !queSecobra }"
        >
          {{ queSecobra || '—' }}
        </div>
      </q-item-section>
    </q-item>

    <!-- Cómo se paga -->
    <q-item>
      <q-item-section>
        <div class="text-subtitle2 text-weight-regular text-grey-7">Cómo se paga</div>
        <div
          class="text-body1"
          :class="{ 'text-subtitle2 text-weight-regular text-grey-7': !comoPaga }"
        >
          {{ comoPaga || '—' }}
        </div>
      </q-item-section>
    </q-item>

    <q-separator spaced />

    <!-- Total -->
    <q-item>
      <q-item-section>
        <div class="text-subtitle2 text-weight-regular text-grey-7">Total</div>
      </q-item-section>
      <q-item-section side>
        <div class="text-h6 text-weight-bold">{{ formatPrice(total ?? 0, currency) }}</div>
      </q-item-section>
    </q-item>
  </q-list>
</template>

<script setup lang="ts">
/**
 * CobroResumen — shared presentational accumulated-summary for the cobro wizard
 * (Phase 151). The wizard mounts it TWICE: the desktop two-column right panel
 * and the mobile step-4 review (single source of truth per UI-SPEC).
 *
 * Purely presentational: props only, no API calls, no store, no logger. Renders
 * four rows (Socio / Qué se cobra / Cómo se paga / Total), showing `—` for empty
 * values. Typography per UI-SPEC: labels/muted micro-copy use 14px text-subtitle2
 * forced weight 400 (text-grey-7); values use 16px text-body1; Total uses
 * Heading 20/600 (text-h6). NEVER 12px captions. Colors come from Quasar
 * brand classes only (no hard-coded hex — the staging marker relies on --q-primary).
 */
import { formatPrice } from 'src/utils/format-price';

withDefaults(
  defineProps<{
    socio?: string | null;
    /** Resolved branch name for alta charges (CR-01). Null → row hidden. */
    sede?: string | null;
    queSecobra?: string | null;
    comoPaga?: string | null;
    total?: number | null;
    currency?: string;
    /** Summary-panel debt indicator (UI-SPEC step 1). Null → renders nothing. */
    debtWarning?: string | null;
  }>(),
  {
    socio: null,
    sede: null,
    queSecobra: null,
    comoPaga: null,
    total: null,
    currency: 'ARS',
    debtWarning: null,
  }
);
</script>
