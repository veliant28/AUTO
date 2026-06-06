'use client';

import { X, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: {
    bg: 'bg-green-600 dark:bg-green-500',
    icon: 'text-white',
    actionBorder: 'border-white/40',
  },
  error: {
    bg: 'bg-red-600 dark:bg-red-500',
    icon: 'text-white',
    actionBorder: 'border-white/40',
  },
  warning: {
    bg: 'bg-orange-500 dark:bg-orange-400',
    icon: 'text-white',
    actionBorder: 'border-white/40',
  },
  info: {
    bg: 'bg-blue-500 dark:bg-blue-400',
    icon: 'text-white',
    actionBorder: 'border-white/40',
  },
};

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface CustomToastProps {
  id: string | number;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
  action?: ToastAction;
}

export function CustomToast({ id, type, title, description, action }: CustomToastProps) {
  const Icon = icons[type];
  const s = styles[type];
  return (
    <div
      className={`relative flex items-start gap-3 py-4 pl-4 pr-6 rounded-lg border border-white/20 shadow-xl w-full ${s.bg} text-white`}
      style={{
        translate: 'var(--x, 0) var(--y, 0)',
        scale: 'var(--scale, 1)',
        opacity: 'var(--opacity, 1)',
        transition: 'translate 400ms cubic-bezier(0.21, 1.02, 0.73, 1), scale 400ms cubic-bezier(0.21, 1.02, 0.73, 1), opacity 400ms cubic-bezier(0.21, 1.02, 0.73, 1)',
      }}
    >
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${s.icon}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-sm opacity-80 mt-0.5">{description}</p>}
        {action && (
          <button
            onClick={action.onClick}
            className={`mt-3 h-8 px-3 rounded-lg text-sm font-medium border ${s.actionBorder} hover:bg-white/10 transition-colors cursor-pointer`}
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => sonnerToast.dismiss(id)}
        className={`p-1 rounded-lg text-white/60 hover:text-white transition-colors hover:bg-white/10 cursor-pointer`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
