<template>
  <!-- Fase 164 — Televisores de sucursal. Contraparte operativa del kiosco:   -->
  <!-- la pantalla del TV muestra un código, alguien del staff lo carga acá y  -->
  <!-- elige la sede (D-01). Monitoreo pasivo con "visto hace X" (D-05) y      -->
  <!-- revocación por fila (D-03). El nav/route solo ocultan: el gate real es  -->
  <!-- el API (TV_CONTROL_ROLES + requireBranchAccess).                        -->
  <q-page padding>
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Televisores</div>
      <q-space />
      <q-btn
        icon="refresh"
        label="Actualizar"
        color="primary"
        outline
        dense
        :loading="refreshing"
        @click="onManualRefresh"
      />
    </div>

    <!-- Vinculación: el código que muestra el TV + la sede + una etiqueta. -->
    <q-card flat bordered class="q-mb-lg">
      <q-card-section>
        <div class="text-subtitle1 q-mb-xs">Vincular un televisor</div>
        <div class="text-caption text-grey-7 q-mb-md">
          Prendé el televisor con la pantalla de El Templo abierta y cargá acá el código que
          muestra.
        </div>

        <div class="row q-col-gutter-md items-start">
          <div class="col-12 col-sm-3">
            <q-input
              :model-value="userCode"
              label="Código"
              hint="El código que muestra la pantalla del TV"
              outlined
              dense
              :maxlength="TV_USER_CODE_LENGTH"
              class="tv-code-input"
              @update:model-value="onUserCodeInput"
            />
          </div>
          <div class="col-12 col-sm-4">
            <q-select
              v-model="selectedBranchId"
              :options="branchOptions"
              label="Sede"
              outlined
              dense
              emit-value
              map-options
              :loading="branchesLoading"
            />
          </div>
          <div class="col-12 col-sm-3">
            <q-input
              v-model="deviceName"
              label="Nombre (opcional)"
              hint="Ej: TV sala, TV recepción"
              outlined
              dense
              maxlength="100"
            />
          </div>
          <div class="col-12 col-sm-2">
            <q-btn
              label="Vincular"
              color="primary"
              unelevated
              class="full-width"
              :disable="!canSubmit"
              :loading="claiming"
              @click="onClaim"
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Estado 1: carga inicial -->
    <div v-if="initialLoading" class="row justify-center q-pa-xl">
      <q-spinner size="40px" color="primary" />
    </div>

    <!-- Estado 2: error sin nada que mostrar -->
    <q-banner v-else-if="listError && rows.length === 0" class="bg-negative text-white q-mb-md">
      <template #avatar>
        <q-icon name="error" />
      </template>
      {{ listError }}
    </q-banner>

    <!-- Estado 3: vacío -->
    <div v-else-if="rows.length === 0" class="text-center q-pa-xl text-grey-6">
      No hay televisores vinculados todav&iacute;a.
    </div>

    <!-- Estado 4: tabla. Un fallo del refresco automático no borra lo que ya -->
    <!-- se está mostrando: se avisa arriba y las filas quedan.               -->
    <div v-else>
      <q-banner v-if="listError" dense class="bg-warning text-dark q-mb-sm">
        <template #avatar>
          <q-icon name="warning" />
        </template>
        {{ listError }}
      </q-banner>

      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        flat
        bordered
        :pagination="{ rowsPerPage: 20 }"
      >
        <template #body-cell-estado="props">
          <q-td :props="props">
            <q-chip
              :color="props.row.isActive ? 'positive' : 'grey-5'"
              text-color="white"
              dense
              square
            >
              {{ props.row.isActive ? 'Activo' : 'Revocado' }}
            </q-chip>
          </q-td>
        </template>

        <template #body-cell-acciones="props">
          <q-td :props="props">
            <q-btn
              v-if="props.row.isActive"
              label="Revocar"
              color="negative"
              flat
              dense
              @click="askRevoke(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Confirmación de revocación: es irreversible para ese televisor (hay -->
    <!-- que volver a vincularlo desde cero).                                -->
    <q-dialog v-model="confirmOpen" persistent>
      <q-card style="min-width: 340px">
        <q-card-section>
          <div class="text-h6">Revocar televisor</div>
        </q-card-section>
        <q-card-section class="text-body2">
          {{ revokeTarget?.nombre }} ({{ revokeTarget?.sede }}) va a dejar de mostrar la clase. Para
          volver a usarlo hay que vincularlo de nuevo con un código nuevo.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat label="Cancelar" color="grey-8" />
          <q-btn flat label="Revocar" color="negative" :loading="revoking" @click="onRevoke" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useMembersApi } from 'src/composables/useMembersApi';
import {
  useTvApi,
  isValidUserCode,
  normalizeUserCode,
  TV_USER_CODE_LENGTH,
  type TvDeviceRow,
} from 'src/composables/useTvApi';
import { createLogger } from 'src/utils/logger';
import { isExpectedClientError } from 'src/utils/extract-error';
import type { BranchOption } from 'src/types/member';

const log = createLogger('TvDevicesPage');
const $q = useQuasar();
const authStore = useAuthStore();
const membersApi = useMembersApi();
const tvApi = useTvApi();

/** Refresco pasivo del listado (D-05): monitoreo, no tiempo real. */
const POLL_MS = 15000;

// =========================================================================
// Estado
// =========================================================================

const devices = ref<TvDeviceRow[]>([]);
const initialLoading = ref(true);
const refreshing = ref(false);
const listError = ref<string | null>(null);
/** Reloj propio: el "hace X" tiene que envejecer aunque el listado no cambie. */
const nowMs = ref(Date.now());

const userCode = ref('');
const deviceName = ref('');
const selectedBranchId = ref<number | null>(null);
const claiming = ref(false);

