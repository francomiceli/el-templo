<!--
  Explicación del descuento por invitación en las pantallas de cobro: de quién depende,
  hasta cuándo tiene plan vigente y, si no se aplicó, por qué. Es solo informativo: no
  bloquea ni cambia el cobro (el servidor decide el descuento). Va como texto
  secundario pegado a la línea del descuento, nunca como fila de monto.
  `detail` null/undefined = nada que explicar (quien paga no tiene vínculos).
-->
<template>
  <div v-if="detail" class="invitation-detail text-caption" data-test="invitation-detail">
    <template v-if="detail.applied">
      <div v-for="link in activeLinks" :key="`${link.userId}-${link.side}`" class="q-mt-xs">
        <div class="text-grey-8">
          Por
          <a
            class="invitation-detail__link text-primary"
            :href="memberHref(link.userId)"
            target="_blank"
            rel="noopener"
            >{{ link.name }}</a
          >
          <template v-if="link.coveredUntil">
            · plan vigente hasta el {{ formatDayMonth(link.coveredUntil) }}
          </template>
        </div>
        <div v-if="link.expiresSoon" class="text-warning row items-center no-wrap">
          <q-icon name="warning" size="xs" class="q-mr-xs" />
          <span>{{ expiresSoonText(link.daysLeft) }}</span>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="text-grey-7">Sin descuento por invitación</div>
      <template v-if="detail.reason === 'counterparty_not_covered'">
        <div v-for="link in detail.links" :key="`${link.userId}-${link.side}`" class="text-grey-7">
          <a
            class="invitation-detail__link text-grey-8"
            :href="memberHref(link.userId)"
            target="_blank"
            rel="noopener"
            >{{ link.name }}</a
          >
          {{ notCoveredText(link) }}
        </div>
      </template>
      <div v-else-if="detail.reason" class="text-grey-7">
        {{ INVITATION_REASON_TEXT[detail.reason] }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { InvitationDiscountDetail, InvitationDiscountLink } from 'src/types/subscription';
import { formatDayMonth } from 'src/utils/renewal-status';
import { INVITATION_REASON_TEXT, expiresSoonText } from 'src/utils/invitation-discount-detail';

const props = defineProps<{ detail: InvitationDiscountDetail | null | undefined }>();

const router = useRouter();

// Con el descuento aplicado solo se listan los vínculos que cuentan.
const activeLinks = computed(() => (props.detail?.links ?? []).filter((link) => link.active));

// Link a la ficha: pestaña nueva, así no se pierde el cobro en curso.
function memberHref(userId: number): string {
  return router.resolve(`/alumnos/${userId}`).href;
}

function notCoveredText(link: InvitationDiscountLink): string {
  return link.coveredUntil
    ? `no tiene el plan vigente (venció el ${formatDayMonth(link.coveredUntil)})`
    : 'no tiene un plan vigente';
}
</script>

<style scoped>
.invitation-detail__link {
  text-decoration: underline;
}
</style>
