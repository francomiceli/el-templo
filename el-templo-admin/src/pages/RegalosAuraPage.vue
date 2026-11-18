<!-- Regalos de Aura (fase 215, plan 23, Pantallas 6b y 6c del UI-SPEC, D-11, D-20, D-21).
     De arriba hacia abajo: el valor del regalo del profe (dueño y admin lo editan, admin_sede solo
     lo ve), la medición de las últimas 4 semanas, los filtros y la tabla con "Anular". El filtro de
     sede lo hace el servidor (admin_sede ve solo las suyas). Fecha y hora de la clase vienen ya en
     hora de la sede: se muestran tal cual, sin convertir de zona. -->
<template>
  <q-page padding>
    <div class="text-h5">Regalos de Aura</div>
    <div class="text-body2 text-grey-8 q-mb-md">
      Los regalos que dieron los alumnos y los profes. Si alguno no corresponde, anulalo y se
      descuenta.
    </div>

    <q-banner
      v-if="loadState === 'unavailable'"
      rounded
      class="bg-warning text-white q-mb-md"
      data-test="regalos-unavailable"
    >
      Los regalos de Aura no están disponibles por ahora.
    </q-banner>

    <q-banner
      v-else-if="loadState === 'error'"
      rounded
      class="bg-warning text-white q-mb-md"
      data-test="regalos-error"
    >
      No pudimos cargar los regalos.
      <template #action>
        <q-btn flat no-caps color="white" label="Reintentar" @click="load()" />
      </template>
    </q-banner>

    <!-- Ajustes: valor del regalo del profe (6c) -->
    <q-card flat bordered class="q-mb-md" data-test="regalos-settings">
      <q-card-section>
        <div class="text-subtitle1">Valor del regalo del profe</div>
        <div class="text-body2 text-grey-8">
          Cuánta Aura suma cada regalo de un profe. El de un alumno vale
          {{ AURA_AMOUNTS.giftMember }}.
        </div>

        <template v-if="settingsState === 'loading'">
          <q-skeleton type="QInput" width="120px" class="q-mt-sm" />
        </template>

        <template v-else-if="settingsState === 'error'">
          <div class="text-body2 q-mt-sm" data-test="regalos-settings-error">
            No pudimos cargar el valor.
            <q-btn flat dense no-caps color="primary" label="Reintentar" @click="loadSettings" />
          </div>
        </template>

        <template v-else-if="canEditValue">
          <div class="row items-start q-col-gutter-sm q-mt-xs">
            <div class="col-auto">
              <q-input
                v-model.number="draftAmount"
                type="number"
                outlined
                dense
                suffix="de Aura"
                min="1"
                max="10"
                step="1"
                style="width: 120px"
                :rules="[amountRule]"
                aria-label="Valor del regalo del profe"
                data-test="regalos-amount-input"
                @keyup.enter="saveAmount"
              />
            </div>
            <div class="col-auto">
              <q-btn
                unelevated
                no-caps
                color="primary"
                label="Guardar valor"
                :disable="!canSaveAmount"
                :loading="savingAmount"
                data-test="regalos-amount-save"
                @click="saveAmount"
              />
            </div>
          </div>
          <div class="text-caption text-grey-8">Los regalos ya dados no cambian.</div>
        </template>

        <div v-else class="text-body2 q-mt-sm" data-test="regalos-amount-readonly">
          Cada regalo de un profe suma {{ savedAmount }} de Aura. Lo cambia el dueño.
        </div>
      </q-card-section>
    </q-card>

    <!-- Medición (D-21) -->
    <q-card flat bordered class="q-mb-md" data-test="regalos-usage">
      <q-card-section>
        <div class="text-subtitle1">Cómo se está usando</div>
        <template v-if="loadState === 'loading'">
          <q-skeleton type="text" class="q-mt-sm" />
          <q-skeleton type="text" />
          <q-skeleton type="text" />
        </template>
        <q-markup-table v-else flat dense class="q-mt-sm">
          <thead>
            <tr>
              <th class="text-left">Semana</th>
              <th class="text-right">Regalos de alumnos</th>
              <th class="text-right">Regalos de profes</th>
              <th class="text-right">Alumnos que asistieron</th>
              <th class="text-right">Regalaron</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="week in weeks" :key="week.weekStart">
              <td class="text-left">{{ weekLabel(week.weekStart) }}</td>
              <td class="text-right tabular">{{ week.studentGifts }}</td>
              <td class="text-right tabular">{{ week.coachGifts }}</td>
              <td class="text-right tabular">{{ week.attendees }}</td>
              <td class="text-right tabular">{{ Math.round(week.giversPct) }}%</td>
            </tr>
          </tbody>
        </q-markup-table>
        <div class="text-caption text-grey-8 q-mt-xs">Cuenta solo los regalos vigentes.</div>
      </q-card-section>
    </q-card>

    <!-- Filtros -->
    <div class="row items-center q-col-gutter-sm q-mb-md">
      <div class="col-12 col-sm-4 col-md-3">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          label="Sede"
          dense
          outlined
          emit-value
          map-options
          data-test="regalos-branch"
          @update:model-value="load()"
        />
      </div>
      <div class="col-auto">
        <q-btn-toggle
          v-model="days"
          :options="DAYS_OPTIONS"
          unelevated
          no-caps
          dense
          toggle-color="primary"
          color="white"
          text-color="primary"
          data-test="regalos-days"
          @update:model-value="load()"
        />
      </div>
      <div class="col-auto">
        <q-toggle
          v-model="includeVoided"
          label="Mostrar anulados"
          data-test="regalos-voided"
          @update:model-value="load()"
        />
      </div>
    </div>

    <q-banner
      v-if="truncated"
      rounded
      class="bg-orange-1 text-grey-9 q-mb-md"
      data-test="regalos-truncated"
    >
      Hay más regalos de los que se pueden mostrar: faltan los más viejos. Elegí un período más
      corto o una sede para verlos.
    </q-banner>

    <!-- Tabla -->
    <q-table
      v-model:pagination="pagination"
      flat
      bordered
      row-key="id"
      :rows="sortedItems"
      :columns="columns"
      :grid="$q.screen.lt.sm"
      :loading="loadState === 'loading' || refreshing"
      :rows-per-page-options="[25]"
      rows-per-page-label="Registros por página"
      loading-label="Cargando..."
      data-test="regalos-table"
    >
      <template #body-cell-date="props">
        <q-td :props="props" class="text-no-wrap">{{ dateLabel(props.row) }}</q-td>
      </template>
      <template #body-cell-giver="props">
        <q-td :props="props">
          {{ props.row.giverName }}
          <q-badge v-if="props.row.giverKind === 'profe'" outline color="grey-8" label="Profe" />
        </q-td>
      </template>
      <template #body-cell-reason="props">
        <q-td :props="props">{{ giftReasonLabel(props.row.reason) }}</q-td>
      </template>
      <template #body-cell-amount="props">
        <q-td :props="props" class="text-aura tabular">+{{ props.row.amount }}</q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <template v-if="props.row.status === 'anulado'">
            <q-chip dense color="grey-4" text-color="grey-9" label="Anulado" />
            <span class="text-caption">{{ voidedByLabel(props.row) }}</span>
          </template>
        </q-td>
      </template>
      <template #body-cell-action="props">
        <q-td :props="props">
          <q-btn
            v-if="props.row.status === 'vigente'"
            flat
            dense
            no-caps
            color="negative"
            label="Anular"
            :data-test="`regalo-anular-${props.row.id}`"
            @click="openVoid(props.row)"
          />
        </q-td>
      </template>

      <!-- Celulares: una card por regalo -->
      <template #item="props">
        <div class="col-12">
          <q-card flat bordered :data-test="`regalo-card-${props.row.id}`">
            <q-card-section class="q-pb-none">
              <div class="row items-center justify-between">
                <div class="text-subtitle2">{{ dateLabel(props.row) }}</div>
                <div class="text-aura tabular text-weight-medium">+{{ props.row.amount }}</div>
              </div>
              <div class="text-body2">
                {{ props.row.giverName }}
                <q-badge
                  v-if="props.row.giverKind === 'profe'"
                  outline
                  color="grey-8"
                  label="Profe"
                />
                le dio a {{ props.row.receiverName }}
              </div>
              <div class="text-caption text-grey-8">{{ giftReasonLabel(props.row.reason) }}</div>
              <div v-if="props.row.status === 'anulado'" class="q-mt-xs">
                <q-chip dense color="grey-4" text-color="grey-9" label="Anulado" />
                <span class="text-caption">{{ voidedByLabel(props.row) }}</span>
              </div>
            </q-card-section>
            <q-card-actions v-if="props.row.status === 'vigente'" align="right">
              <q-btn
                flat
                dense
                no-caps
                color="negative"
                label="Anular"
                @click="openVoid(props.row)"
              />
            </q-card-actions>
          </q-card>
        </div>
      </template>

      <template #no-data>
        <div
          v-if="loadState === 'ready'"
          class="full-width column items-center text-center q-pa-xl"
          data-test="regalos-empty"
        >
          <q-icon name="volunteer_activism" size="48px" color="grey-6" />
          <div class="text-h6 q-mt-sm">No hay regalos en este período</div>
          <div class="text-body2 text-grey-8">
            Cuando los alumnos y los profes den Aura, aparecen acá.
          </div>
        </div>
      </template>
    </q-table>

    <!-- Anular (D-20) -->
    <q-dialog v-model="voidOpen" :persistent="voidBusy">
      <q-card style="min-width: 320px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">¿Anular este regalo?</div>
          <div v-if="voidTarget" class="text-body2 text-grey-8 q-mt-xs">
            A {{ voidTarget.receiverName }} se le descuentan {{ voidTarget.amount }} de Aura.
            {{ voidTarget.giverName }} no recupera el regalo de esa clase. No se le avisa a nadie.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancelar" :disable="voidBusy" @click="voidOpen = false" />
          <q-btn
            unelevated
            no-caps
            color="negative"
            label="Anular"
            :loading="voidBusy"
            data-test="regalos-void-confirm"
            @click="confirmVoid"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import axios from 'axios';
