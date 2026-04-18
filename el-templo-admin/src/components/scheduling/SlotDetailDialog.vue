<template>
  <q-dialog :model-value="show" persistent @update:model-value="$emit('update:show', $event)">
    <q-card style="width: 500px; max-width: 95vw">
      <q-card-section>
        <div class="slot-header">
          <template v-if="!editingActivity">
            <div class="slot-header__title">
              <span class="text-h6">{{ slotDetail?.schedule.activityName }}</span>
              <q-btn
                v-if="slotDetail && !isSlotPast"
                flat
                dense
                round
                icon="edit"
                size="sm"
                color="primary"
                @click="startEditActivity"
              >
                <q-tooltip>Cambiar actividad</q-tooltip>
              </q-btn>
            </div>
            <div class="text-subtitle2 text-grey-7">
              {{ slotDetailDayLabel }} {{ slotDetailDate }} · {{ slotDetail?.schedule.startTime }}
            </div>
          </template>
          <template v-else>
            <div class="row items-center no-wrap q-gutter-xs">
              <q-select
                v-model="selectedActivityId"
                :options="activityOptions"
                option-value="id"
                option-label="name"
                emit-value
                map-options
                dense
                outlined
                class="col"
              />
              <q-btn
                flat
                dense
                round
                icon="check"
                color="positive"
                size="sm"
                :loading="savingActivity"
                :disable="
                  !selectedActivityId || selectedActivityId === slotDetail?.schedule.activityId
                "
                @click="saveActivityChange"
              >
                <q-tooltip>Guardar</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                icon="close"
                color="grey-7"
                size="sm"
                @click="editingActivity = false"
              >
                <q-tooltip>Cancelar</q-tooltip>
              </q-btn>
            </div>
          </template>
        </div>
        <div class="text-caption text-grey-7 q-mt-xs">
          {{ slotDetailBookingCount }}/{{ slotDetail?.maxCapacity ?? 0 }} reservas
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-px-none q-py-sm" style="max-height: 400px; overflow-y: auto">
        <q-list separator>
          <q-item v-if="loadingSlotDetail" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="30px" color="primary" />
          </q-item>

          <q-item v-else-if="!slotDetail || activeBookings.length === 0">
            <q-item-section class="text-grey-5 text-italic text-center">
              Sin reservas para este horario
            </q-item-section>
          </q-item>

          <q-item v-for="booking in activeBookings" :key="booking.id">
            <q-item-section>
              <q-item-label>{{ booking.memberName }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center q-gutter-xs">
                <q-badge
                  :color="getBookingStatusColor(booking.status)"
                  :label="getBookingStatusLabel(booking.status)"
                />
                <q-btn
                  v-if="!isSlotPast"
                  flat
                  dense
                  round
                  icon="delete"
                  color="negative"
                  size="sm"
                  @click="onRemoveBooking(booking.id)"
                >
                  <q-tooltip>Eliminar reserva</q-tooltip>
                </q-btn>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Agregar alumno</div>
        <q-select
          v-model="slotAddMember"
          :options="memberSearchResults"
          option-value="id"
          option-label="displayLabel"
          label="Buscar alumno (nombre o DNI)"
          dense
          outlined
          use-input
          clearable
          input-debounce="300"
          :loading="searchingMembers"
          @filter="onMemberSearch"
        >
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey-5 text-italic">
                {{ memberSearchQuery ? 'Sin resultados' : 'Escribe para buscar' }}
              </q-item-section>
            </q-item>
          </template>
          <template #after>
            <q-btn
              round
              dense
              flat
              icon="add"
              color="primary"
              :disable="!slotAddMember"
              @click="onAddBooking"
            />
          </template>
        </q-select>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cerrar" color="grey-7" @click="$emit('update:show', false)" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type {
  SlotDetailView,
  BookingStatus,
  DayOfWeek,
  ActivityRecord,
} from 'src/types/scheduling';
import { DAY_LABELS, BOOKING_STATUS_LABELS, BOOKING_STATUS_COLORS } from 'src/types/scheduling';

const log = createLogger('SlotDetailDialog');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();
const membersApi = useMembersApi();

// ─── Props & Emits ──────────────────────────────────────────────────────────

const props = defineProps<{
  show: boolean;
  scheduleId: number | null;
  date: string;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  'bookings-changed': [];
}>();

// ─── State ──────────────────────────────────────────────────────────────────

const slotDetail = ref<SlotDetailView | null>(null);
const loadingSlotDetail = ref(false);

// Member search
const slotAddMember = ref<{ id: number; displayLabel: string } | null>(null);
const memberSearchResults = ref<Array<{ id: number; displayLabel: string }>>([]);
const searchingMembers = ref(false);
const memberSearchQuery = ref('');

// Activity edit
const editingActivity = ref(false);
const selectedActivityId = ref<number | null>(null);
const availableActivities = ref<ActivityRecord[]>([]);
const savingActivity = ref(false);

const activityOptions = computed(() =>
  availableActivities.value.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name }))
);

