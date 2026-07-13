<!-- A/B copy test de la card de referidos (v5.5 follow-up). Muestra, por variante,
     el denominador (socios activos expuestos), el enganche (clicks únicos / CTR) y
     la conversión (referidos qualified). "A" = copy actual (control), "B" = nuevo. -->
<template>
  <div>
    <div class="text-h6 q-mb-xs">Referidos — A/B test del copy</div>
    <div class="text-caption text-grey-7 q-mb-md" style="max-width: 720px">
      Dos versiones del copy de la card de referidos, asignadas por paridad del ID del socio (mitad
      y mitad). <b>A</b> es el copy actual (control), <b>B</b> el nuevo. Las tasas se calculan sobre
      los socios activos expuestos de cada grupo.
    </div>

    <!-- Loading -->
    <div v-if="loading" class="row q-col-gutter-md">
      <div v-for="n in 2" :key="n" class="col-12 col-md-6">
        <q-card flat bordered>
          <q-card-section>
            <q-skeleton type="text" width="40%" />
            <q-skeleton type="text" class="q-mt-sm" />
            <q-skeleton type="text" width="60%" class="q-mt-sm" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Data -->
    <div v-else-if="data" class="row q-col-gutter-md">
      <div v-for="v in data.variants" :key="v.variant" class="col-12 col-md-6">
        <q-card flat bordered>
          <q-card-section>
            <div class="row items-center q-mb-md">
              <q-badge
                :color="v.variant === 'A' ? 'grey-7' : 'primary'"
                :label="`Variante ${v.variant}`"
              />
              <span class="text-caption text-grey-6 q-ml-sm">
                {{ v.variant === 'A' ? 'Control (copy actual)' : 'Challenger (copy nuevo)' }}
              </span>
            </div>

            <div class="row q-col-gutter-md">
              <div class="col-6">
                <div class="text-caption text-grey-6">Expuestos</div>
                <div class="text-h6">{{ v.exposedMembers }}</div>
                <div class="text-caption text-grey-5">socios activos</div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-6">Clicks únicos</div>
                <div class="text-h6">{{ v.uniqueClickers }}</div>
                <div class="text-caption text-grey-5">{{ pct(v.ctr) }} CTR</div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-6">Referidos convertidos</div>
                <div class="text-h6 text-positive">{{ v.referralsQualified }}</div>
                <div class="text-caption text-grey-5">{{ pct(v.qualifiedRate) }} conversión</div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-6">Vínculos creados</div>
                <div class="text-h6">{{ v.referralsCreated }}</div>
                <div class="text-caption text-grey-5">incl. aún pendientes</div>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Lectura preliminar -->
      <div v-if="comparison" class="col-12">
        <q-banner dense class="bg-grey-2 text-grey-8" rounded>
          <template #avatar>
            <q-icon name="insights" color="primary" />
          </template>
          {{ comparison }}
        </q-banner>
      </div>
    </div>

    <div v-else class="text-grey-6">Sin datos todavía.</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ReferralAbResults } from 'src/types/analytics';

const props = defineProps<{
  data: ReferralAbResults | null;
  loading: boolean;
}>();

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

// Lectura preliminar de conversión — cauta a propósito: con poco volumen no
// concluye nada. Solo señala quién va adelante hoy, sin declarar ganador.
const comparison = computed<string | null>(() => {
  if (!props.data) return null;
  const a = props.data.variants.find((v) => v.variant === 'A');
  const b = props.data.variants.find((v) => v.variant === 'B');
  if (!a || !b) return null;
  const totalQualified = a.referralsQualified + b.referralsQualified;
  if (totalQualified === 0) {
    return 'Todavía no hay referidos convertidos en ninguna variante — el test necesita más tiempo/volumen para dar señal.';
  }
  if (a.qualifiedRate === b.qualifiedRate) {
    return 'Empate en conversión entre A y B por ahora. Señal preliminar — esperá más volumen.';
  }
  const leader = a.qualifiedRate > b.qualifiedRate ? a : b;
  const other = leader === a ? b : a;
  return `La variante ${leader.variant} lidera en conversión (${pct(leader.qualifiedRate)} vs ${pct(other.qualifiedRate)}). Señal preliminar — esperá más volumen antes de declarar ganador.`;
});
</script>