import { useQuasar, type QTableColumn } from 'quasar';
import { AURA_AMOUNTS } from 'src/config/aura-amounts';
import { giftReasonLabel } from 'src/config/gift-reasons';
import {
  giftErrorCode,
  useAuraGiftsApi,
  type AdminGiftItem,
  type GiftWeek,
} from 'src/composables/useAuraGiftsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import type { BranchOption } from 'src/types/member';
import { isBranchScopedRole } from 'src/utils/branch-scope';
import { createLogger } from 'src/utils/logger';

const log = createLogger('RegalosAuraPage');
const $q = useQuasar();
const authStore = useAuthStore();
const giftsApi = useAuraGiftsApi();
const membersApi = useMembersApi();

type LoadState = 'loading' | 'ready' | 'error' | 'unavailable';
type SettingsState = 'loading' | 'ready' | 'error';
type DaysFilter = 7 | 30 | 90;

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10;
const DAYS_OPTIONS: { label: string; value: DaysFilter }[] = [
  { label: '7 días', value: 7 },
  { label: '30 días', value: 30 },
  { label: '90 días', value: 90 },
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_MS = 24 * 60 * 60 * 1000;

const role = computed(() => authStore.user?.role);
/** Dueño y admin editan el valor; admin_sede lo ve de solo lectura (el servidor también lo exige). */
const canEditValue = computed(() => role.value === 'owner' || role.value === 'admin');
const branchScoped = computed(() => isBranchScopedRole(role.value));

// -- Ajustes (6c) --------------------------------------------------------------

const settingsState = ref<SettingsState>('loading');
const savedAmount = ref<number>(AURA_AMOUNTS.giftMember);
const draftAmount = ref<number | string | null>(null);
const savingAmount = ref(false);

function isValidAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_AMOUNT &&
    value <= MAX_AMOUNT
  );
}

