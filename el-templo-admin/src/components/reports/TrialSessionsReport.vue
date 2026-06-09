<template>
  <div>
    <!-- ================================================================== -->
    <!-- Filters -->
    <!-- ================================================================== -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-3 col-md-2">
        <q-input v-model="filters.search" label="Buscar" dense outlined clearable debounce="300">
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>

      <div class="col-6 col-sm-2 col-md-2">
        <q-select
          :model-value="filters.leadStatus"
          :options="LEAD_STATUS_OPTIONS"
          multiple
          emit-value
          map-options
          label="Estado"
          dense
          outlined
          clearable
          use-chips
          @update:model-value="(v) => (filters.leadStatus = Array.isArray(v) ? v : [])"
        />
      </div>

      <div class="col-6 col-sm-2 col-md-1">
        <q-select
          v-model="filters.attended"
          :options="ATTENDED_OPTIONS"
          emit-value
          map-options
          label="Asistió"
          dense
          outlined
          clearable
        />
      </div>

      <div class="col-6 col-sm-2 col-md-1">
        <q-select
          v-model="filters.shift"
          :options="SHIFT_OPTIONS"
          emit-value
          map-options
          label="Turno"
          dense
          outlined
          clearable
        />
      </div>

      <!-- D-44: Gestiona filter is OWNER-ONLY. For admin/gestion the SELECT
           is not rendered at all. There is NO fallback element (no numeric
           input, no free-form text). -->
      <div v-if="isOwner" class="col-12 col-sm-3 col-md-2">
        <q-select
          v-model="filters.gestionaUserId"
          :options="gestionaOptions"
          option-value="userId"
          option-label="name"
          label="Gestiona"
          dense
          outlined
          clearable
          emit-value
          map-options
          :loading="loadingGestiona"
        />
      </div>

      <div class="col-6 col-sm-2 col-md-1">
        <q-input
          v-model.number="filters.daysWithoutConvertingMin"
          type="number"
          :min="0"
          label="Días sin convertir ≥"
          dense
          outlined
          clearable
        />
      </div>

      <div class="col-auto">
        <q-btn
          color="primary"
          icon="download"
          label="Exportar CSV"
          :loading="exporting"
          :disable="loading"
          @click="onExport"
        />
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Table -->
    <!-- ================================================================== -->
    <q-table
      :rows="rows"
      :columns="columns"
      row-key="userId"
      :loading="loading"
      v-model:pagination="pagination"
      :rows-per-page-options="[20, 50, 100, 200]"
      @request="onPageChange"
      flat
      bordered
    >
      <!-- Lead slot: clickable name navigates to AlumnoDetailPage -->
      <template #body-cell-lead="props">
        <q-td :props="props">
          <router-link
            :to="`/alumnos/${props.row.userId}`"
            class="text-primary text-weight-medium no-underline"
          >
            {{ props.row.lead }}
          </router-link>
        </q-td>
      </template>

      <!-- Asistió slot -->
      <template #body-cell-attended="props">
        <q-td :props="props">
          <q-chip
            v-if="props.row.attended === 'si'"
            color="positive"
            text-color="white"
            dense
            :label="ATTENDED_LABELS_ES.si"
          />
          <q-chip
            v-else-if="props.row.attended === 'no'"
            color="negative"
            text-color="white"
            dense
            :label="ATTENDED_LABELS_ES.no"
          />
          <span v-else class="text-grey-6">—</span>
        </q-td>
      </template>

      <!-- Estado del Lead slot (inline edit, D-37) -->
      <template #body-cell-leadStatus="props">
        <q-td :props="props">
          <q-chip
            :color="LEAD_STATUS_COLORS[props.row.leadStatusEffective]"
            text-color="white"
            dense
            clickable
            :label="LEAD_STATUS_LABELS_ES[props.row.leadStatusEffective]"
          >
            <q-spinner v-if="savingUserId === props.row.userId" size="14px" class="q-ml-xs" />
            <q-menu auto-close>
              <q-list dense>
                <q-item
                  v-for="opt in LEAD_STATUS_OPTIONS"
                  :key="opt.value"
                  clickable
                  @click="onChangeStatus(props.row, opt.value)"
                >
                  <q-item-section>
                    <q-chip
                      :color="LEAD_STATUS_COLORS[opt.value]"
                      text-color="white"
                      dense
                      :label="opt.label"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-chip>
        </q-td>
      </template>

      <!-- Gestiona slot (— for null per D-39) -->
      <template #body-cell-gestiona="props">
        <q-td :props="props">
          <template v-if="props.row.createdBy">{{ props.row.createdBy.name }}</template>
          <span v-else class="text-grey-6">—</span>
        </q-td>
      </template>

      <!-- Comentarios slot (inline edit, D-37) -->
      <template #body-cell-leadNotes="props">
        <q-td :props="props" style="max-width: 280px">
          <q-input
            v-if="editingNotesUserId === props.row.userId"
            v-model="editingNotesDraft"
            type="textarea"
            autogrow
            dense
            outlined
            :loading="savingUserId === props.row.userId"
            autofocus
            @blur="onSaveNotes(props.row)"
            @keydown.esc.prevent="cancelEditNotes"
          />
          <div
            v-else
            class="cursor-pointer notes-clamp"
            :title="props.row.leadNotes ?? ''"
            @click="startEditNotes(props.row)"
          >
            <template v-if="props.row.leadNotes && props.row.leadNotes.length > 0">
              {{ props.row.leadNotes }}
            </template>
            <span v-else class="text-grey-5">—</span>
          </div>
        </q-td>
      </template>

      <!-- Asistió header keeps the accented Spanish label -->
      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          No hay sesiones de prueba para los filtros seleccionados
        </div>
      </template>
    </q-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useQuasar, type QTableColumn, type QTableProps } from 'quasar';
