'use client';

import { useOrderNotifications } from '@/hooks/useOrderNotifications';

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  useOrderNotifications();
  return <>{children}</>;
}
