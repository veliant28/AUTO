'use client';

import { useEffect } from 'react';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import { STORAGE_KEYS, ORDER_POLL_INTERVAL } from '@/lib/constants';

export function useOrderNotifications() {
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        if (!token) return;

        const { data } = await api.get('/orders');
        const orders = data?.items ?? [];

        const lastCheck = localStorage.getItem(STORAGE_KEYS.LAST_ORDER_CHECK);
        const now = Date.now();

        if (lastCheck) {
          orders.forEach((order: any) => {
            const updated = new Date(order.updated_at || order.created_at).getTime();
            if (updated > parseInt(lastCheck) && order.status !== 'pending') {
              toast.info(`Статус заказа #${order.id} изменён`, {
                description: `Текущий статус: ${order.status}`,
                action: {
                  label: 'Открыть',
                  onClick: () => window.location.href = `/orders/${order.id}`,
                },
              });
            }
          });
        }

        localStorage.setItem(STORAGE_KEYS.LAST_ORDER_CHECK, now.toString());
      } catch {
        // Silently fail
      }
    }, ORDER_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);
}
