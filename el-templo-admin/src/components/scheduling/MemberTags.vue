<template>
  <span v-if="seniority || segment || expiry" class="row inline items-center q-gutter-xs">
    <!-- Antigüedad (Phase 136 D-05/D-06): neutral chip, shown only in Horarios.
         Default q-badge size to match the "PRUEBA" pill (no text-caption — it inflates line-height). -->
    <q-badge v-if="seniority" outline color="grey-7" :label="seniorityLabel" />
    <!-- Asistencia (D-07): omitted when segment is null (<1 mes / sin plan) o
         cuando la Antigüedad es "Nuevo" — es poco tiempo para evaluar y nunca
         debe convivir con Alerta/Óptimo (guarda dura ante segment persistido stale). -->
    <q-badge v-if="showSegment" :color="segmentColor" :label="segmentLabel" />
    <!-- Vencimiento (cuenta regresiva): solo en hitos exactos (10/7/5/1/hoy)
         o vencida. Null el resto de los días. -->
    <q-badge v-if="expiry" :color="expiry.color" :label="expiry.label" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  SENIORITY_LABELS,
  expiryBadge,
  type MemberSegment,
  type MemberSeniority,
} from 'src/types/member';
import { todayInTz } from 'src/utils/tz';

const props = withDefaults(
  defineProps<{
    segment: string | null;
    seniority: string | null;
    endDate?: string | null;
    /** Branch timezone for the Vencimiento day count. Defaults to AR. */
    timezone?: string;
  }>(),
  { endDate: null, timezone: 'America/Argentina/Buenos_Aires' }
);

// Un miembro "Nuevo" (< 1 mes) nunca muestra Asistencia: poco tiempo para evaluar.
const showSegment = computed(() => !!props.segment && props.seniority !== 'nuevo');

const segmentLabel = computed(() =>
  props.segment ? (SEGMENT_LABELS[props.segment as MemberSegment] ?? props.segment) : ''
);

const segmentColor = computed(() =>
  props.segment ? (SEGMENT_COLORS[props.segment as MemberSegment] ?? 'grey') : 'grey'
);

const seniorityLabel = computed(() =>
  props.seniority ? (SENIORITY_LABELS[props.seniority as MemberSeniority] ?? props.seniority) : ''
);

const expiry = computed(() => expiryBadge(props.endDate, todayInTz(props.timezone)));
</script>
