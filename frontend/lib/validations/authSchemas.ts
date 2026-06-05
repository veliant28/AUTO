import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants';

export const loginSchema = z.object({
  email: z.string().email('Введите корректный email'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Минимум ${PASSWORD_MIN_LENGTH} символов`),
});

export const registerSchema = z.object({
  full_name: z.string().optional(),
  email: z.string().email('Введите корректный email'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Минимум ${PASSWORD_MIN_LENGTH} символов`),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Введите корректный email'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH, `Минимум ${PASSWORD_MIN_LENGTH} символов`),
  confirmPassword: z.string().min(PASSWORD_MIN_LENGTH, `Подтвердите пароль`),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Пароли не совпадают',
  path: ['confirmPassword'],
});

export const checkoutSchema = z.object({
  full_name: z.string().min(2, 'Введите имя (минимум 2 символа)'),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type CheckoutFormData = z.infer<typeof checkoutSchema>;
