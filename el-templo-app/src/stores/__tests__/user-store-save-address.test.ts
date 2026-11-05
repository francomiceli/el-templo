import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

import { api } from 'src/boot/axios'
import { useUserStore, type UserProfile } from '../useUserStore'

const PROFILE = {
  id: 7,
  email: 'socio@test.com',
  firstName: 'Socio',
  lastName: 'Test',
  role: 'member',
  branchId: 1,
  branchName: 'El Templo Jujuy',
  branchLocality: 'Mar del Plata',
  address: null,
} as unknown as UserProfile

describe('useUserStore · saveAddress (dirección del socio)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.put).mockReset()
  })

  it('manda la dirección y guarda en el perfil la versión normalizada que devolvió el servidor', async () => {
    const store = useUserStore()
    store.setProfile(PROFILE)
    vi.mocked(api.put).mockResolvedValue({ data: { address: 'Av. Colón 2450' } })

    await store.saveAddress('Av.  Colón 2450')

    expect(api.put).toHaveBeenCalledWith('/auth/me/address', { address: 'Av.  Colón 2450' })
    expect(store.profile?.address).toBe('Av. Colón 2450')
    // El resto del perfil no se toca.
    expect(store.profile?.branchLocality).toBe('Mar del Plata')
  })

  it('null la borra', async () => {
    const store = useUserStore()
    store.setProfile({ ...PROFILE, address: 'Jujuy 1000' })
    vi.mocked(api.put).mockResolvedValue({ data: { address: null } })

    await store.saveAddress(null)

    expect(api.put).toHaveBeenCalledWith('/auth/me/address', { address: null })
    expect(store.profile?.address).toBeNull()
  })

  it('si el servidor falla, propaga el error y el perfil queda como estaba', async () => {
    const store = useUserStore()
    store.setProfile({ ...PROFILE, address: 'Jujuy 1000' })
    vi.mocked(api.put).mockRejectedValue(new Error('Network Error'))

    await expect(store.saveAddress('Rawson 2100')).rejects.toThrow('Network Error')
    expect(store.profile?.address).toBe('Jujuy 1000')
  })
})
