import { useAuthStore } from '@/store/authStore'

const mockUser = {
  id: 1,
  email: 'test@example.com',
  role: 'retail',
  full_name: 'Test User',
  first_name: 'Test',
  avatar_index: 1,
}

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false })
  localStorage.clear()
})

describe('authStore', () => {
  it('starts not authenticated', () => {
    const { user, isAuthenticated } = useAuthStore.getState()
    expect(user).toBeNull()
    expect(isAuthenticated).toBe(false)
  })

  it('sets user', () => {
    useAuthStore.getState().setUser(mockUser)
    const { user, isAuthenticated } = useAuthStore.getState()
    expect(user).toMatchObject({ id: 1, email: 'test@example.com', role: 'retail' })
    expect(isAuthenticated).toBe(true)
  })

  it('normalizes user data', () => {
    useAuthStore.getState().setUser({ id: 2, email: 'admin@test.com' })
    const { user } = useAuthStore.getState()
    expect(user).toEqual({
      id: 2,
      email: 'admin@test.com',
      role: 'retail',
      full_name: null,
      first_name: null,
      avatar_index: null,
    })
  })

  it('clears user on setUser(null)', () => {
    useAuthStore.getState().setUser(mockUser)
    useAuthStore.getState().setUser(null)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('removes token on logout', () => {
    localStorage.setItem('token', 'test-token')
    useAuthStore.getState().setUser(mockUser)
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('initializeFromToken does nothing with no token', () => {
    useAuthStore.getState().setUser(mockUser)
    useAuthStore.getState().initializeFromToken()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
