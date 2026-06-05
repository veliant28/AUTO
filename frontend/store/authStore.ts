import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';
import type { AvatarStyle } from '@/lib/avatar';

interface UserState {
  user: {
    id: number;
    email: string;
    role: 'retail' | 'b2b' | 'operator' | 'manager' | 'admin';
    full_name: string | null;
  } | null;
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
        set({ user, isAuthenticated: !!user });
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
    }
  )
);