function amountRule(value: unknown): true | string {
  return isValidAmount(value) || 'Tiene que ser un número entero entre 1 y 10.';
}

const canSaveAmount = computed(
  () => isValidAmount(draftAmount.value) && draftAmount.value !== savedAmount.value
);

async function loadSettings(): Promise<void> {
  settingsState.value = 'loading';
  try {
    const settings = await giftsApi.getSettings();
    savedAmount.value = settings.coachGiftAmount;
    draftAmount.value = settings.coachGiftAmount;
    settingsState.value = 'ready';
  } catch (err: unknown) {
    log.error('No se pudo cargar el valor del regalo del profe', {
      error: err instanceof Error ? err.message : String(err),
    });
    settingsState.value = 'error';
  }
}

async function saveAmount(): Promise<void> {
  const value = draftAmount.value;
  if (savingAmount.value || !canSaveAmount.value || !isValidAmount(value)) return;
  savingAmount.value = true;
  try {
    const saved = await giftsApi.saveSettings(value);
    savedAmount.value = saved.coachGiftAmount;
    draftAmount.value = saved.coachGiftAmount;
    $q.notify({
      type: 'positive',
      message: `Listo. Los próximos regalos de profe suman ${saved.coachGiftAmount} de Aura.`,
    });
  } catch (err: unknown) {
    log.error('No se pudo guardar el valor del regalo del profe', {
      error: err instanceof Error ? err.message : String(err),
    });
    draftAmount.value = savedAmount.value;
    $q.notify({ type: 'negative', message: 'No pudimos guardar el valor. Probá de nuevo.' });
  } finally {
    savingAmount.value = false;
  }
}

