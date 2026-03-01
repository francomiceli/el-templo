<template>
  <div class="page">
    <AppNav />
    <div class="page__content">
      <slot />
    </div>
    <AppPrefooter />
    <AppFooter />
    <CookieConsent />
  </div>
</template>

<style scoped>
.page__content {
  padding-top: 64px; /* Offset for fixed nav */
  min-height: calc(100vh - 64px); /* Ensure content fills viewport minus nav */
}

@media (max-width: 768px) {
  .page__content {
    padding-top: 56px;
    min-height: calc(100vh - 56px);
  }
}
</style>