import { useReportsApi, type TrialSessionsRowClient } from 'src/composables/useReportsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useUsersApi, type StaffUser } from 'src/composables/useUsersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';

const props = defineProps<{
  branchId?: number | undefined;
}>();

// ─── Setup ──────────────────────────────────────────────────────────────

const log = createLogger('TrialSessionsReport');
const $q = useQuasar();
const reportsApi = useReportsApi();
const membersApi = useMembersApi();
const usersApi = useUsersApi();
const authStore = useAuthStore();

// D-44: Gestiona filter is owner-only. Use the same `authStore.user.role`
// pattern that ReportesPage uses for the country selector.
const isOwner = computed(() => authStore.user?.role === 'owner');

// ─── Constants (D-37, D-39, chip colors locked in CONTEXT D-35) ─────────

type LeadStatusValue = 'en_seguimiento' | 'cerrado' | 'perdido';
type AttendedFilter = 'true' | 'false' | 'pending';
type ShiftFilter = 'TM' | 'TT';

const LEAD_STATUS_LABELS_ES: Record<LeadStatusValue, string> = {
  en_seguimiento: 'En seguimiento',
  cerrado: 'Cerrado',
  perdido: 'Perdido',
};

const LEAD_STATUS_COLORS: Record<LeadStatusValue, string> = {
  en_seguimiento: 'blue-grey',
  cerrado: 'positive',
  perdido: 'negative',
};

const SHIFT_LABELS_ES: Record<ShiftFilter, string> = {
  TM: 'Mañana',
  TT: 'Tarde',
};

const ATTENDED_LABELS_ES = {
  si: 'Sí',
  no: 'No',
} as const;

const LEAD_STATUS_OPTIONS: Array<{ value: LeadStatusValue; label: string }> = [
  { value: 'en_seguimiento', label: 'En seguimiento' },
  { value: 'cerrado', label: 'Cerrado' },
  { value: 'perdido', label: 'Perdido' },
];

const ATTENDED_OPTIONS: Array<{ value: AttendedFilter; label: string }> = [
  { value: 'true', label: 'Sí' },
  { value: 'false', label: 'No' },
  { value: 'pending', label: 'Pendiente' },
];

const SHIFT_OPTIONS: Array<{ value: ShiftFilter; label: string }> = [
  { value: 'TM', label: 'Mañana' },
  { value: 'TT', label: 'Tarde' },
];

// ─── Filter state ───────────────────────────────────────────────────────

interface Filters {
  leadStatus: LeadStatusValue[];
  attended: AttendedFilter | null;
  shift: ShiftFilter | null;
  gestionaUserId: number | null;
  daysWithoutConvertingMin: number | null;
  search: string;
}

const filters = reactive<Filters>({
  leadStatus: [],
  attended: null,
  shift: null,
  gestionaUserId: null,
  daysWithoutConvertingMin: null,
  search: '',
});

// ─── Table state ────────────────────────────────────────────────────────

const rows = ref<TrialSessionsRowClient[]>([]);
const total = ref(0);
const loading = ref(false);
const exporting = ref(false);

const pagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

// ─── Inline edit state ──────────────────────────────────────────────────

const editingNotesUserId = ref<number | null>(null);
const editingNotesDraft = ref<string>('');
const savingUserId = ref<number | null>(null);

// ─── Gestiona options (owner-only — D-44) ───────────────────────────────

interface GestionaOption {
  userId: number;
  name: string;
}