async function startEditActivity() {
  if (availableActivities.value.length === 0) {
    try {
      availableActivities.value = await schedulingApi.listActivities();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error loading activities', { error: message });
      $q.notify({ type: 'negative', message: 'Error cargando actividades' });
      return;
    }
  }
  selectedActivityId.value = slotDetail.value?.schedule.activityId ?? null;
  editingActivity.value = true;
}

async function saveActivityChange() {
  if (!slotDetail.value || !selectedActivityId.value) return;
  const scheduleId = slotDetail.value.schedule.id;
  const activityId = selectedActivityId.value;
  savingActivity.value = true;
  try {
    await schedulingApi.updateScheduleActivity(scheduleId, activityId);
    $q.notify({
      type: 'positive',
      message: 'Actividad actualizada — las reservas existentes se mantienen',
    });
    editingActivity.value = false;
    await loadSlotDetail(scheduleId, slotDetail.value.date);
    emit('bookings-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error updating schedule activity', { error: message });
    $q.notify({ type: 'negative', message: 'Error actualizando actividad' });
  } finally {
    savingActivity.value = false;
  }
}

// ─── Computed ───────────────────────────────────────────────────────────────

const activeBookings = computed(() => {
  if (!slotDetail.value) return [];
  return slotDetail.value.bookings.filter(
    (b) =>
      b.status === 'reservado' ||
      b.status === 'qr_escaneado' ||
      b.status === 'confirmado' ||
      b.status === 'lista_espera'
  );
});

const slotDetailBookingCount = computed(() => activeBookings.value.length);

const isSlotPast = computed(() => {
  if (!slotDetail.value) return false;
  const dt = new Date(`${slotDetail.value.date}T${slotDetail.value.schedule.startTime}:00`);
  return dt < new Date();
});

const slotDetailDayLabel = computed(() => {
  if (!slotDetail.value) return '';
  const dow = slotDetail.value.schedule.dayOfWeek as DayOfWeek;
  return DAY_LABELS[dow] ?? '';
});

const slotDetailDate = computed(() => {
  if (!slotDetail.value) return '';
  const d = new Date(slotDetail.value.date + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBookingStatusLabel(status: BookingStatus): string {
  return BOOKING_STATUS_LABELS[status];
}

function getBookingStatusColor(status: BookingStatus): string {
  return BOOKING_STATUS_COLORS[status];
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadSlotDetail(scheduleId: number, date: string) {
  loadingSlotDetail.value = true;
  slotDetail.value = null;
  try {
    slotDetail.value = await schedulingApi.getSlotDetail(scheduleId, date);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading slot detail', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando detalle del horario' });
  } finally {
    loadingSlotDetail.value = false;
  }
}

// ─── Member Search ──────────────────────────────────────────────────────────

function onMemberSearch(val: string, update: (fn: () => void) => void, _abort: () => void) {
  memberSearchQuery.value = val;
  if (!val || val.length < 2) {
    update(() => {
      memberSearchResults.value = [];
    });
    return;
  }

  searchingMembers.value = true;
  membersApi
    .getMembers({ search: val, limit: 10 })
    .then((result) => {
      update(() => {
        memberSearchResults.value = result.members.map((m) => ({
          id: m.id,
          displayLabel: `${m.firstName} ${m.lastName}${m.dni ? ` (${m.dni})` : ''}`,
        }));
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error searching members', { error: message });
      update(() => {
        memberSearchResults.value = [];
      });
    })
    .finally(() => {
      searchingMembers.value = false;
    });
}

// ─── Booking Management ────────────────────────────────────────────────────

async function onAddBooking() {
  if (!slotAddMember.value || !props.scheduleId) return;
  try {
    const result = await schedulingApi.adminAddBooking({
      scheduleId: props.scheduleId,
      memberId: slotAddMember.value.id,
      date: props.date,
    });
    $q.notify({ type: 'positive', message: 'Reserva agregada' });
    if (result.warnings?.length) {
      for (const warning of result.warnings) {
        $q.notify({ type: 'warning', message: warning, timeout: 5000 });
      }
    }
    slotAddMember.value = null;
    memberSearchResults.value = [];
    await loadSlotDetail(props.scheduleId, props.date);
    emit('bookings-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error adding booking', { error: message });
    $q.notify({ type: 'negative', message: 'Error agregando reserva' });
  }
}

async function onRemoveBooking(bookingId: number) {
  $q.dialog({
    title: 'Eliminar reserva',
    message: 'Esta seguro que desea eliminar esta reserva?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await schedulingApi.adminRemoveBooking(bookingId);
      $q.notify({ type: 'positive', message: 'Reserva eliminada' });
      if (props.scheduleId) {
        await loadSlotDetail(props.scheduleId, props.date);
      }
      emit('bookings-changed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error removing booking', { error: message });
      $q.notify({ type: 'negative', message: 'Error eliminando reserva' });
    }
  });
}

// ─── Watchers ───────────────────────────────────────────────────────────────

watch(
  () => props.show,
  (val) => {
    if (val && props.scheduleId) {
      slotAddMember.value = null;
      memberSearchResults.value = [];
      editingActivity.value = false;
      loadSlotDetail(props.scheduleId, props.date);
    }
  }
);
</script>

<style scoped>
.slot-header__title {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
</style>
