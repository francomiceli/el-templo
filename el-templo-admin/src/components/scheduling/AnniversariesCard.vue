<template>
  <q-card v-if="branchId" flat bordered class="anniversaries-card q-mb-md">
    <q-card-section class="row items-center q-py-sm">
      <div class="text-subtitle2 text-weight-bold">
        🎉 Cumpleaños y aniversarios de {{ includeTomorrow ? 'hoy y mañana' : 'hoy' }}
      </div>
      <q-space />
      <q-toggle v-model="includeTomorrow" label="Ver mañana" dense size="sm" color="amber-8" />
    </q-card-section>

    <q-separator />

    <q-card-section v-if="loading" class="row items-center q-gutter-sm q-py-sm">
      <q-spinner size="sm" color="amber-8" />
      <span class="text-grey-6">Cargando…</span>
    </q-card-section>

    <q-card-section
      v-else-if="entries.length === 0 && birthdays.length === 0"
      class="text-grey-6 text-italic q-py-sm"
    >
      No hay cumpleaños ni aniversarios {{ includeTomorrow ? 'hoy ni mañana' : 'hoy' }} 🎂
    </q-card-section>

    <q-list v-else separator>
      <!-- Cumpleaños primero: es el festejo más grande del día -->
      <q-item
        v-for="entry in birthdays"
        :key="`bday-${entry.memberId}-${entry.when}`"
        clickable
        @click="goToMember(entry.memberId)"
      >
        <q-item-section avatar>
          <span class="birthday-emoji">🎂</span>
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ entry.memberName }}</q-item-label>
          <q-item-label caption>{{ entry.label }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-badge
            v-if="entry.when === 'tomorrow'"
            color="amber-2"
            text-color="amber-9"
            label="Mañana"
          />
        </q-item-section>
      </q-item>
      <q-item
        v-for="entry in entries"
        :key="`${entry.memberId}-${entry.months}-${entry.when}`"
        clickable
        @click="goToMember(entry.memberId)"
      >
        <q-item-section avatar>
          <q-icon name="cake" color="amber-8" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ entry.memberName }}</q-item-label>
          <q-item-label caption> Cumple {{ entry.label }} en El Templo </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-badge
            v-if="entry.when === 'tomorrow'"
            color="amber-2"
            text-color="amber-9"
            label="Mañana"
          />
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAnniversariesApi } from 'src/composables/useAnniversariesApi';
import { createLogger } from 'src/utils/logger';
import type { AnniversaryEntry, BirthdayEntry } from 'src/types/anniversary';

const props = defineProps<{
  branchId: number | null;
  timezone?: string;
}>();

const log = createLogger('AnniversariesCard');
const router = useRouter();
const { getBranchAnniversaries } = useAnniversariesApi();

const entries = ref<AnniversaryEntry[]>([]);
const birthdays = ref<BirthdayEntry[]>([]);
const loading = ref(false);
const includeTomorrow = ref(false);

/** "Hoy" en la zona horaria de la sede (YYYY-MM-DD). */
function todayInBranchTz(): string {
  const tz = props.timezone;
  if (!tz) return new Date().toLocaleDateString('en-CA');
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

async function load() {
  if (!props.branchId) {
    entries.value = [];
    birthdays.value = [];
    return;
  }
  loading.value = true;
  try {
    const data = await getBranchAnniversaries(props.branchId, {
      date: todayInBranchTz(),
      includeTomorrow: includeTomorrow.value,
    });
    entries.value = data.anniversaries;
    birthdays.value = data.birthdays;
  } catch (err: unknown) {
    log.error('Error cargando aniversarios y cumpleaños', { error: err });
    entries.value = [];
    birthdays.value = [];
  } finally {
    loading.value = false;
  }
}

function goToMember(memberId: number) {
  void router.push(`/alumnos/${memberId}`);
}

onMounted(load);
watch(() => props.branchId, load);
watch(includeTomorrow, load);
</script>

<style scoped>
.anniversaries-card {
  border-color: #f0c675;
  background: #fffaf0;
}
.birthday-emoji {
  font-size: 22px;
  line-height: 1;
}
/* chore(staging): re-trigger de deploy (paths-filter/event.before) — solo staging. */
/* reintento 2 tras incidente de GitHub Actions (2026-08-06). */
/* reintento 3 (2026-08-07): GitHub Actions ya se recuperó, re-disparar CI+deploy de staging. */
</style>