const gestionaOptions = ref<GestionaOption[]>([]);
const loadingGestiona = ref(false);

async function loadGestionaOptionsIfOwner(): Promise<void> {
  if (!isOwner.value) return; // D-44: non-owners never even invoke the endpoint
  loadingGestiona.value = true;
  try {
    const staff = await usersApi.fetchStaff();
    // Only admin / gestion / owner — coach and recepcion don't manage leads.
    const ROLES_THAT_MANAGE_LEADS = new Set<string>(['admin', 'gestion', 'owner']);
    gestionaOptions.value = staff
      .filter((s: StaffUser) => ROLES_THAT_MANAGE_LEADS.has(s.role))
      .map((s: StaffUser) => ({
        userId: s.id,
        name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email,
      }))
      .sort((a: GestionaOption, b: GestionaOption) => a.name.localeCompare(b.name, 'es'));
  } catch (err: unknown) {
    log.error('Failed to load gestiona staff list', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loadingGestiona.value = false;
  }
}

// ─── Columns (D-01 locked order) ────────────────────────────────────────

function formatDateDdMmYyyy(iso: string): string {
  // iso is YYYY-MM-DD (server-side). Render DD/MM/YYYY for the UI.
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const columns: QTableColumn<TrialSessionsRowClient>[] = [
  {
    name: 'lead',
    label: 'Lead',
    field: 'lead',
    align: 'left',
    sortable: false,
  },
  {
    name: 'bookingDate',
    label: 'Fecha',
    field: 'bookingDate',
    align: 'left',
    sortable: false,
    format: (val: string) => formatDateDdMmYyyy(val),
  },
  {
    name: 'bookingCreatedAt',
    label: 'Creación',
    field: 'bookingCreatedAt',
    align: 'left',
    sortable: false,
    format: (val: string) => formatDateDdMmYyyy(val),
  },
  {
    name: 'startTime',
    label: 'Hora',
    field: 'startTime',
    align: 'left',
    sortable: false,
  },
  {
    name: 'branchName',
    label: 'Sucursal',
    field: 'branchName',
    align: 'left',
    sortable: false,
  },
  {
    name: 'attended',
    label: 'Asistió',
    field: 'attended',
    align: 'center',
    sortable: false,
  },
  {
    name: 'leadStatus',
    label: 'Estado del Lead',
    field: 'leadStatusEffective',
    align: 'center',
    sortable: false,
  },
  {
    name: 'gestiona',
    label: 'Gestiona',
    field: (r: TrialSessionsRowClient) => r.createdBy?.name ?? null,
    align: 'left',
    sortable: false,
  },
  {
    name: 'leadNotes',
    label: 'Comentarios',
    field: 'leadNotes',
    align: 'left',
    sortable: false,
  },
  {
    name: 'shift',
    label: 'Turno',
    field: (r: TrialSessionsRowClient) => SHIFT_LABELS_ES[r.shift],
    align: 'left',
    sortable: false,
  },
  {
    name: 'period',
    label: 'Periodo',
    field: 'period',
    align: 'left',
    sortable: false,
  },
  {
    name: 'weekRange',
    label: 'Semana',
    field: 'weekRange',
    align: 'left',
    sortable: false,
  },
];

// ─── Build server-side filter payload ───────────────────────────────────

function buildServerFilters() {
  return {
    branchId: props.branchId,
    leadStatus: filters.leadStatus.length > 0 ? filters.leadStatus : undefined,
    attended: filters.attended ?? undefined,
    shift: filters.shift ?? undefined,
    // D-44: only ship gestionaUserId when current user is owner. The server
    // also silently strips it for non-owners (Plan 05 T3) as defense in depth.
    gestionaUserId:
      isOwner.value && filters.gestionaUserId !== null ? filters.gestionaUserId : undefined,
    daysWithoutConvertingMin:
      filters.daysWithoutConvertingMin !== null && filters.daysWithoutConvertingMin >= 0
        ? filters.daysWithoutConvertingMin
        : undefined,
    search: filters.search.trim() ? filters.search.trim() : undefined,
    page: pagination.value.page,
    limit: pagination.value.rowsPerPage,
  };
}

// ─── Load lifecycle ─────────────────────────────────────────────────────

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await reportsApi.fetchTrialSessions(buildServerFilters());
    rows.value = result.rows;
    total.value = result.total;
    pagination.value.rowsNumber = result.total;
    pagination.value.page = result.page;
    pagination.value.rowsPerPage = result.limit;
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando sesiones de prueba');
    log.error('Failed to load trial sessions', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

// Debounced reload for filter changes — verbatim per the plan spec. The
// search input already debounces at the input layer (`debounce="300"`), so
// its watcher invocation arrives already-throttled; the outer debounce is
// harmless (no duplicate fire). DO NOT swap for useDebounceFn — we don't
// add VueUse as a new dependency (CLAUDE.md / feedback_no_auto_install_deps).
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedReload(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Reset to page 1 whenever filters change
    pagination.value.page = 1;
    void load();
  }, 300);
}

watch(filters, () => debouncedReload(), { deep: true });

// ─── Pagination ─────────────────────────────────────────────────────────

function onPageChange(props: Parameters<NonNullable<QTableProps['onRequest']>>[0]): void {
  pagination.value.page = props.pagination.page ?? 1;
  pagination.value.rowsPerPage = props.pagination.rowsPerPage ?? 20;
  void load();
}

// ─── Inline edit: leadStatus (D-37) ─────────────────────────────────────

async function onChangeStatus(
  row: TrialSessionsRowClient,
  newStatus: LeadStatusValue
): Promise<void> {
  if (row.leadStatusEffective === newStatus && row.leadStatus === newStatus) return;
  savingUserId.value = row.userId;
  const prevLeadStatus = row.leadStatus;
  const prevLeadStatusEffective = row.leadStatusEffective;
  try {
    const snapshot = await membersApi.updateLead(row.userId, { leadStatus: newStatus });
    row.leadStatus = snapshot.leadStatus;
    row.leadStatusEffective = snapshot.leadStatus ?? newStatus;
    $q.notify({ type: 'positive', message: 'Estado actualizado', timeout: 1500 });
  } catch (err: unknown) {
    // Revert optimistic UI state
    row.leadStatus = prevLeadStatus;
    row.leadStatusEffective = prevLeadStatusEffective;
    const message = extractError(err, 'Error al actualizar el estado');
    log.error('Failed to update lead status', {
      error: message,
      userId: row.userId,
      newStatus,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    savingUserId.value = null;
  }
}

// ─── Inline edit: leadNotes (D-37) ──────────────────────────────────────

function startEditNotes(row: TrialSessionsRowClient): void {
  editingNotesUserId.value = row.userId;
  editingNotesDraft.value = row.leadNotes ?? '';
}

function cancelEditNotes(): void {
  editingNotesUserId.value = null;
  editingNotesDraft.value = '';
}

async function onSaveNotes(row: TrialSessionsRowClient): Promise<void> {
  // If unchanged → just close the editor; don't ping the server.
  const draft = editingNotesDraft.value;
  const next = draft.length === 0 ? null : draft;
  const prev = row.leadNotes;
  if (next === prev) {
    editingNotesUserId.value = null;
    editingNotesDraft.value = '';
    return;
  }

  savingUserId.value = row.userId;
  try {
    const snapshot = await membersApi.updateLead(row.userId, { leadNotes: next });
    row.leadNotes = snapshot.leadNotes;
    $q.notify({ type: 'positive', message: 'Comentario guardado', timeout: 1500 });
  } catch (err: unknown) {
    // Backend returns 400 if leadNotes > 2000 chars (CONTEXT.md pitfalls).
    const message = extractError(err, 'Error al guardar el comentario');
    log.error('Failed to update lead notes', {
      error: message,
      userId: row.userId,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    savingUserId.value = null;
    editingNotesUserId.value = null;
    editingNotesDraft.value = '';
  }
}

// ─── Export CSV ─────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function onExport(): Promise<void> {
  exporting.value = true;
  try {
    // For the export, the server ignores pagination (Plan 05 SUMMARY) — strip
    // it from the payload so the request is clean.
    const exportFilters = { ...buildServerFilters() };
    delete (exportFilters as { page?: number }).page;
    delete (exportFilters as { limit?: number }).limit;
    const blob = await reportsApi.exportTrialSessions(exportFilters);
    const today = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `sesiones-de-prueba-${today}.csv`);
    $q.notify({ type: 'positive', message: 'Exportación completada', timeout: 1500 });
  } catch (err: unknown) {
    const message = extractError(err, 'Error al exportar');
    log.error('Failed to export trial sessions', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    exporting.value = false;
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────

watch(
  () => props.branchId,
  () => {
    pagination.value.page = 1;
    void load();
  }
);

onMounted(async () => {
  await loadGestionaOptionsIfOwner();
  await load();
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  reportsApi.cleanup();
  membersApi.cleanup();
  usersApi.cleanup();
});
</script>

<style scoped>
.notes-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 1.5em;
  white-space: pre-wrap;
  word-break: break-word;
}
.no-underline {
  text-decoration: none;
}
.no-underline:hover {
  text-decoration: underline;
}
</style>
