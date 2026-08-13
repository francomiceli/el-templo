<template>
  <q-card v-if="branchId" flat bordered class="registros-card q-mb-md">
    <q-card-section class="row items-center q-py-sm">
      <div class="text-subtitle2 text-weight-bold">📝 Registros del día</div>
      <q-space />
      <span v-if="!loading && attendeeCount > 0" class="text-caption text-grey-6">
        {{ entries.length }} de {{ attendeeCount }} registraron
      </span>
    </q-card-section>

    <q-separator />

    <q-card-section v-if="loading" class="row items-center q-gutter-sm q-py-sm">
      <q-spinner size="sm" color="primary" />
      <span class="text-grey-6">Cargando…</span>
    </q-card-section>

    <q-card-section
      v-else-if="entries.length === 0"
      class="text-grey-6 text-italic q-py-sm"
    >
      {{
        attendeeCount === 0
          ? 'Nadie asiste todavía hoy 🗓️'
          : 'Ningún asistente registró cómo se siente 📝'
      }}
    </q-card-section>

    <q-list v-else separator>
      <q-item
        v-for="entry in entries"
        :key="entry.memberId"
        clickable
        @click="goToMember(entry.memberId)"
      >
        <q-item-section>
          <q-item-label>{{ entry.memberName }}</q-item-label>
          <q-item-label caption class="q-mt-xs">
            <CheckInChips :check-in="entry.checkIn" />
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useCheckInRosterApi } from 'src/composables/useCheckInRosterApi';
import { createLogger } from 'src/utils/logger';
import CheckInChips from './CheckInChips.vue';
import type { CheckInRosterEntry } from 'src/types/checkin-roster';

const props = defineProps<{
  branchId: number | null;
  timezone?: string;
}>();

const log = createLogger('RegistrosDelDiaCard');
const router = useRouter();
const { getDayRoster } = useCheckInRosterApi();

const entries = ref<CheckInRosterEntry[]>([]);
const attendeeCount = ref(0);
const loading = ref(false);

/** "Hoy" en la zona horaria de la sede (YYYY-MM-DD). */
function todayInBranchTz(): string {
  const tz = props.timezone;
  if (!tz) return new Date().toLocaleDateString('en-CA');
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

async function load() {
  if (!props.branchId) {
    entries.value = [];
    attendeeCount.value = 0;
    return;
  }
  loading.value = true;
  try {
    const res = await getDayRoster(props.branchId, {
      date: todayInBranchTz(),
    });
    entries.value = res.entries;
    attendeeCount.value = res.attendeeCount;
  } catch (err: unknown) {
    log.error('Error cargando registros del día', { error: err });
    entries.value = [];
    attendeeCount.value = 0;
  } finally {
    loading.value = false;
  }
}

function goToMember(memberId: number) {
  void router.push(`/alumnos/${memberId}`);
}

onMounted(load);
watch(() => props.branchId, load);
</script>

<style scoped>
.registros-card {
  border-color: #cfe3d0;
  background: #f6faf6;
}
</style>
