<!--
  Fase 204 (D-20 / D-17 / D-26): card "Wellhub" de la ficha del alumno.
  Datos de la vinculación y de las visitas, más tres acciones:
  - "Asociar al templo": emite `associate`; la página abre el AssignPlanDialog
    existente (sin flujo paralelo).
  - "Enviar acceso a la app": acción explícita (nunca automática, D-06). Si la
    persona ya entró alguna vez a la app, el confirm avisa que se resetea la clave.
  - "Unir con alumno existente": emite `merge`; el diálogo lo agrega el plan 15.
  No renderiza nada si la persona no está vinculada a Wellhub.
-->
<template>
  <q-card v-if="card" flat bordered class="wellhub-card">
    <q-card-section class="row items-center q-pb-none">
      <div class="text-subtitle1 text-weight-bold q-mr-sm">Wellhub</div>
      <q-badge :color="WELLHUB_COLOR" text-color="white" :label="WELLHUB_LABEL" />
    </q-card-section>

    <q-card-section>
      <div class="row q-col-gutter-md">
        <div class="col-12 col-sm-6 col-md-4">
          <div class="text-caption text-grey-7">ID de Wellhub</div>
          <div class="text-body2">{{ card.gympassId }}</div>
        </div>
        <div class="col-12 col-sm-6 col-md-4">
          <div class="text-caption text-grey-7">Vinculado desde</div>
          <div class="text-body2">
            {{ card.linkedSince ? formatDate(card.linkedSince) : 'Sin datos' }}
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-4">
          <div class="text-caption text-grey-7">Última visita</div>
          <div class="text-body2">
            {{ card.lastVisitDate ? formatDate(card.lastVisitDate) : 'Todavía no vino' }}
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-4">
          <div class="text-caption text-grey-7">Visitas este mes</div>
          <div class="text-body2">{{ card.visitsThisMonth }}</div>
        </div>
        <div class="col-12 col-sm-6 col-md-4">
          <div class="text-caption text-grey-7">Visitas totales</div>
          <div class="text-body2">
            {{ card.visitsTotal }}
            <span v-if="card.manualVisitsTotal > 0" class="text-grey-7">
              · {{ card.manualVisitsTotal }} a mano
            </span>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-4">
          <div class="text-caption text-grey-7">Sedes visitadas</div>
          <div class="text-body2">
            {{ card.branchesVisited.length > 0 ? card.branchesVisited.join(', ') : '—' }}
          </div>
        </div>
        <div class="col-12">
          <div class="text-caption text-grey-7">Próxima reserva Wellhub</div>
          <div class="text-body2">
            <template v-if="card.nextWellhubBooking">
              {{ formatDate(card.nextWellhubBooking.date) }} ·
              {{ formatTime(card.nextWellhubBooking.startTime) }} ·
              {{ card.nextWellhubBooking.activityName }} · {{ card.nextWellhubBooking.branchName }}
            </template>
            <template v-else>Sin reservas</template>
          </div>
        </div>
      </div>

      <div v-if="card.recentWellhubBookings.length > 0" class="q-mt-md">
        <div class="text-caption text-grey-7">Últimas reservas Wellhub</div>
        <q-list dense separator>
          <q-item
            v-for="booking in card.recentWellhubBookings"
            :key="booking.bookingId"
            class="q-px-none"
          >
            <q-item-section>
              <q-item-label>
                {{ formatDate(booking.date) }} · {{ formatTime(booking.startTime) }} ·
                {{ booking.activityName }}
              </q-item-label>
              <q-item-label caption>{{ booking.branchName }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-chip
                dense
                text-color="white"
                :color="bookingStatusColor(booking.status)"
                :label="bookingStatusLabel(booking.status)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </q-card-section>

    <q-card-actions v-if="showAssociate || showAppAccess || card.canMerge" class="q-px-md q-pb-md">
      <q-btn
        v-if="showAssociate"
        color="primary"
        no-caps
        icon="how_to_reg"
        label="Asociar al templo"
        @click="emit('associate')"
      />
      <q-btn
        v-if="showAppAccess"
        flat
        no-caps
        color="primary"
        icon="phone_iphone"
        label="Enviar acceso a la app"
        :loading="sendingAccess"
        @click="onSendAppAccess"
      />
      <q-btn
        v-if="card.canMerge"
        flat
        no-caps
        color="primary"
        icon="merge_type"
        label="Unir con alumno existente"
        @click="emit('merge')"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useWellhubApi } from 'src/composables/useWellhubApi';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatDate } from 'src/utils/format-date';
import { WELLHUB_COLOR, WELLHUB_LABEL } from 'src/utils/wellhub-label';
import type { WellhubCard } from 'src/types/wellhub';

