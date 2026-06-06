import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

export function useProfile() {
  const { user } = useAuthStore();
  const t = useTranslations('profile');

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await api.get('/users/me');
      return data;
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async (formData: any) => {
      const { data } = await api.put('/users/me', formData);
      return data;
    },
    onSuccess: () => {
      toast.success(t('saved'));
      refetch();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('save_error'));
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (formData: { current_password: string; new_password: string }) => {
      const { data } = await api.post('/users/change-password', formData);
      return data;
    },
    onSuccess: () => {
      toast.success(t('password_changed'));
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      if (detail?.toLowerCase().includes('current password is incorrect')) {
        toast.error(t('password_incorrect'));
      } else {
        toast.error(t('change_password_error'));
      }
    },
  });

  return {
    profile,
    isLoading,
    refetch,
    updateProfile: updateMutation.mutate,
    updating: updateMutation.isPending,
    changePassword: passwordMutation.mutate,
    changingPassword: passwordMutation.isPending,
  };
}
