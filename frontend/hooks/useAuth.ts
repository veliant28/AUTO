import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

export function useAuth() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const t = useTranslations('auth');

  const getError = (err: any, key: string) => {
    const detail = err?.response?.data?.detail;
    if (detail?.toLowerCase().includes('already registered')) return t('email_exists');
    if (detail?.toLowerCase().includes('invalid credentials')) return t('login_error');
    return t(key);
  };

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await api.post('/auth/login', data);
      return res.data;
    },
    onSuccess: (res) => {
      setUser({ id: res.user_id, email: '', role: res.role, full_name: '' });
      localStorage.setItem('token', res.access_token);
      toast.success(t('login_success'));
      router.push('/');
    },
    onError: (err: any) => toast.error(getError(err, 'login_error')),
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; full_name?: string }) => {
      const res = await api.post('/auth/register', data);
      return res.data;
    },
    onSuccess: (res) => {
      setUser({ id: res.user_id, email: '', role: res.role, full_name: '' });
      localStorage.setItem('token', res.access_token);
      toast.success(t('register_success'));
      router.push('/');
    },
    onError: (err: any) => toast.error(getError(err, 'register_error')),
  });

  const forgotMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await api.post('/auth/forgot-password', data);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(t('forgot_success'));
    },
    onError: (err: any) => toast.error(getError(err, 'forgot_error')),
  });

  const resetMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const res = await api.post('/auth/reset-password', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('reset_success'));
      router.push('/auth/login');
    },
    onError: (err: any) => toast.error(getError(err, 'reset_error')),
  });

  const googleMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await api.post('/auth/google', { token });
      return res.data;
    },
    onSuccess: (res) => {
      setUser({ id: res.user_id, email: '', role: res.role, full_name: '' });
      localStorage.setItem('token', res.access_token);
      toast.success(t('google_success'));
      router.push('/');
    },
  });

  return {
    login: loginMutation.mutate,
    loginLoading: loginMutation.isPending,
    register: registerMutation.mutate,
    registerLoading: registerMutation.isPending,
    forgotPassword: forgotMutation.mutate,
    forgotLoading: forgotMutation.isPending,
    resetPassword: resetMutation.mutate,
    resetLoading: resetMutation.isPending,
    googleAuth: googleMutation.mutate,
    googleLoading: googleMutation.isPending,
  };
}