const props = withDefaults(
  defineProps<{
    userId: number;
    /** Rol que puede cobrar (no ciego a las finanzas): habilita "Asociar al templo". */
    canCharge: boolean;
    /** Rol que puede mandar el acceso a la app (el API exige rol de ciclo de vida). */
    canSendAppAccess?: boolean;
  }>(),
  { canSendAppAccess: true }
);

const emit = defineEmits<{
  associate: [];
  appAccessSent: [];
  merge: [];
}>();

const log = createLogger('WellhubCard');
const $q = useQuasar();
const wellhubApi = useWellhubApi();

const card = ref<WellhubCard | null>(null);
const sendingAccess = ref(false);
// Descarta respuestas de cargas viejas (cambio de alumno o recargas solapadas).
let loadSeq = 0;

const BOOKING_STATUS_LABEL: Record<string, string> = {
  reservado: 'Reservada',
  confirmado: 'Presente',
  qr_escaneado: 'Presente',
  no_show: 'Ausente',
  cancelado: 'Cancelada',
  lista_espera: 'En espera',
};

const BOOKING_STATUS_COLOR: Record<string, string> = {
  reservado: 'secondary',
  confirmado: 'positive',
  qr_escaneado: 'positive',
  no_show: 'negative',
  cancelado: 'grey-7',
  lista_espera: 'warning',
};

function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_LABEL[status] ?? status;
}

function bookingStatusColor(status: string): string {
  return BOOKING_STATUS_COLOR[status] ?? 'grey-7';
}

/** HH:mm(:ss) -> HH:mm */
function formatTime(time: string): string {
  return time.slice(0, 5);
}

const showAssociate = computed(() => !!card.value && card.value.canConvert && props.canCharge);

// Se ofrece a quien todavía no es socio activo (puede convertirse) o a quien nunca
// entró a la app. Que ya haya entrado NO la oculta si puede convertirse: el staff
// decide y el confirm avisa del reseteo.
const showAppAccess = computed(
  () => !!card.value && props.canSendAppAccess && (card.value.canConvert || !card.value.hasLoggedIn)
);

const appAccessConfirmMessage = computed(() =>
  card.value?.hasLoggedIn
    ? 'Ya tiene cuenta en la app. Se le va a resetear la contraseña y le llega un mail para crear una nueva. ¿Seguimos?'
    : 'Le vamos a mandar un email con una contraseña temporal para entrar a la app.'
);

/**
 * Recarga la card y devuelve la card fresca (o `null` si no hay vínculo Wellhub o
 * la carga falló). Quien necesite `hasLoggedIn` debe leerlo de este resultado, no
 * de una card anterior.
 */
async function reload(): Promise<WellhubCard | null> {
  const seq = ++loadSeq;
  try {
    const fresh = await wellhubApi.getCard(props.userId);
    if (seq === loadSeq) card.value = fresh;
    return fresh;
  } catch (err: unknown) {
    if (seq === loadSeq) card.value = null;
    $q.notify({ type: 'negative', message: extractError(err, 'No se pudo cargar Wellhub') });
    return null;
  }
}

function onSendAppAccess(): void {
  if (!card.value) return;
  const hadLoggedIn = card.value.hasLoggedIn;
  $q.dialog({
    title: 'Enviar acceso a la app',
    message: appAccessConfirmMessage.value,
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: hadLoggedIn ? 'negative' : 'primary', label: hadLoggedIn ? 'Seguir' : 'Enviar' },
  }).onOk(() => {
    void sendAccess();
  });
}

async function sendAccess(): Promise<void> {
  sendingAccess.value = true;
  try {
    const result = await wellhubApi.sendAppAccess(props.userId);
    if (result.emailSent) {
      $q.notify({ type: 'positive', message: 'Acceso enviado' });
    } else {
      $q.notify({
        type: 'warning',
        message: 'Contraseña reseteada, pero no se pudo enviar el email',
      });
    }
    emit('appAccessSent');
    await reload();
  } catch (err: unknown) {
    log.warn('No se pudo enviar el acceso a la app', { userId: props.userId });
    $q.notify({
      type: 'negative',
      message: extractError(err, 'No se pudo enviar el acceso a la app'),
    });
  } finally {
    sendingAccess.value = false;
  }
}

watch(
  () => props.userId,
  (newId, oldId) => {
    if (newId !== oldId && Number.isInteger(newId)) void reload();
  }
);

onMounted(() => {
  void reload();
});

onUnmounted(() => {
  // Invalida cargas en vuelo y limpia el estado del composable.
  loadSeq++;
  wellhubApi.cleanup();
});

defineExpose({ reload });
</script>

<style scoped>
.wellhub-card {
  border-left: 4px solid var(--q-secondary);
}
</style>
