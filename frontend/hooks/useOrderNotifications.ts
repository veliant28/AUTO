'use client';

import { useEffect } from 'react';
import { toast } from '@/lib/toast';
import { STORAGE_KEYS, ORDER_POLL_INTERVAL } from '@/lib/constants';

export function useOrderNotifications() {
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        if (!token) return;

        const res = await fetch(`/api/v1/orders?status=updated`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const orders = await res.json();

        const lastCheck = localStorage.getItem(STORAGE_KEYS.LAST_ORDER_CHECK);
        const now = Date.now();

        if (lastCheck) {
          orders.forEach((order: any) => {
            const updated = new Date(order.updated_at || order.created_at).getTime();
            if (updated > parseInt(lastCheck) && order.status !== 'pending') {
              toast(`Статус заказа #${order.id} изменён`, {
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
