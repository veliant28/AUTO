import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants';

export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData {
  full_name: string;
  email: string;
  password: string;
}

export interface ForgotPasswordFormData {
  email: string;
}

export interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

export interface CheckoutFormData {
  full_name: string;
  phone?: string;
  address?: string;
}

export const loginSchema = (t: (key: string, values?: any) => string) => z.object({
  email: z.string().email(t('email_invalid')),
  password: z.string().min(PASSWORD_MIN_LENGTH, t('password_min_length', { min: PASSWORD_MIN_LENGTH })),
});

export const registerSchema = (t: (key: string, values?: any) => string) => z.object({
  full_name: z.string().min(2, t('name_min_length', { min: 2 })),
  email: z.string().email(t('email_invalid')),
  password: z.string().min(PASSWORD_MIN_LENGTH, t('password_min_length', { min: PASSWORD_MIN_LENGTH })),
});

export const forgotPasswordSchema = (t: (key: string, values?: any) => string) => z.object({
  email: z.string().email(t('email_invalid')),
});

export const resetPasswordSchema = (t: (key: string, values?: any) => string) => z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH, t('password_min_length', { min: PASSWORD_MIN_LENGTH })),
  confirmPassword: z.string().min(PASSWORD_MIN_LENGTH, t('confirm_password_required')),
}).refine((data) => data.password === data.confirmPassword, {
  message: t('passwords_mismatch'),
  path: ['confirmPassword'],
});

export const checkoutSchema = (t: (key: string, values?: any) => string) => z.object({
  full_name: z.string().min(2, t('name_min_length', { min: 2 })),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export interface ProfileFormData {
  full_name: string;
  phone?: string;
  delivery_type?: string;
  delivery_city?: string;
  delivery_warehouse?: string;
}

export interface ChangePasswordFormData {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export const changePasswordSchema = (t: (key: string, values?: any) => string) => z.object({
  current_password: z.string().min(1, t('required_field')),
  new_password: z.string().min(PASSWORD_MIN_LENGTH, t('password_min_length', { min: PASSWORD_MIN_LENGTH })),
  confirm_password: z.string().min(1, t('required_field')),
}).refine((data) => data.new_password === data.confirm_password, {
  message: t('passwords_mismatch'),
  path: ['confirm_password'],
});