// -- Filtros, lista y medición --------------------------------------------------

const loadState = ref<LoadState>('loading');
const refreshing = ref(false);
const items = ref<AdminGiftItem[]>([]);
const weeks = ref<GiftWeek[]>([]);
const truncated = ref(false);
const branches = ref<BranchOption[]>([]);
const selectedBranchId = ref<number | null>(null);
const days = ref<DaysFilter>(7);
const includeVoided = ref(false);
const pagination = ref({ page: 1, rowsPerPage: 25 });

/** Dueño y admin: "Todas" más las sedes. admin_sede: solo las suyas, sin "Todas". */
const branchOptions = computed<{ label: string; value: number | null }[]>(() => {
  const own = branches.value.map((branch) => ({ label: branch.name, value: branch.id }));
  return branchScoped.value ? own : [{ label: 'Todas', value: null }, ...own];
});

const columns: QTableColumn<AdminGiftItem>[] = [
  { name: 'date', label: 'Fecha', field: 'sessionDate', align: 'left' },
  { name: 'giver', label: 'Dio', field: 'giverName', align: 'left' },
  { name: 'receiver', label: 'Recibió', field: 'receiverName', align: 'left' },
  { name: 'reason', label: 'Motivo', field: 'reason', align: 'left' },
  { name: 'amount', label: 'Puntos', field: 'amount', align: 'right' },
  { name: 'status', label: 'Estado', field: 'status', align: 'left' },
  { name: 'action', label: 'Acción', field: 'id', align: 'right' },
];

/** Fecha de la clase descendente (sin hora, al final del día); empata por id descendente. */
const sortedItems = computed<AdminGiftItem[]>(() =>
  [...items.value].sort((a, b) => {
    const left = `${a.sessionDate} ${a.startTime ?? ''}`;
    const right = `${b.sessionDate} ${b.startTime ?? ''}`;
    if (left !== right) return left < right ? 1 : -1;
    return b.id - a.id;
  })
);

