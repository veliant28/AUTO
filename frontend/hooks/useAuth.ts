import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

export function useAuth() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await api.post('/auth/login', data);
      return res.data;
    },
    onSuccess: (res) => {
      setUser({ id: res.user_id, email: '', role: res.role, full_name: '' });
      localStorage.setItem('token', res.access_token);
      toast.success('Вход выполнен');
      router.push('/');
    },
    onError: () => toast.error('Неверный email или пароль'),
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; full_name?: string }) => {
      const res = await api.post('/auth/register', data);
      return res.data;
    },
    onSuccess: (res) => {
      setUser({ id: res.user_id, email: '', role: res.role, full_name: '' });
      localStorage.setItem('token', res.access_token);
      toast.success('Регистрация успешна');
      router.push('/');
    },
    onError: () => toast.error('Ошибка регистрации'),
  });

  const forgotMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await api.post('/auth/forgot-password', data);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success('Ссылка для восстановления отправлена');
    },
    onError: () => toast.error('Ошибка'),
  });

  const resetMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const res = await api.post('/auth/reset-password', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Пароль изменен');
      router.push('/auth/login');
    },
    onError: () => toast.error('Неверный или просроченный токен'),
  });

  const googleMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await api.post('/auth/google', { token });
      return res.data;
    },
    onSuccess: (res) => {
      setUser({ id: res.user_id, email: '', role: res.role, full_name: '' });
      localStorage.setItem('token', res.access_token);
      toast.success('Вход через Google выполнен');
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
