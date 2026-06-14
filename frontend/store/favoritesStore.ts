import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';

interface FavoritesState {
  articles: string[];
  toggleFavorite: (article: string) => void;
  isFavorite: (article: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      articles: [],
      toggleFavorite: (article) => {
        const exists = get().articles.includes(article);
        set({
          articles: exists
            ? get().articles.filter((a) => a !== article)
            : [...get().articles, article],
        });
      },
      isFavorite: (article) => get().articles.includes(article),
    }),
    { name: STORAGE_KEYS.FAVORITES }
  )
);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEYS.FAVORITES) {
      useFavoritesStore.persist.rehydrate();
    }
  });
}