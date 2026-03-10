<template>
  <q-page class="q-pa-md">
    <!-- Back button -->
    <q-btn flat icon="arrow_back" label="Volver a Alumnos" class="q-mb-md" @click="goBack" />

    <!-- Loading -->
    <div v-if="pageLoading" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <!-- Error -->
    <div v-else-if="pageError" class="text-center q-pa-xl text-negative">
      <q-icon name="error" size="xl" class="q-mb-md" />
      <div class="text-h6">{{ pageError }}</div>
    </div>

    <!-- Detail content -->
    <template v-else-if="memberProfile">
      <!-- ========================================== -->
      <!-- Header Card -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row items-center q-gutter-md">
            <!-- Level letter -->
            <div>
              <span
                class="text-h4 text-weight-bold"
                :class="`text-${levelColor(memberProfile.level)}`"
              >
                {{ greekLevel(memberProfile.level) }}
              </span>
            </div>

            <!-- Name and details -->
            <div class="col">
              <div class="text-h5">{{ memberName }}</div>
              <div class="text-caption text-grey-7">
                {{ levelDisplayName(memberProfile.level) }} ·
                {{ memberProfile.branchName }}
              </div>
            </div>

            <!-- Status badge + action buttons -->
            <div class="q-gutter-sm row items-center">
              <q-badge
                :color="memberProfile.isActive ? 'positive' : 'grey'"
                :label="memberProfile.isActive ? 'Activo' : 'Inactivo'"
                class="text-body2"
              />
              <q-btn
                flat
                icon="edit"
                label="Editar"
                color="primary"
                @click="showEditDialog = true"
              />
              <q-btn
                v-if="memberProfile.isActive"
                flat
                icon="block"
                label="Desactivar"
                color="negative"
                @click="confirmToggleStatus"
              />
              <q-btn
                v-else
                flat
                icon="check_circle"
                label="Reactivar"
                color="positive"
                @click="confirmToggleStatus"
              />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- Tabs -->
      <!-- ========================================== -->
      <q-tabs
        v-model="activeTab"
        dense
        align="left"
        class="text-grey-8"
        active-color="primary"
        indicator-color="primary"
      >
        <q-tab name="perfil" label="Perfil" />
        <q-tab name="entrenamiento" label="Entrenamiento" />
        <q-tab name="notas" label="Notas" />
        <q-tab name="suscripcion" label="Suscripcion" />
        <q-tab name="pagos" label="Pagos" />
        <q-tab name="asistencia" label="Asistencia" />
      </q-tabs>
      <q-separator />

      <q-tab-panels v-model="activeTab" animated class="q-mt-md">
        <!-- Perfil Tab -->
        <q-tab-panel name="perfil">
          <MemberProfileTab :member="memberProfile" />
        </q-tab-panel>

        <!-- Entrenamiento Tab -->
        <q-tab-panel name="entrenamiento">
          <!-- Loading state for journey data -->
          <div v-if="journeyLoading" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="40px" color="primary" />
          </div>

          <template v-else-if="journeyDetail">
            <!-- Active Journey -->
            <q-card v-if="journeyDetail.active" flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-sm">Journey Activo</div>
                <div class="row items-center q-gutter-sm q-mb-sm">
                  <q-badge
                    :color="journeyBadgeColor(journeyDetail.active.journeyType)"
                    :label="journeyLabel(journeyDetail.active.journeyType)"
                    class="text-body2"
                  />
                  <q-badge
                    outline
                    :color="journeyBadgeColor(journeyDetail.active.journeyType)"
                    :label="tierLabel(journeyDetail.active.journeyType)"
                  />
                </div>
                <div class="text-caption text-grey-7 q-mb-md">
                  Iniciado: {{ formatDate(journeyDetail.active.startedAt) }}
                </div>

                <!-- Per-duration semana counters -->
                <div class="row q-gutter-md">
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6 text-primary">{{ journeyDetail.active.semana20 }}</div>
                      <div class="text-caption text-grey-7">Semana 20 min</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6 text-primary">{{ journeyDetail.active.semana40 }}</div>
                      <div class="text-caption text-grey-7">Semana 40 min</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6 text-primary">{{ journeyDetail.active.semana60 }}</div>
                      <div class="text-caption text-grey-7">Semana 60 min</div>
                    </div>
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <!-- No active journey -->
            <q-card v-else flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-xs">Journey Activo</div>
                <div class="text-grey-5 text-italic">Sin journey activo</div>
              </q-card-section>
            </q-card>

            <!-- Entrenamiento Progress -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-sm">Progreso Entrenamiento</div>
                <div class="row q-gutter-md">
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6">
                        {{ journeyDetail.entrenamientoStats.totalSessions }}
                      </div>
                      <div class="text-caption text-grey-7">Sesiones completadas</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6">{{ journeyDetail.entrenamientoStats.totalDays }}</div>
                      <div class="text-caption text-grey-7">Dias entrenados</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6">
                        {{ journeyDetail.entrenamientoStats.currentStreak }}
                        <q-icon
                          v-if="journeyDetail.entrenamientoStats.currentStreak > 0"
                          name="local_fire_department"
                          color="orange"
                          size="xs"
                        />
                      </div>
                      <div class="text-caption text-grey-7">Racha actual</div>
                    </div>
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <!-- Journey Progress -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-sm">Progreso Journey</div>
                <div class="row q-gutter-md">
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6">{{ journeyDetail.journeyStats.totalSessions }}</div>
                      <div class="text-caption text-grey-7">Sesiones journey</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6">{{ journeyDetail.journeyStats.byDuration.d20 }}</div>
                      <div class="text-caption text-grey-7">20 min</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6">{{ journeyDetail.journeyStats.byDuration.d40 }}</div>
                      <div class="text-caption text-grey-7">40 min</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="text-center">
                      <div class="text-h6">{{ journeyDetail.journeyStats.byDuration.d60 }}</div>
                      <div class="text-caption text-grey-7">60 min</div>
                    </div>
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <!-- Session History (last 20) -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-sm">Historial de Sesiones</div>

                <div v-if="recentCompletions.length === 0" class="text-grey-5 text-italic">
                  Sin sesiones completadas
                </div>

                <q-list v-else separator>
                  <q-item v-for="(completion, idx) in recentCompletions" :key="idx">
                    <q-item-section avatar>
                      <q-icon
                        :name="completion.journeyType ? 'explore' : 'fitness_center'"
                        :color="completion.journeyType ? 'deep-orange-9' : 'primary'"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>
                        {{
                          completion.journeyType
                            ? journeyLabel(completion.journeyType)
                            : 'Entrenamiento'
                        }}
                        <q-badge
                          v-if="completion.duration"
                          outline
                          color="grey-7"
                          :label="`${completion.duration} min`"
                          class="q-ml-sm"
                        />
                      </q-item-label>
                      <q-item-label caption>
                        {{ formatDate(completion.completedAt) }}
                        <span v-if="completion.rpe !== null"> · RPE {{ completion.rpe }}</span>
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-badge
                        v-if="completion.blocksCompleted"
                        outline
                        color="grey-7"
                        :label="`${completion.blocksCompleted.length} bloques`"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>

            <!-- Archived Journeys -->
            <q-card v-if="journeyDetail.archived.length > 0" flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-sm">Journeys Anteriores</div>

                <q-list separator>
                  <q-item v-for="(arch, idx) in journeyDetail.archived" :key="idx">
                    <q-item-section avatar>
                      <q-icon name="history" color="grey-6" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>
                        <q-badge
                          :color="journeyBadgeColor(arch.journeyType)"
                          :label="journeyLabel(arch.journeyType)"
                        />
                      </q-item-label>
                      <q-item-label caption>
                        {{ formatDate(arch.startedAt) }} — {{ formatDate(arch.archivedAt) }}
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <div class="text-caption text-grey-7">
                        S{{ arch.semana20 }}/{{ arch.semana40 }}/{{ arch.semana60 }}
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>
          </template>

          <!-- Journey data error -->
          <div v-else class="text-center q-pa-lg text-grey-5 text-italic">
            Sin datos de entrenamiento disponibles
          </div>
        </q-tab-panel>

        <!-- Notas Tab -->
        <q-tab-panel name="notas">
          <MemberNotesTab
            v-if="currentUser"
            :userId="userId"
            :currentUserId="currentUser.id"
            :currentUserRole="currentUser.role"
          />
        </q-tab-panel>

        <!-- Suscripcion Tab -->
        <q-tab-panel name="suscripcion">
          <MemberSubscriptionTab
            :userId="userId"
            :memberBranchId="memberProfile.branchId"
            :memberBoardingPassUsed="memberBoardingPassUsed"
            @subscription-changed="onSubscriptionChanged"
          />
        </q-tab-panel>

        <!-- Pagos Tab -->
        <q-tab-panel name="pagos">
          <MemberPaymentTab
            :userId="userId"
            :memberName="memberName"
            @payment-changed="onPaymentChanged"
          />
        </q-tab-panel>

        <!-- Asistencia Tab -->
        <q-tab-panel name="asistencia">
          <MemberAttendanceTab :userId="userId" />
        </q-tab-panel>
      </q-tab-panels>

      <!-- ========================================== -->
      <!-- Edit Dialog -->
      <!-- ========================================== -->
      <MemberFormDialog
        v-model="showEditDialog"
        :member="memberProfile"
        :branches="branches"
        @saved="onMemberSaved"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useJourneyAdminApi } from 'src/composables/useJourneyAdminApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import MemberProfileTab from 'src/components/MemberProfileTab.vue';
