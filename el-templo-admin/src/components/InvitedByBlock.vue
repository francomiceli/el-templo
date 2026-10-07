<!--
  Bloque "Lo invitó" (Fase 194, SC-5): quién lo invitó, etapa derivada por el servidor,
  accesos usados/N, vencimiento y sedes donde entrenó. Lo comparten la pestaña
  "Invitaciones" de la ficha y la tarjeta "Datos de Lead" (los leads en prueba no
  tienen pestañas). Solo muestra: el estado lo deriva el servidor.
-->
<template>
  <q-list>
    <q-item class="q-px-none">
      <q-item-section>
        <q-item-label>
          <a class="invited-by-link text-primary cursor-pointer" @click="goToInviter">
            {{ invitedBy.inviterName }}
          </a>
        </q-item-label>
        <q-item-label caption>
          {{ accessesText }} · vence el {{ formatDate(invitedBy.accessExpiresOn) }}
        </q-item-label>
        <q-item-label caption>
          Activada el {{ formatDate(invitedBy.activatedAt) }} ·
          {{ invitedBy.channel === 'assisted' ? 'cargada por el equipo' : 'desde el link' }}
        </q-item-label>
        <q-item-label v-if="invitedBy.branchesTrained.length > 0" caption>
          Entrenó en {{ invitedBy.branchesTrained.join(', ') }}
        </q-item-label>
      </q-item-section>
      <q-item-section side top>
        <q-chip
          dense
          :color="LEAD_STAGE_META[invitedBy.stage].color"
          text-color="white"
          :label="LEAD_STAGE_META[invitedBy.stage].label"
        />
      </q-item-section>
    </q-item>
  </q-list>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { formatDate } from 'src/utils/format-date';
import { LEAD_STAGE_META, accessesLabel } from 'src/utils/invitation-meta';
import type { InvitedByView } from 'src/types/member';

const props = defineProps<{ invitedBy: InvitedByView }>();

const router = useRouter();

const accessesText = computed(
  () => accessesLabel(props.invitedBy.accessesUsed, props.invitedBy.accessesBudget) ?? ''
);

function goToInviter(): void {
  void router.push(`/alumnos/${props.invitedBy.inviterId}`);
}
</script>

<style scoped>
.invited-by-link {
  text-decoration: none;
}
.invited-by-link:hover {
  text-decoration: underline;
}
</style>
