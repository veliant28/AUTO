'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Truck,
  Building2,
  Package,
  CreditCard,
  Search,
  X,
  Printer,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';
import { novaPoshtaApi } from '@/lib/api/nova-poshta';
import type {
  NovaPoshtaSenderProfile,
  OrderNovaPoshtaWaybillUpsert,
  OrderNovaPoshtaWaybillResponse,
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
  NovaPoshtaLookupStreet,
  WaybillEventResponse,
} from '@/lib/types/nova-poshta';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  orderId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function OrderWaybillModal({ orderId, open, onOpenChange }: Props) {
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
   const [activeTab, setActiveTab] = useState('sender');
   const formInitialized = React.useRef(false);

   // ── Fetch waybill if exists ──────────────────────────────────────────────
  const { data: detail, isLoading: loadingWaybill } = useQuery({
    queryKey: ['np-waybill', orderId],
    queryFn: () => novaPoshtaApi.getOrderWaybillDetail(orderId).then((r) => r.data),
    enabled: open,
  });

  const waybill = detail?.waybill;
  const summary = detail?.summary;
  const isEdit = !!waybill && !waybill.is_deleted;

  // ── Senders ──────────────────────────────────────────────────────────────
  const { data: senders = [] } = useQuery({
    queryKey: ['nova-poshta', 'senders'],
    queryFn: () => novaPoshtaApi.listSenders().then((r) => r.data),
    enabled: open,
  });

  // ── Form state ───────────────────────────────────────────────────────────
  const [form, setForm] = useState<OrderNovaPoshtaWaybillUpsert>({
    sender_profile_id: 0,
    delivery_type: 'warehouse',
    payer_type: 'Recipient',
    payment_method: 'Cash',
    cargo_type: 'Parcel',
    description: '',
    recipient_city_ref: '',
    recipient_city_label: '',
    recipient_address_ref: '',
    recipient_address_label: '',
    recipient_name: '',
    recipient_phone: '',
    weight: '1.000',
    seats_amount: 1,
    cost: '0',
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

   // Reset form when waybill loads
  useEffect(() => {
    if (open) {
      formInitialized.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (waybill && !waybill.is_deleted) {
      setForm({
        sender_profile_id: waybill.sender_profile_id,
        delivery_type: 'warehouse',
        payer_type: (waybill.payer_type as any) || 'Recipient',
        payment_method: (waybill.payment_method as any) || 'Cash',
        cargo_type: (waybill.cargo_type as any) || 'Parcel',
        description: waybill.description_snapshot || '',
        recipient_city_ref: waybill.recipient_city_ref,
        recipient_city_label: waybill.recipient_city_label,
        recipient_address_ref: waybill.recipient_address_ref,
        recipient_address_label: waybill.recipient_address_label,
        recipient_name: waybill.recipient_name,
        recipient_phone: waybill.recipient_phone,
        weight: waybill.weight || '1.000',
        seats_amount: waybill.seats_amount || 1,
        cost: waybill.cost || '0',
        afterpayment_amount: waybill.afterpayment_amount || undefined,
      });
      formInitialized.current = true;
    } else if (!waybill && !formInitialized.current && senders.length > 0) {
      // Set default sender only on first load
      const defaultSender = senders.find((s) => s.is_default) || senders[0];
      setForm((prev) => ({
        ...prev,
        sender_profile_id: defaultSender?.id || 0,
      }));
      formInitialized.current = true;
    }
    return () => {};
  }, [waybill, senders]);

  // ── Lookups ──────────────────────────────────────────────────────────────
  const [cityQuery, setCityQuery] = useState('');
  const [warehouseQuery, setWarehouseQuery] = useState('');

  const { data: settlements = [] } = useQuery({
    queryKey: ['np-lookup', 'settlements', form.sender_profile_id, cityQuery],
    queryFn: () =>
      novaPoshtaApi
        .searchSettlements({ sender_profile_id: form.sender_profile_id, query: cityQuery })
        .then((r) => r.data),
    enabled: cityQuery.length >= 2 && form.sender_profile_id > 0,
    staleTime: 60000,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['np-lookup', 'warehouses', form.sender_profile_id, form.recipient_city_ref, warehouseQuery],
    queryFn: () =>
      novaPoshtaApi
        .searchWarehouses({
          sender_profile_id: form.sender_profile_id,
          city_ref: form.recipient_city_ref,
          query: warehouseQuery,
        })
        .then((r) => r.data),
    enabled: !!form.recipient_city_ref && form.sender_profile_id > 0,
    staleTime: 60000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: OrderNovaPoshtaWaybillUpsert) =>
      novaPoshtaApi.createWaybill(orderId, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] });
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] });
      toast.success(waybill ? t('novaposhta_waybill_updated') : t('novaposhta_waybill_created'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: OrderNovaPoshtaWaybillUpsert }) =>
      novaPoshtaApi.updateWaybill(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] });
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] });
      toast.success(t('novaposhta_waybill_updated'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => novaPoshtaApi.deleteWaybill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] });
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] });
      toast.success(t('novaposhta_waybill_deleted'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  });

  const syncMutation = useMutation({
    mutationFn: (id: number) => novaPoshtaApi.syncWaybillStatus(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] });
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] });
      toast.success(t('novaposhta_waybill_sync'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  });

  const printMutation = useMutation({
    mutationFn: ({ id, type }: { id: number; type: 'html' | 'pdf' }) =>
      novaPoshtaApi.printWaybill(id, type).then((r) => r.data),
    onSuccess: (res) => {
      if (res.url) window.open(res.url, '_blank');
      else toast.error(t('novaposhta_print_no_url'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  });

  // ── Submit handler ──────────────────────────────────────────────────────
  const handleSave = () => {
    if (form.sender_profile_id === 0) {
      toast.error(t('novaposhta_sender_not_selected'));
      return;
    }
    if (!form.recipient_name || !form.recipient_phone) {
      toast.error(t('novaposhta_validation_recipient_required'));
      return;
    }

    if (isEdit && waybill) {
      updateMutation.mutate({ id: waybill.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            {isEdit ? `${t('novaposhta_waybill_edit')} — ${waybill?.np_number}` : t('novaposhta_waybill_create')}
          </DialogTitle>
          <DialogDescription>
            {summary?.exists && !summary.is_deleted && (
              <Badge variant={summary.has_sync_error ? 'destructive' : 'secondary'}>
                {summary.status_text || t('novaposhta_waybill_status')}: {summary.status_code}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        {loadingWaybill ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-4">
                <TabsTrigger value="sender">
                  <Building2 className="w-4 h-4 mr-2" />
                  {t('novaposhta_sender')}
                </TabsTrigger>
                <TabsTrigger value="recipient">
                  <Truck className="w-4 h-4 mr-2" />
                  {t('novaposhta_recipient')}
                </TabsTrigger>
                <TabsTrigger value="shipment">
                  <Package className="w-4 h-4 mr-2" />
                  {t('novaposhta_shipment')}
                </TabsTrigger>
                <TabsTrigger value="payment">
                  <CreditCard className="w-4 h-4 mr-2" />
                  {t('novaposhta_payment')}
                </TabsTrigger>
              </TabsList>

              {/* ── Tab: Sender ───────────────────────────────────────── */}
              <TabsContent value="sender" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>{t('novaposhta_sender')}</Label>
                  <Select
                    value={form.sender_profile_id?.toString() || ''}
                    onValueChange={(v) => setForm({ ...form, sender_profile_id: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('novaposhta_sender_not_selected')} />
                    </SelectTrigger>
                    <SelectContent>
                      {senders.map((s: NovaPoshtaSenderProfile) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.name} {s.is_default ? '(default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('novaposhta_delivery_type')}</Label>
                  <Select
                    value={form.delivery_type}
                    onValueChange={(v: any) => setForm({ ...form, delivery_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warehouse">{t('novaposhta_delivery_warehouse')}</SelectItem>
                      <SelectItem value="postomat">{t('novaposhta_delivery_postomat')}</SelectItem>
                      <SelectItem value="address">{t('novaposhta_delivery_address')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              {/* ── Tab: Recipient ───────────────────────────────────── */}
              <TabsContent value="recipient" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>{t('novaposhta_city')}</Label>
                  <Input
                    placeholder={t('novaposhta_search_city')}
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                  />
                  {cityQuery.length >= 2 && (
                    <div className="max-h-40 overflow-y-auto border rounded-md p-1">
                      {settlements.map((s: NovaPoshtaLookupSettlement) => (
                        <div
                          key={s.ref}
                          className="p-2 hover:bg-muted cursor-pointer rounded text-sm"
                          onClick={() => {
                            setForm({
                              ...form,
                              recipient_city_ref: s.delivery_city_ref,
                              recipient_city_label: s.label,
                            });
                            setCityQuery(s.label);
                          }}
                        >
                          {s.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {form.delivery_type === 'warehouse' || form.delivery_type === 'postomat' ? (
                  <div className="space-y-2">
                    <Label>{t('novaposhta_warehouse')}</Label>
                    <Input
                      placeholder={t('novaposhta_search_warehouse')}
                      value={warehouseQuery}
                      onChange={(e) => setWarehouseQuery(e.target.value)}
                    />
                    {warehouses.length > 0 && (
                      <div className="max-h-40 overflow-y-auto border rounded-md p-1">
                        {warehouses.map((w: NovaPoshtaLookupWarehouse) => (
                          <div
                            key={w.ref}
                            className="p-2 hover:bg-muted cursor-pointer rounded text-sm"
                            onClick={() => {
                              setForm({
                                ...form,
                                recipient_address_ref: w.ref,
                                recipient_address_label: w.label,
                              });
                              setWarehouseQuery(w.label);
                            }}
                          >
                            #{w.number} — {w.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>{t('novaposhta_street')}</Label>
                      <Input placeholder={t('novaposhta_search_street')} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('novaposhta_house')}</Label>
                        <Input
                          value={form.recipient_house || ''}
                          onChange={(e) => setForm({ ...form, recipient_house: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('novaposhta_apartment')}</Label>
                        <Input
                          value={form.recipient_apartment || ''}
                          onChange={(e) => setForm({ ...form, recipient_apartment: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('novaposhta_recipient_name')}</Label>
                    <Input
                      value={form.recipient_name}
                      onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('novaposhta_recipient_phone')}</Label>
                    <Input
                      value={form.recipient_phone}
                      onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab: Shipment ────────────────────────────────────── */}
              <TabsContent value="shipment" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>{t('novaposhta_description')}</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Запчастини"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('novaposhta_cargo_type')}</Label>
                    <Select
                      value={form.cargo_type}
                      onValueChange={(v: any) => setForm({ ...form, cargo_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cargo">Cargo</SelectItem>
                        <SelectItem value="Parcel">Parcel</SelectItem>
                        <SelectItem value="Documents">Documents</SelectItem>
                        <SelectItem value="Pallet">Pallet</SelectItem>
                        <SelectItem value="TiresWheels">TiresWheels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('novaposhta_weight')}</Label>
                    <Input
                      value={form.weight}
                      onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('novaposhta_seats')}</Label>
                    <Input
                      type="number"
                      value={form.seats_amount}
                      onChange={(e) => setForm({ ...form, seats_amount: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('novaposhta_cost')}</Label>
                    <Input
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('novaposhta_afterpayment')}</Label>
                  <Input
                    value={form.afterpayment_amount || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        afterpayment_amount: e.target.value || undefined,
                      })
                    }
                    placeholder="0.00"
                  />
                </div>
              </TabsContent>

              {/* ── Tab: Payment ─────────────────────────────────────── */}
              <TabsContent value="payment" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>{t('novaposhta_payer_type')}</Label>
                  <Select
                    value={form.payer_type}
                    onValueChange={(v: any) => setForm({ ...form, payer_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sender">{t('novaposhta_payer_sender')}</SelectItem>
                      <SelectItem value="Recipient">{t('novaposhta_payer_recipient')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('novaposhta_payment_method')}</Label>
                  <Select
                    value={form.payment_method}
                    onValueChange={(v: any) => setForm({ ...form, payment_method: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">{t('novaposhta_payment_cash')}</SelectItem>
                      <SelectItem value="NonCash">{t('novaposhta_payment_noncash')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>

            {/* ── Existing waybill actions ──────────────────────────── */}
            {isEdit && waybill && (
              <div className="flex items-center gap-2 mt-4 p-3 bg-muted/30 rounded-lg">
                <Badge variant="outline" className="text-xs">
                  {t('novaposhta_waybill_number')}: {waybill.np_number}
                </Badge>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => syncMutation.mutate(waybill.id)}
                      disabled={syncMutation.isPending}
                    >
                      {syncMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('novaposhta_waybill_sync')}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => printMutation.mutate({ id: waybill.id, type: 'html' })}
                      disabled={printMutation.isPending}
                    >
                      <Printer className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('novaposhta_waybill_print')}</TooltipContent>
                </Tooltip>

                {waybill.can_edit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive ml-auto"
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('novaposhta_waybill_delete')}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isPending || loadingWaybill}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('novaposhta_save')}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* ── Delete confirmation ─────────────────────────────────────── */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('novaposhta_waybill_delete')}</DialogTitle>
            <DialogDescription>{t('novaposhta_confirm_delete')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (waybill) deleteMutation.mutate(waybill.id);
                setShowDeleteConfirm(false);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
