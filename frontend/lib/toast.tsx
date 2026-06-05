import { toast as sonnerToast } from 'sonner';
import { CustomToast } from '@/components/ui/CustomToast';
import type { ToastAction } from '@/components/ui/CustomToast';

export const toast = {
  success: (title: string, options?: { description?: string; action?: ToastAction }) =>
    sonnerToast.custom((id) => (
      <CustomToast id={id} type="success" title={title} {...options} />
    )),
  error: (title: string, options?: { description?: string; action?: ToastAction }) =>
    sonnerToast.custom((id) => (
      <CustomToast id={id} type="error" title={title} {...options} />
    )),
  info: (title: string, options?: { description?: string; action?: ToastAction }) =>
    sonnerToast.custom((id) => (
      <CustomToast id={id} type="info" title={title} {...options} />
    )),
  warning: (title: string, options?: { description?: string; action?: ToastAction }) =>
    sonnerToast.custom((id) => (
      <CustomToast id={id} type="warning" title={title} {...options} />
    )),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};