import MemberNotesTab from 'src/components/MemberNotesTab.vue';
import MemberSubscriptionTab from 'src/components/MemberSubscriptionTab.vue';
import MemberPaymentTab from 'src/components/MemberPaymentTab.vue';
import MemberAttendanceTab from 'src/components/MemberAttendanceTab.vue';
import MemberFormDialog from 'src/components/MemberFormDialog.vue';
import type { MemberProfile, BranchOption } from 'src/types/member';
import {
  JOURNEY_TYPE_LABELS,
  JOURNEY_TIER_MAP,
  JOURNEY_TIER_COLORS,
  JOURNEY_TIER_LABELS,
  type JourneyType,
  type JourneyTier,
  type MemberJourneyDetail,
} from 'src/types/journey';

const log = createLogger('AlumnoDetailPage');
const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const authStore = useAuthStore();

// =========================================================================
// State
// =========================================================================

const pageLoading = ref(true);
const pageError = ref<string | null>(null);
const memberProfile = ref<MemberProfile | null>(null);
const journeyDetail = ref<MemberJourneyDetail | null>(null);
const journeyLoading = ref(false);
const branches = ref<BranchOption[]>([]);
const activeTab = ref('perfil');
const showEditDialog = ref(false);

const userId = computed(() => Number(route.params.userId));

