<template>
  <div>
    <!-- ================================================================== -->
    <!-- Aviso: SP reservadas desde la app pendientes de contactar. El filtro  -->
    <!-- NO se aplica por defecto; solo al tocar "Clickeá acá para filtrarlos" -->
    <!-- (toggle). Estilo suave tipo danger (espeja MemberProgramsTab).        -->
    <!-- ================================================================== -->
    <q-banner
      v-if="adminStore.appTrialsPendingCount > 0"
      class="bg-red-1 text-negative q-mb-md app-trials-banner"
    >
      <template #avatar>
        <q-icon name="notifications_active" color="negative" size="20px" />
      </template>
      <span class="text-weight-medium">
        {{ adminStore.appTrialsPendingCount }}
        {{ adminStore.appTrialsPendingCount === 1 ? 'alumno reservó' : 'alumnos reservaron' }}
        su sesión de prueba desde la app y
        {{ adminStore.appTrialsPendingCount === 1 ? 'espera' : 'esperan' }} tu mensaje.
      </span>
      <span
        class="text-weight-medium cursor-pointer text-underline q-ml-xs"
        @click="togglePendingFollowup"
      >
        {{ filters.pendingFollowup ? 'Quitar filtro.' : 'Clickeá acá para filtrarlos.' }}
      </span>
    </q-banner>

    <!-- ================================================================== -->
    <!-- Header: caption + engranaje "Turnos" (solo owner/admin) -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-sm">
      <div class="col text-caption text-grey-7">
        Cadencia de mensajes de la sesión de prueba — qué mensaje corresponde a cada persona y cuándo
      </div>
      <div class="col-auto">
        <q-btn
          v-if="canManageShifts"
          flat
          round
          dense
          icon="settings"
          @click="showShiftsDialog = true"
        >
          <q-tooltip>Turnos de sesiones de prueba</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- KPIs (clickeables cuando aplican como filtro rápido) -->
    <!-- ================================================================== -->
    <div class="row q-col-gutter-sm q-mb-md">
      <div v-for="card in kpiCards" :key="card.key" class="col-6 col-sm-4 col-md-2">
        <KpiCard
          :label="card.label"
          :value="card.value"
          :icon="card.icon"
          :active="card.active"
          :loading="loading"
          @click="card.onClick ? card.onClick() : null"
        />
      </div>
    </div>

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

      <div class="col-6 col-sm-3 col-md-2">
        <q-select
          :model-value="filters.sessionStatus"
          :options="SESSION_STATUS_OPTIONS"
          multiple
          emit-value
          map-options
          label="Estado"
          dense
          outlined
          clearable
          use-chips
          @update:model-value="(v) => (filters.sessionStatus = Array.isArray(v) ? v : [])"
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

      <!-- Origen de la SP: creada desde la app (self-service) vs cargada por staff -->
      <div class="col-6 col-sm-2 col-md-2">
        <q-select
          v-model="filters.origin"
          :options="ORIGIN_OPTIONS"
          emit-value
          map-options
          label="Origen SP"
          dense
          outlined
          clearable
        />
      </div>

      <!-- Sólo SP de app que nadie tomó todavía (mismo criterio que la pelotita) -->
      <div class="col-auto self-center">
        <q-toggle v-model="filters.pendingFollowup" label="Solo pendientes de seguimiento" dense />
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
      class="trial-sessions-table"
      :rows="rows"
      :columns="columns"
      row-key="bookingId"
      :loading="loading"
      v-model:pagination="pagination"
      :rows-per-page-options="[20, 50, 100, 200]"
      @request="onPageChange"
      flat
      bordered
    >
      <template #body="props">
        <q-tr :props="props" :data-booking-row="props.row.bookingId">
          <q-td
            v-for="col in props.cols"
            :key="col.name"
            :props="props"
            :auto-width="col.name === 'acciones'"
          >
            <!-- Lead: clickable name navigates to AlumnoDetailPage -->
            <template v-if="col.name === 'lead'">
              <router-link
                :to="`/alumnos/${props.row.userId}`"
                class="text-primary text-weight-medium no-underline"
              >
                {{ props.row.lead }}
              </router-link>
            </template>

            <!-- Teléfono: copiar E.164 (mismo patrón que Renovaciones) -->
            <template v-else-if="col.name === 'phone'">
              <div class="row items-center no-wrap q-gutter-xs">
                <span>{{ props.row.phoneE164 ?? props.row.phone ?? '—' }}</span>
                <q-btn
                  v-if="props.row.phoneE164 || props.row.phone"
                  flat
                  round
                  dense
                  size="sm"
                  icon="content_copy"
                  @click="copyPhone(props.row)"
                >
                  <q-tooltip>Copiar número</q-tooltip>
                </q-btn>
                <q-icon v-if="!props.row.phoneE164" name="warning" color="warning" size="16px">
                  <q-tooltip>Número inválido: revisalo en la ficha</q-tooltip>
                </q-icon>
              </div>
            </template>

            <!-- Origen slot: 🟢 Nueva (app sin seguimiento) / App ✓ (ya contactada) / Staff -->
            <template v-else-if="col.name === 'origin'">
              <template v-if="props.row.origin === 'app'">
                <q-chip
                  v-if="!props.row.followupStartedAt"
                  color="positive"
                  text-color="white"
                  dense
                  icon="fiber_new"
                  label="Nueva"
                >
                  <q-tooltip>Sesión de prueba creada desde la app, sin seguimiento iniciado</q-tooltip>
                </q-chip>
                <q-chip v-else color="grey-4" text-color="grey-8" dense icon="smartphone" label="App">
                  <q-tooltip>Desde la app — seguimiento iniciado</q-tooltip>
                </q-chip>
              </template>
              <span v-else class="text-grey-6">Staff</span>
            </template>

            <!-- Estado: única fuente visible (subsume el viejo leadStatus + Asistió) -->
            <template v-else-if="col.name === 'sessionStatus'">
              <q-chip
                :color="trialSessionStatusMeta(props.row.sessionStatus).color"
                text-color="white"
                dense
                :clickable="isTrialSessionOpen(props.row.sessionStatus)"
                :label="trialSessionStatusMeta(props.row.sessionStatus).label"
              >
                <q-menu v-if="isTrialSessionOpen(props.row.sessionStatus)" auto-close>
                  <q-list dense>
                    <q-item clickable @click="openPlanDialog(props.row)">
                      <q-item-section>Marcar Ganada…</q-item-section>
                    </q-item>
                    <q-item clickable @click="openLostDialog(props.row)">
                      <q-item-section class="text-negative">Marcar Perdida…</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-chip>
              <q-icon
                v-if="props.row.leadStatusSource === 'manual'"
                name="edit"
                size="14px"
                class="q-ml-xs text-grey-6"
              >
                <q-tooltip>Estado puesto a mano</q-tooltip>
              </q-icon>
            </template>

            <!-- Último mensaje -->
            <template v-else-if="col.name === 'lastMessage'">
              {{ formatLastMessage(props.row) }}
            </template>

            <!-- Próxima acción: roja si venció -->
            <template v-else-if="col.name === 'nextAction'">
              <span :class="{ 'text-negative text-weight-medium': props.row.nextAction?.status === 'overdue' }">
                {{ formatNextActionForRow(props.row) }}
              </span>
            </template>

            <!-- Reagenda: link a la sesión nueva (original) / referencia a la vieja (hija) -->
            <template v-else-if="col.name === 'reagenda'">
              <template v-if="props.row.rescheduledTo">
                <q-btn
                  v-if="isBookingOnPage(props.row.rescheduledTo.bookingId)"
                  flat
                  dense
                  no-caps
                  color="primary"
                  icon="arrow_forward"
                  :label="`${formatDateDdMmYyyy(props.row.rescheduledTo.date)} ${props.row.rescheduledTo.startTime}`"
                  @click="scrollToBooking(props.row.rescheduledTo.bookingId)"
                />
                <span v-else class="text-grey-7">
                  {{ formatDateDdMmYyyy(props.row.rescheduledTo.date) }}
                  {{ props.row.rescheduledTo.startTime }}
                  <q-tooltip>
                    {{ props.row.rescheduledTo.branchName }} — no está en esta página, ajustá filtros/página
                    para verla
                  </q-tooltip>
                </span>
              </template>
              <template v-else-if="props.row.rescheduledFrom">
                <span class="text-grey-7 text-caption">
                  Reagenda de {{ formatDateDdMmYyyy(props.row.rescheduledFrom.date) }}
                  {{ props.row.rescheduledFrom.startTime }}
                </span>
              </template>
              <span v-else class="text-grey-5">—</span>
            </template>

            <!-- Plan comprado: click abre el diálogo de plan -->
            <template v-else-if="col.name === 'purchasedPlan'">
              <div class="cursor-pointer" @click="openPlanDialog(props.row)">
                <q-chip
                  v-if="props.row.purchasedPlanName"
                  color="positive"
                  outline
                  dense
                  :label="props.row.purchasedPlanName"
                />
                <span v-else class="text-grey-5">—</span>
              </div>
            </template>

            <!-- Gestiona -->
            <template v-else-if="col.name === 'gestiona'">
              <template v-if="props.row.createdBy">{{ props.row.createdBy.name }}</template>
              <span v-else class="text-grey-6">—</span>
            </template>

            <!-- Comentarios: inline edit -->
            <template v-else-if="col.name === 'leadNotes'">
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
            </template>

            <!-- Acciones rápidas: solo en sesiones "en juego" -->
            <template v-else-if="col.name === 'acciones'">
              <template v-if="isTrialSessionOpen(props.row.sessionStatus)">
                <div class="row items-center no-wrap q-gutter-xs">
                  <q-btn
                    v-if="props.row.nextAction"
                    flat
                    dense
                    no-caps
                    size="sm"
                    color="primary"
                    :loading="actionSavingBookingId === props.row.bookingId"
                    :label="`Marcar ${props.row.nextAction.code}`"
                    @click="onMarkSent(props.row, props.row.nextAction.code)"
                  />
                  <q-btn flat round dense size="sm" icon="more_vert">
                    <q-menu auto-close>
                      <q-list dense style="min-width: 220px">
                        <q-item
                          v-if="props.row.followup?.lastMessage"
                          clickable
                          @click="onUnmarkSent(props.row)"
                        >
                          <q-item-section>
                            Desmarcar {{ props.row.followup.lastMessage.code }}
                          </q-item-section>
                        </q-item>
                        <q-item clickable @click="onToggleResponded(props.row)">
                          <q-item-section avatar>
                            <q-icon
                              :name="
                                props.row.followup?.respondedAt
                                  ? 'check_box'
                                  : 'check_box_outline_blank'
                              "
                            />
                          </q-item-section>
                          <q-item-section>Respondió</q-item-section>
                        </q-item>
                        <q-separator />
                        <q-item clickable @click="openRescheduleDialog(props.row)">
                          <q-item-section>Reagendar…</q-item-section>
                        </q-item>
                        <q-item clickable @click="openLostDialog(props.row)">
                          <q-item-section class="text-negative">Marcar perdida…</q-item-section>
                        </q-item>
                      </q-list>
                    </q-menu>
                  </q-btn>
                </div>
              </template>
              <span v-else class="text-grey-5 text-caption">Sesión cerrada</span>
            </template>

            <!-- Resto de columnas (Fecha/Hora/Turno/Sucursal): valor plano
                 resuelto vía `col.field`/`col.format`, mismo criterio que el
                 render por defecto de q-table (necesario acá porque el
                 slot #body reemplaza TODO el renderizado de fila). -->
            <template v-else>
              {{ cellValue(col, props.row) }}
            </template>
          </q-td>
        </q-tr>
      </template>

      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          No hay sesiones de prueba para los filtros seleccionados
        </div>
      </template>
    </q-table>

    <!-- Diálogo "Plan comprado" (hotfix 2026-07). Entra desde la celda de plan
         o desde el menú de Estado ("Marcar Ganada…"). -->
    <q-dialog v-model="showPlanDialog">
      <q-card style="min-width: 320px">
        <q-card-section>
          <div class="text-h6">Plan comprado</div>
          <div v-if="planDialogRow" class="text-caption text-grey-7">
            {{ planDialogRow.lead }} — al confirmar, el estado pasa a "Ganada"
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-select
            v-model="planDialogPlanId"
            :options="planOptions"
            option-value="id"
            option-label="label"
            emit-value
            map-options
            label="Plan"
            dense
            outlined
            :loading="loadingPlans"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-if="planDialogRow?.purchasedPlanId"
            flat
            color="negative"
            label="Quitar plan"
            :loading="savingUserId === planDialogRow?.userId"
            @click="onRemovePlan"
          />
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn
            color="primary"
            label="Guardar"
            :disable="planDialogPlanId === null"
            :loading="savingUserId === planDialogRow?.userId"
            @click="onConfirmPlanDialog"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Diálogo "Marcar perdida": motivo + nota (SPEC decisión #2) -->
    <q-dialog v-model="showLostDialog">
      <q-card style="min-width: 360px">
        <q-card-section>
          <div class="text-h6">Marcar como perdida</div>
          <div v-if="lostDialogRow" class="text-caption text-grey-7">
            {{ lostDialogRow.lead }}
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none q-gutter-sm">
          <q-select
            v-model="lostReason"
            :options="LOST_REASON_OPTIONS"
            emit-value
            map-options
            label="Motivo"
            dense
            outlined
          />
          <q-input v-model="lostNote" type="textarea" autogrow dense outlined label="Nota (opcional)" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn
            color="negative"
            label="Marcar perdida"
            :disable="lostReason === null"
            :loading="actionSavingBookingId === lostDialogRow?.bookingId"
            @click="onConfirmLost"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <RescheduleTrialDialog
      :show="showRescheduleDialog"
      :trial="trialForRescheduleDialog"
      :branch-id="rescheduleRow?.branchId ?? null"
      @update:show="showRescheduleDialog = $event"
      @rescheduled="onRescheduled"
    />

    <TrialShiftsDialog v-model="showShiftsDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useQuasar, type QTableColumn, type QTableProps } from 'quasar';
import {
  useReportsApi,
  type TrialSessionsRowClient,
  type TrialSessionStatus,
  type TrialMessageCode,
  type TrialLostReason,
  type TrialSessionKpis,
  type TrialFollowupAction,
} from 'src/composables/useReportsApi';
import { useMembersApi, type LeadSnapshot } from 'src/composables/useMembersApi';
import { useUsersApi, type StaffUser } from 'src/composables/useUsersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useAdminStore } from 'src/stores/useAdminStore';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { DUENO_ROLES } from 'src/config/templo-config';
import { trialSessionStatusMeta, isTrialSessionOpen } from 'src/utils/trial-session-status';
import { formatNextAction } from 'src/utils/trial-next-action';
import { formatDateTimeInTz } from 'src/utils/tz';
import type { BranchOption } from 'src/types/member';
import type { TrialListItem } from 'src/types/scheduling';
import RescheduleTrialDialog from 'src/components/scheduling/RescheduleTrialDialog.vue';
import TrialShiftsDialog from 'src/components/reports/TrialShiftsDialog.vue';
import KpiCard from 'src/components/comunicaciones/KpiCard.vue';

const props = defineProps<{
  branchId?: number | undefined;
  /**
   * País del selector de ReportesPage (owner). Sin esto el server resuelve el
   * scope desde la sede del propio owner —- que es AR -— y las sesiones de
   * prueba de España quedan invisibles con cualquier filtro.
   */
  country?: 'AR' | 'ES' | undefined;
}>();

// ─── Setup ──────────────────────────────────────────────────────────────

const log = createLogger('TrialSessionsReport');
const $q = useQuasar();
const reportsApi = useReportsApi();
const membersApi = useMembersApi();
const usersApi = useUsersApi();
const authStore = useAuthStore();
const adminStore = useAdminStore();

const isOwner = computed(() => authStore.user?.role === 'owner');
// Turnos (⚙): mismo gate que Renovaciones (owner/admin) — el server además
// lo exige via `requireAdminRole` en los endpoints /trial-sessions/shifts.
const canManageShifts = computed(() =>
  (DUENO_ROLES as readonly string[]).includes(authStore.user?.role ?? '')
);

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

// ─── Constants ────────────────────────────────────────────────────────────

type ShiftFilter = 'TM' | 'TT';

const SHIFT_LABELS_ES: Record<ShiftFilter, string> = {
  TM: 'Mañana',
  TT: 'Tarde',
};

const SHIFT_OPTIONS: Array<{ value: ShiftFilter; label: string }> = [
  { value: 'TM', label: 'Mañana' },
  { value: 'TT', label: 'Tarde' },
];

type OriginFilter = 'app' | 'admin';

const ORIGIN_OPTIONS: Array<{ value: OriginFilter; label: string }> = [
  { value: 'app', label: 'Desde la app' },
  { value: 'admin', label: 'Cargada por staff' },
];

// Cadencia de mensajes: "Estado" es la ÚNICA fuente visible (reemplaza a los
// viejos filtros leadStatus/attended/leadStatusSource — ver decisión en el
// reporte del plan). Opciones derivadas de `trialSessionStatusMeta` (DRY).
const SESSION_STATUS_VALUES: TrialSessionStatus[] = [
  'agendada',
  'asistio',
  'no_asistio',
  'reagendada',
  'ganada',
  'perdida',
];
const SESSION_STATUS_OPTIONS: Array<{ value: TrialSessionStatus; label: string }> =
  SESSION_STATUS_VALUES.map((value) => ({ value, label: trialSessionStatusMeta(value).label }));

const LOST_REASON_OPTIONS: Array<{ value: TrialLostReason; label: string }> = [
  { value: 'no_responde', label: 'No responde' },
  { value: 'precio', label: 'Precio' },
  { value: 'horario', label: 'Horario' },
  { value: 'distancia', label: 'Distancia' },
  { value: 'otro', label: 'Otro' },
];

// ─── Filter state ───────────────────────────────────────────────────────

interface Filters {
  sessionStatus: TrialSessionStatus[];
  shift: ShiftFilter | null;
  gestionaUserId: number | null;
  daysWithoutConvertingMin: number | null;
  search: string;
  origin: OriginFilter | null;
  pendingFollowup: boolean;
  pendingThisShift: boolean;
}

const filters = reactive<Filters>({
  sessionStatus: [],
  shift: null,
  gestionaUserId: null,
  daysWithoutConvertingMin: null,
  search: '',
  origin: null,
  pendingFollowup: false,
  pendingThisShift: false,
});

// ─── Table state ────────────────────────────────────────────────────────

const rows = ref<TrialSessionsRowClient[]>([]);
const total = ref(0);
const loading = ref(false);
const exporting = ref(false);
const actionSavingBookingId = ref<number | null>(null);

const pagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

// ─── KPIs (brief §9 / SPEC) ─────────────────────────────────────────────

const kpis = ref<TrialSessionKpis | null>(null);

function formatPct(value: number | null | undefined): string {
  return value != null ? `${value.toFixed(0)}%` : '—';
}

interface KpiCardConfig {
  key: string;
  label: string;
  value: number | string;
  icon: string;
  active: boolean;
  onClick: (() => void) | null;
}

const kpiCards = computed<KpiCardConfig[]>(() => {
  const k = kpis.value;
  return [
    {
      key: 'pendingThisShift',
      label: 'Pendientes del turno',
      value: k?.pendingThisShift ?? 0,
      icon: 'notifications_active',
      active: filters.pendingThisShift,
      onClick: () => {
        filters.pendingThisShift = !filters.pendingThisShift;
      },
    },
    {
      key: 'total',
      label: 'Total sesiones',
      value: k?.total ?? 0,
      icon: 'event_note',
      active: !filters.pendingThisShift && filters.sessionStatus.length === 0,
      onClick: () => {
        filters.pendingThisShift = false;
        filters.sessionStatus = [];
      },
    },
    {
      key: 'attendanceRate',
      label: '% Asistencia',
      value: formatPct(k?.attendanceRate),
      icon: 'how_to_reg',
      active: false,
      onClick: null,
    },
    {
      key: 'conversionRate',
      label: '% Conversión',
      value: formatPct(k?.conversionRate),
      icon: 'trending_up',
      active: false,
      onClick: null,
    },
    {
      key: 'recoveryRate',
      label: '% Recuperación',
      value: formatPct(k?.recoveryRate),
      icon: 'restart_alt',
      active: false,
      onClick: null,
    },
  ];
});

// ─── Franjas por sede (para formatear fechas en hora local) ─────────────

const branches = ref<BranchOption[]>([]);
const branchTimezones = computed(
  () => new Map(branches.value.filter((b) => b.timezone).map((b) => [b.id, b.timezone as string]))
);

function tzFor(branchId: number): string {
  return branchTimezones.value.get(branchId) ?? DEFAULT_TZ;
}

async function loadBranches(): Promise<void> {
  try {
    branches.value = await membersApi.getBranches({ country: props.country });
  } catch (err: unknown) {
    log.error('Failed to load branches for timezone lookup', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Inline edit state (Comentarios) ─────────────────────────────────────

const editingNotesUserId = ref<number | null>(null);
const editingNotesDraft = ref<string>('');
const savingUserId = ref<number | null>(null);

// ─── Plan comprado (hotfix 2026-07 — "Marcar Ganada…") ──────────────────

interface PlanSelectOption {
  id: number;
  label: string;
}

const planOptions = ref<PlanSelectOption[]>([]);
const loadingPlans = ref(false);

const showPlanDialog = ref(false);
const planDialogRow = ref<TrialSessionsRowClient | null>(null);
const planDialogPlanId = ref<number | null>(null);

async function loadPlanOptions(): Promise<void> {
  loadingPlans.value = true;
  try {
    const plans = await membersApi.getPlans();
    const nameCounts = new Map<string, number>();
    for (const p of plans) {
      nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1);
    }
    planOptions.value = plans.map((p) => ({
      id: p.id,
      label: (nameCounts.get(p.name) ?? 0) > 1 ? `${p.name} (${p.country})` : p.name,
    }));
  } catch (err: unknown) {
    log.error('Failed to load plan options', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loadingPlans.value = false;
  }
}

function openPlanDialog(row: TrialSessionsRowClient): void {
  planDialogRow.value = row;
  planDialogPlanId.value = row.purchasedPlanId;
  showPlanDialog.value = true;
}

/** Vuelca los campos de lead del snapshot del PATCH sobre la fila visible. */
function applyLeadSnapshot(row: TrialSessionsRowClient, snapshot: LeadSnapshot): void {
  row.leadStatus = snapshot.leadStatus;
  row.leadStatusEffective = snapshot.leadStatus ?? row.leadStatusEffective;
  row.purchasedPlanId = snapshot.purchasedPlanId;
  row.purchasedPlanName = snapshot.purchasedPlanName;
  row.leadNotes = snapshot.leadNotes;
}

async function onConfirmPlanDialog(): Promise<void> {
  const row = planDialogRow.value;
  if (!row || planDialogPlanId.value === null) return;
  savingUserId.value = row.userId;
  try {
    const snapshot = await membersApi.updateLead(row.userId, {
      leadStatus: 'ganado',
      purchasedPlanId: planDialogPlanId.value,
    });
    applyLeadSnapshot(row, snapshot);
    showPlanDialog.value = false;
    $q.notify({ type: 'positive', message: 'Plan comprado guardado', timeout: 1500 });
    void load();
  } catch (err: unknown) {
    const message = extractError(err, 'Error al guardar el plan');
    log.error('Failed to update purchased plan', { error: message, userId: row.userId });
    $q.notify({ type: 'negative', message });
  } finally {
    savingUserId.value = null;
  }
}

async function onRemovePlan(): Promise<void> {
  const row = planDialogRow.value;
  if (!row) return;
  savingUserId.value = row.userId;
  try {
    const snapshot = await membersApi.updateLead(row.userId, {
      leadStatus: 'en_seguimiento',
      purchasedPlanId: null,
    });
    applyLeadSnapshot(row, snapshot);
    showPlanDialog.value = false;
    $q.notify({ type: 'positive', message: 'Plan quitado', timeout: 1500 });
    void load();
  } catch (err: unknown) {
    const message = extractError(err, 'Error al quitar el plan');
    log.error('Failed to remove purchased plan', { error: message, userId: row.userId });
    $q.notify({ type: 'negative', message });
  } finally {
    savingUserId.value = null;
  }
}

// ─── Marcar perdida (SPEC decisión #2) ───────────────────────────────────

const showLostDialog = ref(false);
const lostDialogRow = ref<TrialSessionsRowClient | null>(null);
const lostReason = ref<TrialLostReason | null>(null);
const lostNote = ref('');

function openLostDialog(row: TrialSessionsRowClient): void {
  lostDialogRow.value = row;
  lostReason.value = null;
  lostNote.value = '';
  showLostDialog.value = true;
}

async function onConfirmLost(): Promise<void> {
  const row = lostDialogRow.value;
  if (!row || lostReason.value === null) return;
  await performFollowupAction(
    row,
    { type: 'lost', reason: lostReason.value, note: lostNote.value.trim() || null },
    'Sesión marcada como perdida'
  );
  showLostDialog.value = false;
}

// ─── Cadencia de mensajes: acciones rápidas de fila ──────────────────────

function replaceRow(updated: TrialSessionsRowClient): void {
  const idx = rows.value.findIndex((r) => r.bookingId === updated.bookingId);
  if (idx !== -1) rows.value[idx] = updated;
}

async function performFollowupAction(
  row: TrialSessionsRowClient,
  action: TrialFollowupAction,
  successMessage: string
): Promise<void> {
  actionSavingBookingId.value = row.bookingId;
  try {
    const updated = await reportsApi.updateTrialFollowup(row.bookingId, action);
    replaceRow(updated);
    $q.notify({ type: 'positive', message: successMessage, timeout: 1200 });
    // Los KPIs (pendientes del turno, etc.) dependen del set completo — se
    // recalculan volviendo a pedir el listado (mismo criterio que
    // RenovacionesTab.patchFollowup). No toca la URL: esta pantalla no
    // sincroniza filtros contra la query, así que no hay salto de scroll.
    await load();
  } catch (err: unknown) {
    // El 409 de guardrail (SESSION_CLOSED, M2_BEFORE_CLASS_END, etc.) trae el
    // mensaje en español listo para mostrar (SPEC) — extractError ya lo toma.
    const message = extractError(err, 'No se pudo actualizar el seguimiento');
    log.error('Failed to update trial followup', {
      error: message,
      bookingId: row.bookingId,
      actionType: action.type,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    actionSavingBookingId.value = null;
  }
}

async function onMarkSent(row: TrialSessionsRowClient, code: TrialMessageCode): Promise<void> {
  await performFollowupAction(row, { type: 'mark_sent', code }, `${code} marcado como enviado`);
}

async function onUnmarkSent(row: TrialSessionsRowClient): Promise<void> {
  const code = row.followup?.lastMessage?.code;
  if (!code) return;
  await performFollowupAction(row, { type: 'unmark_sent', code }, `${code} desmarcado`);
}

async function onToggleResponded(row: TrialSessionsRowClient): Promise<void> {
  const next = row.followup?.respondedAt == null;
  await performFollowupAction(
    row,
    { type: 'responded', value: next },
    next ? 'Marcado como "Respondió"' : 'Se quitó la marca de "Respondió"'
  );
}

// ─── Reagendar (reutiliza RescheduleTrialDialog) ─────────────────────────

const showRescheduleDialog = ref(false);
const rescheduleRow = ref<TrialSessionsRowClient | null>(null);

function openRescheduleDialog(row: TrialSessionsRowClient): void {
  rescheduleRow.value = row;
  showRescheduleDialog.value = true;
}

// RescheduleTrialDialog espera un `TrialListItem` (contrato del listado de
// SP del coach) — acá se arma uno mínimo con lo que la fila del reporte ya
// tiene. Los campos que el diálogo no usa en pantalla (scheduleId, endTime,
// activityName, status) quedan con placeholders inertes.
const trialForRescheduleDialog = computed<TrialListItem | null>(() => {
  const r = rescheduleRow.value;
  if (!r) return null;
  const parts = r.lead.trim().split(/\s+/);
  return {
    bookingId: r.bookingId,
    userId: r.userId,
    firstName: parts[0] ?? r.lead,
    lastName: parts.slice(1).join(' '),
    phone: r.phone,
    scheduleId: 0,
    startTime: r.startTime,
    endTime: '',
    activityName: '',
    status: '',
  };
});

function onRescheduled(): void {
  showRescheduleDialog.value = false;
  void load();
}

// ─── Turnos (⚙, owner/admin) ──────────────────────────────────────────────

const showShiftsDialog = ref(false);

// ─── Reagenda: scroll a la fila vinculada si está en la página actual ────

function isBookingOnPage(bookingId: number): boolean {
  return rows.value.some((r) => r.bookingId === bookingId);
}

function scrollToBooking(bookingId: number): void {
  const el = document.querySelector<HTMLElement>(`[data-booking-row="${bookingId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('trial-row--highlight');
  setTimeout(() => el.classList.remove('trial-row--highlight'), 1500);
}

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

// ─── Formatters ─────────────────────────────────────────────────────────

function formatDateDdMmYyyy(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatLastMessage(row: TrialSessionsRowClient): string {
  const lm = row.followup?.lastMessage;
  if (!lm) return '—';
  const when = formatDateTimeInTz(lm.sentAt, tzFor(row.branchId));
  const who = lm.sentBy?.name ?? '—';
  return `${lm.code} · ${when} · ${who}`;
}

function formatNextActionForRow(row: TrialSessionsRowClient): string {
  return formatNextAction(row.nextAction, tzFor(row.branchId));
}

async function copyPhone(row: TrialSessionsRowClient): Promise<void> {
  const target = row.phoneE164 ?? row.phone;
  if (!target) return;
  try {
    await navigator.clipboard.writeText(target);
  } catch (err: unknown) {
    log.error('Error copiando número', {
      error: err instanceof Error ? err.message : String(err),
      userId: row.userId,
    });
    $q.notify({ type: 'negative', message: 'No se pudo copiar' });
    return;
  }
  $q.notify({
    type: row.phoneE164 ? 'positive' : 'warning',
    message: row.phoneE164
      ? 'Copiado'
      : 'Número inválido: revisalo en la ficha (copiado el original)',
  });
}

// ─── Columns ────────────────────────────────────────────────────────────
//
// Las celdas complejas (lead, phone, origin, sessionStatus, lastMessage,
// nextAction, reagenda, purchasedPlan, gestiona, leadNotes, acciones) se
// resuelven en un único slot `#body` (arriba) — más simple que mantener 11
// `body-cell-*` slots separados y evita repetir `<q-td :props="props">` en
// cada uno (DRY). Acá solo se define el contrato de columnas de q-table.

/**
 * Resuelve el valor de una celda "simple" (sin template dedicado en el slot
 * `#body`) igual que lo haría q-table por defecto: `col.field` puede ser el
 * nombre de una propiedad O una función `(row) => valor`, y `col.format` es
 * opcional. Necesario porque el slot `#body` reemplaza TODO el renderizado
 * de fila — q-table ya no resuelve esto por nosotros.
 */
function cellValue(col: QTableColumn<TrialSessionsRowClient>, row: TrialSessionsRowClient): unknown {
  const raw =
    typeof col.field === 'function'
      ? col.field(row)
      : row[col.field as keyof TrialSessionsRowClient];
  return col.format ? col.format(raw, row) : raw;
}

const columns: QTableColumn<TrialSessionsRowClient>[] = [
  { name: 'lead', label: 'Lead', field: 'lead', align: 'left', sortable: false },
  { name: 'phone', label: 'Teléfono', field: 'phoneE164', align: 'left', sortable: false },
  {
    name: 'bookingDate',
    label: 'Fecha',
    field: 'bookingDate',
    align: 'left',
    sortable: false,
    format: (val: string) => formatDateDdMmYyyy(val),
  },
  { name: 'startTime', label: 'Hora', field: 'startTime', align: 'left', sortable: false },
  {
    name: 'shift',
    label: 'Turno',
    field: (r: TrialSessionsRowClient) => SHIFT_LABELS_ES[r.shift],
    align: 'left',
    sortable: false,
  },
  { name: 'branchName', label: 'Sucursal', field: 'branchName', align: 'left', sortable: false },
  { name: 'origin', label: 'Origen', field: 'origin', align: 'center', sortable: false },
  {
    name: 'sessionStatus',
    label: 'Estado',
    field: 'sessionStatus',
    align: 'center',
    sortable: false,
  },
  {
    name: 'lastMessage',
    label: 'Último mensaje',
    field: (r: TrialSessionsRowClient) => formatLastMessage(r),
    align: 'left',
    sortable: false,
  },
  {
    name: 'nextAction',
    label: 'Próxima acción',
    field: (r: TrialSessionsRowClient) => formatNextActionForRow(r),
    align: 'left',
    sortable: false,
  },
  { name: 'reagenda', label: 'Reagenda', field: 'bookingId', align: 'left', sortable: false },
  {
    name: 'purchasedPlan',
    label: 'Plan comprado',
    field: 'purchasedPlanName',
    align: 'left',
    sortable: false,
  },
  {
    name: 'gestiona',
    label: 'Gestiona',
    field: (r: TrialSessionsRowClient) => r.createdBy?.name ?? null,
    align: 'left',
    sortable: false,
  },
  { name: 'leadNotes', label: 'Comentarios', field: 'leadNotes', align: 'left', sortable: false },
  { name: 'acciones', label: 'Acciones', field: 'bookingId', align: 'center', sortable: false },
];

// ─── Build server-side filter payload ───────────────────────────────────

function buildServerFilters() {
  return {
    branchId: props.branchId,
    country: props.country,
    shift: filters.shift ?? undefined,
    gestionaUserId:
      isOwner.value && filters.gestionaUserId !== null ? filters.gestionaUserId : undefined,
    daysWithoutConvertingMin:
      filters.daysWithoutConvertingMin !== null && filters.daysWithoutConvertingMin >= 0
        ? filters.daysWithoutConvertingMin
        : undefined,
    search: filters.search.trim() ? filters.search.trim() : undefined,
    origin: filters.origin ?? undefined,
    pendingFollowup: filters.pendingFollowup ? true : undefined,
    sessionStatus: filters.sessionStatus.length > 0 ? filters.sessionStatus : undefined,
    pendingThisShift: filters.pendingThisShift ? true : undefined,
    page: pagination.value.page,
    limit: pagination.value.rowsPerPage,
  };
}

// Botón del aviso → alterna el filtro "solo pendientes de seguimiento" (SP de
// app sin contactar). Espeja EXACTAMENTE el contador del banner, que combina
// origen app + pendiente (getAppTrialsPendingCount): por eso también setea el
// filtro "Origen SP" en 'app'.
function togglePendingFollowup(): void {
  const enabling = !filters.pendingFollowup;
  filters.pendingFollowup = enabling;
  filters.origin = enabling ? 'app' : null;
}

// ─── Load lifecycle ─────────────────────────────────────────────────────

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await reportsApi.fetchTrialSessions(buildServerFilters());
    rows.value = result.rows;
    total.value = result.total;
    kpis.value = result.kpis;
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

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedReload(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
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

// ─── Inline edit: leadNotes ──────────────────────────────────────────────

function startEditNotes(row: TrialSessionsRowClient): void {
  editingNotesUserId.value = row.userId;
  editingNotesDraft.value = row.leadNotes ?? '';
}

function cancelEditNotes(): void {
  editingNotesUserId.value = null;
  editingNotesDraft.value = '';
}

async function onSaveNotes(row: TrialSessionsRowClient): Promise<void> {
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
    const message = extractError(err, 'Error al guardar el comentario');
    log.error('Failed to update lead notes', { error: message, userId: row.userId });
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
  () => [props.branchId, props.country],
  () => {
    pagination.value.page = 1;
    void loadBranches();
    void load();
  }
);

onMounted(async () => {
  // Refresca la pelotita para el banner al aterrizar directo en la tab
  // (deep-link ?tab=sesiones-de-prueba) sin depender del layout.
  void adminStore.fetchAppTrialsPendingCount();
  await loadGestionaOptionsIfOwner();
  void loadPlanOptions();
  void loadBranches();
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
.text-underline {
  text-decoration: underline;
}
/* Centrar la campanita verticalmente: Quasar le pone self-start al avatar. */
.app-trials-banner :deep(.q-banner__avatar.self-start) {
  align-self: center !important;
}

/* Tabla con alto propio + header pegado (mismo patrón que RenovacionesTab):
   el scroll horizontal y vertical viven DENTRO de la tabla. */
:deep(.trial-sessions-table) {
  max-height: calc(100vh - 260px);
}
:deep(.trial-sessions-table thead tr th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
}

/* Resalte momentáneo al saltar a la fila vinculada por una reagenda. */
:deep(tr.trial-row--highlight) {
  animation: trial-row-flash 1.5s ease-out;
}
@keyframes trial-row-flash {
  from {
    background-color: rgba(150, 89, 58, 0.18);
  }
  to {
    background-color: transparent;
  }
}
</style>
