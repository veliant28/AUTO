'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const CHANNEL = 'auto-order-sync';

export function broadcastStatusChange(orderId: number, status: string) {
  try {
    const c = new BroadcastChannel(CHANNEL);
    c.postMessage({ type: 'status-changed', orderId, status });
    c.close();
  } catch {}
}

export function useOrderSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    try {
      const c = new BroadcastChannel(CHANNEL);
      c.onmessage = (e) => {
        if (e.data?.type === 'status-changed') {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['orders-active'] });
          queryClient.invalidateQueries({ queryKey: ['order'] });
          queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
        }
      };
      return () => c.close();
    } catch {}
  }, [queryClient]);
}
