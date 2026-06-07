import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';
import type { AvatarStyle } from '@/lib/avatar';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  full_name: string | null;
  first_name: string | null;
}

interface UserState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  avatarStyle: AvatarStyle;
  
  setUser: (user: any) => void;
  logout: () => void;
  initializeFromToken: () => void;
  setAvatarStyle: (style: AvatarStyle) => void;
}

export const useAuthStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      avatarStyle: 'initials' as AvatarStyle,
      
      setUser: (user) => {
        set({
          user: user ? {
            id: user.id,
            email: user.email,
            role: user.role || 'retail',
            full_name: user.full_name || null,
            first_name: user.first_name || null,
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

      setAvatarStyle: (avatarStyle) => set({ avatarStyle }),
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
