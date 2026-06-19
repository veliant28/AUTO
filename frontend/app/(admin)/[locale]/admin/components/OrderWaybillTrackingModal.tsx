'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Clock,
  RefreshCw,
  CheckCircle2,
  Circle,
  Package,
  Truck,
  MapPin,
  XCircle,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { novaPoshtaApi } from '@/lib/api/nova-poshta';
import type { OrderNovaPoshtaWaybillResponse, WaybillTrackingEvent } from '@/lib/types/nova-poshta';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  orderId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Status group → icon/color mapping
// ═══════════════════════════════════════════════════════════════════════════════

function getStatusGroup(code: string): {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
} {
  const groups: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
    created: {
      icon: <Package className="w-4 h-4" />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    in_transit: {
      icon: <Truck className="w-4 h-4" />,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
    },
    arrived: {
      icon: <MapPin className="w-4 h-4" />,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    delivered: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    returned: {
      icon: <RotateCcw className="w-4 h-4" />,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
    error: {
      icon: <XCircle className="w-4 h-4" />,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
  };

  // Simple grouping logic matching backend catalog
  if (['101', '102', '104', '1'].includes(code)) return groups.created;
  if (['103', '105', '107', '118', '119', '200', '2', '3', '5'].includes(code))
    return groups.in_transit;
  if (['106', '108', '110', '4', '6'].includes(code)) return groups.arrived;
  if (['111', '112', '113', '114', '201', '7', '10'].includes(code)) return groups.delivered;
  if (['117', '123', '124', '125', '9'].includes(code)) return groups.returned;
  if (['109', '115', '116', '120', '121', '122', '8'].includes(code)) return groups.error;

  return groups.in_transit;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function OrderWaybillTrackingModal({ orderId, open, onOpenChange }: Props) {
  const t = useTranslations('admin');
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['np-waybill', orderId],
    queryFn: () => novaPoshtaApi.getOrderWaybillDetail(orderId).then((r) => r.data),
    enabled: open,
  });

  const syncMutation = useMutation({
    mutationFn: () => novaPoshtaApi.syncOrderWaybillStatus(orderId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] });
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] });
      toast.success(t('novaposhta_waybill_sync'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  });

  const waybill = detail?.waybill;
  const events: WaybillTrackingEvent[] = waybill?.tracking_events || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t('novaposhta_tracking_title')}
          </DialogTitle>
          <DialogDescription>
            {waybill && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{waybill.np_number}</Badge>
                <Badge>{waybill.status_text || waybill.status_code}</Badge>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !waybill ? (
          <div className="text-center py-10 text-muted-foreground">
            {t('novaposhta_waybill_not_found')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Sync button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t('novaposhta_sync_now')}
              </Button>
            </div>

            {/* Timeline */}
            {events.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                {t('novaposhta_tracking_empty')}
              </div>
            ) : (
              <div className="relative space-y-0">
                {events.map((event, index) => {
                  const group = getStatusGroup(event.status_code);
                  const isLast = index === events.length - 1;
                  const isFirst = index === 0;

                  return (
                    <div key={index} className="flex gap-4 pb-6 relative">
                      {/* Timeline line */}
                      {!isLast && (
                        <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-border" />
                      )}

                      {/* Icon */}
                      <div
                        className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full ${group.bgColor} ${group.color} shrink-0`}
                      >
                        {group.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${group.color}`}>
                            {event.status_text || `Код ${event.status_code}`}
                          </span>
                          {isFirst && (
                            <Badge variant="secondary" className="text-[10px] h-5">
                              {t('novaposhta_waybill_sync')}
                            </Badge>
                          )}
                        </div>

                        {event.location && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {event.location}
                            {event.warehouse ? ` — ${event.warehouse}` : ''}
                          </div>
                        )}

                        {event.event_at && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {new Date(event.event_at).toLocaleString()}
                          </div>
                        )}

                        {event.note && (
                          <div className="text-xs text-muted-foreground mt-1 italic">
                            {event.note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Error state */}
            {waybill.last_sync_error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {waybill.last_sync_error}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
