'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Heart, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';

export default function FavoritesPage() {
  const t = useTranslations('common');
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const { data: favorites, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const { data } = await api.get('/favorites');
      return data;
    },
    enabled: isAuthenticated,
  });

  const removeMutation = useMutation({
    mutationFn: async (partId: number) => {
      await api.delete(`/favorites/${partId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success('Удалено из избранного');
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <Heart className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">Избранное</h1>
        <p className="text-muted-foreground">Авторизуйтесь, чтобы сохранять и просматривать избранные запчасти</p>
        <Link href="/auth/login">
          <Button>Войти</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <Heart className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">Избранное</h1>
        <Badge variant="secondary">{favorites?.length || 0}</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : favorites?.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <Heart className="w-16 h-16 mx-auto text-muted-foreground/40" />
          <p className="text-lg font-medium">В избранном пока пусто</p>
          <p className="text-muted-foreground text-sm">Добавляйте запчасти в избранное из каталога</p>
          <Link href="/catalog">
            <Button variant="outline">Перейти в каталог</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {favorites?.map((fav: any) => (
            <div key={fav.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{fav.article}</span>
                  <Badge variant="secondary" className="text-[10px]">{fav.brand_name}</Badge>
                </div>
                <p className="font-medium">{fav.part_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">В корзину</Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-destructive"
                  onClick={() => removeMutation.mutate(fav.part_id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
