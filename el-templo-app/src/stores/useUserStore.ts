import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type Level = 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';

export interface UserProfile {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'member' | 'coach' | 'admin' | 'superadmin';
  level: Level;
  branchId: number;
  branchName: string;
}

export const useUserStore = defineStore('user', () => {
  // State
  const profile = ref<UserProfile | null>(null);
  const loading = ref(false);

  // Getters
  const fullName = computed(() => {
    if (!profile.value) return '';
    const { firstName, lastName } = profile.value;
    if (firstName && lastName) return `${firstName} ${lastName}`;
    if (firstName) return firstName;
    if (lastName) return lastName;
    return profile.value.email;
  });

  const displayLevel = computed(() => {
    if (!profile.value) return '';
    // Capitalize first letter
    return profile.value.level.charAt(0).toUpperCase() + profile.value.level.slice(1);
  });

  // Actions
  function setProfile(newProfile: UserProfile) {
    profile.value = newProfile;
  }

  function clearProfile() {
    profile.value = null;
  }

  function setLoading(state: boolean) {
    loading.value = state;
  }

  return {
    // State
    profile,
    loading,
    // Getters
    fullName,
    displayLevel,
    // Actions
    setProfile,
    clearProfile,
    setLoading,
  };
});
