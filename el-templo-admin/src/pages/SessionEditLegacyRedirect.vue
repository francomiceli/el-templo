<template>
  <q-page class="flex flex-center">
    <q-spinner-dots size="50px" color="primary" />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { weekToUrlParam } from 'src/utils/weekDates';

const route = useRoute();
const router = useRouter();
const sessionsApi = useSessionsApi();

onMounted(async () => {
  const id = Number(route.params.id);
  if (isNaN(id)) {
    router.replace('/sessions');
    return;
  }

  try {
    const session = await sessionsApi.fetchSessionDetail(id);
    router.replace({
      path: '/sessions/edit',
      query: { week: weekToUrlParam(session.week), day: session.day },
    });
  } catch {
    router.replace('/sessions');
  }
});
</script>