const branches = ref<BranchOption[]>([]);
const branchesLoading = ref(false);

const confirmOpen = ref(false);
const revokeTarget = ref<TvDeviceDisplayRow | null>(null);
const revoking = ref(false);

let pollId: ReturnType<typeof setInterval> | null = null;

// =========================================================================
// Sedes — un televisor cuelga de una pared, así que las sedes virtuales
// (online) se filtran, mismo criterio que CobrosPage/AssignPlanDialog. El
// default es la sede del usuario logueado (D-11); el API igual valida el
// acceso con requireBranchAccess.
// =========================================================================

const branchOptions = computed(() =>
  branches.value.filter((b) => !b.isVirtual).map((b) => ({ label: b.name, value: b.id }))
);

async function fetchBranches(): Promise<void> {
  branchesLoading.value = true;
  try {
    branches.value = await membersApi.getBranches();
    const own = branchOptions.value.find((o) => o.value === authStore.user?.branchId);
    selectedBranchId.value = own?.value ?? branchOptions.value[0]?.value ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error cargando sedes', { error: message });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar las sedes' });
  } finally {
    branchesLoading.value = false;
  }
}

// =========================================================================
// Listado
// =========================================================================

/** Fila lista para pintar: el "hace X" se calcula acá para que siga al reloj. */
interface TvDeviceDisplayRow extends TvDeviceRow {
  nombre: string;
  sede: string;
  vistoHace: string;
  vinculadoEl: string;
}

function relativeFrom(iso: string | null, now: number): string {
  if (iso === null) return 'nunca';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return `hace ${secs} s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const rows = computed<TvDeviceDisplayRow[]>(() =>
  devices.value.map((d) => ({
    ...d,
    nombre: d.name ?? 'Sin nombre',
    sede: d.branchName ?? '—',
    vistoHace: relativeFrom(d.lastSeenAt, nowMs.value),
    vinculadoEl: formatDateTime(d.createdAt),
  }))
);

const columns: QTableProps['columns'] = [
  { name: 'nombre', label: 'Nombre', field: 'nombre', align: 'left', sortable: true },
  { name: 'sede', label: 'Sede', field: 'sede', align: 'left', sortable: true },
  { name: 'estado', label: 'Estado', field: 'isActive', align: 'left', sortable: true },
  { name: 'vistoHace', label: 'Visto hace', field: 'vistoHace', align: 'left' },
  { name: 'vinculadoEl', label: 'Vinculado el', field: 'vinculadoEl', align: 'left' },
  { name: 'acciones', label: '', field: 'id', align: 'right' },
];

async function fetchDevices(): Promise<void> {
  nowMs.value = Date.now();
  try {
    devices.value = await tvApi.listDevices();
    listError.value = null;
  } catch (err: unknown) {
    listError.value = tvApi.error.value ?? 'Error cargando los televisores';
    if (!isExpectedClientError(err)) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error cargando televisores', { error: message });
    }
  } finally {
    initialLoading.value = false;
  }
}

async function onManualRefresh(): Promise<void> {
  refreshing.value = true;
  try {
    await fetchDevices();
  } finally {
    refreshing.value = false;
  }
}

// =========================================================================
// Vinculación
// =========================================================================

const canSubmit = computed(
  () => isValidUserCode(userCode.value) && selectedBranchId.value !== null && !claiming.value
);

function onUserCodeInput(val: string | number | null): void {
  userCode.value = normalizeUserCode(String(val ?? ''));
}

async function onClaim(): Promise<void> {
  const branchId = selectedBranchId.value;
  if (branchId === null || !isValidUserCode(userCode.value)) return;

  claiming.value = true;
  try {
    const name = deviceName.value.trim();
    await tvApi.claimPairing({
      userCode: userCode.value,
      branchId,
      ...(name ? { name } : {}),
    });
    userCode.value = '';
    deviceName.value = '';
    $q.notify({
      type: 'positive',
      message: 'Televisor vinculado. Se conecta solo en unos segundos.',
    });
    await fetchDevices();
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: tvApi.error.value ?? 'No se pudo vincular el televisor',
    });
    if (!isExpectedClientError(err)) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error vinculando televisor', { error: message });
    }
  } finally {
    claiming.value = false;
  }
}

// =========================================================================
// Revocación (D-03)
// =========================================================================

function askRevoke(row: TvDeviceDisplayRow): void {
  revokeTarget.value = row;
  confirmOpen.value = true;
}

async function onRevoke(): Promise<void> {
  const target = revokeTarget.value;
  if (!target) return;

  revoking.value = true;
  try {
    await tvApi.revokeDevice(target.id);
    $q.notify({ type: 'positive', message: 'Televisor revocado' });
    confirmOpen.value = false;
    revokeTarget.value = null;
    await fetchDevices();
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: tvApi.error.value ?? 'No se pudo revocar el televisor',
    });
    if (!isExpectedClientError(err)) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error revocando televisor', { error: message });
    }
  } finally {
    revoking.value = false;
  }
}

// =========================================================================
// Ciclo de vida — el intervalo lo registra y lo corta LA PÁGINA; el
// composable no engancha ningún hook de Vue (CLAUDE.md).
// =========================================================================

onMounted(() => {
  void fetchBranches();
  void fetchDevices();
  pollId = setInterval(() => {
    void fetchDevices();
  }, POLL_MS);
});

onUnmounted(() => {
  if (pollId !== null) {
    clearInterval(pollId);
    pollId = null;
  }
  tvApi.cleanup();
});
</script>

<style scoped>
/* El código se lee de lejos y se dicta letra por letra: monoespaciado y ancho. */
.tv-code-input :deep(input) {
  font-family: monospace;
  font-size: 1.2rem;
  letter-spacing: 0.25rem;
  text-transform: uppercase;
}
</style>
