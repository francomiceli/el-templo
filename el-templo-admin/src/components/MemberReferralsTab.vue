<!-- Tab "Referidos" de la ficha del alumno (fase 158, VIS-03) — UI-SPEC S3. -->
<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else-if="overview">
      <!-- Lo trajo (referredBy) — con asignación retroactiva si está vacío -->
      <div class="q-mb-md">
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Lo trajo</div>

        <q-list v-if="overview.referredBy">
          <q-item class="q-px-none">
            <q-item-section>
              <q-item-label>
                <a
                  class="referral-link text-primary cursor-pointer"
                  @click="goToMember(overview.referredBy.userId)"
                >
                  {{ overview.referredBy.fullName }}
                </a>
              </q-item-label>
              <q-item-label v-if="overview.referredBy.state === 'suspended'" caption>
                se reactiva si vuelve
              </q-item-label>
            </q-item-section>
            <q-item-section side top>
              <q-chip
                dense
                :color="chipColor(overview.referredBy.state)"
                text-color="white"
                :label="chipLabel(overview.referredBy.state)"
              />
            </q-item-section>
          </q-item>
        </q-list>

        <!-- Fase 173: el alta pregunta "¿quién lo trajo?" antes de que se sepa,
             así que casi siempre queda vacío. Acá se carga cuando el dato
             aparece — sin esto hay que tocar la base a mano. -->
        <div v-else>
          <div class="text-caption text-grey-7 q-mb-sm">
            Sin referidor asignado. Si te enterás de quién lo trajo, cargalo acá.
          </div>
          <div class="row items-start q-col-gutter-sm">
            <div class="col">
              <ReferrerSelect
                ref="referrerSelect"
                v-model="newReferrerId"
                label="¿Quién lo trajo?"
                :disable="assigning"
              />
            </div>
            <div class="col-auto">
              <q-btn
                color="primary"
                label="Asignar"
                unelevated
                :disable="newReferrerId === null"
                :loading="assigning"
                @click="onAssign"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Trajo a (referred[]) — solo si tiene al menos uno -->
      <div v-if="overview.referred.length > 0">
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Trajo a</div>
        <q-list>
          <q-item v-for="link in overview.referred" :key="link.userId" class="q-px-none">
            <q-item-section>
              <q-item-label>
                <a
                  class="referral-link text-primary cursor-pointer"
                  @click="goToMember(link.userId)"
                >
                  {{ link.fullName }}
                </a>
              </q-item-label>
              <q-item-label v-if="link.state === 'suspended'" caption>
                se reactiva si vuelve
              </q-item-label>
            </q-item-section>
            <q-item-section side top>
              <q-chip
                dense
                :color="chipColor(link.state)"
                text-color="white"
                :label="chipLabel(link.state)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi, type MemberReferralsResponse } from 'src/composables/useMembersApi';
import ReferrerSelect from './ReferrerSelect.vue';

const log = createLogger('MemberReferralsTab');
const $q = useQuasar();
const router = useRouter();
const membersApi = useMembersApi();

const props = defineProps<{ userId: number }>();

const overview = ref<MemberReferralsResponse | null>(null);
const loading = ref(false);

// Atribución retroactiva (fase 173).
const newReferrerId = ref<number | null>(null);
const referrerSelect = ref<{ reset: () => void } | null>(null);
const assigning = ref(false);

// Chips: misma semántica derivada que la app (S1). El estado viene del server
// (deriveCoveredUntil, D-28); el cliente nunca lo recalcula desde users.status.
type ReferralState = 'pending' | 'active' | 'suspended';

function chipColor(state: ReferralState): string {
  switch (state) {
    case 'active':
      return 'positive';
    case 'suspended':
      return 'warning';
    case 'pending':
    default:
      return 'info';
  }
}

function chipLabel(state: ReferralState): string {
  switch (state) {
    case 'active':
      return 'Activo';
    case 'suspended':
      return 'Suspendido';
    case 'pending':
    default:
      return 'Pendiente';
  }
}

function goToMember(userId: number): void {
  void router.push(`/alumnos/${userId}`);
}

async function load() {
  loading.value = true;
  try {
    overview.value = await membersApi.getReferrals(props.userId);
  } catch (err: unknown) {
    log.error('Failed to load referrals', {
      userId: props.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: membersApi.error.value ?? 'No se pudieron cargar los referidos.',
    });
  } finally {
    loading.value = false;
  }
}

/**
 * Carga el vínculo "lo trajo" después del alta.
 *
 * El mensaje distingue los dos estados porque significan cosas distintas para
 * quien atiende el mostrador: `pending` es "el descuento llega cuando pague",
 * `qualified` es "ya pagó, corre desde el próximo cobro". Sin esa distinción el
 * staff no sabe qué contestar cuando el socio pregunta.
 */
async function onAssign(): Promise<void> {
  if (newReferrerId.value === null) return;
  assigning.value = true;
  try {
    const result = await membersApi.assignReferrer(props.userId, newReferrerId.value);
    newReferrerId.value = null;
    referrerSelect.value?.reset();
    $q.notify({
      type: 'positive',
      message:
        result.status === 'qualified'
          ? 'Referidor asignado. El descuento corre desde el próximo cobro de cada uno.'
          : 'Referidor asignado. Cuando pague su primer plan, ambos reciben el descuento.',
    });
    // Recarga en vez de mutar local: el estado de los chips lo deriva el server
    // (deriveCoveredUntil), el cliente no lo puede inventar.
    await load();
  } catch (err: unknown) {
    log.error('Failed to assign referrer', {
      userId: props.userId,
      referrerId: newReferrerId.value,
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: membersApi.error.value ?? 'No se pudo asignar el referidor.',
    });
  } finally {
    assigning.value = false;
  }
}

onMounted(() => {
  void load();
});

// Los cross-links "Lo trajo"/"Trajo a" navegan a otra ficha reutilizando la
// misma instancia de página (solo cambia el route param), así que este tab
// recibe un userId nuevo sin remontarse.
watch(
  () => props.userId,
  () => {
    overview.value = null;
    // Un referidor a medio elegir no puede sobrevivir al cambio de ficha: se
    // asignaría al alumno equivocado.
    newReferrerId.value = null;
    referrerSelect.value?.reset();
    void load();
  }
);
</script>

<style scoped>
.referral-link {
  text-decoration: none;
}
.referral-link:hover {
  text-decoration: underline;
}
</style>
