import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  full_name: string | null;
  first_name: string | null;
  avatar_index: number | null;
}

interface UserState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  
  setUser: (user: any) => void;
  logout: () => void;
  initializeFromToken: () => void;
}

export const useAuthStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      
      setUser: (user) => {
        set({
          user: user ? {
            id: user.id,
            email: user.email,
            role: user.role || 'retail',
            full_name: user.full_name || null,
            first_name: user.first_name || null,
            avatar_index: user.avatar_index ?? null,
          } : null,
          isAuthenticated: !!user,
        });
      },
      
      logout: () => {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        set({ user: null, isAuthenticated: false });
      },
      
      initializeFromToken: () => {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        if (!token) {
          set({ user: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: STORAGE_KEYS.AUTH,
      version: 2,
      migrate: (persisted: any, version: number) => {
        let state = persisted?.state || persisted;
        if (version < 2 && state?.user) {
          if (Array.isArray(state.user.roles)) {
            state.user.role = state.user.roles[0] || 'retail';
            delete state.user.roles;
          }
        }
        return persisted;
      },
    }
  )
);
