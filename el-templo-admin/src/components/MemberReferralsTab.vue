<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else-if="overview">
      <!-- Sin ningún vínculo: nota vacía -->
      <div v-if="!hasAnyLink" class="text-caption text-grey-7">Este alumno no tiene referidos.</div>

      <template v-else>
        <!-- Lo trajo (referredBy) — solo si existe -->
        <div v-if="overview.referredBy" class="q-mb-md">
          <div class="text-subtitle2 text-weight-bold q-mb-sm">Lo trajo</div>
          <q-list>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi, type MemberReferralsResponse } from 'src/composables/useMembersApi';

const log = createLogger('MemberReferralsTab');
const $q = useQuasar();
const router = useRouter();
const membersApi = useMembersApi();

const props = defineProps<{ userId: number }>();

const overview = ref<MemberReferralsResponse | null>(null);
const loading = ref(false);

const hasAnyLink = computed(
  () =>
    !!overview.value && (overview.value.referredBy !== null || overview.value.referred.length > 0)
);

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

onMounted(() => {
  void load();
});
</script>

<style scoped>
.referral-link {
  text-decoration: none;
}
.referral-link:hover {
  text-decoration: underline;
}
</style>
