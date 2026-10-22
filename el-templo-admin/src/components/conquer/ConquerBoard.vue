<!--
  Tablero del coach de Conquer (fase 201, S12-7, §5): todos los alumnos activos en una pantalla,
  con semáforo y alertas, rojo primero (el API ya los manda ordenados). Una columna, apta para
  30 alumnos sin paginar y para 390 px. Las alertas guardadas (con id) se pueden marcar vistas o
  resueltas; las derivadas por tiempo (inactivo, control vencido) se resuelven solas. Tocar la
  fila abre la ficha del alumno cuando existe la ruta `conquer-alumno` (la suma 201-22).
-->
<template>
  <div>
    <div v-if="loading && !board" class="row justify-center q-pa-lg">
      <q-spinner color="secondary" size="32px" />
    </div>

    <q-banner v-else-if="loadError && !board" rounded class="bg-grey-3 text-accent">
      {{ loadError }}
      <template #action>
        <q-btn flat color="secondary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <template v-else-if="board">
      <!-- Contadores por color -->
      <div class="row q-col-gutter-sm q-mb-md" data-test="conquer-counts">
        <div v-for="c in counters" :key="c.key" class="col-6 col-sm-3">
          <q-card flat bordered>
            <q-card-section class="row items-center no-wrap q-pa-sm">
              <span class="conquer-dot q-mr-sm" :class="c.dotClass" />
              <div class="text-h6 q-mr-sm">{{ c.value }}</div>
              <div class="text-body2 text-grey-8">{{ c.label }}</div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <div v-if="board.members.length === 0" class="text-center text-grey-8 q-pa-lg">
        <q-icon name="military_tech" size="40px" color="grey-6" />
        <div class="q-mt-sm">Todavía no hay alumnos con Conquer activo</div>
        <div class="text-caption">Activalos desde Pedidos o con "Activar alumno".</div>
      </div>

      <q-list v-else bordered separator class="rounded-borders">
        <q-item
          v-for="m in board.members"
          :key="m.userId"
          :clickable="canOpenFicha"
          class="items-start"
          data-test="conquer-board-row"
          @click="openFicha(m)"
        >
          <q-item-section avatar top style="min-width: 28px">
            <span
              class="conquer-dot q-mt-xs"
              :class="dotClass(m.light)"
              :title="lightLabel(m.light)"
            />
          </q-item-section>

          <q-item-section>
            <q-item-label class="text-weight-medium">
              {{ memberName(m) }}
            </q-item-label>
            <q-item-label caption>
              {{ LEVEL_LABELS[m.level] }} · {{ m.daysCount }} días · {{ lastSessionText(m) }}
            </q-item-label>

            <div v-if="m.alerts.length > 0" class="q-mt-sm column q-gutter-y-xs">
              <div
                v-for="(a, idx) in m.alerts"
                :key="a.id ?? `${a.kind}-${idx}`"
                class="row items-center q-gutter-x-sm"
                data-test="conquer-alert"
              >
                <q-chip
                  dense
                  square
                  :color="chipColor(a.severity)"
                  text-color="white"
                  :label="a.label"
                  class="q-ma-none"
                >
                  <q-tooltip v-if="a.proposal">{{ a.proposal.label }}</q-tooltip>
                </q-chip>
                <span v-if="a.proposal" class="text-caption text-grey-8">
                  {{ a.proposal.label }}
                </span>
                <q-space />
                <template v-if="a.id !== null">
                  <q-btn
                    v-if="a.status === 'abierta'"
                    flat
                    dense
                    no-caps
                    color="accent"
                    label="Vista"
                    :loading="busyAlertId === a.id"
                    :disable="busyAlertId !== null"
                    style="min-height: 36px"
                    @click.stop="setAlertStatus(a, 'vista')"
                  />
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="secondary"
                    label="Resuelta"
                    :loading="busyAlertId === a.id"
                    :disable="busyAlertId !== null"
                    style="min-height: 36px"
                    @click.stop="setAlertStatus(a, 'resuelta')"
                  />
                </template>
              </div>
            </div>
          </q-item-section>

          <q-item-section v-if="canOpenFicha" side top>
            <q-icon name="chevron_right" color="grey-7" />
          </q-item-section>
        </q-item>
      </q-list>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import {
  LEVEL_LABELS,
  type AlertSeverity,
  type BoardAlert,
  type BoardMember,
  type BoardResponse,
  type Light,
} from 'src/types/conquer';
import { agoText, daysSince, fullName } from 'src/utils/conquer-format';

const props = defineProps<{
  /** Sube cuando la página necesita que se relea el tablero (después de activar a alguien). */
  reloadToken: number;
}>();

const $q = useQuasar();
const router = useRouter();
const conquerApi = useConquerAdminApi();

const board = ref<BoardResponse | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const busyAlertId = ref<number | null>(null);

// La ficha la registra 201-22: hasta entonces las filas no navegan.
const canOpenFicha = computed(() => router.hasRoute('conquer-alumno'));

// Semáforo: rojo, amarillo y verde solo en el dot y el chip (tokens cálidos de Quasar).
const DOT_CLASS: Record<Light, string> = {
  rojo: 'bg-negative',
  amarillo: 'bg-warning',
  verde: 'bg-positive',
  ok: 'bg-grey-5',
};
const LIGHT_LABEL: Record<Light, string> = {
  rojo: 'Rojo',
  amarillo: 'Amarillo',
  verde: 'Verde',
  ok: 'Sin alertas',
};
const CHIP_COLOR: Record<AlertSeverity, string> = {
  rojo: 'negative',
  amarillo: 'warning',
  verde: 'positive',
};

function dotClass(light: Light): string {
  return DOT_CLASS[light];
}

function lightLabel(light: Light): string {
  return LIGHT_LABEL[light];
}

function chipColor(severity: AlertSeverity): string {
  return CHIP_COLOR[severity];
}

const counters = computed(() => {
  const counts = board.value?.counts;
  const lights: Light[] = ['rojo', 'amarillo', 'verde', 'ok'];
  return lights.map((light) => ({
    key: light,
    label: LIGHT_LABEL[light],
    value: counts ? counts[light] : 0,
    dotClass: DOT_CLASS[light],
  }));
});

function memberName(m: BoardMember): string {
  return fullName(m.firstName, m.lastName) || `Alumno ${m.userId}`;
}

function lastSessionText(m: BoardMember): string {
  const days = daysSince(m.lastSessionDate);
  return days === null ? 'sin sesiones todavía' : `última sesión ${agoText(days)}`;
}

function openFicha(m: BoardMember): void {
  if (!canOpenFicha.value) return;
  void router.push({ name: 'conquer-alumno', params: { userId: m.userId } });
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    board.value = await conquerApi.getBoard();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No pudimos cargar el tablero';
    loadError.value = message;
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

async function setAlertStatus(alert: BoardAlert, status: 'vista' | 'resuelta'): Promise<void> {
  if (alert.id === null) return;
  busyAlertId.value = alert.id;
  try {
    await conquerApi.patchAlert(alert.id, status);
    $q.notify({
      type: 'positive',
      message: status === 'vista' ? 'Alerta marcada como vista' : 'Alerta resuelta',
    });
    // El semáforo y los contadores salen del servidor: se relee el tablero entero.
    await load();
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos actualizar la alerta',
    });
  } finally {
    busyAlertId.value = null;
  }
}

onMounted(load);
watch(() => props.reloadToken, load);
</script>

<style scoped lang="scss">
.conquer-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex: none;
}
</style>
