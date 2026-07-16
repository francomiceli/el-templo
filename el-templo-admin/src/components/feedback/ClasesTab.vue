<!-- Tab "Clases" de Feedback: puntuaciones de clase (mudado desde Analíticas
     en la reorganización de feedback). Wrapper que fetchea class-ratings con
     los filtros compartidos y renderiza el panel presentacional. -->
<template>
  <div>
    <div class="row justify-end q-mb-sm">
      <q-btn flat round dense icon="refresh" :loading="loading" @click="reload" />
    </div>
    <ClassRatingsPanel :data="data" :loading="loading" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import ClassRatingsPanel from 'src/components/feedback/ClassRatingsPanel.vue';
import { useAnalyticsApi } from 'src/composables/useAnalyticsApi';
import type { ClassRatingsAnalytics } from 'src/types/analytics';
import { createLogger } from 'src/utils/logger';
import type { FeedbackFilters } from 'src/components/feedback/feedback-filters';

const props = defineProps<{ filters: FeedbackFilters }>();

const log = createLogger('FeedbackClasesTab');
const analyticsApi = useAnalyticsApi();

const data = ref<ClassRatingsAnalytics | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    data.value = await analyticsApi.getClassRatings({
      dateFrom: props.filters.dateFrom ?? undefined,
      dateTo: props.filters.dateTo ?? undefined,
      branchId: props.filters.branchId ?? undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching class ratings', { error: message });
    data.value = null;
  } finally {
    loading.value = false;
  }
}

function reload(): void {
  void load();
}

watch(
  () => [props.filters.dateFrom, props.filters.dateTo, props.filters.branchId],
  () => {
    void load();
  }
);

onMounted(() => {
  void load();
});

onUnmounted(() => {
  analyticsApi.cleanup();
});
</script>