/** Parte "YYYY-MM-DD" en números, o null si no tiene esa forma. */
function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "Lun 17/11 · 18:00". Sin hora (horario borrado) queda solo "Lun 17/11". */
function dateLabel(item: AdminGiftItem): string {
  const parts = parseYmd(item.sessionDate);
  if (!parts) return item.sessionDate;
  const weekday = WEEKDAYS[new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay()];
  const day = `${weekday} ${pad2(parts.d)}/${pad2(parts.m)}`;
  const time = item.startTime ? item.startTime.slice(0, 5) : null;
  return time && /^\d{2}:\d{2}$/.test(time) ? `${day} · ${time}` : day;
}

/** "10/11 al 16/11" a partir del lunes de la semana. */
function weekLabel(weekStart: string): string {
  const parts = parseYmd(weekStart);
  if (!parts) return weekStart;
  const start = Date.UTC(parts.y, parts.m - 1, parts.d);
  const end = new Date(start + 6 * DAY_MS);
  return `${pad2(parts.d)}/${pad2(parts.m)} al ${pad2(end.getUTCDate())}/${pad2(end.getUTCMonth() + 1)}`;
}

function voidedByLabel(item: AdminGiftItem): string {
  return item.voidedByName ? `por ${item.voidedByName}` : 'por asistencia anulada';
}

function statusOf(err: unknown): number | null {
  return axios.isAxiosError(err) && err.response ? err.response.status : null;
}

/** Un contador descarta las respuestas viejas si se cambia un filtro mientras otra va en vuelo. */
let loadSeq = 0;

async function load(options: { silent?: boolean } = {}): Promise<void> {
  const seq = ++loadSeq;
  if (options.silent) refreshing.value = true;
  else loadState.value = 'loading';
  try {
    const response = await giftsApi.listGifts({
      branchId: selectedBranchId.value ?? undefined,
      days: days.value,
      includeVoided: includeVoided.value,
    });
    if (seq !== loadSeq) return;
    items.value = response.items;
    truncated.value = response.truncated;
    weeks.value = response.weeks;
    if (!options.silent) pagination.value = { ...pagination.value, page: 1 };
    loadState.value = 'ready';
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    if (statusOf(err) === 404 && giftErrorCode(err) === null) {
      loadState.value = 'unavailable';
      return;
    }
    log.error('No se pudieron cargar los regalos', {
      error: err instanceof Error ? err.message : String(err),
    });
    loadState.value = 'error';
  } finally {
    if (seq === loadSeq) refreshing.value = false;
  }
}

async function loadBranches(): Promise<void> {
  try {
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    // Sin la lista de sedes la página sigue: el selector queda en "Todas" (o vacío para admin_sede).
    log.warn('No se pudieron cargar las sedes', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  // admin_sede no tiene "Todas": arranca en su (única o primera) sede.
  if (branchScoped.value && branches.value.length > 0) {
    selectedBranchId.value = branches.value[0].id;
  }
}

// -- Anular (D-20) -------------------------------------------------------------

const voidOpen = ref(false);
const voidTarget = ref<AdminGiftItem | null>(null);
const voidBusy = ref(false);

function openVoid(item: AdminGiftItem): void {
  voidTarget.value = item;
  voidOpen.value = true;
}

async function confirmVoid(): Promise<void> {
  const item = voidTarget.value;
  if (!item || voidBusy.value) return;
  voidBusy.value = true;
  try {
    await giftsApi.voidGift(item.id);
    voidOpen.value = false;
    $q.notify({
      type: 'positive',
      message: `Regalo anulado. Se descontaron ${item.amount} de Aura.`,
    });
    await load({ silent: true });
  } catch (err: unknown) {
    voidOpen.value = false;
    if (statusOf(err) === 409) {
      $q.notify({ type: 'info', message: 'Ese regalo ya estaba anulado.' });
      await load({ silent: true });
      return;
    }
    log.error('No se pudo anular el regalo', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No pudimos anular el regalo. Probá de nuevo.' });
  } finally {
    voidBusy.value = false;
  }
}

onMounted(async () => {
  void loadSettings();
  // La sede por defecto de admin_sede tiene que estar antes del primer pedido de la lista.
  await loadBranches();
  await load();
});
</script>

<style scoped>
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