const currentUser = computed(() => authStore.user);

// boardingPassUsed is not in the member profile API response; the pricing preview API handles eligibility
const memberBoardingPassUsed = computed(() => false);

const memberName = computed(() => {
  if (!memberProfile.value) return '';
  const parts = [memberProfile.value.firstName, memberProfile.value.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `Usuario #${userId.value}`;
});

const recentCompletions = computed(() => {
  if (!journeyDetail.value) return [];
  return journeyDetail.value.completions.slice(0, 20);
});

// =========================================================================
// Greek level display
// =========================================================================

const LEVEL_GREEK_MAP: Record<string, string> = {
  alfa: '\u03B1',
  delta: '\u0394',
  sigma: '\u03A3',
  omega: '\u03A9',
  spartan: '\u03A9',
};

const LEVEL_NAMES: Record<string, string> = {
  alfa: 'Alfa',
  delta: 'Delta',
  sigma: 'Sigma',
  omega: 'Omega',
  spartan: 'Spartan',
};

function greekLevel(level: string): string {
  return LEVEL_GREEK_MAP[level.toLowerCase()] ?? level;
}

function levelDisplayName(level: string): string {
  return LEVEL_NAMES[level.toLowerCase()] ?? level;
}

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'alfa':
      return 'amber-8';
    case 'delta':
      return 'deep-orange-7';
    case 'sigma':
      return 'brown-8';
    case 'omega':
      return 'red-9';
    case 'spartan':
      return 'grey-9';
    default:
      return 'grey';
  }
}

