<!-- Nombre del invitado (link a la ficha) + botón de WhatsApp. -->
<template>
  <div class="row items-center no-wrap">
    <router-link :to="`/alumnos/${row.invitee.userId}`" class="text-primary">
      {{ row.invitee.firstName }} {{ row.invitee.lastName }}
    </router-link>
    <q-btn
      round
      flat
      dense
      icon="chat"
      color="positive"
      class="q-ml-xs"
      :disable="!row.invitee.phone"
      @click="contact"
    >
      <q-tooltip>Contactar por WhatsApp</q-tooltip>
    </q-btn>
  </div>
</template>

<script setup lang="ts">
import type { InvitationLeadRow } from 'src/types/report';

const props = defineProps<{ row: InvitationLeadRow }>();

function contact(): void {
  const phone = props.row.invitee.phone;
  if (!phone) return;
  window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
}
</script>
