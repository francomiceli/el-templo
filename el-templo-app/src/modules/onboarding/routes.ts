import type { RouteRecordRaw } from 'vue-router'

export const onboardingRoutes: RouteRecordRaw[] = [
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('./pages/OnboardingPage.vue'),
    meta: { requiresAuth: true },
  },
]

export default onboardingRoutes