// =========================================================================
// Journey display helpers
// =========================================================================

function journeyLabel(journeyType: string): string {
  return JOURNEY_TYPE_LABELS[journeyType as JourneyType] ?? journeyType;
}

function journeyBadgeColor(journeyType: string): string {
  const tier: JourneyTier | undefined = JOURNEY_TIER_MAP[journeyType as JourneyType];
  return tier ? JOURNEY_TIER_COLORS[tier] : 'grey';
}

function tierLabel(journeyType: string): string {
  const tier: JourneyTier | undefined = JOURNEY_TIER_MAP[journeyType as JourneyType];
  return tier ? JOURNEY_TIER_LABELS[tier] : '';
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadMemberProfile() {
  try {
    const membersApi = useMembersApi();
    memberProfile.value = await membersApi.getMember(userId.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading member profile', { error: message, userId: userId.value });
    throw err;
  }
}

async function loadJourneyDetail() {
  journeyLoading.value = true;
  try {
    const journeyApi = useJourneyAdminApi();
    journeyDetail.value = await journeyApi.getMemberDetail(userId.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading journey detail', { error: message, userId: userId.value });
    // Non-fatal: journey data is supplementary, profile still works
    journeyDetail.value = null;
  } finally {
    journeyLoading.value = false;
  }
}

async function loadBranches() {
  try {
    const membersApi = useMembersApi();
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branches', { error: message });
  }
}

async function loadAll() {
  pageLoading.value = true;
  pageError.value = null;

  try {
    // Load profile + branches in parallel (required for page render)
    await Promise.all([loadMemberProfile(), loadBranches()]);

    // Load journey detail in background (non-blocking)
    loadJourneyDetail();
  } catch {
    pageError.value = 'Error cargando detalle del alumno';
  } finally {
    pageLoading.value = false;
  }
}

// =========================================================================
// Actions
// =========================================================================

function confirmToggleStatus() {
  if (!memberProfile.value) return;

  const name = memberName.value;
  const isCurrentlyActive = memberProfile.value.isActive;

  $q.dialog({
    title: isCurrentlyActive ? 'Desactivar alumno' : 'Reactivar alumno',
    message: isCurrentlyActive
      ? `Desactivar a ${name}? No podra ingresar a la app.`
      : `Reactivar a ${name}?`,
    cancel: { flat: true, label: 'Cancelar' },
    ok: {
      color: isCurrentlyActive ? 'negative' : 'positive',
      label: isCurrentlyActive ? 'Desactivar' : 'Reactivar',
    },
  }).onOk(async () => {
    if (!memberProfile.value) return;
    try {
      const membersApi = useMembersApi();
      memberProfile.value = await membersApi.toggleMemberStatus(
        userId.value,
        !memberProfile.value.isActive
      );
      $q.notify({
        type: 'positive',
        message: memberProfile.value.isActive ? 'Alumno reactivado' : 'Alumno desactivado',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error toggling member status', { error: message });
      $q.notify({ type: 'negative', message: 'Error actualizando estado' });
    }
  });
}

async function onMemberSaved() {
  $q.notify({ type: 'positive', message: 'Alumno actualizado' });
  await loadMemberProfile();
}

async function onSubscriptionChanged() {
  // Refresh member profile in case boarding pass usage changed
  await loadMemberProfile();
}

async function onPaymentChanged() {
  // Refresh member profile in case overdue status changed
  await loadMemberProfile();
}

// =========================================================================
// Navigation
// =========================================================================

function goBack() {
  router.push('/alumnos');
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadAll();
});
</script>
